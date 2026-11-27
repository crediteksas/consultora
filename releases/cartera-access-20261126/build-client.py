from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parent
P=R.parent/'cobra-evolucion-20261126'
O=R/'candidate'
def replace(s,old,new):
    assert s.count(old)==1,(old[:100],s.count(old))
    return s.replace(old,new,1)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
repo=R.parents[1]
for name in ['sidebar.js','kora-access-control.js']:
    assert sha(repo/'creditek/erp'/name)==sha(P/'navigation/baseline'/name), 'Rebase shared shell first: '+name
sidebar=(P/'access-scope/candidate/sidebar.js').read_text()
adapter=(O/'cartera-operador-client.js').read_text()
validator=adapter[adapter.index(' const uuid='):adapter.index(' function create(')]
sidebar=replace(sidebar,'  async function initialize() {','  const resolvePortfolioBootstrap = (()=>{\n'+validator+'\n return resolveBootstrap;\n  })();\n\n  async function initialize() {')
sidebar=replace(sidebar,"      const { data: perfil } = await withBootTimeout(\n        sb.from('perfiles').select('*').eq('id', userId).maybeSingle(),\n      );", "      const portfolioBoot = resolvePortfolioBootstrap(await withBootTimeout(sb.rpc('cartera_operador_inicio')), userId);\n      const profileResponse = portfolioBoot.restricted ? { data: portfolioBoot.profile } : await withBootTimeout(\n        sb.from('perfiles').select('*').eq('id', userId).maybeSingle(),\n      );\n      if (profileResponse.error) throw new Error('No se pudo comprobar el perfil.');\n      const perfil = profileResponse.data;")
sidebar=replace(sidebar,'      let puedeLeerCartera = false;\n      let puedeGestionarCartera = false;\n      if (typeof sb.rpc === \'function\') {',"      let puedeLeerCartera = portfolioBoot.restricted ? portfolioBoot.read : false;\n      let puedeGestionarCartera = portfolioBoot.restricted ? portfolioBoot.manage : false;\n      if (!portfolioBoot.restricted && typeof sb.rpc === 'function') {")
sidebar=replace(sidebar,'      const pageClient = sharedPageClient', '      let pageClient = sharedPageClient')
sidebar=replace(sidebar,'      window.creditekSidebar = { perfil, tiendas: [], sb: pageClient, authorization };\n','')
sidebar=replace(sidebar,"      completeBootStage('authorization', { allowed: true, experience: authorization.experience });", "      if (experience === 'portfolio') {\n        if (!window.KoraPortfolioClient) {\n          await withBootTimeout(new Promise((resolve,reject)=>{\n            const script=document.createElement('script');script.src='/creditek/erp/cartera-operador-client.js?v=1.0.0';\n            script.onload=resolve;script.onerror=()=>reject(new Error('No se pudo cargar la conexión restringida de Cartera.'));document.head.appendChild(script);\n          }));\n        }\n        if (!window.KoraPortfolioClient) throw new Error('No se pudo comprobar la conexión restringida de Cartera.');\n        pageClient = window.KoraPortfolioClient.create(pageClient, portfolioBoot);\n      }\n      window.creditekSidebar = { perfil, tiendas: [], sb: pageClient, authorization };\n      completeBootStage('authorization', { allowed: true, experience: authorization.experience });")
sidebar=replace(sidebar,'    const mountIncidentCenter = () => window.KoraIncidentCenter?.mount?.({',"    const restrictedPortfolio = profile.rol === 'operador_cartera';\n    if (restrictedPortfolio) {\n      main.querySelector('[data-kora-notifications]')?.setAttribute('hidden','');\n      main.querySelector('[data-kora-export]')?.setAttribute('hidden','');\n    }\n    const mountIncidentCenter = () => !restrictedPortfolio && window.KoraIncidentCenter?.mount?.({")
sidebar=replace(sidebar,'    const mountNotifications = () => window.KoraNotifications?.mount?.({','    const mountNotifications = () => !restrictedPortfolio && window.KoraNotifications?.mount?.({')
sidebar=replace(sidebar,'    const mountContextHelp = () => window.KoraContextHelp?.mount?.({','    const mountContextHelp = () => !restrictedPortfolio && window.KoraContextHelp?.mount?.({')
sidebar=replace(sidebar,'    const mountReportExport = () => window.KoraReportExport?.mount?.({ profile, sb: supabaseClient });','    const mountReportExport = () => !restrictedPortfolio && window.KoraReportExport?.mount?.({ profile, sb: supabaseClient });')
sidebar=replace(sidebar,"perfil.rol === 'operador_cartera' ? 'Aliados'", "perfil.rol === 'operador_cartera' ? escapeHtml(perfil.tienda_codigo ? 'Origen: '+perfil.tienda_codigo : 'Sin origen clásico asignado')")
sidebar=replace(sidebar,"if (profile.rol === 'operador_cartera') return '<span class=\"kora-extension\">Aliados</span>';", "if (profile.rol === 'operador_cartera') return '<span class=\"kora-extension\">'+escapeHtml(profile.tienda_codigo ? 'Origen: '+profile.tienda_codigo : 'Sin origen clásico asignado')+'</span>';")
(O/'sidebar.js').write_text(sidebar)
(O/'kora-access-control.js').write_text((P/'access-scope/candidate/kora-access-control.js').read_text())
html=(P/'candidate/creditos-cartera.html').read_text()
html=replace(html,'  <script src="sidebar.js', '  <script src="cartera-operador-client.js?v=1.0.0"></script>\n  <script src="sidebar.js')
html=replace(html,'</head>','<link rel="stylesheet" href="cartera-presentacion.css?v=1.0.0">\n</head>')
html=replace(html,'<section id="portfolio" class="panel active card"><div id="portfolioContent"></div></section>','<section id="portfolio" class="panel active card"><p id="classicScope" class="notice">Esta cartera muestra los créditos de las tiendas que tienes asignadas.</p><div id="portfolioContent"></div></section>')
html=replace(html,'<p>El crédito ya existe en KORA. Cada corte añade una observación de sus cuotas.</p>','<p>Seguimiento general de KrediYA: todas las tiendas y aliados incluidos en los cortes. Cada corte añade una observación; no crea una deuda ni confirma un pago.</p>')
html=replace(html,'</body>','<script src="cartera-presentacion.js?v=1.0.0"></script>\n</body>')
(O/'creditos-cartera.html').write_text(html)
(O/'cartera-presentacion.css').write_text((P/'visual/candidate/review.css').read_text())
(O/'cartera-presentacion.js').write_text((P/'visual/candidate/review.js').read_text().replace('review-v1','cartera-v1'))
(O/'creditos-cartera-app.js').write_text((P/'visual/candidate/creditos-cartera-app.js').read_text().replace(".order('ally_paid_at',{ascending:false,nullsFirst:false}).range", ".order('ally_paid_at',{ascending:false,nullsFirst:false}).order('id').range").replace("email:'Correo',internal:'Interno'", "email:'Correo',platform:'Plataforma',internal:'Interno'"))
app=(O/'creditos-cartera-app.js').read_text()
app=replace(app,"sb=context.sb;profile=context.perfil;", "sb=context.sb;profile=context.perfil;if(profile.rol==='operador_cartera')$('classicScope').textContent=profile.tienda_codigo?'Cartera clásica del origen '+profile.tienda_codigo+'. El seguimiento general de KrediYA se consulta en Calidad KrediYA.':'Cartera clásica pendiente de asignar un origen. La lista vacía no significa que no existan créditos. El seguimiento general de KrediYA está en su pestaña.';")
(O/'creditos-cartera-app.js').write_text(app)
for src,dst in [('candidate/cobra-krediya-connection.js','cobra-krediya-connection.js'),('candidate/cobra-krediya-panel.js','cobra-krediya-panel.js'),('candidate/quality-domain.js','cobra-krediya-domain.js'),('candidate/quality-persistence.js','cobra-krediya-persistence.js'),('evolution-domain.cjs','cobra-evolution-domain.js'),('evolution.css','cobra-evolution.css'),('visual/candidate/evolution-ui.js','cobra-evolution-ui.js')]:
    (O/dst).write_bytes((P/src).read_bytes())
manifest={'prepared_only':True,'production_writes':0,'reviewed_wrapper_definition_md5':'5a549a460deb7bc53e16d13f52c40cf1','baseline':{n:sha(repo/'creditek/erp'/n) for n in ['sidebar.js','kora-access-control.js','creditos-cartera.html','creditos-cartera-app.js']},'candidates':{p.name:sha(p) for p in O.glob('*') if p.suffix in ['.js','.mjs','.css','.html','.sql']}}
(R/'candidate-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'candidate_assets':len(manifest['candidates']),'active_source_changes':0,'production_changes':0}))
