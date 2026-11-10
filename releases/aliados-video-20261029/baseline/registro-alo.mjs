var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// after/registro-alo.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var REGISTRATION_LEGACY_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KORA \xB7 Registro \u2014 Creditek</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --azul: #0B1E3D;
  --turquesa: #00C4CC;
  --bg: #F8FAFC;
  --border: #E2E8F0;
  --text2: #4B5563;
  --verde: #16A34A;
  --rojo: #DC2626;
  --radius: 14px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--azul);
  line-height: 1.5;
  padding-bottom: 40px;
}
.wrap { max-width: 480px; margin: 0 auto; padding: 0 18px; }
header { padding: 24px 0 16px; text-align: center; }
.logo-title { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 20px; color: var(--azul); letter-spacing: 0.02em; }
.logo-title span { color: var(--turquesa); }
.tienda-tag {
  margin-top: 10px; display: inline-block; background: #E8F4F8; color: var(--azul);
  font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(11,30,61,0.08);
}
.tienda-tag b { color: var(--turquesa); }
form { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 18px; margin-top: 12px; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 12.5px; font-weight: 600; color: var(--text2); margin-bottom: 6px; }
.field label .req { color: var(--rojo); }
.field label .opt { color: #94A3B8; font-weight: 400; }
input[type=text], input[type=tel], input[type=email], select {
  width: 100%; border: 1.5px solid var(--border); border-radius: 10px;
  padding: 13px 14px; font-size: 16px; font-family: 'DM Sans', sans-serif; color: var(--azul);
  outline: none; transition: border-color .15s;
  -webkit-appearance: none; appearance: none;
  background: white;
}
select { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234B5563'><path d='M7 10l5 5 5-5z'/></svg>"); background-repeat: no-repeat; background-position: right 12px center; background-size: 18px; }
input:focus, select:focus { border-color: var(--turquesa); box-shadow: 0 0 0 3px rgba(0,196,204,0.15); }
.help { font-size: 11.5px; color: #94A3B8; margin-top: 5px; }
.ref-block { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #FBFDFE; }
.ref-block .ref-title { font-size: 12px; font-weight: 700; color: var(--turquesa); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
.otp-row { display: flex; gap: 8px; }
.otp-row input { flex: 1; }
.btn-secondary {
  white-space: nowrap; background: var(--azul); color: white; border: none; border-radius: 10px;
  padding: 0 16px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif;
}
.btn-secondary:disabled { background: #CBD5E1; cursor: not-allowed; }
.otp-status { font-size: 12.5px; margin-top: 8px; font-weight: 600; display: none; }
.otp-status.ok { display: block; color: var(--verde); }
.otp-status.pending { display: block; color: var(--text2); font-weight: 500; }
.otp-status.err { display: block; color: var(--rojo); }
.code-row { display: none; margin-top: 10px; gap: 8px; }
.code-row.show { display: flex; }
.file-input-wrap { position: relative; }
.file-input-wrap input[type=file] {
  width: 100%; border: 1.5px dashed var(--border); border-radius: 10px; padding: 12px 14px;
  font-size: 13px; color: var(--text2); background: #FBFDFE;
}
.checkbox-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
.checkbox-row input[type=checkbox] { width: 19px; height: 19px; margin-top: 1px; flex-shrink: 0; accent-color: var(--turquesa); }
.checkbox-row label { font-size: 12.5px; color: var(--text2); line-height: 1.5; font-weight: 400; }
.checkbox-row a { color: var(--turquesa); font-weight: 600; }
.btn-submit {
  width: 100%; background: var(--turquesa); color: white; border: none; border-radius: 12px;
  padding: 15px; font-size: 15.5px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif;
  margin-top: 6px;
}
.btn-submit:disabled { background: #CBD5E1; cursor: not-allowed; }
.msg-box { border-radius: 10px; padding: 12px 14px; font-size: 13px; margin-top: 12px; display: none; }
.msg-box.show { display: block; }
.msg-box.err { background: #FEF2F2; color: var(--rojo); border: 1px solid #FECACA; }
.msg-box.ok { background: #F0FDF4; color: var(--verde); border: 1px solid #BBF7D0; }
.success-screen { display: none; text-align: center; padding: 50px 20px; }
.success-screen.show { display: block; }
.success-screen .check { font-size: 52px; margin-bottom: 14px; }
.success-screen h2 { font-family: 'Montserrat', sans-serif; font-size: 20px; margin-bottom: 8px; }
.success-screen p { font-size: 14px; color: var(--text2); }
.blocked-screen {
  display: none; background: white; border: 1px solid var(--border);
  border-radius: var(--radius); padding: 44px 24px; margin-top: 12px; text-align: center;
}
.blocked-screen.show { display: block; }
.blocked-screen .lock { font-size: 42px; margin-bottom: 12px; }
.blocked-screen h2 { font-family: 'Montserrat', sans-serif; font-size: 19px; margin-bottom: 8px; }
.blocked-screen p { color: var(--text2); font-size: 13.5px; }
.locked-context {
  border: 1.5px solid var(--border); border-radius: 10px; padding: 12px 14px;
  background: #F1F5F9; font-size: 14px; font-weight: 600;
}
#turnstileContainer { min-height: 66px; margin-top: 12px; }
.form-hidden { display: none; }
</style>
<link rel="stylesheet" href="/design-system/components/kora-product.css">
<script src="/design-system/components/kora-product.js" defer><\/script>
</head>
<body>
<div class="wrap">
  <header>
    <div data-kora-brand data-variant="public"></div>
    <div id="tiendaTag" class="tienda-tag" style="display:none;"></div>
  </header>

  <div class="blocked-screen" id="linkBlockedScreen" role="alert">
    <div class="lock">\u{1F512}</div>
    <h2>No se puede abrir este registro</h2>
    <p id="linkBlockedMessage">Enlace de registro inv\xE1lido o vencido.</p>
  </div>

  <form id="formRegistro" class="form-hidden">
    <div class="field">
      <label>Tienda o aliado</label>
      <div class="locked-context" id="origenBloqueado">Validando enlace...</div>
    </div>

    <div class="field">
      <label>Vendedor que registra <span class="req">*</span></label>
      <select id="captadorSelect" disabled>
        <option value="">Cargando...</option>
      </select>
      <div class="help" id="captadorHelp">Solo aparecen vendedores activos de esta tienda.</div>
    </div>

    <div class="field">
      <label>C\xE9dula <span class="req">*</span></label>
      <input type="text" id="cedula" inputmode="numeric" maxlength="12" placeholder="N\xFAmero de c\xE9dula" autocomplete="off">
    </div>

    <div class="field">
      <label>Nombre completo <span class="req">*</span></label>
      <input type="text" id="nombreCompleto" placeholder="Nombre y apellidos" autocomplete="off">
    </div>

    <div class="field">
      <label>Celular <span class="req">*</span></label>
      <div class="otp-row">
        <input type="tel" id="celular" inputmode="numeric" maxlength="10" placeholder="3XXXXXXXXX" autocomplete="off">
        <button type="button" class="btn-secondary" id="btnEnviarOtp" disabled>Enviar c\xF3digo</button>
      </div>
      <div class="otp-status" id="otpStatus"></div>
      <div class="code-row" id="codeRow">
        <input type="text" id="codigoOtp" inputmode="numeric" maxlength="6" placeholder="C\xF3digo de 6 d\xEDgitos">
        <button type="button" class="btn-secondary" id="btnVerificarOtp">Verificar</button>
      </div>
      <div id="turnstileContainer"></div>
    </div>

    <div class="field">
      <label>Correo <span class="opt">(opcional, si tiene)</span></label>
      <input type="email" id="email" placeholder="correo@ejemplo.com" autocomplete="off">
    </div>

    <div class="field">
      <label>Ciudad <span class="req">*</span></label>
      <input type="text" id="ciudad" placeholder="Ciudad donde vive" autocomplete="off">
    </div>

    <div class="field">
      <label>Direcci\xF3n <span class="req">*</span></label>
      <input type="text" id="direccion" placeholder="Direcci\xF3n donde vive" autocomplete="street-address">
    </div>

    <div class="field">
      <label>\xBFQu\xE9 producto le interesa? <span class="req">*</span></label>
      <input type="text" id="productoInteres" placeholder="Ej: iPhone 13, moto, licuadora..." autocomplete="off">
    </div>

    <div class="field">
      <label>Financiera <span class="opt">(opcional, si ya sabe)</span></label>
      <select id="financiera">
        <option value="">No sabe / no aplica</option>
        <option value="payjoy">PayJoy</option>
        <option value="krediya">Krediya</option>
        <option value="alocredit">Alo Credit</option>
        <option value="addi">Addi</option>
      </select>
    </div>

    <div class="ref-block">
      <div class="ref-title">Referencia 1 \u2014 Amigo/a o conocido/a</div>
      <div class="field" style="margin-bottom:8px;">
        <input type="text" id="ref1Nombre" placeholder="Nombre completo">
      </div>
      <div class="field" style="margin-bottom:8px;">
        <input type="tel" id="ref1Telefono" inputmode="numeric" maxlength="10" placeholder="Tel\xE9fono">
      </div>
      <div class="field" style="margin-bottom:0;">
        <input type="text" id="ref1Parentesco" placeholder="Parentesco (ej: amiga, compa\xF1ero de trabajo)">
      </div>
    </div>

    <div class="ref-block">
      <div class="ref-title">Referencia 2 \u2014 Familiar</div>
      <div class="field" style="margin-bottom:8px;">
        <input type="text" id="ref2Nombre" placeholder="Nombre completo">
      </div>
      <div class="field" style="margin-bottom:8px;">
        <input type="tel" id="ref2Telefono" inputmode="numeric" maxlength="10" placeholder="Tel\xE9fono">
      </div>
      <div class="field" style="margin-bottom:0;">
        <input type="text" id="ref2Parentesco" placeholder="Parentesco (ej: hermano, mam\xE1)">
      </div>
    </div>

    <div class="field">
      <label>C\xE9dula \u2014 frente <span class="req">*</span></label>
      <div class="file-input-wrap">
        <input type="file" id="fotoFrente" accept="image/*" capture="environment">
      </div>
    </div>

    <div class="field">
      <label>C\xE9dula \u2014 reverso <span class="req">*</span></label>
      <div class="file-input-wrap">
        <input type="file" id="fotoReverso" accept="image/*" capture="environment">
      </div>
    </div>

    <div class="field">
      <label>Selfie sosteniendo la c\xE9dula <span class="req">*</span></label>
      <div class="file-input-wrap">
        <input type="file" id="fotoSelfie" accept="image/*" capture="user">
      </div>
      <div class="help">Que se vea tu cara y la c\xE9dula en la misma foto.</div>
    </div>

    <div class="checkbox-row">
      <input type="checkbox" id="autDatos">
      <label for="autDatos">Autorizo a Creditek SAS el tratamiento de mis datos personales seg\xFAn la <a href="../legal/index.html" target="_blank">pol\xEDtica de privacidad</a>. <span class="req">*</span></label>
    </div>
    <div class="checkbox-row">
      <input type="checkbox" id="autComercial">
      <label for="autComercial">Acepto recibir comunicaciones comerciales de Creditek (opcional).</label>
    </div>

    <div class="msg-box" id="msgBox"></div>

    <button type="submit" class="btn-submit" id="btnSubmit" disabled>Enviar registro</button>
  </form>

  <div class="success-screen" id="successScreen">
    <div class="check">\u2705</div>
    <h2>\xA1Registro completo!</h2>
    <p>Gracias, ya quedaste registrado en Creditek. Tu asesor contin\xFAa el proceso contigo.</p>
    <div id="fotoWarning" style="display:none; margin-top:16px;">
      <p id="fotoWarningText" style="color:var(--rojo); font-size:13px; margin-bottom:10px;">El registro ya qued\xF3 guardado, pero una o m\xE1s fotos no se subieron. Intenta de nuevo sin salir de esta pantalla.</p>
      <button type="button" class="btn-submit" id="btnReintentarFotos" style="width:auto; padding:10px 20px;">Reintentar subir fotos</button>
    </div>
  </div>
</div>

<script>
// \u2500\u2500\u2500 Config \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Asume mismo subdominio de Cloudflare que creditek-bot (comercial-853),
// porque el Worker "creditek-clientes" a\xFAn no existe / no est\xE1 desplegado.
// CONFIRMAR esta URL con Oscar apenas haga el primer \`wrangler deploy\`.
const API = 'https://creditek-clientes.comercial-853.workers.dev';
const AUT_VERSION = 'v1-jul2026';
const enlaceToken = new URLSearchParams(location.search).get('t');

let contextoValido = false;
let otpVerificado = false;
let celularVerificado = null;
let cedulaVerificada = null;
let ultimoEnvioOtp = 0;
let turnstileToken = null;
let turnstileWidgetId = null;
let registroSession = null;
let documentosSession = null;
let registroEnCurso = false;
let subidaFotosEnCurso = false;

const form = document.getElementById('formRegistro');
const captadorSelect = document.getElementById('captadorSelect');
const tiendaTag = document.getElementById('tiendaTag');
const btnSubmit = document.getElementById('btnSubmit');
const msgBox = document.getElementById('msgBox');

function mostrarBloqueoEnlace(
  mensaje = 'Enlace de registro inv\xE1lido o vencido.',
) {
  contextoValido = false;
  form.classList.add('form-hidden');
  document.getElementById('linkBlockedMessage').textContent = mensaje;
  document.getElementById('linkBlockedScreen').classList.add('show');
}

function agregarOpcionCaptador(id, nombre) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = nombre;
  captadorSelect.appendChild(option);
}

function renderCaptadores(contexto) {
  const captadores = Array.isArray(contexto.captadores)
    ? contexto.captadores
    : [];
  captadorSelect.replaceChildren();
  const help = document.getElementById('captadorHelp');

  if (captadores.length === 0) {
    agregarOpcionCaptador('', 'No hay vendedores activos');
    captadorSelect.disabled = true;
    help.textContent =
      'No hay vendedores activos para esta tienda. Comun\xEDcate con el administrador.';
    help.style.color = 'var(--rojo)';
    contextoValido = false;
    return;
  }

  if (contexto.tipo === 'personal') {
    agregarOpcionCaptador(captadores[0].id, captadores[0].nombre);
    captadorSelect.disabled = true;
    help.textContent = 'Este enlace est\xE1 asignado a este vendedor.';
  } else {
    agregarOpcionCaptador('', 'Selecciona el vendedor');
    captadores.forEach((captador) => {
      agregarOpcionCaptador(captador.id, captador.nombre);
    });
    captadorSelect.disabled = false;
    help.textContent = 'Solo aparecen vendedores activos de esta tienda.';
  }
  contextoValido = true;
}

function cargarTurnstileApi() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function reiniciarTurnstile() {
  turnstileToken = null;
  if (
    turnstileWidgetId !== null &&
    window.turnstile &&
    typeof turnstile.reset === 'function'
  ) {
    turnstile.reset(turnstileWidgetId);
  }
  evaluarEnvioOtp();
}

async function initTurnstile() {
  const configResponse = await fetch(\`\${API}/api/registro/config\`);
  if (!configResponse.ok) throw new Error('config_no_disponible');
  const config = await configResponse.json();
  const turnstileSiteKey = config.turnstile_site_key;
  if (typeof turnstileSiteKey !== 'string' || !turnstileSiteKey) {
    throw new Error('config_invalida');
  }
  await cargarTurnstileApi();
  turnstileWidgetId = turnstile.render('#turnstileContainer', {
    sitekey: turnstileSiteKey,
    action: 'registro-cliente',
    callback: (token) => {
      turnstileToken = token;
      evaluarEnvioOtp();
    },
    'expired-callback': reiniciarTurnstile,
    'error-callback': () => {
      turnstileToken = null;
      mostrarErrorOtp(
        'No se pudo completar la verificaci\xF3n de seguridad. Intenta de nuevo.',
      );
      evaluarEnvioOtp();
    },
  });
}

async function initRegistroSeguro() {
  if (!enlaceToken) {
    mostrarBloqueoEnlace();
    return;
  }

  try {
    const contextResponse = await fetch(
      \`\${API}/api/registro/contexto?t=\${encodeURIComponent(enlaceToken)}\`,
    );
    if (!contextResponse.ok) {
      mostrarBloqueoEnlace();
      return;
    }
    const data = await contextResponse.json();
    const contexto = data.contexto;
    if (
      !contexto ||
      !contexto.origen ||
      typeof contexto.origen.nombre !== 'string'
    ) {
      mostrarBloqueoEnlace();
      return;
    }

    // Use the validated destination before exposing the legacy form or starting OTP.
    const registrationTarget = data.registration_url;
    let destination;
    try {
      if (data.ok !== true || typeof registrationTarget !== 'string' ||
          registrationTarget.length > 8192 ||
          !registrationTarget.startsWith('https://registro.crediteksas.com/') ||
          /[\\u0000-\\u0020\\u007f#]/.test(registrationTarget)) throw new Error('invalid_destination');
      destination = new URL(registrationTarget);
      if (destination.origin !== 'https://registro.crediteksas.com' ||
          destination.username || destination.password || destination.port || destination.hash ||
          !/^\\?t=[^&]*$/.test(destination.search) ||
          destination.searchParams.getAll('t').length !== 1 ||
          destination.searchParams.get('t') !== enlaceToken) throw new Error('invalid_destination');
    } catch {
      mostrarBloqueoEnlace();
      return;
    }
    if (destination.pathname === '/nova/registro' ||
        destination.pathname === '/nova/registro-inicio') {
      location.replace(destination.href);
      return;
    }
    if (!/^\\/creditek\\/erp\\/registro(?:\\.html|\\/)?$/.test(destination.pathname)) {
      mostrarBloqueoEnlace();
      return;
    }

    tiendaTag.textContent = \`Registrando para: \${contexto.origen.nombre}\`;
    tiendaTag.style.display = 'inline-block';
    document.getElementById('origenBloqueado').textContent =
      contexto.origen.nombre;
    renderCaptadores(contexto);
    form.classList.remove('form-hidden');
    document.getElementById('linkBlockedScreen').classList.remove('show');

    try {
      await initTurnstile();
    } catch {
      contextoValido = false;
      mostrarErrorOtp(
        'La verificaci\xF3n de seguridad no est\xE1 disponible. Intenta recargar la p\xE1gina.',
      );
    }
    evaluarSubmit();
    evaluarEnvioOtp();
  } catch {
    mostrarBloqueoEnlace(
      'No pudimos validar este enlace. Revisa tu conexi\xF3n e intenta de nuevo.',
    );
  }
}

// \u2500\u2500\u2500 Validaciones \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function celularValido(v) { return /^3\\d{9}$/.test(v); }
function cedulaValida(v) { return /^\\d{6,12}$/.test(v); }
function obtenerReferencias() {
  return [1, 2].map((numero) => ({
    nombre: document.getElementById(\`ref\${numero}Nombre\`).value.trim(),
    telefono: document.getElementById(\`ref\${numero}Telefono\`).value,
    parentesco:
      document.getElementById(\`ref\${numero}Parentesco\`).value.trim() || null,
  })).filter((referencia) =>
    referencia.nombre || referencia.telefono || referencia.parentesco
  );
}
function referenciasValidas() {
  return obtenerReferencias().every((referencia) =>
    referencia.nombre.length >= 2 && celularValido(referencia.telefono)
  );
}

const celularInput = document.getElementById('celular');
const btnEnviarOtp = document.getElementById('btnEnviarOtp');
const otpStatus = document.getElementById('otpStatus');
const codeRow = document.getElementById('codeRow');
const btnVerificarOtp = document.getElementById('btnVerificarOtp');
const codigoOtpInput = document.getElementById('codigoOtp');

function mostrarErrorOtp(mensaje) {
  otpStatus.className = 'otp-status err';
  otpStatus.textContent = mensaje;
}

function invalidarSesionOtp() {
  otpVerificado = false;
  celularVerificado = null;
  cedulaVerificada = null;
  registroSession = null;
  otpStatus.className = 'otp-status';
  codeRow.classList.remove('show');
}

function evaluarEnvioOtp() {
  btnEnviarOtp.disabled =
    !contextoValido ||
    !celularValido(celularInput.value) ||
    !cedulaValida(document.getElementById('cedula').value) ||
    !turnstileToken;
}

celularInput.addEventListener('input', () => {
  celularInput.value = celularInput.value.replace(/\\D/g, '').slice(0, 10);
  if (otpVerificado && celularInput.value !== celularVerificado) {
    invalidarSesionOtp();
  }
  evaluarEnvioOtp();
  evaluarSubmit();
});

document.getElementById('cedula').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\\D/g, '').slice(0, 12);
  if (otpVerificado && e.target.value !== cedulaVerificada) {
    invalidarSesionOtp();
  }
  evaluarEnvioOtp();
  evaluarSubmit();
});
['ref1Telefono','ref2Telefono'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\\D/g, '').slice(0, 10);
  });
});

btnEnviarOtp.addEventListener('click', async () => {
  const celular = celularInput.value;
  const cedula = document.getElementById('cedula').value;
  if (
    !contextoValido ||
    !celularValido(celular) ||
    !cedulaValida(cedula) ||
    !turnstileToken
  ) return;
  const ahora = Date.now();
  if (ahora - ultimoEnvioOtp < 15000) return;
  ultimoEnvioOtp = ahora;
  btnEnviarOtp.disabled = true;
  otpStatus.className = 'otp-status pending';
  otpStatus.textContent = 'Enviando c\xF3digo...';
  try {
    const res = await fetch(\`\${API}/api/otp/enviar\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enlace_token: enlaceToken,
        cedula: cedula,
        celular: celular,
        turnstile_token: turnstileToken
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok === true) {
      otpStatus.className = 'otp-status pending';
      otpStatus.textContent = 'C\xF3digo enviado por WhatsApp. Puede tardar unos segundos.';
      codeRow.classList.add('show');
    } else if (res.status === 404) {
      mostrarBloqueoEnlace();
    } else if (res.status === 429) {
      mostrarErrorOtp(
        'Alcanzaste el l\xEDmite de c\xF3digos. Espera antes de intentarlo de nuevo.',
      );
    } else {
      mostrarErrorOtp(
        'No se pudo enviar el c\xF3digo. Completa nuevamente la verificaci\xF3n de seguridad.',
      );
    }
  } catch {
    mostrarErrorOtp(
      'Error de conexi\xF3n. Revisa tu internet e intenta de nuevo.',
    );
  } finally {
    reiniciarTurnstile();
  }
});

codigoOtpInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\\D/g, '').slice(0, 6);
});

btnVerificarOtp.addEventListener('click', async () => {
  const celular = celularInput.value;
  const codigo = codigoOtpInput.value;
  if (codigo.length !== 6) return;
  btnVerificarOtp.disabled = true;
  try {
    const res = await fetch(\`\${API}/api/otp/verificar\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enlace_token: enlaceToken,
        cedula: document.getElementById('cedula').value,
        celular: celular,
        codigo
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (
      res.ok &&
      data.ok === true &&
      typeof data.registro_session === 'string'
    ) {
      registroSession = data.registro_session;
      otpVerificado = true;
      celularVerificado = celular;
      cedulaVerificada = document.getElementById('cedula').value;
      otpStatus.className = 'otp-status ok';
      otpStatus.textContent = '\u2713 Celular verificado';
      codeRow.classList.remove('show');
    } else if (res.status === 404) {
      mostrarBloqueoEnlace();
    } else if (res.status === 429) {
      mostrarErrorOtp(
        'Se agotaron los intentos de este c\xF3digo. Solicita uno nuevo.',
      );
    } else {
      mostrarErrorOtp('C\xF3digo incorrecto, vencido o ya utilizado.');
    }
  } catch {
    mostrarErrorOtp('Error de conexi\xF3n al verificar. Intenta de nuevo.');
  } finally {
    btnVerificarOtp.disabled = false;
    evaluarSubmit();
  }
});

// \u2500\u2500\u2500 Habilitar bot\xF3n final \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function evaluarSubmit() {
  const ok =
    contextoValido &&
    !!captadorSelect.value &&
    cedulaValida(document.getElementById('cedula').value) &&
    document.getElementById('nombreCompleto').value.trim().length > 2 &&
    celularValido(celularInput.value) &&
    otpVerificado &&
    registroSession !== null &&
    celularInput.value === celularVerificado &&
    document.getElementById('cedula').value === cedulaVerificada &&
    document.getElementById('ciudad').value.trim().length > 1 &&
    document.getElementById('direccion').value.trim().length > 2 &&
    document.getElementById('productoInteres').value.trim().length > 1 &&
    referenciasValidas() &&
    document.getElementById('autDatos').checked &&
    document.getElementById('fotoFrente').files.length > 0 &&
    document.getElementById('fotoReverso').files.length > 0 &&
    document.getElementById('fotoSelfie').files.length > 0 &&
    !registroEnCurso;
  btnSubmit.disabled = !ok || registroEnCurso;
}
form.addEventListener('input', () => {
  evaluarSubmit();
  evaluarEnvioOtp();
});
form.addEventListener('change', () => {
  evaluarSubmit();
  evaluarEnvioOtp();
});

// \u2500\u2500\u2500 Compresi\xF3n + subida de las 3 fotos (despu\xE9s de un registro exitoso) \u2500
// Las fotos de celular pesan 3-8 MB; se comprimen a JPEG ~0.7 de calidad con
// lado m\xE1ximo 1600px antes de subir, para que no mueran en conexiones lentas
// de tienda (AJUSTES_Registro_v2, Cambio 3).
async function comprimirImagen(file, maxSide = 1600, quality = 0.7) {
  let width, height, drawSource;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width; height = bitmap.height; drawSource = bitmap;
  } catch (e) {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = URL.createObjectURL(file);
    });
    width = img.naturalWidth; height = img.naturalHeight; drawSource = img;
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(drawSource, 0, 0, w, h);
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function mostrarErrorDocumento(
  mensaje = 'Una o m\xE1s fotos no se pudieron subir.',
) {
  document.getElementById('fotoWarningText').textContent = mensaje;
  document.getElementById('fotoWarning').style.display = 'block';
}

async function subirFoto(file, tipo) {
  try {
    if (!documentosSession) return false;
    const comprimida = await comprimirImagen(file);
    if (!comprimida) return false;
    const base64 = await blobABase64(comprimida);
    const res = await fetch(\`\${API}/api/documentos\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentos_session: documentosSession,
        tipo,
        mime: 'image/jpeg',
        foto_base64: base64
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function subirTresFotos() {
  if (subidaFotosEnCurso) return false;
  subidaFotosEnCurso = true;
  const frente = document.getElementById('fotoFrente').files[0];
  const reverso = document.getElementById('fotoReverso').files[0];
  const selfie = document.getElementById('fotoSelfie').files[0];
  try {
    const resultados = await Promise.all([
      subirFoto(frente, 'frente'),
      subirFoto(reverso, 'reverso'),
      subirFoto(selfie, 'selfie'),
    ]);
    return resultados.every(Boolean);
  } finally {
    subidaFotosEnCurso = false;
  }
}

async function manejarFotosPostRegistro() {
  const ok = await subirTresFotos();
  if (ok) {
    document.getElementById('fotoWarning').style.display = 'none';
  } else {
    mostrarErrorDocumento(
      'El registro qued\xF3 guardado, pero una o m\xE1s fotos no se subieron. Revisa tu conexi\xF3n e intenta de nuevo.',
    );
  }
}

document.getElementById('btnReintentarFotos').addEventListener('click', async (e) => {
  const btn = e.target;
  if (subidaFotosEnCurso) return;
  btn.disabled = true;
  btn.textContent = 'Subiendo...';
  const ok = await subirTresFotos();
  btn.disabled = false;
  btn.textContent = 'Reintentar subir fotos';
  if (ok) {
    document.getElementById('fotoWarning').style.display = 'none';
  } else {
    mostrarErrorDocumento(
      'Las fotos siguen pendientes. Revisa tu conexi\xF3n antes de reintentar.',
    );
  }
});

// \u2500\u2500\u2500 Submit \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function mostrarErrorRegistro(
  mensaje = 'No se pudo completar el registro. Revisa los datos e intenta de nuevo.',
) {
  msgBox.className = 'msg-box err show';
  msgBox.textContent = mensaje;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (btnSubmit.disabled || registroEnCurso) return;
  registroEnCurso = true;
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Enviando...';
  msgBox.className = 'msg-box';

  const payload = {
    enlace_token: enlaceToken,
    captador_id: captadorSelect.value,
    registro_session: registroSession,
    nombre_completo: document.getElementById('nombreCompleto').value.trim(),
    email: document.getElementById('email').value.trim() || null,
    ciudad: document.getElementById('ciudad').value.trim(),
    direccion: document.getElementById('direccion').value.trim(),
    producto_interes: document.getElementById('productoInteres').value.trim(),
    financiera: document.getElementById('financiera').value || null,
    referencias: obtenerReferencias(),
    autorizacion_datos: document.getElementById('autDatos').checked,
    autorizacion_comercial: document.getElementById('autComercial').checked,
    autorizacion_version: AUT_VERSION
  };

  try {
    const res = await fetch(\`\${API}/api/registro\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (
      res.ok &&
      data.ok === true &&
      typeof data.documentos_session === 'string'
    ) {
      documentosSession = data.documentos_session;
      form.classList.add('form-hidden');
      document.getElementById('successScreen').classList.add('show');
      await manejarFotosPostRegistro();
    } else if (res.status === 400) {
      mostrarErrorRegistro(
        'La sesi\xF3n o el enlace ya no son v\xE1lidos. Verifica el celular nuevamente.',
      );
      invalidarSesionOtp();
    } else {
      mostrarErrorRegistro();
    }
  } catch {
    mostrarErrorRegistro('Error de conexi\xF3n al registrar. Intenta de nuevo.');
  } finally {
    if (!documentosSession) {
      registroEnCurso = false;
      btnSubmit.textContent = 'Enviar registro';
      evaluarSubmit();
    }
  }
});

captadorSelect.addEventListener('change', evaluarSubmit);
initRegistroSeguro();
<\/script>
</body>
</html>
`;
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var PENDING_HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>AURA \xB7 Pendientes de aliados</title><style>\n:root{font-family:Arial,sans-serif;color:#17365d;background:#f3f6fa;font-size:16px}*{box-sizing:border-box}body{margin:0}header{background:#0b1e3d;color:white;padding:24px max(20px,calc((100vw - 1080px)/2));display:flex;gap:18px;align-items:center}header strong{font-size:26px;color:#24c6cc}main{max-width:1080px;margin:28px auto;padding:0 18px 60px}h1{font-size:27px;margin:0 0 12px}h2{font-size:21px}h3{font-size:17px}p{line-height:1.5}a{color:#087782}.card{background:white;border:1px solid #dbe3ed;border-radius:14px;padding:24px;margin:16px 0}.row{display:flex;gap:16px;flex-wrap:wrap}.row>*{flex:1;min-width:200px}label{display:block;font-weight:bold;margin:12px 0 6px}input:not([type=checkbox]),textarea,select{font:inherit;width:100%;padding:12px;border:1px solid #b8c7d6;border-radius:8px}textarea{min-height:95px}button,.button{background:#17365d;color:white;font:inherit;font-weight:bold;padding:12px 18px;border:0;border-radius:8px;cursor:pointer;display:inline-block;text-decoration:none;margin:8px 6px 0 0}button.secondary{background:#e6eef5;color:#17365d}button:disabled{opacity:.5;cursor:wait}.hint{color:#53667b;font-size:14px}.notice{background:#fff7dc;border-left:4px solid #e5a021;padding:14px;line-height:1.5}.status{display:inline-block;border-radius:20px;background:#e7f4f5;color:#07545b;padding:7px 12px;font-size:14px;font-weight:bold}.error{background:#ffe8e5;color:#8d261b;padding:16px;border-radius:8px}.success{background:#e1f4e7;color:#195e33;padding:16px;border-radius:8px}[hidden]{display:none!important}.check{font-weight:normal;display:flex;gap:10px;align-items:flex-start}.check input{margin-top:4px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #e1e7ed;vertical-align:top}.scroll{overflow:auto}.item{border-top:1px solid #dbe3ed;padding:18px 0}.links a{display:block;margin:10px 0}.small{font-size:13px;color:#53667b}#message{position:sticky;top:0;z-index:3}footer{border-top:1px solid #dbe3ed;padding-top:18px;margin-top:24px}\n</style><script src="app.js?v=20261029alo1" defer><\/script></head><body><header><strong>AURA</strong><span>Seguimiento de aliados \xB7 Creditek</span></header><main>\n<div id="message" role="status" aria-live="polite"></div>\n<section id="login" class="card"><h1>Corregir pendientes de un aliado</h1><p>Consulta con el radicado <strong>o</strong> con la identificaci\xF3n del representante; basta uno de los dos. Solo podr\xE1s modificar lo que qued\xF3 pendiente; la carpeta original se conserva.</p><form id="loginForm"><div class="row"><div><label for="radicado">Radicado</label><input id="radicado" placeholder="CK-2026-6221" pattern="[Cc][Kk]-[0-9]{4}-[0-9]{4}" autocomplete="off"></div><div><label for="identificacion">Identificaci\xF3n del representante legal</label><input id="identificacion" inputmode="numeric" autocomplete="off"><p class="hint">Si no tienes el radicado, puedes buscar con esta identificaci\xF3n.</p></div></div><button type="submit">Consultar pendientes</button></form><p><a href="../">Registrar un nuevo aliado</a></p></section>\n<section id="adminList" hidden><div class="card"><h1>Revisi\xF3n interna de pendientes</h1><p>Califica los soportes, devuelve lo que deba corregirse y prepara el paquete vigente para la plataforma solicitada.</p><label for="filter">Buscar negocio, asesor o radicado</label><input id="filter" placeholder="Luis, \xC1lex, CK-2026\u2026"><button id="refresh" class="secondary">Actualizar</button><div id="records" class="scroll"></div></div></section>\n<section id="detail" hidden></section>\n<footer class="hint">Los documentos recibidos requieren revisi\xF3n. El paquete listo para enviar y la creaci\xF3n confirmada por la plataforma son estados distintos.</footer>\n</main></body></html>\n';
var PENDING_JS = `// Extensi\xF3n privada del panel existente. No solicita firmas ni env\xEDa correos.
function aloPanel(r){
 if(!(r.plataformasSolicitadas||[]).includes('alo_credit'))return '';
 const a=r.alo||{},data=(r.data||{}).alo||{};
 return '<article class="item"><h2>Al\xF3 Credit \xB7 ALO-FO-CA-001</h2><p>'+esc(a.status||'Formato pendiente de preparar')+'</p>'+
 '<p>Jennifer firma por Creditek antes de enviar a firma electr\xF3nica a la tienda. El KAM firma al recibir en Al\xF3. Cada paso se registra despu\xE9s de comprobarlo.</p>'+
 (a.configMissing?.length?'<p class="notice">Datos por completar: '+a.configMissing.map(esc).join('; ')+'.</p>':'')+
 '<label>Raz\xF3n social o titular seg\xFAn C\xE1mara<input id="aloLegal" maxlength="180" value="'+esc(data.razonSocial)+'"></label>'+
 '<label>Matr\xEDcula del establecimiento<input id="aloRegistration" maxlength="180" value="'+esc(data.matricula)+'"></label>'+
 '<label class="check"><input type="checkbox" id="aloDataChecked">Contrast\xE9 estos datos con la C\xE1mara y la identificaci\xF3n.</label><button type="button" id="aloSaveData">Guardar datos Al\xF3</button> '+
 '<button type="button" id="aloGenerate">Preparar borrador Al\xF3</button>'+
 (a.draft?'<p><a target="_blank" rel="noopener noreferrer" href="https://drive.google.com/file/d/'+encodeURIComponent(a.draft.fileId)+'/view">Abrir borrador oficial \xB7 versi\xF3n '+esc(a.draft.revision)+'</a></p>':'')+
 '<details><summary>Registrar documento preparado y firma de la tienda</summary><p>Registra \xFAnicamente acciones que ya comprobaste en Google. Estos controles no env\xEDan solicitudes.</p>'+
 '<label>ID del PDF en la carpeta original<input id="aloFileId"></label>'+
 '<label class="check"><input type="checkbox" id="aloCompanyChecked">La firma de Jennifer est\xE1 insertada y revis\xE9 que los datos y el dise\xF1o est\xE9n completos.</label>'+
 '<button type="button" id="aloCompany">Registrar documento con firma de Creditek</button>'+
 '<label>Identificador de la solicitud confirmada en Google<input id="aloRequestId" value="'+esc(a.subSignature?.requestId)+'"></label>'+
 '<label class="check"><input type="checkbox" id="aloRequestChecked">Google confirm\xF3 la solicitud a la tienda y comprob\xE9 que no existe otra.</label>'+
 '<button type="button" id="aloRequested">Registrar solicitud de firma enviada</button>'+
 '<label>Fecha de firma seg\xFAn auditor\xEDa, con zona horaria<input id="aloSignedAt" placeholder="2026-10-29T15:00:00-05:00"></label>'+
 '<label class="check"><input type="checkbox" id="aloAuditChecked">Abr\xED el PDF final y su auditor\xEDa: coinciden la solicitud, la identidad del representante, la fecha y la firma de Creditek.</label>'+
 '<button type="button" id="aloSigned">Registrar firma comprobada de la tienda</button></details>'+
 '<details><summary>Preparar paquete y registrar env\xEDo a Al\xF3</summary><p>Selecciona abajo los archivos del expediente. Incluye el PDF firmado y su auditor\xEDa.</p>'+
 Object.entries({camara:'C\xE1mara completa del establecimiento',fachada:'Foto de fachada',interior:'Foto de interior',vitrinas:'Foto de vitrinas',datos:'Datos conciliados con C\xE1mara e identificaci\xF3n',firma:'Firma de Creditek y firma de la tienda con auditor\xEDa'}).map(([k,v])=>'<label class="check"><input type="checkbox" data-alo-control="'+k+'">'+esc(v)+'</label>').join('')+
 '<button type="button" id="aloPackage">Preparar paquete Al\xF3</button>'+
 '<label>ID del correo realmente enviado a Al\xF3<input id="aloMailId"></label><button type="button" id="aloSubmitted">Registrar env\xEDo comprobado</button>'+
 '<label>ID de confirmaci\xF3n de creaci\xF3n por Al\xF3<input id="aloConfirmationId"></label><button type="button" id="aloCreated">Registrar creaci\xF3n confirmada</button></details></article>';
}
function bindAlo(){
 if(!document.getElementById('aloSaveData'))return;
 const action=async(operation,payload={})=>{const result=await api('pending_alo',{radicado:record.radicado,version:record.version,operation,...payload});record=result.record;render();message('Estado de Al\xF3 guardado. No se enviaron correos ni solicitudes de firma desde este control.');};
 $('aloSaveData').onclick=()=>run(()=>action('data',{data:{razonSocial:$('aloLegal').value.trim(),matricula:$('aloRegistration').value.trim()},confirmed:$('aloDataChecked').checked}));
 $('aloGenerate').onclick=()=>run(()=>action('generate'));
 $('aloCompany').onclick=()=>run(()=>action('company_prepared',{fileId:$('aloFileId').value.trim(),checked:$('aloCompanyChecked').checked,layoutChecked:$('aloCompanyChecked').checked}));
 $('aloRequested').onclick=()=>run(()=>action('requested',{requestId:$('aloRequestId').value.trim(),checked:$('aloRequestChecked').checked}));
 $('aloSigned').onclick=()=>run(()=>action('signed',{fileId:$('aloFileId').value.trim(),requestId:$('aloRequestId').value.trim(),signedAt:$('aloSignedAt').value.trim(),auditChecked:$('aloAuditChecked').checked,identityChecked:$('aloAuditChecked').checked,companySignatureChecked:$('aloAuditChecked').checked}));
 $('aloPackage').onclick=()=>run(()=>action('package',{checklist:Object.fromEntries([...document.querySelectorAll('[data-alo-control]')].map(x=>[x.dataset.aloControl,x.checked])),selectedFiles:[...document.querySelectorAll('[data-pack]:checked')].map(x=>x.dataset.pack)}));
 $('aloSubmitted').onclick=()=>run(()=>action('submitted',{gmailMessageId:$('aloMailId').value.trim(),checked:!!$('aloMailId').value.trim()}));
 $('aloCreated').onclick=()=>run(()=>action('created',{confirmationId:$('aloConfirmationId').value.trim(),checked:!!$('aloConfirmationId').value.trim()}));
}

'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let adminKey='',token='',record=null,records=[],types={},busy=false,inventory=[];
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('admin')){adminKey=fragment.get('admin');sessionStorage.setItem('auraPendingAdmin',adminKey);history.replaceState(null,'',location.pathname+location.search);}else adminKey=sessionStorage.getItem('auraPendingAdmin')||'';
const statusNames={pending:'Pendiente de corregir',rejected:'Requiere correcci\xF3n',staged:'Guardado; falta enviar a revisi\xF3n',review:'Recibido; pendiente de revisi\xF3n',approved:'Aprobado'};
function message(text,error=false){$('message').className=error?'error':'success';$('message').textContent=text;}
async function api(action,body={}){const r=await fetch('/api/pendientes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...body,...(adminKey?{adminKey}:{token})}),cache:'no-store'});const d=await r.json();if(!d.ok)throw Error(d.error||'No se pudo confirmar la operaci\xF3n.');return d;}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(x=>x.disabled=true);try{await fn();}catch(e){message(e.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(x=>x.disabled=false);}}
function uuid(){return crypto.randomUUID();}
$('radicado').value=new URLSearchParams(location.search).get('radicado')||'';
$('loginForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const radicado=$('radicado').value.trim().toUpperCase(),identificacion=$('identificacion').value.trim();if(!radicado&&!identificacion)throw Error('Escribe el radicado o la identificaci\xF3n del representante.');const d=await api('pending_login',{radicado,identificacion});$('identificacion').value='';if(d.matches){$('detail').hidden=false;$('detail').innerHTML='<div class="card"><h2>Selecciona el negocio que vas a corregir</h2>'+d.matches.map((x,n)=>'<p><button type="button" data-match="'+n+'">'+esc(x.record.business)+' \xB7 '+esc(x.record.radicado)+'</button></p>').join('')+'</div>';$('detail').querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>{const selected=d.matches[Number(b.dataset.match)];token=selected.token;record=selected.record;render();message('Expediente consultado. Solo se muestran sus pendientes.');});message('Hay varios negocios con esa identificaci\xF3n. Selecciona el que corresponde.');return;}token=d.token;record=d.record;render();message('Expediente consultado. Solo se muestran sus pendientes.');});});
$('refresh').onclick=()=>run(loadList);$('filter').oninput=renderList;
async function loadList(){const d=await api('pending_list');records=d.records;types=d.types;$('login').hidden=true;$('adminList').hidden=false;renderList();}
function renderList(){const q=$('filter').value.toLowerCase();const rows=records.filter(r=>[r.business,r.owner,...r.radicados].join(' ').toLowerCase().includes(q));$('records').innerHTML='<p class="hint">'+rows.length+' expedientes</p><table><thead><tr><th>Negocio / radicado</th><th>Responsable</th><th>Estado</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+esc(r.business)+'</strong><br>'+esc(r.radicados.join('; '))+'</td><td>'+esc(r.owner)+'</td><td>'+esc(r.state)+'</td><td><button data-open="'+esc(r.radicado)+'">Revisar</button></td></tr>').join('')+'</tbody></table>';$('records').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>run(()=>openRecord(b.dataset.open)));}
async function openRecord(rad){const d=await api('pending_login',{radicado:rad});record=d.record;token=d.token;inventory=[];render();}
function render(){const r=record;$('login').hidden=true;$('detail').hidden=false;if(adminKey)$('adminList').hidden=true;
 $('detail').innerHTML='<div class="card"><h1>'+esc(r.business)+'</h1><p><strong>'+esc(r.radicado)+'</strong> \xB7 '+esc(r.owner)+'</p><span class="status">'+esc(r.state)+'</span><div class="links"><a target="_blank" rel="noopener noreferrer" href="'+esc(r.folderUrl)+'">Abrir carpeta original</a>'+(r.packageUrl?'<a target="_blank" rel="noopener noreferrer" href="'+esc(r.packageUrl)+'">Documentos vigentes del expediente</a>':'')+'</div>'+(!r.auditComplete?'<p class="notice">La revisi\xF3n integral del expediente sigue pendiente. Los soportes a\xFAn no revisados pueden generar observaciones adicionales.</p>':'')+(adminKey?adminContent(r):execContent(r))+'<button id="back" class="secondary">'+(adminKey?'Volver al listado':'Consultar otro radicado')+'</button></div>';
 $('back').onclick=()=>{record=null;token='';$('detail').hidden=true;if(adminKey){$('adminList').hidden=false;run(loadList);}else $('login').hidden=false;};
 if(adminKey){bindAdmin();bindAlo();}else bindExecutive();window.scrollTo({top:0,behavior:'smooth'});
}
function execContent(r){return '<h2>Pendientes por corregir</h2>'+(!r.items.length?'<p>No tienes correcciones por cargar. Consulta el estado de la revisi\xF3n.</p>':'')+r.items.map(i=>'<article class="item" data-item="'+esc(i.id)+'"><h3>'+esc(i.label)+'</h3><p>'+esc(i.detail)+'</p><span class="status">'+esc(statusNames[i.status])+'</span>'+i.files.map(f=>'<p><a target="_blank" rel="noopener noreferrer" href="'+esc(f.url)+'">Ver soporte cargado</a></p>').join('')+(i.internal?'<p class="hint">Esta revisi\xF3n corresponde al equipo interno; no necesitas cargar otro archivo aqu\xED.</p>':i.status==='review'?'<p class="hint">Espera el resultado de la revisi\xF3n. Si se devuelve, podr\xE1s corregir este soporte.</p>':i.text?'<label for="response-'+esc(i.id)+'">Correcci\xF3n / aclaraci\xF3n</label><textarea id="response-'+esc(i.id)+'" data-response="'+esc(i.id)+'" maxlength="3000">'+esc(i.response)+'</textarea>':'<label for="file-'+esc(i.id)+'">'+(i.status==='staged'?'Reemplazar carga guardada':'Adjuntar correcci\xF3n')+'</label><input type="file" id="file-'+esc(i.id)+'" data-file="'+esc(i.id)+'" accept="'+esc(i.accept)+'">'+(i.type==='camara'&&!((r.plataformasSolicitadas||[]).length===1&&r.plataformasSolicitadas[0]==='alo_credit')?'<div class="row"><div><label for="date-'+esc(i.id)+'">Fecha de expedici\xF3n</label><input type="date" id="date-'+esc(i.id)+'"></div><div><label for="ciiu-'+esc(i.id)+'">C\xF3digos CIIU del certificado</label><input id="ciiu-'+esc(i.id)+'" placeholder="4741"></div></div><p class="hint">Menos de 60 d\xEDas de expedici\xF3n y actividad 4741. Adjunta el certificado completo.</p>':'')+'<p class="hint">M\xE1ximo 20 MB por archivo.'+(i.type==='video'?' MP4; debe mostrar exterior e interior y coincidir con las fotos.':i.type==='fachada'?' Deben verse el nombre del establecimiento y la nomenclatura.':'')+'</p><button type="button" data-upload="'+esc(i.id)+'">Guardar este soporte</button>')+'</article>').join('')+'<p class="notice">Guarda cada soporte y luego pulsa \u201CEnviar correcciones a revisi\xF3n\u201D. La carga no aprueba autom\xE1ticamente los documentos.</p><button id="submitCorrections">Enviar correcciones a revisi\xF3n</button>';}
async function fileData(file){if(!file)throw Error('Selecciona el archivo corregido.');if(file.size>20*1024*1024)throw Error('El archivo supera 20 MB.');const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('No se pudo leer el archivo.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});if(file.type.startsWith('image/')){const img=await new Promise((resolve,reject)=>{const v=new Image();v.onload=()=>resolve(v);v.onerror=()=>reject(Error('No se pudo convertir la fotograf\xEDa. Adjunta una imagen JPG, PNG o WebP.'));v.src=url;});const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);return {base64:canvas.toDataURL('image/jpeg',.82).split(',')[1],tipo:'image/jpeg',nombre:file.name.replace(/\\.[^.]+$/,'')+'.jpg'};}return {base64:url.split(',')[1],tipo:file.type||(/\\.mp4$/i.test(file.name)?'video/mp4':/\\.pdf$/i.test(file.name)?'application/pdf':''),nombre:file.name};}
function bindExecutive(){document.querySelectorAll('[data-upload]').forEach(b=>b.onclick=()=>run(async()=>{const id=b.dataset.upload;const item=record.items.find(i=>i.id===id);if(item.type==='fachada'&&!window.confirm('Confirma que en la foto se ven el nombre del establecimiento y la nomenclatura del local.'))return;const f=$('file-'+id).files[0];if(item.type==='video'&&!/\\.mp4$/i.test(f?.name||''))throw Error('Selecciona un video en formato MP4.');const requestId=uuid();message('Guardando soporte en la carpeta original\u2026');const d=await api('pending_upload',{radicado:record.radicado,version:record.version,itemId:id,requestId,file:await fileData(f),fechaCamara:$('date-'+id)?.value,ciiu:$('ciiu-'+id)?.value});record=d.record;render();message('Soporte guardado. Al terminar, env\xEDa las correcciones a revisi\xF3n.');}));
 $('submitCorrections').onclick=()=>run(async()=>{const responses=[...document.querySelectorAll('[data-response]')].filter(x=>x.value.trim()).map(x=>({id:x.dataset.response,value:x.value.trim()}));let saved;try{saved=JSON.parse(sessionStorage.getItem('aura-submit-'+record.radicado)||'null');}catch{}const requestId=saved&&saved.version===record.version?saved.id:uuid();sessionStorage.setItem('aura-submit-'+record.radicado,JSON.stringify({id:requestId,version:record.version}));const d=await api('pending_submit',{radicado:record.radicado,version:record.version,requestId,responses});sessionStorage.removeItem('aura-submit-'+record.radicado);record=d.record;render();message(d.mailState==='awaiting_review'?'Correcciones guardadas para revisar. El informe se enviar\xE1 al terminar la revisi\xF3n; no necesitas volver a cargar los archivos.':d.mailState==='sent'?'Correcciones enviadas. \xD3scar recibi\xF3 el aviso para revisar.':'Correcciones guardadas. El env\xEDo del aviso no pudo confirmarse; no repitas la carga.');});}
function dataContent(r){if((r.plataformasSolicitadas||[]).length===1&&r.plataformasSolicitadas[0]==='alo_credit')return '';const d=r.data||{};return '<article class="item"><h2>Datos del M3</h2><p class="hint">Corrige los datos despu\xE9s de contrastarlos con los documentos. Actualizar el M3 conserva los enlaces de los Excel existentes.</p><div class="row">'+Object.entries({nombreComercial:'Nombre del negocio',direccion:'Direcci\xF3n',departamento:'Departamento',municipio:'Municipio',nombre:'Nombre del representante',cedula:'Identificaci\xF3n del representante',telefono:'Celular de la tienda',correo:'Correo de la tienda',nit:'NIT'}).map(([k,v])=>'<div><label for="m3-'+k+'">'+v+'</label><input id="m3-'+k+'" data-m3="'+k+'" value="'+esc(d[k])+'"></div>').join('')+'</div><h3>Usuarios M3 \xB7 hasta cinco</h3>'+Array.from({length:5},(_,n)=>{const u=(d.vendedores||[])[n]||{};return '<details '+(u.nombres?'open':'')+'><summary>Usuario '+(n+1)+'</summary><div class="row" data-vendor="'+n+'">'+Object.entries({nombres:'Nombres',apellidos:'Apellidos',cedula:'Identificaci\xF3n',celular:'Celular',correo:'Correo'}).map(([k,v])=>'<div><label for="vendor-'+n+'-'+k+'">'+v+'</label><input id="vendor-'+n+'-'+k+'" data-v="'+k+'" value="'+esc(u[k])+'"></div>').join('')+'</div></details>';}).join('')+'<label class="check"><input type="checkbox" id="m3Confirmed">Contrast\xE9 estos datos con los documentos y las correcciones recibidas.</label><button id="updateM3" class="secondary">Actualizar M3 en las carpetas originales</button></article>'; }
function adminContent(r){return aloPanel(r)+'<h2>Calificaci\xF3n interna</h2><p class="hint">Aprueba solo despu\xE9s de abrir y revisar el soporte. Puedes devolverlo con una observaci\xF3n concreta.</p>'+r.items.map(i=>'<article class="item" data-review="'+esc(i.id)+'"><h3>'+esc(i.label)+'</h3><label>Observaci\xF3n que ver\xE1 el ejecutivo<textarea data-detail maxlength="3000">'+esc(i.detail)+'</textarea></label><label>Estado<select data-state>'+Object.entries(statusNames).map(([k,v])=>'<option value="'+k+'" '+(i.status===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label><label class="check"><input type="checkbox" data-checked '+(i.status==='approved'?'checked':'')+'>He revisado este soporte o dato y confirmo su resultado.</label>'+i.files.map(f=>'<p><a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">'+esc(f.name)+'</a></p>').join('')+(i.response?'<p><strong>Respuesta del ejecutivo:</strong> '+esc(i.response)+'</p>':'')+'</article>').join('')+'<article class="item"><h3>Agregar un pendiente</h3><label for="addType">Soporte o dato</label><select id="addType"><option value="">No agregar</option>'+Object.entries(types).filter(([k,v])=>!v.retired).map(([k,v])=>'<option value="'+k+'">'+esc(v.label)+'</option>').join('')+'</select><label for="addDetail">Qu\xE9 debe corregir</label><textarea id="addDetail" maxlength="3000"></textarea></article><label class="check"><input type="checkbox" id="auditComplete" '+(r.auditComplete?'checked':'')+'>Complet\xE9 la auditor\xEDa integral de este expediente.</label><label for="reviewNote">Observaci\xF3n interna del resultado</label><textarea id="reviewNote" maxlength="3000"></textarea><button id="saveReview">Guardar revisi\xF3n y avisarme por correo</button>'+dataContent(r)+'<article class="item"><h2>Archivos y paquete del expediente</h2><p>Selecciona solo los archivos que deben enviarse. Para Al\xF3 usa su control espec\xEDfico. El control general prepara el paquete de PayJoy.</p><button id="loadFiles" class="secondary">Ver archivos del expediente</button><div id="fileList"></div><div class="row"><div><label for="finalCameraDate">Fecha de C\xE1mara verificada en el documento</label><input type="date" id="finalCameraDate"></div><div><label for="finalCiiu">CIIU verificados</label><input id="finalCiiu" placeholder="4741"></div></div><h3>Controles antes de enviar</h3>'+Object.entries({camara:'C\xE1mara completa, legible y con menos de 60 d\xEDas',ciiu:'Actividad econ\xF3mica 4741 en la C\xE1mara',fachada:'Fachada con nombre y nomenclatura legibles',video:'Video MP4: exterior e interior concordantes',cedulas:'Identificaciones completas y concordantes',firma:'Convenio firmado por quien corresponde',m3:'M3 vigente completo, datos y usuarios conciliados',direccion:'Direcci\xF3n del local contrastada con soporte'}).map(([k,v])=>'<label class="check"><input type="checkbox" data-control="'+k+'">'+esc(v)+'</label>').join('')+'<button id="prepare">Aprobar y preparar paquete para Diana</button></article>';}
function reviewPayload(prepare=false){return {radicado:record.radicado,version:record.version,items:[...document.querySelectorAll('[data-review]')].map(el=>({id:el.dataset.review,status:el.querySelector('[data-state]').value,detail:el.querySelector('[data-detail]').value,checked:el.querySelector('[data-checked]').checked})),add:$('addType').value?[{type:$('addType').value,detail:$('addDetail').value}]:[],auditComplete:$('auditComplete').checked,note:$('reviewNote').value,preparePackage:prepare,camera:{fechaCamara:$('finalCameraDate').value,ciiu:$('finalCiiu').value},selectedFiles:[...document.querySelectorAll('[data-pack]:checked')].map(x=>x.dataset.pack),checklist:Object.fromEntries([...document.querySelectorAll('[data-control]')].map(x=>[x.dataset.control,x.checked]))};}
function bindAdmin(){if($('updateM3'))$('updateM3').onclick=()=>run(async()=>{const data=Object.fromEntries([...document.querySelectorAll('[data-m3]')].map(x=>[x.dataset.m3,x.value.trim()]));data.vendedores=[...document.querySelectorAll('[data-vendor]')].map(el=>Object.fromEntries([...el.querySelectorAll('[data-v]')].map(x=>[x.dataset.v,x.value.trim()]))).filter(v=>Object.values(v).some(Boolean));const d=await api('pending_data',{radicado:record.radicado,version:record.version,data,regenerate:true,confirmed:$('m3Confirmed').checked});record=d.record;render();message('M3 actualizado en las carpetas originales. Contin\xFAa la revisi\xF3n de los soportes.');});const save=prepare=>run(async()=>{const d=await api('pending_review',reviewPayload(prepare));record=d.record;render();message(d.mailState==='sent'?'Revisi\xF3n guardada y correo enviado a \xD3scar.':'Revisi\xF3n guardada. El env\xEDo del correo requiere comprobarse.');});$('saveReview').onclick=()=>save(false);$('prepare').onclick=()=>save(true);if((record.plataformasSolicitadas||[]).length===1&&record.plataformasSolicitadas[0]==='alo_credit'){$('prepare').hidden=true;document.querySelectorAll('[data-control]').forEach(x=>x.closest('label').hidden=true);$('finalCameraDate').closest('.row').hidden=true;}$('loadFiles').onclick=()=>run(async()=>{const d=await api('pending_files',{radicado:record.radicado});inventory=d.files;$('fileList').innerHTML=inventory.map(f=>'<label class="check"><input type="checkbox" data-pack="'+esc(f.id)+'"><span>'+esc(f.name)+'<br><span class="small">'+esc(f.path)+'</span> \xB7 <a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">Abrir</a></span></label>').join('');});}
if(adminKey)run(async()=>{await loadList();const rad=new URLSearchParams(location.search).get('radicado');if(rad)await openRecord(rad);}).catch(e=>message(e.message,true));
`;
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var ENDPOINT = "https://script.google.com/macros/s/AKfycbzYrPbQ4hdb5KVaLry8h19re0yM-M6fwLHLit8Ai7Q8Lj8x4wbR91yzudBpQp5AmWUM/exec";
async function pendingAPI(request) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  const fail = /* @__PURE__ */ __name222((error, status) => Response.json({ ok: false, error }, { status, headers }), "fail");
  if (request.method !== "POST") return fail("M\xE9todo no permitido.", 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Origen no permitido.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail("Origen no permitido.", 403);
  const limit = 30 * 1024 * 1024;
  if (Number(request.headers.get("content-length") || 0) > limit) return fail("Solicitud demasiado grande.", 413);
  try {
    const reader = request.body?.getReader();
    if (!reader) return fail("Solicitud vac\xEDa.", 400);
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return fail("Solicitud demasiado grande.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    const body = new TextDecoder().decode(bytes);
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return fail("Solicitud inv\xE1lida.", 400);
    }
    if (!/^pending_(health|login|get|list|import|files|upload|submit|review|data|alo)$/.test(data.action || "")) return fail("Acci\xF3n inv\xE1lida.", 400);
    const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body, redirect: "follow", signal: AbortSignal.timeout(11e4) });
    if (!response.ok) return fail("Aura no pudo confirmar la operaci\xF3n. Consulta el radicado antes de repetir.", 502);
    const text = await response.text();
    try {
      JSON.parse(text);
    } catch {
      return fail("Respuesta no confirmada. Consulta el radicado antes de repetir.", 502);
    }
    return new Response(text, { status: 200, headers });
  } catch {
    return fail("No se pudo confirmar la operaci\xF3n. Recarga el radicado para verificar el estado.", 502);
  }
}
__name(pendingAPI, "pendingAPI");
__name2(pendingAPI, "pendingAPI");
__name22(pendingAPI, "pendingAPI");
__name222(pendingAPI, "pendingAPI");
var REGISTRO_PUBLIC_ASSETS = [
  "creditek/convenios/submission-guard.js",
  "creditek/convenios/aura-convenios.css",
  "creditek/shared/branding/creditek-logo.png",
  "design-system/components/kora-product.css",
  "design-system/components/kora-product.js",
  "design-system/components/kora-ecosystem.css",
  "design-system/styles/index.css",
  "design-system/styles/fonts.css",
  "design-system/styles/reset.css",
  "design-system/styles/base.css",
  "design-system/styles/animations.css",
  "design-system/tokens/index.css",
  "design-system/components/index.css",
  "design-system/components/actions.css",
  "design-system/components/forms.css",
  "design-system/components/feedback.css",
  "design-system/components/data-display.css",
  "design-system/components/navigation.css",
  "design-system/components/overlays.css",
  "design-system/utilities/index.css",
  "design-system/utilities/layout.css",
  "design-system/utilities/accessibility.css",
  "design-system/utilities/responsive.css"
];
var PUBLIC_ASSET_PATHS = new Set(REGISTRO_PUBLIC_ASSETS.map((path) => "/" + path));
var SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(self), microphone=(), geolocation=()",
  "x-frame-options": "SAMEORIGIN"
});
var ALLOWED_PATHS = [
  /^\/creditek\/convenios\/pendientes(?:\/|\/index\.html)?$/,
  /^\/creditek\/convenios\/pendientes\/app\.js$/,
  /^\/$/,
  /^\/index\.html$/,
  /^\/creditek\/convenios(?:\/|\/index\.html)?$/,
  /^\/creditek\/erp\/registro(?:\.html|\/)?$/,
  /^\/creditek\/legal(?:\/|\/index\.html)?$/,
  /^\/design-system\/components\/kora-product\.(?:css|js)$/
];
var registro_assets_worker_default = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/pendientes") return pendingAPI(request);
    if (!PUBLIC_ASSET_PATHS.has(pathname) && !ALLOWED_PATHS.some((pattern) => pattern.test(pathname))) {
      return new Response("No encontrado", { status: 404, headers: SECURITY_HEADERS });
    }
    if (request.method === "GET" && /^\/creditek\/convenios\/pendientes(?:\/|\/index\.html)?$/.test(pathname)) return new Response(PENDING_HTML, { headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-pending-login": "either-20261023" } });
    if (request.method === "GET" && pathname === "/creditek/convenios/pendientes/app.js") return new Response(PENDING_JS, { headers: { ...SECURITY_HEADERS, "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" } });
    if (["GET", "HEAD"].includes(request.method) && /^\/creditek\/erp\/registro(?:\.html|\/)?$/.test(pathname)) {
      return new Response(request.method === "HEAD" ? null : REGISTRATION_LEGACY_HTML, { headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
export {
  registro_assets_worker_default as default
};
//# sourceMappingURL=registro-alo.js.map
