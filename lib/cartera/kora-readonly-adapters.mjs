export const CONTRACT_VERSION = '1.0';
export const NORMALIZED_FIELDS = [
  'external_obligation_id','customer_external_id','platform','store_id','currency',
  'original_amount','outstanding_balance','installment_amount','due_date','status',
  'days_past_due','last_payment_at','last_payment_amount','reconciliation_status','source_updated_at'
];

const present = value => value !== null && value !== undefined && value !== '';
const numberOrNull = value => present(value) && Number.isFinite(Number(value)) ? Number(value) : null;

export function validateContract(record) {
  const missing = NORMALIZED_FIELDS.filter(field => !present(record[field]));
  return { version: CONTRACT_VERSION, valid: missing.length === 0, missing };
}

class PlatformAdapterReal {
  constructor(platform) { this.platform = platform; }
  normalize() { return { status: 'INCOMPLETE', platform: this.platform, record: null, gaps: ['NO_REAL_SOURCE_EVIDENCE'] }; }
}

function normalizeLiquidationOperation(row, platform) {
  const external = String(row.external_id || '').trim();
  const record = {
    external_obligation_id: external ? `${platform}:${external}` : null,
    customer_external_id: null,
    platform,
    store_id: row.origen_codigo || null,
    currency: null,
    original_amount: numberOrNull(row.monto_credito ?? row.monto_base),
    outstanding_balance: null,
    installment_amount: null,
    due_date: null,
    status: null,
    days_past_due: null,
    last_payment_at: null,
    last_payment_amount: null,
    reconciliation_status: null,
    source_updated_at: row.imported_at || row.created_at || null
  };
  const contract = validateContract(record);
  return { status: contract.valid ? 'COMPLETE' : 'INCOMPLETE', platform, record, gaps: contract.missing, contract };
}

export class PayJoyAdapterReal extends PlatformAdapterReal {
  constructor() { super('payjoy'); }
  normalize(row) { return normalizeLiquidationOperation(row, this.platform); }
}
export class AloAdapterReal extends PlatformAdapterReal {
  constructor() { super('alo'); }
  normalize(row) { return normalizeLiquidationOperation(row, this.platform); }
}
export class AddiAdapterReal extends PlatformAdapterReal { constructor() { super('addi'); } }
export class KrediyaAdapterReal extends PlatformAdapterReal { constructor() { super('krediya'); } }

export class KoraReadOnlySource {
  constructor(read) { if (typeof read !== 'function') throw new TypeError('read function required'); this.read = read; Object.freeze(this); }
  async operations() { return this.read('liquidation_operations'); }
}

export async function syncAnonymizedSnapshot({ source, sandboxSink, adapters }) {
  const rows = await source.operations();
  const accepted = [], rejected = [];
  for (const row of rows) {
    if (row.anonymized !== true) { rejected.push({ external_id:row.external_id || null,gaps:['PII_NOT_ANONYMIZED'] }); continue; }
    const result = adapters[row.plataforma]?.normalize(row) || { status:'INCOMPLETE', gaps:['PLATFORM_ADAPTER_MISSING'] };
    if (result.status !== 'COMPLETE') { rejected.push({ external_id:row.external_id || null, gaps:result.gaps }); continue; }
    accepted.push(await sandboxSink.upsert(result.record));
    await sandboxSink.audit?.({ event_type:'KORA_SNAPSHOT_INGESTED',external_obligation_id:result.record.external_obligation_id,source_updated_at:result.record.source_updated_at });
  }
  return { read:rows.length, accepted:accepted.length, rejected };
}

export function isReminderEligible(obligation) { return Boolean(obligation) && !['PAID','CLOSED','REVERSED'].includes(String(obligation.status || '').toUpperCase()) && Number(obligation.outstanding_balance) > 0; }

export function classifyReconciliation({ obligation, payment, duplicate = false, sourceUpdatedAt, referenceMatches = 1 }) {
  if (duplicate) return 'DUPLICATE_PAYMENT';
  if (referenceMatches > 1) return 'AMBIGUOUS_REFERENCE';
  if (!obligation) return 'OBLIGATION_NOT_FOUND';
  if (!payment) return 'PAYMENT_NOT_FOUND';
  if (sourceUpdatedAt && obligation.source_updated_at && new Date(sourceUpdatedAt) < new Date(obligation.source_updated_at)) return 'STALE_SOURCE';
  if (Number(payment.amount) !== Number(obligation.expected_payment)) return 'AMOUNT_MISMATCH';
  return 'MATCH';
}
