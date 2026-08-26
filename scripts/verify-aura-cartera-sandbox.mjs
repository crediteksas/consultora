import assert from 'node:assert/strict';
import { createPool, loadCustomers } from './aura-cartera-sandbox-db.mjs';

const pool=createPool();const client=await pool.connect();
try{
  const customers=await loadCustomers(pool);assert.equal(customers.length,48);assert.equal(customers.every(x=>x.id.includes(':SIM-CUSTOMER-')),true);assert.equal(customers.reduce((sum,x)=>sum+x.balance,0),9573000);
  const tables=await client.query("select count(*)::int n from information_schema.tables where table_schema='cartera' and table_type='BASE TABLE'");assert.equal(tables.rows[0].n,12);
  const rls=await client.query("select count(*)::int n from pg_tables where schemaname='cartera' and rowsecurity");assert.equal(rls.rows[0].n,12);
  await client.query('begin');
  await client.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:'00000000-0000-0000-0000-000000000001',app_metadata:{cartera_role:'cartera_admin'}})]);
  const before=await client.query("select id,customer_id,balance from cartera.obligations where balance>0 order by external_id limit 1");const o=before.rows[0];
  const key='sandbox-regression:ya-pague';
  const first=await client.query('select cartera.create_payment_report($1,$2,$3,$4,$5) id',[o.customer_id,o.id,25000,JSON.stringify({fixture:true}),key]);
  const second=await client.query('select cartera.create_payment_report($1,$2,$3,$4,$5) id',[o.customer_id,o.id,25000,JSON.stringify({fixture:true}),key]);
  assert.equal(first.rows[0].id,second.rows[0].id);
  const after=await client.query('select balance from cartera.obligations where id=$1',[o.id]);assert.equal(after.rows[0].balance,before.rows[0].balance);
  const cases=await client.query('select count(*)::int n from cartera.reconciliation_cases where payment_report_id=$1',[first.rows[0].id]);assert.equal(cases.rows[0].n,1);
  const report=await client.query('select status from cartera.payment_reports where id=$1',[first.rows[0].id]);assert.equal(report.rows[0].status,'PENDING_VALIDATION');
  const audit=await client.query('select count(*)::int n from cartera.audit_events where trace_id=$1',['payment-report:'+first.rows[0].id]);assert.ok(audit.rows[0].n>=1);
  const sourceTime=await client.query('select source_updated_at,balance from cartera.obligations where id=$1',[o.id]);
  await client.query("update cartera.obligations set balance=1,source_updated_at=source_updated_at-interval '1 day' where id=$1",[o.id]);
  const stale=await client.query('select source_updated_at,balance from cartera.obligations where id=$1',[o.id]);assert.equal(stale.rows[0].balance,sourceTime.rows[0].balance);assert.equal(String(stale.rows[0].source_updated_at),String(sourceTime.rows[0].source_updated_at));
  await client.query('rollback');
  console.log(JSON.stringify({tables:12,rls:12,customers:48,total:9573000,fixtureParity:'MATCH',yaPague:'PASS',idempotency:'PASS',staleSnapshot:'PASS',audit:'PASS',realData:0}));
} catch(error){await client.query('rollback').catch(()=>{});throw error;} finally{client.release();await pool.end();}
