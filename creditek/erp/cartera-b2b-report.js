(function(global){
  'use strict';
  const D=global.CreditekCarteraB2BDomain;
  const fields=['inicial','cargos','abonos','ajustes','saldo'];
  const sum=(rows,field)=>rows.reduce((n,row)=>n+Math.round(Number(row[field])*100),0)/100;
  const date=value=>value?new Date(value+'T00:00:00Z'):null;
  function build({summaries,movements,from,to,mode='detailed'}){
    if(!from||!to||from>to||!summaries.length)throw new Error('Selecciona un cliente y un período válido antes de descargar.');
    const codes=new Set(summaries.map(c=>c.cliente_codigo));
    const selected=movements.filter(m=>codes.has(m.tienda_codigo)&&m.fecha>=from&&m.fecha<=to);
    const names=new Map(summaries.map(c=>[c.cliente_codigo,c.cliente]));
    const tables=[{
      heading:'Resumen de cartera',headers:['Tienda / cliente','Saldo inicial','Cargos nuevos','Abonos','Ajustes de auditoría','Saldo al cierre'],
      columnTypes:['text',...fields.map(()=>'currency')],
      rows:summaries.map(c=>[c.cliente,...fields.map(field=>c[field])]),
      totalRows:[['TOTAL NETO',...fields.map(field=>sum(summaries,field))]],
    }];
    if(summaries.length>1)tables.push({
      heading:'Saldos sin compensar clientes',headers:['Concepto','Por cobrar','A favor del cliente'],
      columnTypes:['text','currency','currency'],
      rows:[['Saldo inicial','inicial'],['Saldo al cierre','saldo']].map(([label,field])=>[
        label,sum(summaries.filter(c=>c[field]>=0),field),-sum(summaries.filter(c=>c[field]<0),field),
      ]),
    });
    if(mode!=='summary'){
      tables.push({
        heading:'Composición del saldo inicial',headers:['Tienda / cliente','Origen','Valor','Fecha de corte','Fecha de registro','ID de movimiento'],
        columnTypes:['text','text','currency','date','date','text'],
        rows:summaries.flatMap(c=>[
          [c.cliente,'Saldo anterior al '+from,c.inicialArrastrado,null,null,''],
          ...c.cargasIniciales.map(m=>[c.cliente,'Carga inicial',Number(m.monto),date(m.fecha_corte),date(m.fecha),m.id]),
        ]),
        totalRows:[['TOTAL SALDO INICIAL','',sum(summaries,'inicial'),'','','']],
      });
      tables.push({
        heading:'Cargos, abonos y ajustes del período',
        headers:['Fecha efectiva','Tienda / cliente','Concepto','Cargo nuevo','Abono','Ajuste de auditoría','Responsable','ID de movimiento'],
        columnTypes:['date','text','text','currency','currency','currency','text','text'],
        rows:selected.filter(m=>!D.esCargaInicial(m)).sort((a,b)=>b.fecha.localeCompare(a.fecha)||String(a.id).localeCompare(String(b.id))).map(m=>[
          date(m.fecha),names.get(m.tienda_codigo),m.concepto,
          m.tipo==='cargo'&&!D.esAjusteAuditoria(m)?Number(m.monto):null,
          m.tipo==='abono'&&!D.esAjusteAuditoria(m)?Number(m.monto):null,
          D.esAjusteAuditoria(m)?(m.tipo==='cargo'?1:-1)*Number(m.monto):null,
          m.responsable||'No registrado',m.id,
        ]),
        totalRows:[['TOTAL DEL PERÍODO','','',...['cargos','abonos','ajustes'].map(field=>sum(summaries,field)),'','']],
      });
    }
    return {
      title:summaries.length===1?'Cartera B2B · '+summaries[0].cliente:'Cartera B2B · tiendas y clientes',
      mode:mode==='summary'?'summary':'detailed',scope:{label:summaries.length===1?summaries[0].cliente:'Clientes consultados'},
      route:global.location.pathname+global.location.search+'#detalle-cartera',
      filters:[['Desde',from],['Hasta',to],['Cliente',summaries.length===1?summaries[0].cliente:summaries.length+' tiendas y clientes']],
      tables,
      pdfTables:summaries.length===1?[{
        heading:'Resumen de cartera',headers:['Concepto','Valor'],columnTypes:['text','currency'],
        rows:['Saldo inicial','Cargos nuevos (+)','Abonos (-)','Ajustes de auditoría (+/-)'].map((label,index)=>[label,summaries[0][fields[index]]]),
        totalRows:[['SALDO AL CIERRE',summaries[0].saldo]],
      },...tables.slice(1)]:tables,
    };
  }
  global.KoraCarteraB2BReport=Object.freeze({build});
})(typeof window!=='undefined'?window:globalThis);
