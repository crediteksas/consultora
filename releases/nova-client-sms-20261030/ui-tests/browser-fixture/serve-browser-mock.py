from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import hashlib
import json
import re

here = Path(__file__).resolve().parent
source = here.parents[1] / 'form.html'
expected = json.loads((here.parent / 'manifest.json').read_text())['form']['sha256']
raw = source.read_text()
assert hashlib.sha256(raw.encode()).hexdigest() == expected, 'Candidate drift: revalidate test harness source'
html = re.sub(r'<base\b[^>]*>', '', raw)
html = re.sub(r'<link\b[^>]*>', '', html)
html = re.sub(r'<script\b[^>]+src=[^>]*>\s*</script>', '', html)
html = html.replace('<title>KORA · Registro — Creditek</title>', '<title>NOVA SMS · prueba local sin envíos</title>')
bootstrap = '<script>\n' + (here / 'mock-bootstrap.js').read_text() + '\n</script>\n'
html = html.replace('<head>', '<head>\n<meta name="nova-candidate-sha256" content="' + expected + '">\n' + bootstrap, 1)
controls = '''<aside style="max-width:720px;margin:18px auto;padding:18px;border:3px solid #0b5264;background:white;color:#0b1e3d;font:16px system-ui;">
<h1 style="font-size:22px">PRUEBA LOCAL · ningún OTP real</h1>
<p>Endpoints y Turnstile simulados en memoria. Todas las conexiones externas están bloqueadas por CSP.</p>
<label><input type="checkbox" id="mockPilotEnabled" checked> Permitir SMS al celular sintético habilitado</label><p id="mockCapabilityStatus" role="status">Capacidad aún sin consultar</p>
<label for="mockSendMode">Siguiente resultado al pulsar un botón real de envío</label>
<select id="mockSendMode"><option value="uncertain">Incierto (202)</option><option value="failed">Fallido, aún bloqueado</option><option value="accepted">Aceptado</option><option value="reserved">Reservado (202)</option><option value="network">Respuesta perdida</option><option value="not_sent">No enviado definitivo</option></select>
<label for="mockStatusMode">Siguiente resultado al consultar el envío</label>
<select id="mockStatusMode"><option value="expired">Vencido confirmado</option><option value="accepted">Aceptado</option><option value="failed_wait">Fallido, esperar</option><option value="failed_terminal">Fallido terminal sin bloqueo</option><option value="uncertain">Incierto</option><option value="network">Consulta sin conexión</option><option value="verified">Ya verificado en otra pestaña (409)</option></select>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0"><button type="button" id="mockLoadFile">Cargar foto sintética y fijar control</button><button type="button" id="mockAdvance16">Avanzar 16 segundos simulados</button><button type="button" id="mockAdvance6m">Avanzar 6 minutos simulados</button></div>
<p id="mockFixtureState" role="status">Aún no se fijó foto de control.</p><p id="mockClock" role="status"></p>
<label for="mockStep">Nombre del paso comprobado</label><input id="mockStep" value="inicial" type="text">
<button type="button" id="mockReport">Comprobar conservación de archivo y datos</button>
<pre id="mockResults" style="white-space:pre-wrap;overflow-wrap:anywhere;font:12px monospace;margin-top:12px" aria-live="polite"></pre>
</aside>'''
html = html.replace('<body>', '<body>\n' + controls, 1)
(here / 'browser-mock.html').write_text(html)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/favicon.ico'):
            self.send_response(204); self.end_headers(); return
        if self.path.split('?')[0] not in ['/', '/browser-mock.html']:
            self.send_response(404); self.end_headers(); return
        data = html.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; media-src blob:")
        self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        self.send_response(405); self.end_headers()
    def log_message(self, *_): pass

server = HTTPServer(('127.0.0.1', 8787), Handler)
print('http://127.0.0.1:8787/?t=synthetic-link', flush=True)
server.serve_forever()
