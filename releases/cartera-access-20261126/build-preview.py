from pathlib import Path
import re,shutil,json
R=Path(__file__).resolve().parent;P=R.parent/'cobra-evolucion-20261126';O=R/'preview';O.mkdir(exist_ok=True)
html=(R/'candidate/creditos-cartera.html').read_text()
html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html)
styles=['kora-product.css','kora-shell.css','kora-responsive.css','creditek-liquid.css','kora-finish.css','cobra-krediya-panel.css']
for n in styles:shutil.copyfile(P/'visual/baseline'/n,O/n)
for p in (P/'visual/baseline').glob('asset-*'):shutil.copyfile(p,O/p.name)
# Offline preview uses installed fallback fonts, never external font services.
for p in O.glob('*.css'):
    p.write_text(re.sub(r'@import\s+(?:url\()?\s*[\"\']https?://[^;]+;', '', p.read_text()))
for n in ['creditos-cartera-domain.js','cobra-krediya-domain.js','cobra-krediya-persistence.js']:shutil.copyfile(P/'visual/baseline'/n,O/n)
for n in ['creditos-cartera-app.js','cobra-krediya-panel.js','cobra-evolution-domain.js','cobra-evolution-ui.js','cobra-evolution.css','cartera-presentacion.css','cartera-presentacion.js']:shutil.copyfile(R/'candidate'/n,O/n)
shutil.copyfile(P/'fixtures.cjs',O/'fixtures.cjs')
fixture=(P/'visual/fixture.js').read_text();fixture=re.sub(r"if\(new URL\(location.href\)\.searchParams\.get\('baseline'\)[^\n]+",'',fixture)
(O/'fixture.js').write_text(fixture)
html=html.replace('<html ','<html class="creditek-shell-authenticated kora-visual-ready" ').replace('<body ','<body class="kora-product-page kora-responsive-ready" ').replace('<main id="app" class="main-content" hidden>','<main id="app" class="main-content">')
html=html.replace('</head>',''.join('<link rel="stylesheet" href="'+n+'">' for n in styles+['cobra-evolution.css','cartera-presentacion.css'])+'<style>.main-content{margin:0!important;width:100%!important}.review-note{margin:0;padding:12px 24px;background:#fff4d6;color:#604700;font:14px/1.5 sans-serif}</style></head>')
html=html.replace('<main id="app"','<p class="review-note">KORA · Cartera · prueba local con datos ficticios. Sin conexión ni guardados en producción.</p><main id="app"',1)
scripts=['creditos-cartera-domain.js','cobra-krediya-domain.js','cobra-krediya-persistence.js','fixtures.cjs','cobra-evolution-domain.js','fixture.js','creditos-cartera-app.js','cobra-evolution-ui.js','cobra-krediya-panel.js','cartera-presentacion.js']
html=html.replace('</body>',''.join('<script src="'+n+'"></script>' for n in scripts)+'</body>');(O/'index.html').write_text(html)
print(json.dumps({'preview':str(O/'index.html'),'fictional_only':True,'production_writes':0}))
