(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KoraPyg=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function total(rows,field){
    let amount=0,missing=0;
    for(const row of rows){
      const value=row[field];
      if(value==null||value===''||!Number.isFinite(Number(value)))missing++;
      else amount+=Math.round(Number(value)*100);
    }
    return {amount:amount/100,missing};
  }
  function result(name,income,cost,margin,expenses,losses,missing=0){
    return {name,income,cost,margin,expenses,losses,net:margin-expenses-losses,missing};
  }
  function retail(data,stores){
    const codes=new Set([...stores.map(s=>s.codigo),...data.sales.map(s=>s.tienda_codigo),...data.itemRows.map(s=>s.store),
      ...data.expenses.map(e=>e.tienda_codigo),...data.writeoffs.map(e=>e.tienda_codigo)]);
    const byStore=[...codes].map(code=>{
      const sales=data.sales.filter(s=>s.tienda_codigo===code);
      const income=total(sales,'total');
      const margin=total(data.itemRows.filter(s=>s.store===code),'value');
      const expenses=total(data.expenses.filter(e=>e.tienda_codigo===code),'monto');
      const losses=total(data.writeoffs.filter(e=>e.tienda_codigo===code),'valor');
      const missing=income.missing+margin.missing+expenses.missing+losses.missing;
      return {...result(code==='CENTRAL'?'Operación CENTRAL':stores.find(s=>s.codigo===code)?.nombre||code,income.amount,
        income.amount-margin.amount,margin.amount,expenses.amount,losses.amount,missing),code};
    });
    if(data.generalExpenses.some(e=>Number(e.amount)<0))throw Error('Gasto general Retail con signo inválido.');
    const general=total(data.generalExpenses,'amount');
    byStore.push({...result('Gastos generales Retail',0,0,0,general.amount,0,general.missing),code:'CENTRAL'});
    const sum=field=>byStore.reduce((n,s)=>n+s[field],0);
    return {stores:byStore,summary:result('Retail',sum('income'),sum('cost'),sum('margin'),sum('expenses'),sum('losses'),sum('missing'))};
  }
  function b2b(rows,expenses){
    const income=total(rows,'facturado'),cost=total(rows,'costo'),margin=total(rows,'utilidad');
    if(expenses.some(e=>Number(e.value)>0))throw Error('Gasto B2B con signo inválido.');
    const expense=total(expenses,'value');
    return result('B2B',income.amount,cost.amount,margin.amount,-expense.amount,0,
      income.missing+cost.missing+margin.missing+expense.missing);
  }
  function allies(rows,expenses){
    if(expenses.some(e=>Number(e.value)>0))throw Error('Gasto Aliados con signo inválido.');
    const margin=total(rows,'utilidad_creditek'),expense=total(expenses,'value');
    return result('Aliados',null,null,margin.amount,-expense.amount,0,margin.missing+expense.missing);
  }
  return {total,retail,b2b,allies};
});
