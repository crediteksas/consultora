const SCHEMA = 'cartera';

class SupabaseRepository {
  constructor(client, table) { this.client = client; this.table = table; }
  relation() { return this.client.schema(SCHEMA).from(this.table); }
  async list() { const { data, error } = await this.relation().select('*'); if (error) throw error; return data; }
  async get(id) { const { data, error } = await this.relation().select('*').eq('id', id).maybeSingle(); if (error) throw error; return data; }
  async save(record, conflict = 'id') {
    const safe = { ...record, sandbox_data: true };
    const { data, error } = await this.relation().upsert(safe, { onConflict: conflict }).select('*').single();
    if (error) throw error; return data;
  }
}

export class CustomerRepository extends SupabaseRepository { constructor(c) { super(c, 'customers'); } }
export class ObligationRepository extends SupabaseRepository { constructor(c) { super(c, 'obligations'); } }
export class PaymentRepository extends SupabaseRepository { constructor(c) { super(c, 'payments'); } }
export class ContactRepository extends SupabaseRepository { constructor(c) { super(c, 'contacts'); } }
export class PromiseRepository extends SupabaseRepository { constructor(c) { super(c, 'payment_promises'); } }
export class PaymentReportRepository extends SupabaseRepository {
  constructor(c) { super(c, 'payment_reports'); }
  async report({ customerId, obligationId, amount, evidence = {}, idempotencyKey }) {
    const { data, error } = await this.client.schema(SCHEMA).rpc('create_payment_report', {
      p_customer: customerId, p_obligation: obligationId, p_amount: amount,
      p_evidence: evidence, p_idempotency: idempotencyKey
    });
    if (error) throw error; return data;
  }
}
export class OptOutRepository extends SupabaseRepository { constructor(c) { super(c, 'opt_outs'); } }
export class ComplaintRepository extends SupabaseRepository { constructor(c) { super(c, 'complaints'); } }
export class ReconciliationCaseRepository extends SupabaseRepository { constructor(c) { super(c, 'reconciliation_cases'); } }

export function createCarteraRepositories(client) {
  return {
    customers: new CustomerRepository(client), obligations: new ObligationRepository(client),
    payments: new PaymentRepository(client), contacts: new ContactRepository(client),
    promises: new PromiseRepository(client), paymentReports: new PaymentReportRepository(client),
    optOuts: new OptOutRepository(client), complaints: new ComplaintRepository(client),
    reconciliationCases: new ReconciliationCaseRepository(client)
  };
}
