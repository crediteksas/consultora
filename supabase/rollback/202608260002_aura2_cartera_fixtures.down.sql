begin;
delete from cartera.customers where external_id like '%:SIM-CUSTOMER-%';
commit;
