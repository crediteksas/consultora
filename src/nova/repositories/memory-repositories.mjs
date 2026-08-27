export class MemoryCustomerRepository{constructor(rows=[]){this.rows=rows;}findById(id){return this.rows.find(x=>x.id===id)||null;}}
export class MemorySaleRepository{constructor(rows=[]){this.rows=rows;}findByCustomerId(id){return this.rows.filter(x=>x.customer_id===id);}}
export class MemorySnapshotRepository{constructor(){this.rows=new Map();}key(id,p){return`${id}:${p}`;}find(id,p){return this.rows.get(this.key(id,p))||null;}save(row){this.rows.set(this.key(row.customer_id,row.platform),row);return row;}}
