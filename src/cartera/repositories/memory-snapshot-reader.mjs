export class MemorySnapshotReader{
  constructor(rows=[]){this.rows=[...rows];}
  find(customer_id,platform){return this.rows.find(row=>row.customer_id===customer_id&&row.platform===platform)||null;}
}
