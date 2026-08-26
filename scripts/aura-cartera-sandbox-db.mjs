import pg from 'pg';

export function createPool() {
  const connectionString = process.env.AURA_CARTERA_SANDBOX_DATABASE_URL;
  if (!connectionString) throw new Error('Falta AURA_CARTERA_SANDBOX_DATABASE_URL');
  if (!connectionString.includes('gjkyxhmtrhnaiphajxha')) throw new Error('Ref sandbox incorrecta');
  return new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
}

export async function loadCustomers(pool) {
  const { rows } = await pool.query(`select c.external_id id,c.name,o.platform,o.store_id store,o.balance,
    o.installment_amount installment,to_char(o.due_date,'DD/MM/YYYY') due,
    greatest(0,current_date-o.due_date)::int days,o.status
    from cartera.customers c join cartera.obligations o on o.customer_id=c.id
    where c.sandbox_data and o.sandbox_data order by c.external_id`);
  return rows.map((row,index)=>{const paid=row.status==='PAID';const days=paid?0:row.days;return {...row,balance:Number(row.balance),installment:Number(row.installment),priority:index<3?'P1':index<5?'P2':index<20?'P3':'P4',segment:paid?'PAID':days===0?'DUE_TODAY':days<=15?'EARLY_DELINQUENCY':days<=30?'MID_DELINQUENCY':days<=60?'HIGH_DELINQUENCY':days<=90?'CRITICAL_DELINQUENCY':'SPECIALIZED_COLLECTION',eligible:!paid&&[0,3].includes(days),reconciliation:index%4===0?'PENDING':'RECONCILED'};});
}
