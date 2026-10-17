// releases/aura-piezas-20261017/baseline-worker.mjs
var shell_index_default = `<!DOCTYPE html>
<html lang="es" data-kora-product="1.0.0" data-kora-version="2.0.4">
<head>
<meta name="aura-build" content="903825b0f83397463b8516dc319b633d1640bf6a021e918bd871fef1e6247f26">
<script type="module" src="aura-dictation.mjs"><\/script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AURA \xB7 Agentes \u2014 Creditek</title>
<link rel="icon" type="image/png" href="/creditek/shared/branding/creditek-logo.png">
<link rel="apple-touch-icon" href="/creditek/shared/branding/creditek-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/design-system/components/kora-dashboard.css">
<link rel="stylesheet" href="/design-system/components/kora-shell.css?v=2.0.4">
<link rel="stylesheet" href="/design-system/components/kora-product.css">
<link rel="stylesheet" href="/creditek/agentes/aura-premium.css">
<script src="https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js" defer><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" defer><\/script>
<script src="/design-system/components/kora-product.js" defer><\/script>
<script src="aura-module-config.js"><\/script>
<script src="aura-release.js" defer><\/script>
<script src="aura-auto-navigation.js" defer><\/script>
<link rel="stylesheet" href="aura-auto-navigation.css">
<script src="aura-context-help.js" defer><\/script>
<script>document.addEventListener('DOMContentLoaded',()=>window.lucide?.createIcons());<\/script>
<style>
:root {
  --navy:   #0B1E3D;
  --navy2:  #0f2548;
  --navy3:  #162d52;
  --turq:   #00C4CC;
  --turq2:  #00A8AF;
  --white:  #FFFFFF;
  --bg:     #F0F4F8;
  --card:   #FFFFFF;
  --border: rgba(255,255,255,.08);
  --border2:#E2E8F0;
  --text1:  #0B1E3D;
  --text2:  #64748B;
  --text3:  #94A3B8;
  --green:  #10B981;
  --yellow: #F59E0B;
  --red:    #EF4444;
  --font:   'DM Sans', system-ui, sans-serif;
  --mono:   'DM Mono', monospace;
  --r:      10px;
  --sidebar:220px;
  --sidebar-collapsed:64px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--ctk-color-background,#F5F5F7);height:100dvh;min-height:0;overflow:hidden}

/* \u2500\u2500 LOGIN \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#login-screen{
  position:fixed;inset:0;
  background:
    radial-gradient(circle at 15% 15%,rgba(0,196,204,.13),transparent 30%),
    radial-gradient(circle at 85% 80%,rgba(11,30,61,.09),transparent 34%),
    linear-gradient(145deg,#F8FAFC 0%,#EEF3F7 100%);
  display:flex;align-items:center;justify-content:center;
  z-index:1000;transition:opacity .42s ease,transform .42s ease;
  padding:24px;overflow:auto;
}
#login-screen.exit{opacity:0;transform:scale(1.018);pointer-events:none}
.login-box{
  width:min(100%,430px);text-align:left;background:#fff;border:1px solid rgba(148,163,184,.22);
  border-radius:12px;padding:38px 38px 30px;box-shadow:0 28px 70px rgba(11,30,61,.14),0 2px 10px rgba(11,30,61,.05);
  position:relative;overflow:hidden;
}
.login-box::before{content:'';position:absolute;inset:0 0 auto;height:4px;background:linear-gradient(90deg,var(--navy),var(--turq))}
.login-brand{text-align:center;margin-bottom:30px}
.login-brand img{display:block;width:132px;height:auto;object-fit:contain;margin:0 auto 16px;mix-blend-mode:multiply}
.login-brand h1{font-size:37px;line-height:1;font-weight:700;color:var(--navy);letter-spacing:.18em;margin-left:.18em}
.login-brand p{font-size:13px;color:#64748B;letter-spacing:.04em;margin-top:8px}
.auth-view{display:none;animation:authViewIn .28s ease both}
.auth-view.active{display:block}
@keyframes authViewIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
.auth-title{font-size:21px;font-weight:700;color:var(--navy);text-align:center;margin-bottom:7px}
.auth-copy{font-size:13px;line-height:1.55;color:#64748B;text-align:center;margin:0 auto 22px;max-width:330px}
.login-field{position:relative;margin-bottom:14px}
.login-field label{display:block;font-size:12px;font-weight:650;color:#334155;margin:0 0 7px 2px}
.login-field input{
  pointer-events:auto;
  width:100%;padding:13px 45px 13px 14px;background:#F8FAFC;
  border:1.5px solid #DCE4EC;border-radius:12px;color:var(--navy);
  font-size:14px;font-family:var(--font);
  outline:none;transition:border .2s,box-shadow .2s,background .2s;
}
.login-field input::placeholder{color:#94A3B8}
.login-field input:focus{background:#fff;border-color:var(--turq);box-shadow:0 0 0 4px rgba(0,196,204,.12)}
.password-toggle{position:absolute;right:10px;bottom:8px;width:34px;height:34px;border:0;background:transparent;color:#64748B;border-radius:9px;cursor:pointer;font-size:17px}
.password-toggle:hover{background:#EAF1F5;color:var(--navy)}
body.kora-product-page .password-toggle{position:absolute!important;top:auto!important;right:5px!important;bottom:3px!important;left:auto!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;background:transparent!important;color:#64748B!important;box-shadow:none!important}
body.kora-product-page .password-toggle:hover{background:#EAF1F5!important;color:var(--navy)!important;transform:none!important}
body.kora-product-page .password-toggle svg{width:18px;height:18px}
.login-options{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 1px 18px}
.remember-option{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 4px;color:#64748B;font-size:12px;cursor:pointer}
.remember-option input{accent-color:var(--turq);width:16px;height:16px}
.auth-link{border:0;background:none;color:#087D83;font-family:var(--font);font-weight:650;font-size:12px;cursor:pointer;padding:4px 0}
body.kora-product-page .auth-link{width:auto!important;min-height:44px!important;padding:0 4px!important;background:transparent!important;color:#087D83!important;border:0!important;box-shadow:none!important;border-radius:0!important}
.auth-link:hover{text-decoration:underline;color:var(--navy)}
.login-btn{
  width:100%;min-height:48px;padding:13px 16px;margin-top:2px;
  background:var(--navy);border:none;border-radius:12px;
  color:var(--navy);font-size:14px;font-weight:700;
  color:#fff;font-family:var(--font);cursor:pointer;transition:transform .2s,background .2s,box-shadow .2s;
  letter-spacing:.2px;box-shadow:0 8px 18px rgba(11,30,61,.18);
}
.login-btn:hover:not(:disabled){background:#132D55;transform:translateY(-1px);box-shadow:0 11px 22px rgba(11,30,61,.23)}
.login-btn:active:not(:disabled){transform:scale(.985);transition-duration:80ms}
.login-btn:disabled{opacity:.68;cursor:wait}
.login-btn.secondary{background:#E7F8F8;color:#087D83;box-shadow:none}
.auth-back{display:block;margin:16px auto 0}
.auth-status{display:none;border-radius:11px;padding:11px 12px;margin:14px 0 0;font-size:12px;line-height:1.45;text-align:left}
.auth-status.visible{display:block}
.auth-status.error{background:#FEF2F2;color:#B42318;border:1px solid #FECACA}
.auth-status.success{background:#ECFDF5;color:#047857;border:1px solid #A7F3D0}
.auth-status.info{background:#EFF8FF;color:#175CD3;border:1px solid #B2DDFF}
.success-mark{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;margin:0 auto 18px;background:#E7F8F8;color:#087D83;font-size:28px;font-weight:700}
.login-version{text-align:center;font-size:11px;color:#64748B;margin-top:25px;font-family:var(--mono)}
@media(max-width:520px){
  #login-screen{padding:14px}
  .login-box{padding:31px 22px 24px;border-radius:12px}
  .login-brand{margin-bottom:25px}.login-brand h1{font-size:32px}
  .login-options{align-items:center;flex-direction:row;flex-wrap:wrap;gap:8px 16px}
}
@media(prefers-reduced-motion:reduce){.auth-view,#login-screen{animation:none;transition:none}}

/* \u2500\u2500 APP SHELL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#app{display:none;height:100dvh;min-height:0;overflow:hidden}
#app.visible{display:grid;grid-template-columns:var(--sidebar) minmax(0,1fr)}
#app.sidebar-collapsed{--sidebar:var(--sidebar-collapsed)}
#app:not(.visible){display:none!important}
#app.visible.kora-shell-root{display:grid!important}

/* \u2500\u2500 SIDEBAR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.sidebar{
  width:var(--sidebar);flex-shrink:0;
  background:#FFFFFF;
  border-right:1px solid #E2E8F0;
  display:flex;flex-direction:column;
  height:100dvh;min-height:0;padding:0;overflow-y:auto;
}
.sidebar-logo{
  padding:13px 16px 12px;
  border-bottom:1px solid #E2E8F0;
  display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:2;background:#fff;
}
.sidebar-toggle{position:absolute;right:8px;top:8px;display:grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid #E2E8F0;border-radius:8px;background:#fff;color:#64748B;cursor:pointer;z-index:3}
.sidebar-toggle:hover,.sidebar-toggle:focus-visible{color:var(--navy);border-color:var(--turq);outline:none}
.sidebar-toggle svg{width:15px;height:15px}
.sidebar-home{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;width:100%;border:0;background:#fff;cursor:pointer;border-radius:8px;padding:4px 2px 3px;text-align:left}
body.kora-product-page .sidebar-home{background:#fff!important;color:var(--navy)!important;box-shadow:none!important}
.sidebar-home:hover,.sidebar-home:focus-visible{background:#F0F4F8;outline:2px solid rgba(0,196,204,.28)}
body.kora-product-page .sidebar-home:hover,body.kora-product-page .sidebar-home:focus-visible{background:#F0F4F8!important;color:var(--navy)!important}
.sidebar-brand-name{font-size:19px;line-height:1;font-weight:750;color:var(--navy);letter-spacing:.12em}
.sidebar-brand-by{font-size:8px;line-height:1;color:#64748B;margin:5px 0 6px 1px;letter-spacing:.08em}
.sidebar-brand-logo{display:block;width:82px;height:26px;object-fit:contain;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:3px 6px;box-sizing:border-box}

.sidebar-section{padding:20px 12px 8px;font-size:10px;font-weight:600;color:#94A3B8;letter-spacing:1.5px;text-transform:uppercase}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 12px;margin:1px 4px;
  border-radius:8px;cursor:pointer;
  transition:background .15s;color:#64748B;
  font-size:13px;font-weight:500;
  text-decoration:none;
}
.nav-item:hover{background:#F0F4F8;color:#0B1E3D}
.nav-item.active{background:rgba(0,196,204,.1);color:#0B1E3D;font-weight:600}
.nav-icon{font-size:15px;width:20px;text-align:center;flex-shrink:0;display:grid;place-items:center}
.nav-icon svg{width:17px;height:17px;stroke-width:1.9}
.nav-label{min-width:0}
.nav-badge{margin-left:auto;background:var(--turq);color:var(--navy);font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px}
.nav-badge.new{background:var(--green)}

.sidebar-footer{margin-top:auto;padding:10px 12px 12px;border-top:1px solid #E2E8F0;background:#fff}
.sidebar-footer-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 8px}
.sidebar-owner{font-size:9px;color:#94A3B8;letter-spacing:.04em}
.logout-btn{margin-left:auto;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:13px;padding:4px}
.logout-btn:hover{color:#0B1E3D}
.logout-btn svg{width:16px;height:16px}
.aura-version{display:block;max-width:100%;margin:0 8px 7px;padding:5px 7px;border:1px solid #E2E8F0;border-radius:7px;color:#64748B;font:500 9px/1.25 var(--mono);text-align:center;overflow-wrap:anywhere;white-space:normal}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-logo{min-height:74px;padding:11px 8px;justify-content:center}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-home{width:32px;align-items:center;padding:4px 0;margin-top:0}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-brand-name{font-size:0}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-brand-name::after{content:'A';font-size:18px;letter-spacing:0}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-brand-by,#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-brand-logo,#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-section,#app.sidebar-collapsed:not(.sidebar-peek) .nav-label,#app.sidebar-collapsed:not(.sidebar-peek) .nav-badge,#app.sidebar-collapsed:not(.sidebar-peek) .aura-version,#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-owner{display:none}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-toggle{top:auto;right:18px;bottom:5px}
#app.sidebar-collapsed:not(.sidebar-peek) .nav-item{justify-content:center;margin:4px 7px;padding:10px 0;gap:0}
#app.sidebar-collapsed:not(.sidebar-peek) .nav-icon{width:20px}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-footer{padding:9px 0}
#app.sidebar-collapsed:not(.sidebar-peek) .sidebar-footer-actions{justify-content:center;padding:0}
#app.sidebar-collapsed:not(.sidebar-peek) .logout-btn{margin:0}

/* \u2500\u2500 MAIN AREA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.main-area{flex:1;display:flex;flex-direction:column;min-width:0;height:100dvh;min-height:0;overflow:hidden;background:var(--ctk-color-background,#F5F5F7)}

.topbar{
  height:52px;flex-shrink:0;
  background:var(--white);
  border-bottom:1px solid var(--border2);
  display:flex;align-items:center;
  padding:0 24px;gap:16px;
}
.topbar-title{font-size:14px;font-weight:600;color:var(--text1)}
.topbar-breadcrumb{font-size:12px;color:var(--text3)}
.topbar-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.global-incident-launch{display:grid!important;visibility:visible!important;opacity:1!important;place-items:center;width:32px;height:32px;border:1px solid var(--border2);border-radius:9px;background:#fff;color:var(--navy);cursor:pointer;flex:0 0 auto;position:relative;z-index:3}
.global-incident-launch:hover,.global-incident-launch:focus-visible{border-color:var(--turq);color:var(--turq);outline:none}
.global-incident-launch svg{width:17px;height:17px}
.status-dot{width:7px;height:7px;border-radius:50%;background:var(--green)}
.status-text{font-size:12px;color:var(--text2)}
.topbar-date{font-size:11px;color:var(--text3);font-family:var(--mono)}

.content{flex:1;width:100%;max-width:var(--ctk-width-content);margin:0 auto;min-height:0;overflow-y:auto;padding:var(--ctk-space-3,24px)}

/* \u2500\u2500 DASHBOARD \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.dashboard-greeting{margin-bottom:14px}
.greeting-text{font-size:22px;font-weight:700;color:var(--text1)}
.greeting-sub{font-size:13px;color:var(--text2);margin-top:2px}

.quick-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.qstat{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:13px 15px;position:relative;outline:none}
.qstat:is(:hover,:focus-visible){border-color:var(--turq)}
.qstat-label{font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.qstat-value{font-size:22px;font-weight:700;color:var(--text1)}
.qstat-value.turq{color:var(--turq2)}
.qstat-sub{font-size:11px;color:var(--text2);margin-top:3px}

/* \u2500\u2500 MODULES GRID \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.section-title{font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.modules-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px}
@media(max-width:900px){.modules-grid{grid-template-columns:repeat(2,1fr)}}

.module-card{
  background:var(--card);border:1px solid var(--border2);
  border-radius:var(--r);padding:15px 16px;
  cursor:pointer;transition:all .2s;
  display:flex;flex-direction:column;gap:10px;
  text-decoration:none;color:inherit;
  position:relative;overflow:hidden;
}
.module-card:hover{border-color:var(--turq);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,196,204,.12)}
.module-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--turq);opacity:0;transition:opacity .2s}
.module-card:hover::before{opacity:1}
.module-top{display:flex;align-items:flex-start;justify-content:space-between}
.module-icon,.tool-icon{color:var(--navy)}
.module-icon svg{width:21px;height:21px;stroke-width:1.9}
.module-status{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px}
.module-status.active{background:rgba(16,185,129,.1);color:var(--green)}
.module-status.pending{background:rgba(245,158,11,.1);color:var(--yellow)}
.module-status.locked{background:rgba(148,163,184,.1);color:var(--text3)}
.module-name{font-size:14px;font-weight:600;color:var(--text1)}
.module-desc{font-size:12px;color:var(--text2);line-height:1.5}
.module-meta{display:flex;align-items:center;justify-content:space-between;margin-top:4px}
.module-tag{font-size:10px;color:var(--text3);font-family:var(--mono)}
.module-arrow{font-size:16px;color:var(--text3);transition:color .2s,transform .2s}
.module-card:hover .module-arrow{color:var(--turq);transform:translateX(3px)}
.operations-strip{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(320px,1.2fr);gap:10px;margin-bottom:16px}
.operations-card{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid var(--border2);border-radius:var(--r);padding:11px 14px;min-width:0}
.operations-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#ECFDF5;color:#047857;flex:0 0 auto}
.operations-icon.alert{background:#FFF7ED;color:#C2410C}
.operations-icon svg{width:18px;height:18px}
.operations-copy{min-width:0;flex:1}
.operations-title{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--text1)}
.operations-title .live{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(16,185,129,.12)}
.operations-detail{font-size:11px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.operations-badge{margin-left:auto;padding:4px 8px;border-radius:999px;background:#ECFDF5;color:#047857;font-size:10px;font-weight:700}
.operations-badge.review{background:#FFF7ED;color:#C2410C}

/* \u2500\u2500 HERRAMIENTAS SECTION \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.tools-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.tool-row{
  background:var(--card);border:1px solid var(--border2);
  border-radius:var(--r);padding:14px 18px;
  display:flex;align-items:center;gap:14px;
  cursor:pointer;transition:all .2s;text-decoration:none;color:inherit;
}
.tool-row:hover{border-color:var(--turq);box-shadow:0 4px 16px rgba(0,196,204,.1)}
.tool-icon{font-size:18px;width:36px;height:36px;background:var(--bg);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.tool-icon svg{width:18px;height:18px}
@media(max-width:760px){.quick-stats,.modules-grid,.operations-strip,.tools-grid{grid-template-columns:1fr}.content{padding:14px}.operations-detail{white-space:normal}}
.tool-name{font-size:13px;font-weight:600;color:var(--text1)}
.tool-desc{font-size:11px;color:var(--text2);margin-top:1px}
.tool-arrow{margin-left:auto;color:var(--text3);font-size:14px}

/* \u2500\u2500 CONFIG PANEL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.config-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;max-width:920px}
.config-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:18px}
.incident-overlay{position:fixed;inset:0;z-index:9000;display:grid!important;place-items:center;padding:20px;background:rgba(11,30,61,.45)}
.incident-overlay .dashboard-greeting{display:none}
.incident-overlay .config-grid{width:min(680px,100%);max-height:calc(100dvh - 40px);overflow:auto}
.incident-overlay .config-card{box-shadow:0 24px 60px rgba(11,30,61,.25)}
.incident-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.incident-dialog-close{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:8px;background:#F1F5F9;color:var(--text2);cursor:pointer}
.incident-dialog-close svg{width:16px;height:16px}
.links-modal{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(11,30,61,.58)}
.links-modal.open{display:flex}.links-dialog{width:min(1080px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 28px 80px rgba(11,30,61,.28);padding:24px}
.links-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.links-head h2{font-size:22px;color:var(--navy)}.links-head p{margin-top:5px;color:var(--text2);font-size:13px}
.links-close,.links-action{border:0;border-radius:9px;cursor:pointer;font:650 12px var(--font);min-height:40px;padding:9px 13px}.links-close{background:#F1F5F9;color:var(--navy)}.links-action{background:var(--navy);color:#fff}.links-action.danger{background:#FFF1F2;color:#BE123C}.links-action:disabled{opacity:.55;cursor:wait}
.links-section{margin-top:22px}.links-section h3{font-size:15px;color:var(--navy);margin-bottom:9px}.links-table-wrap{overflow-x:auto;border:1px solid var(--border2);border-radius:12px}.links-table{width:100%;border-collapse:collapse;font-size:12px}.links-table th,.links-table td{padding:11px 12px;border-bottom:1px solid #E2E8F0;text-align:left;vertical-align:middle}.links-table th{background:#F8FAFC;color:#475569;font-weight:700}.links-table tr:last-child td{border-bottom:0}.links-state{font-weight:700;color:#047857}.links-state.empty{color:#64748B}.links-status{min-height:48px;display:grid;place-items:center;color:#64748B;font-size:13px}
.generated-link{background:#F8FAFC;border:1px solid var(--border2);border-radius:10px;padding:12px;font:500 12px/1.5 var(--mono);overflow-wrap:anywhere;margin:14px 0}.one-time-warning{color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:11px;font-size:12px;line-height:1.5}.link-result-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}.qr-wrap{display:grid;place-items:center;min-height:220px;margin:16px auto 4px}.qr-wrap img,.qr-wrap canvas{max-width:220px;height:auto}
.kora-product-page #view-dashboard button.tool-row{width:100%;background:var(--card);color:var(--text1);border:1px solid var(--border2);text-align:left;font-family:var(--font)}
.kora-product-page #view-dashboard button.tool-row:hover{background:var(--card);border-color:var(--turq)}
.config-title{font-size:13px;font-weight:600;color:var(--text1);margin-bottom:4px}
.config-desc{font-size:12px;color:var(--text2);margin-bottom:14px}
.config-field{margin-bottom:10px}
.config-field label{display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px}
.config-field input,.config-field select,.config-field textarea{width:100%;padding:9px 12px;border:1.5px solid var(--border2);border-radius:8px;font-size:12px;font-family:var(--font);color:var(--text1);outline:none;background:#fff}
.config-field textarea{min-height:96px;resize:vertical;line-height:1.5}
.config-field input[type="file"]{padding:8px;background:#F8FAFC}
.config-field input:focus{border-color:var(--turq)}
.config-save{background:var(--navy);color:var(--white);border:none;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)}
.config-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
.incident-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px;padding:11px;border:1px solid var(--border2);border-radius:8px;background:#F8FAFC;color:var(--text2);font-size:10px}
.incident-preview{margin-top:12px;min-height:120px;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 var(--mono);background:#F8FAFC;border:1px solid var(--border2);border-radius:8px;padding:12px;color:var(--text1)}
.config-status{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);margin-top:8px}
.config-dot{width:7px;height:7px;border-radius:50%;background:var(--text3)}
.config-dot.ok{background:var(--green)}

/* \u2500\u2500 IFRAME VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.iframe-view{display:none;flex:1;flex-direction:column;position:relative;min-height:0;overflow:hidden;background:var(--bg)}
.iframe-view.visible{display:flex}
.iframe-topbar{
  height:44px;flex-shrink:0;background:var(--navy);
  display:flex;align-items:center;gap:12px;padding:0 16px;
}
.iframe-back{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:13px;font-family:var(--font);display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px}
.iframe-back:hover{background:rgba(255,255,255,.1);color:var(--white)}
.iframe-title{font-size:13px;font-weight:600;color:rgba(255,255,255,.8)}
.iframe-open{margin-left:auto;font-size:11px;color:var(--turq);text-decoration:none;font-weight:600}
iframe{flex:1;border:none;width:100%;min-height:0;background:var(--bg)}
.iframe-status{position:absolute;inset:44px 0 0;display:none;align-items:center;justify-content:center;padding:24px;background:var(--bg);z-index:2;text-align:center;color:var(--text2)}
.iframe-status.visible{display:flex}
.iframe-status-card{max-width:420px;background:#fff;border:1px solid var(--border2);border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(11,30,61,.08)}
.iframe-status-card h3{color:var(--text1);font-size:15px;margin-bottom:6px}
.iframe-status-actions{display:flex;justify-content:center;gap:8px;margin-top:14px}
.iframe-status-actions button{border:0;border-radius:8px;padding:8px 12px;font:600 12px var(--font);cursor:pointer}
.iframe-status-actions .retry{background:var(--navy);color:#fff}.iframe-status-actions .panel{background:#E7F8F8;color:#087D83;margin:0;box-shadow:none}

/* \u2500\u2500 TOAST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--navy);color:var(--white);padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;opacity:0;transition:opacity .3s;z-index:9999;pointer-events:none;white-space:nowrap}
#toast.show{opacity:1}
.nav-item,.sidebar-home,.logout-btn,.module-card,.operations-card,.config-field input,.config-field select,.config-field textarea,.config-card button,.iframe-status-actions button{min-height:44px}.module-card,.operations-card,.config-card{border-radius:12px}.nav-item,.sidebar-home,.logout-btn,.module-card,.operations-card,.config-card button,.iframe-status-actions button{transition:transform 120ms ease}.nav-item:active,.sidebar-home:active,.logout-btn:active,.module-card:active,.operations-card:active,.config-card button:active,.iframe-status-actions button:active{transform:scale(.985)}

[data-aura-owner-only][hidden]{display:none!important}

[data-nova-dashboard-card] .module-name{text-align:center;width:100%}
[data-nova-dashboard-card] .module-top{justify-content:center;gap:8px}
[data-nova-dashboard-card] .module-meta{justify-content:center;gap:4px}
</style>
<link rel="stylesheet" href="/creditek/agentes/aura-responsive.css">
</head>
<body class="kora-product-page" data-kora-agent-id="home" data-aura-page="home">

<!-- LOGIN -->
<div id="login-screen">
  <div class="login-box">
    <div class="login-brand" data-kora-brand data-variant="login" data-product-name="AURA"></div>

    <form class="auth-view active" id="auth-view-login" autocomplete="on" onsubmit="doLogin(); return false;">
      <h2 class="auth-title">Bienvenido</h2>
      <p class="auth-copy">Ingresa con tu cuenta individual para acceder a tus m\xF3dulos autorizados.</p>
      <div class="login-field">
        <label for="login-email">Correo electr\xF3nico</label>
        <input type="email" id="login-email" name="email" placeholder="nombre@crediteksas.com" autocomplete="username">
      </div>
      <div class="login-field">
        <label for="login-password">Contrase\xF1a</label>
        <input type="password" id="login-password" name="password" placeholder="Tu contrase\xF1a" autocomplete="current-password">
        <button class="password-toggle" type="button" aria-label="Mostrar contrase\xF1a" onclick="togglePassword('login-password',this)"><i data-lucide="eye"></i></button>
      </div>
      <div class="login-options">
        <label class="remember-option"><input type="checkbox" id="remember-session" checked> Recordar sesi\xF3n</label>
        <button class="auth-link" type="button" onclick="showAuthView('forgot')">Olvid\xE9 mi contrase\xF1a</button>
      </div>
      <button class="login-btn" id="login-submit" type="submit">Iniciar sesi\xF3n</button>
      <div class="auth-status" id="login-error" role="status" aria-live="polite"></div>
    </form>

    <div class="auth-view" id="auth-view-forgot">
      <h2 class="auth-title">Recupera tu acceso</h2>
      <p class="auth-copy">Te enviaremos un c\xF3digo de seis d\xEDgitos para crear una nueva contrase\xF1a dentro de AURA.</p>
      <div class="login-field">
        <label for="recovery-email">Correo electr\xF3nico</label>
        <input type="email" id="recovery-email" placeholder="nombre@crediteksas.com" autocomplete="email" onkeydown="if(event.key==='Enter')requestRecovery()">
      </div>
      <button class="login-btn" id="recovery-submit" onclick="requestRecovery()">Enviar c\xF3digo de recuperaci\xF3n</button>
      <div class="auth-status" id="recovery-status" role="status" aria-live="polite"></div>
      <button class="auth-link auth-back" type="button" onclick="showAuthView('login')">\u2190 Volver a iniciar sesi\xF3n</button>
    </div>

    <div class="auth-view" id="auth-view-verify-code">
      <h2 class="auth-title">Crear nueva contrase\xF1a</h2>
      <p class="auth-copy">Ingresa el c\xF3digo recibido por correo y define tu nueva contrase\xF1a.</p>
      <div class="login-field">
        <label for="recovery-code">C\xF3digo de verificaci\xF3n</label>
        <input type="text" id="recovery-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000" autocomplete="one-time-code">
      </div>
      <div class="login-field">
        <label for="new-password">Nueva contrase\xF1a</label>
        <input type="password" id="new-password" placeholder="M\xEDnimo 10 caracteres" autocomplete="new-password">
        <button class="password-toggle" type="button" aria-label="Mostrar contrase\xF1a" onclick="togglePassword('new-password',this)"><i data-lucide="eye"></i></button>
      </div>
      <div class="login-field">
        <label for="confirm-password">Confirmar contrase\xF1a</label>
        <input type="password" id="confirm-password" placeholder="Repite la contrase\xF1a" autocomplete="new-password" onkeydown="if(event.key==='Enter')completeRecovery()">
        <button class="password-toggle" type="button" aria-label="Mostrar contrase\xF1a" onclick="togglePassword('confirm-password',this)"><i data-lucide="eye"></i></button>
      </div>
      <button class="login-btn" id="password-submit" onclick="completeRecovery()">Guardar contrase\xF1a</button>
      <div class="auth-status" id="password-status" role="status" aria-live="polite"></div>
      <button class="auth-link auth-back" type="button" onclick="showAuthView('forgot')">\u2190 Solicitar un c\xF3digo nuevo</button>
    </div>

    <div class="auth-view" id="auth-view-password-updated">
      <div class="success-mark">\u2713</div>
      <h2 class="auth-title">Contrase\xF1a actualizada correctamente</h2>
      <p class="auth-copy">Tu sesi\xF3n est\xE1 lista. Estamos abriendo tus m\xF3dulos autorizados.</p>
      <button class="login-btn secondary" type="button" onclick="enterAura()">Entrar a AURA</button>
    </div>

    <div class="login-version">Acceso seguro \xB7 AURA 2026</div>
  </div>
</div>

<!-- APP -->
<div id="app" data-aura-shell-root>

  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-logo">
      <button class="sidebar-home" data-aura-home type="button" aria-label="AURA \xB7 abrir Panel general" onclick="showSection('dashboard',document.querySelector('[data-dashboard-nav]'))">
        <span class="sidebar-brand-name">AURA</span>
        <span class="sidebar-brand-by">by</span>
        <img class="sidebar-brand-logo" src="/creditek/shared/branding/creditek-logo.png" alt="Creditek">
      </button>
      <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-label="Replegar barra lateral" aria-expanded="true" data-aura-help="Repliega la barra lateral y deja visibles \xFAnicamente los iconos." onclick="toggleAuraSidebar()"><i data-lucide="panel-left-close"></i></button>
    </div>

    <div class="sidebar-section">Principal</div>
    <a class="nav-item active" data-dashboard-nav onclick="showSection('dashboard',this)">
      <span class="nav-icon"><i data-lucide="layout-dashboard"></i></span><span class="nav-label">Panel general</span>
    </a>

    <div class="sidebar-section" data-aura-app="sofia">Agentes IA</div>
    <a class="nav-item" data-aura-app="sofia" onclick="openModule('/creditek/agentes/creditek-agente-redes.html','Piezas comerciales',this,'sofia')">
      <span class="nav-icon"><i data-lucide="image-plus"></i></span><span class="nav-label">Piezas comerciales</span>
    </a>
    <a class="nav-item" data-aura-app="sofia" onclick="openModule('/creditek/agentes/creditek-estudio-video.html','Estudio de Video',this,'sofia')">
      <span class="nav-icon"><i data-lucide="clapperboard"></i></span><span class="nav-label">Estudio de Video</span><span class="nav-badge new">NUEVO</span>
    </a>
    <a class="nav-item" data-aura-app="sofia" onclick="openModule('/creditek/agentes/creditek-agente-respuestas.html','Sof\xEDa',this,'sofia')">
      <span class="nav-icon"><i data-lucide="messages-square"></i></span><span class="nav-label">Sof\xEDa</span>
    </a>
    <a class="nav-item" data-aura-app="meta_ads" onclick="openModule('/creditek/agentes/agente3-meta-ads.html','Publicaci\xF3n y m\xE9tricas',this,'meta_ads')">
      <span class="nav-icon"><i data-lucide="megaphone"></i></span><span class="nav-label">Publicaci\xF3n y m\xE9tricas</span>
    </a>
    <a class="nav-item" data-aura-app="sofia" onclick="openModule('/creditek/agentes/creditek-agente-calendario.html','Calendario de contenido',this,'sofia')">
      <span class="nav-icon"><i data-lucide="calendar-days"></i></span><span class="nav-label">Calendario de contenido</span>
    </a>

    <div class="sidebar-section" data-aura-owner-only hidden>NOVA \xB7 Piloto</div>
    <a class="nav-item" data-aura-owner-only hidden href="/creditek/agentes/nova-supervision.html" onclick="openModule('/creditek/agentes/nova-supervision.html','NOVA \xB7 Supervisi\xF3n',this,'nova');return false;">
      <span class="nav-icon"><i data-lucide="clipboard-list"></i></span><span class="nav-label">NOVA \xB7 Supervisi\xF3n</span>
    </a>

    <div class="sidebar-section" data-aura-app="finanzas">Finanzas privadas</div>
    <a class="nav-item" data-aura-app="finanzas" onclick="openModule('/creditek/agentes/aura-finanzas.html','Inversiones',this,'finanzas')">
      <span class="nav-icon"><i data-lucide="chart-candlestick"></i></span><span class="nav-label">Inversiones</span><span class="nav-badge new">NUEVO</span>
    </a>

    <div class="sidebar-section">Comercial</div>
    <a class="nav-item" data-aura-app="sofia" onclick="openModule('creditek-gbp-fichas.html','Fichas Google Business',this,'sofia')">
      <span class="nav-icon"><i data-lucide="map-pin"></i></span><span class="nav-label">Google Business</span>
    </a>
    <a class="nav-item" data-aura-app="convenios" onclick="openModule('https://registro.crediteksas.com/creditek/convenios/','Convenios de Aliados',this,'convenios')">
      <span class="nav-icon"><i data-lucide="file-signature"></i></span><span class="nav-label">Convenios de Aliados</span>
    </a>

    <a class="nav-item" data-aura-app="registro_links" onclick="openRegistrationLinksPanel()">
      <span class="nav-icon"><i data-lucide="users"></i></span><span class="nav-label">Registro de clientes</span>
    </a>

    <div class="sidebar-section" data-aura-app="sofia">Sistema</div>
    <a class="nav-item" data-aura-app="sofia" onclick="showSection('configuracion',this)">
      <span class="nav-icon"><i data-lucide="bug"></i></span><span class="nav-label">Incidencias</span>
    </a>

    <div class="sidebar-footer">
      <div class="aura-version" data-aura-release>Verificando versi\xF3n de AURA\u2026</div>
      <div class="sidebar-footer-actions">
        <span class="sidebar-owner">Creditek</span>
        <button class="logout-btn" onclick="doLogout()" title="Cerrar sesi\xF3n" aria-label="Cerrar sesi\xF3n"><i data-lucide="log-out"></i></button>
      </div>
    </div>
  </div>

  <!-- Main area -->
  <div class="main-area">
    <div class="topbar">
      <span class="topbar-title" id="topbar-title">Panel general</span>
      <span class="topbar-breadcrumb" id="topbar-breadcrumb">Ecosistema AURA</span>
      <div class="topbar-right">
        <!-- Lucide bug (data-lucide="bug") se conserva inline para que sea visible aun si falla el CDN. -->
        <button class="global-incident-launch" data-aura-global-incident type="button" aria-label="Reportar incidencia" title="Reportar incidencia" aria-controls="view-configuracion" onclick="openIncidentReporter()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/><path d="M18 13h4"/><path d="M21 21c0-2.1-1.7-3.9-3.8-4"/></svg></button>
        <div class="status-dot"></div>
        <span class="status-text">Panel AURA</span>
        <span class="topbar-date" id="topbar-date"></span>
      </div>
    </div>

    <div class="content" id="main-content">

      <!-- DASHBOARD VIEW -->
      <div id="view-dashboard">
        <div class="dashboard-greeting">
          <div class="greeting-text" id="greeting-text">Buenos d\xEDas, Oscar</div>
          <div class="greeting-sub" id="greeting-sub">Martes 10 de junio \xB7 Creditek SAS \xB7 11 tiendas activas</div>
        </div>

        <div class="quick-stats">
          <div class="qstat" tabindex="0" data-help="Registros de clientes realizados para validaci\xF3n.">
            <div class="qstat-label">Clientes inscritos</div>
            <div class="qstat-value turq" id="clientes-inscritos-hoy" aria-live="polite">Hoy: \u2014</div>
            <div class="qstat-sub" id="clientes-inscritos-mes">Mes: Consultando\u2026</div>
          </div>
          <div class="qstat" tabindex="0" data-help="Leads enviados por Sof\xEDa a tiendas o aliados y confirmados correctamente.">
            <div class="qstat-label">Leads enviados</div>
            <div class="qstat-value" id="leads-enviados-hoy" aria-live="polite">Hoy: \u2014</div>
            <div class="qstat-sub" id="leads-enviados-mes">Mes: Consultando\u2026</div>
          </div>
        </div>

        <div class="operations-strip" aria-label="Estado operativo y alertas">
          <div class="operations-card" tabindex="0" data-aura-help="Indica si el Hub y los cuatro m\xF3dulos principales de AURA est\xE1n disponibles en este momento.">
            <div class="operations-icon"><i data-lucide="activity"></i></div>
            <div class="operations-copy">
              <div class="operations-title">Conexi\xF3n de indicadores</div>
              <div class="operations-detail" id="aura-kpi-health-detail" role="status">Comprobando los indicadores con tu sesi\xF3n.</div>
            </div>
            <span class="operations-badge review" id="aura-kpi-health">Consultando</span>
          </div>
          <div class="operations-card" tabindex="0" data-aura-help="Resume alertas operativas de AURA. Abre cada m\xF3dulo para consultar sus novedades espec\xEDficas.">
            <div class="operations-icon alert"><i data-lucide="bell-ring"></i></div>
            <div class="operations-copy">
              <div class="operations-title">Alertas</div>
              <div class="operations-detail">Sin comprobaci\xF3n global de alertas. Abre Sof\xEDa o NOVA para revisar pendientes.</div>
            </div>
            <span class="operations-badge review">Sin verificar</span>
          </div>
        </div>

        <div class="section-title">Agentes de inteligencia artificial</div>
        <div class="modules-grid">
          <a class="module-card" data-nova-dashboard-card data-aura-owner-only hidden href="/creditek/agentes/nova-supervision.html" onclick="openModuleFromCard('/creditek/agentes/nova-supervision.html','NOVA \xB7 Supervisi\xF3n','nova');return false;" style="text-decoration:none;color:inherit">
            <div class="module-top">
              <div class="module-icon"><i data-lucide="clipboard-list"></i></div>
              <div class="module-status">Piloto \xB7 Solo lectura</div>
            </div>
            <div class="module-name">NOVA</div>
            <div class="module-desc">Supervisa solicitudes, documentos y referencias de M\xF3vil Shopping. Acceso privado para Oscar y Andrea.</div>
            <div class="module-meta"><span class="module-tag">Abrir supervisi\xF3n</span><span class="module-arrow">\u2192</span></div>
          </a>

          <div class="module-card" tabindex="0" role="button" data-aura-help="Crea copies e im\xE1genes publicitarias para las redes sociales de Creditek." data-aura-app="sofia" onclick="openModuleFromCard('/creditek/agentes/creditek-agente-redes.html','Piezas comerciales','sofia')">
            <div class="module-top">
              <div class="module-icon"><i data-lucide="image-plus"></i></div>
              <div class="module-status active">\u25CF Activo</div>
            </div>
            <div class="module-name">Piezas comerciales</div>
            <div class="module-desc">Genera copy e im\xE1genes con IA para Facebook, Instagram y WhatsApp. 7 modos, estilos coste\xF1os y generaci\xF3n dual Gemini + GPT.</div>
            <div class="module-meta">
              <span class="module-tag">Piezas comerciales</span>
              <span class="module-arrow">\u2192</span>
            </div>
          </div>

          <div class="module-card" tabindex="0" role="button" data-aura-help="Convierte una imagen aprobada en video vertical y exige aprobaci\xF3n manual antes de descargar." data-aura-app="sofia" onclick="openModuleFromCard('/creditek/agentes/creditek-estudio-video.html','Estudio de Video','sofia')">
            <div class="module-top">
              <div class="module-icon"><i data-lucide="clapperboard"></i></div>
              <div class="module-status active">\u25CF Nuevo</div>
            </div>
            <div class="module-name">Estudio de Video</div>
            <div class="module-desc">Anima piezas ya aprobadas en formato vertical de 8 segundos. Muestra el costo y conserva el video como borrador hasta tu aprobaci\xF3n.</div>
            <div class="module-meta">
              <span class="module-tag">Reels y TikTok</span>
              <span class="module-arrow">\u2192</span>
            </div>
          </div>

          <div class="module-card" tabindex="0" role="button" data-aura-help="Abre el CRM conversacional de Sof\xEDa para consultar chats, clientes y derivaciones." data-aura-app="sofia" onclick="openModuleFromCard('/creditek/agentes/creditek-agente-respuestas.html','Sof\xEDa','sofia')">
            <div class="module-top">
              <div class="module-icon"><i data-lucide="messages-square"></i></div>
              <div class="module-status active">\u25CF Activo</div>
            </div>
            <div class="module-name">Sof\xEDa</div>
            <div class="module-desc">Responde DMs de Instagram y WhatsApp con tono Creditek. Preguntas de cr\xE9dito, precios, tiendas y horarios.</div>
            <div class="module-meta">
              <span class="module-tag">Sof\xEDa</span>
              <span class="module-arrow">\u2192</span>
            </div>
          </div>

          <div class="module-card" tabindex="0" role="button" data-aura-help="Consulta m\xE9tricas, campa\xF1as y alertas de publicidad de Meta Ads." data-aura-app="meta_ads" onclick="openModuleFromCard('/creditek/agentes/agente3-meta-ads.html','Publicaci\xF3n y m\xE9tricas','meta_ads')">
            <div class="module-top">
              <div class="module-icon"><i data-lucide="megaphone"></i></div>
              <div class="module-status active">\u25CF Activo</div>
            </div>
            <div class="module-name">Publicaci\xF3n y m\xE9tricas</div>
            <div class="module-desc">Dashboard de pauta en tiempo real. 10 KPIs, an\xE1lisis con Claude IA, ranking de campa\xF1as, alertas y tendencia de 4 semanas.</div>
            <div class="module-meta">
              <span class="module-tag">Publicaci\xF3n y m\xE9tricas</span>
              <span class="module-arrow">\u2192</span>
            </div>
          </div>

          <div class="module-card" tabindex="0" role="button" data-aura-help="Organiza y revisa el calendario mensual de publicaciones de Creditek." data-aura-app="sofia" onclick="openModuleFromCard('/creditek/agentes/creditek-agente-calendario.html','Calendario de contenido','sofia')">
            <div class="module-top">
              <div class="module-icon"><i data-lucide="clapperboard"></i></div>
              <div class="module-status active">\u25CF Activo</div>
            </div>
            <div class="module-name">Calendario de contenido</div>
            <div class="module-desc">30 d\xEDas de publicaciones listas por tienda. Exportable para Meta Business Suite.</div>
            <div class="module-meta">
              <span class="module-tag">Calendario</span>
              <span class="module-arrow">\u2192</span>
            </div>
          </div>

          <div class="module-card" tabindex="0" role="button" data-aura-help="Revisa de forma privada las carteras JA y \xD3scar, sus riesgos y los informes diarios." data-aura-app="finanzas" onclick="openModuleFromCard('/creditek/agentes/aura-finanzas.html','Inversiones','finanzas')">
            <div class="module-top"><div class="module-icon"><i data-lucide="chart-candlestick"></i></div><div class="module-status active">\u25CF Activo</div></div>
            <div class="module-name">Inversiones</div>
            <div class="module-desc">Seguimiento privado de las carteras JA y \xD3scar, an\xE1lisis de apertura y cierre, noticias, riesgos y decisiones pendientes.</div>
            <div class="module-meta"><span class="module-tag">Inversi\xF3n privada</span><span class="module-arrow">\u2192</span></div>
          </div>
        </div>

        <div class="section-title">Herramientas comerciales</div>
        <div class="tools-grid">
          <a class="tool-row" data-aura-app="sofia" onclick="openModuleFromCard('creditek-gbp-fichas.html','Fichas Google Business','sofia')">
            <div class="tool-icon"><i data-lucide="map-pin"></i></div>
            <div>
              <div class="tool-name">Fichas Google Business</div>
              <div class="tool-desc">SEO local \xB7 11 tiendas \xB7 Caribe colombiano</div>
            </div>
            <span class="tool-arrow">\u2192</span>
          </a>
          <button class="tool-row" type="button" data-aura-app="registro_links" onclick="openRegistrationLinksPanel()" data-aura-help="Genera y administra enlaces seguros de registro por tienda o aliado">
            <div class="tool-icon"><i data-lucide="users"></i></div>
            <div>
              <div class="tool-name">Registro de clientes</div>
              <div class="tool-desc">Genera, consulta y renueva enlaces seguros por origen.</div>
            </div>
            <span class="tool-arrow">\u2192</span>
          </button>
          <a class="tool-row" data-aura-app="convenios" onclick="openModuleFromCard('https://registro.crediteksas.com/creditek/convenios/','Convenios de Aliados','convenios')">
            <div class="tool-icon"><i data-lucide="file-signature"></i></div>
            <div>
              <div class="tool-name">Convenios de Aliados</div>
              <div class="tool-desc">Firma digital \xB7 Carga de documentos \xB7 Generaci\xF3n autom\xE1tica de PDF</div>
            </div>
            <span class="tool-arrow">\u2192</span>
          </a>
        </div>
      </div>

      <!-- CONFIG VIEW -->
      <div id="view-configuracion" style="display:none">
        <div class="dashboard-greeting">
          <div class="greeting-text">Centro de incidencias de AURA</div>
          <div class="greeting-sub">Registra un problema y genera un reporte t\xE9cnico seguro para soporte.</div>
        </div>
        <div class="config-grid">
          <div class="config-card">
            <div class="incident-dialog-head">
              <div><div class="config-title">Reportar un error</div><div class="config-desc">El reporte se enviar\xE1 al Centro Corporativo de Incidencias KORA.</div></div>
              <button class="incident-dialog-close" type="button" aria-label="Cerrar reporte" onclick="closeIncidentReporter()"><i data-lucide="x"></i></button>
            </div>
            <div class="config-field">
              <label for="incident-title">T\xEDtulo o asunto</label>
              <input id="incident-title" maxlength="160" placeholder="Resume el problema en una frase">
            </div>
            <div class="config-field">
              <label for="incident-module">M\xF3dulo afectado</label>
              <select id="incident-module">
                <option>Panel general</option>
                <option>Piezas comerciales</option>
                <option>Sof\xEDa</option>
                <option>Publicaci\xF3n y m\xE9tricas</option>
                <option>Calendario de contenido</option>
                <option>Google Business</option>
                <option>Portal B2B</option>
                <option>Acceso y sesi\xF3n</option>
              </select>
            </div>
            <div class="config-field">
              <label for="incident-error">\xBFQu\xE9 ocurri\xF3?</label>
              <textarea id="incident-error" placeholder="Describe el error y los pasos que realizaste."></textarea>
            </div>
            <div class="config-field">
              <label for="incident-expected">\xBFQu\xE9 resultado esperabas?</label>
              <textarea id="incident-expected" placeholder="Explica c\xF3mo deber\xEDa funcionar."></textarea>
            </div>
            <div class="config-field">
              <label for="incident-evidence">Evidencia o captura</label>
              <input id="incident-evidence" type="file" accept="image/png,image/jpeg,image/webp,application/pdf">
            </div>
            <div class="incident-meta" id="incident-meta" aria-label="Contexto t\xE9cnico del incidente"></div>
            <div class="config-actions">
              <button class="config-save" id="incident-submit" type="button" onclick="submitCorporateIncident()">Enviar a KORA</button>
              <button class="config-save" type="button" onclick="generateIncidentReport()">Generar reporte</button>
              <button class="config-save" type="button" onclick="copyIncidentReport()">Copiar para soporte</button>
              <button class="config-save" type="button" onclick="downloadIncidentReport()">Descargar</button>
            </div>
            <pre class="incident-preview" id="incident-preview" aria-live="polite">Completa la descripci\xF3n y genera el reporte.</pre>
          </div>
        </div>
      </div>

    </div>

    <!-- IFRAME VIEW -->
    <div class="iframe-view" id="iframe-view">
      <div class="iframe-topbar">
        <button class="iframe-back" onclick="closeIframe()"><i data-lucide="arrow-left"></i> Volver</button>
        <span class="iframe-title" id="iframe-title">\u2014</span>
        <a class="iframe-open" id="iframe-link" target="_blank"><i data-lucide="external-link"></i> Abrir en pesta\xF1a</a>
      </div>
      <div class="iframe-status" id="iframe-status" role="status" aria-live="polite">
        <div class="iframe-status-card">
          <h3 id="iframe-status-title">Cargando m\xF3dulo\u2026</h3>
          <p id="iframe-status-copy">Espera un momento.</p>
          <div class="iframe-status-actions" id="iframe-status-actions" hidden>
            <button class="retry" type="button" onclick="retryModule()">Reintentar</button>
            <button class="panel" type="button" onclick="closeIframe()">Volver al Panel general</button>
          </div>
        </div>
      </div>
      <iframe id="main-iframe" allow="microphone 'self'" src="about:blank" allowfullscreen title="M\xF3dulo AURA"></iframe>
    </div>
  </div>

</div>

<div class="links-modal" id="registration-links-modal" aria-hidden="true">
  <section class="links-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-links-title">
    <header class="links-head">
      <div><h2 id="registration-links-title">Enlaces de registro</h2><p>Administra enlaces seguros para tiendas propias y aliados.</p></div>
      <button class="links-close" type="button" onclick="closeRegistrationLinksPanel()" aria-label="Cerrar panel"><i data-lucide="x"></i></button>
    </header>
    <div id="registration-links-content" class="links-status" aria-live="polite">Cargando enlaces\u2026</div>
  </section>
</div>

<div class="links-modal" id="generated-link-modal" aria-hidden="true">
  <section class="links-dialog" style="max-width:560px" role="dialog" aria-modal="true" aria-labelledby="generated-link-title">
    <header class="links-head"><div><h2 id="generated-link-title">Enlace generado</h2><p id="generated-link-origin"></p></div><button class="links-close" type="button" onclick="closeGeneratedLink()" aria-label="Cerrar"><i data-lucide="x"></i></button></header>
    <p class="one-time-warning">Este link solo se muestra una vez. C\xF3pialo o descarga el QR ahora \u2014 no podr\xE1s volver a verlo.</p>
    <div class="generated-link" id="generated-link-value"></div>
    <div class="qr-wrap" id="generated-link-qr"></div>
    <div class="link-result-actions"><button class="links-action" type="button" onclick="copyGeneratedLink()">Copiar link</button><button class="links-action" type="button" onclick="downloadGeneratedQr()">Descargar QR</button></div>
  </section>
</div>

<div id="toast"></div>

<script type="module">
import { auraAuth, appGrant, hasPermission, sanitizeReturnTo } from './aura-auth-otp-20260802.mjs';
import { installDictation } from './aura-dictation.mjs';
import { buildIncidentReport, downloadIncidentText, sanitizeIncidentText, technicalContext } from './aura-incident-report.mjs';
import { fetchCommercialKpis } from './aura-dashboard-kpis.mjs';

let auraAccess = null;
const requestedModule = sanitizeReturnTo(new URLSearchParams(location.search).get('return_to') || '');
let recoveryEmail = '';
let activeModule = null;
let moduleLoadTimer = null;
let moduleLoadId = 0;
let incidentReport = '';
let incidentRequestId = '';
const auraTechnicalErrors = [];
const SIDEBAR_STORAGE_KEY = 'aura_sidebar_collapsed';
const AURA_MODULES = Object.values(window.AURA_MODULES || {});

function moduleForPath(value) {
  if (!value) return null;
  try {
    const path = new URL(value, location.origin).pathname;
    return AURA_MODULES.find(module => module.path === path) || null;
  } catch (_) {
    return null;
  }
}

function buildEmbeddedModuleUrl(value) {
  const destination = new URL(value, location.href);
  if (moduleForPath(destination.href)) destination.searchParams.set('embedded', '1');
  return destination;
}

function canOpenModule(module) {
  return Boolean(module && hasPermission(auraAccess, module.appId, module.permission));
}

function applyAuraSidebar(collapsed, persist = false) {
  const app = document.getElementById('app');
  const button = document.getElementById('sidebar-toggle');
  app.classList.toggle('sidebar-collapsed', collapsed);
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? 'Expandir barra lateral' : 'Replegar barra lateral');
  button.dataset.auraHelp = collapsed
    ? 'Expande la barra lateral para mostrar los nombres de todos los m\xF3dulos.'
    : 'Repliega la barra lateral y deja visibles \xFAnicamente los iconos.';
  button.innerHTML = collapsed
    ? '<i data-lucide="panel-left-open"></i>'
    : '<i data-lucide="panel-left-close"></i>';
  if (persist) {
    try { sessionStorage.setItem('aura_sidebar_collapsed', collapsed ? '1' : '0'); } catch (_) {}
  }
  window.lucide?.createIcons?.();
}

function toggleAuraSidebar() {
  const app = document.getElementById('app');
  const expanded = app.classList.contains('sidebar-peek') || !app.classList.contains('sidebar-collapsed');
  app.classList.remove('sidebar-peek');
  applyAuraSidebar(expanded, true);
}

function restoreAuraSidebar() {
  applyAuraSidebar(true);
  window.installAuraAutoNavigation?.(applyAuraSidebar);
}

function setAuthStatus(id, message = '', kind = 'error') {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = \`auth-status\${message ? \` visible \${kind}\` : ''}\`;
}

function showAuthView(name) {
  document.querySelectorAll('.auth-view').forEach(view => view.classList.remove('active'));
  document.getElementById(\`auth-view-\${name}\`).classList.add('active');
  setTimeout(() => {
    document.querySelector(\`#auth-view-\${name} input\`)?.focus();
  }, 80);
}

function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  button.setAttribute('aria-label', visible ? 'Mostrar contrase\xF1a' : 'Ocultar contrase\xF1a');
  button.innerHTML = visible ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>';
  window.lucide?.createIcons?.();
  input.focus();
}

async function withLoading(buttonId, loadingText, action) {
  const button = document.getElementById(buttonId);
  const original = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  try { return await action(); }
  finally { button.disabled = false; button.textContent = original; }
}

// \u2500\u2500 Login \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function doLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  auraAuth.setRememberSession(document.getElementById('remember-session').checked);
  setAuthStatus('login-error');
  await withLoading('login-submit', 'Cargando...', async () => {
    try {
      auraAccess = await auraAuth.signIn(email, password);
      enterAura();
    } catch (error) {
      setAuthStatus('login-error', error.message);
      document.getElementById('login-password').value = '';
    }
  });
}

async function requestRecovery() {
  const email = document.getElementById('recovery-email').value;
  setAuthStatus('recovery-status');
  await withLoading('recovery-submit', 'Enviando...', async () => {
    try {
      const result = await auraAuth.requestPasswordRecovery(email);
      recoveryEmail = String(email || '').trim().toLowerCase();
      showAuthView('verify-code');
      setAuthStatus('password-status', result.message, 'success');
    } catch (error) {
      setAuthStatus('recovery-status', error.message);
    }
  });
}

async function completeRecovery() {
  const code = document.getElementById('recovery-code').value;
  const password = document.getElementById('new-password').value;
  const confirmation = document.getElementById('confirm-password').value;
  setAuthStatus('password-status');
  if (password.length < 10) {
    setAuthStatus('password-status', 'La contrase\xF1a debe tener al menos 10 caracteres.');
    return;
  }
  if (password !== confirmation) {
    setAuthStatus('password-status', 'Las contrase\xF1as no coinciden.');
    return;
  }
  await withLoading('password-submit', 'Guardando...', async () => {
    try {
      await auraAuth.verifyRecoveryCode(recoveryEmail, code);
      auraAccess = await auraAuth.updatePassword(password);
      document.getElementById('recovery-code').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
      showAuthView('password-updated');
      setTimeout(() => enterAura(), 1100);
    } catch (error) {
      setAuthStatus('password-status', error.message);
    }
  });
}

async function doLogout() {
  await auraAuth.signOut();
  location.replace('/creditek/agentes/');
}

function renderAuthorizedModules() {
  const permissionByApp = {
    portal_b2b: 'portal.read',
    meta_ads: 'meta_ads.read',
    sofia: 'sofia.use',
    convenios: 'convenios.use',
    registro_links: 'registro_links.manage',
    cartera: 'cartera.read',
    consultas: 'consultas.read',
    finanzas: 'finanzas.read',
  };
  document.querySelectorAll('[data-aura-app]').forEach(element => {
    const appId = element.dataset.auraApp;
    const allowed = appId === 'registro_links'
      ? canManageRegistrationLinks()
      : appId === 'convenios'
        ? canOpenConvenios()
      : appId === 'finanzas'
        ? isAuraOwner() || hasPermission(auraAccess, 'finanzas', 'finanzas.read')
      : Boolean(permissionByApp[appId] && hasPermission(auraAccess, appId, permissionByApp[appId]));
    element.hidden = !allowed;
  });
  document.querySelectorAll('[data-aura-owner-only]').forEach(element => {
    element.hidden = !isAuraOwner();
  });
}

function isAuraOwner() {
  return Array.isArray(auraAccess?.apps) && auraAccess.apps.some(grant => grant?.role_id === 'aura.owner');
}

function canManageRegistrationLinks() {
  return isAuraOwner() || hasPermission(auraAccess, 'registro_links', 'registro_links.manage');
}

function canOpenConvenios() {
  return isAuraOwner() || hasPermission(auraAccess, 'convenios', 'convenios.use');
}

function enterAura() {
  renderAuthorizedModules();
  document.getElementById('login-screen').classList.add('exit');
  setTimeout(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    initApp();
    if (requestedModule) {
      const requestedAgent = moduleForPath(requestedModule);
      if (requestedAgent && canOpenModule(requestedAgent)) {
        openModule(requestedAgent.path, requestedAgent.name, null, requestedAgent.appId);
      } else if (requestedAgent) {
        showToast('No tienes permiso para abrir este m\xF3dulo.', '#EF4444');
      } else if (requestedModule.startsWith('/creditek/portal/') && hasPermission(auraAccess, 'portal_b2b', 'portal.read')) {
        location.replace(requestedModule);
      } else if (requestedModule.startsWith('/creditek/portal/')) {
        showToast('No tienes permiso para abrir Portal B2B.', '#EF4444');
      }
    }
  }, 250);
}

Object.assign(window, {
  doLogin, doLogout, requestRecovery, completeRecovery,
  showAuthView, togglePassword, enterAura, toggleAuraSidebar,
});

// \u2500\u2500 Init \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function initApp() {
  restoreAuraSidebar();
  updateDate();
  void updateCommercialKpis();
  setInterval(updateDate, 60000);
  updateIncidentMeta();
  window.lucide?.createIcons?.();
}

function renderKpiHealth(state, doc = document, now = new Date()) {
  const badge = doc.getElementById('aura-kpi-health');
  const detail = doc.getElementById('aura-kpi-health-detail');
  if (!badge || !detail) return;
  badge.className = state === 'ready' ? 'operations-badge' : 'operations-badge review';
  badge.textContent = state === 'ready' ? 'Datos disponibles' : state === 'loading' ? 'Consultando' : 'Sin conexi\xF3n';
  detail.textContent = state === 'ready'
    ? \`Indicadores consultados a las \${now.toLocaleTimeString('es-CO', {timeZone:'America/Bogota', hour:'2-digit', minute:'2-digit'})}. No verifica agentes ni WhatsApp.\`
    : state === 'loading' ? 'Comprobando los indicadores con tu sesi\xF3n.'
    : 'No fue posible consultar los indicadores. Esto no confirma una ca\xEDda de los agentes.';
}

function renderCommercialKpis(kpis) {
  renderKpiHealth('ready');
  document.getElementById('clientes-inscritos-hoy').textContent = \`Hoy: \${kpis.clientesInscritos.hoy}\`;
  document.getElementById('clientes-inscritos-mes').textContent = \`Mes: \${kpis.clientesInscritos.mes}\`;
  document.getElementById('leads-enviados-hoy').textContent = \`Hoy: \${kpis.leadsEnviados.hoy}\`;
  document.getElementById('leads-enviados-mes').textContent = \`Mes: \${kpis.leadsEnviados.mes}\`;
}

function renderCommercialKpisUnavailable() {
  renderKpiHealth('unavailable');
  document.getElementById('clientes-inscritos-hoy').textContent = 'No disponible';
  document.getElementById('clientes-inscritos-mes').textContent = '\u2014';
  document.getElementById('leads-enviados-hoy').textContent = 'No disponible';
  document.getElementById('leads-enviados-mes').textContent = '\u2014';
}

async function updateCommercialKpis() {
  renderKpiHealth('loading');
  try {
    const token = await auraAuth.token();
    renderCommercialKpis(await fetchCommercialKpis({ token }));
  } catch (_) {
    renderCommercialKpisUnavailable();
  }
}

let generatedRegistrationLink = '';

function safeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatLinkDate(value) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '\u2014' : date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

async function auraLinksRequest(path, options = {}) {
  const token = await auraAuth.token();
  if (!token) throw new Error('La sesi\xF3n de AURA venci\xF3. Inicia sesi\xF3n nuevamente.');
  const response = await fetch(\`/api/aura/enlaces\${path}\`, {
    ...options,
    cache: 'no-store',
    headers: {
      authorization: \`Bearer \${token}\`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No fue posible administrar los enlaces.');
  return payload;
}

function linkGroupName(origin) {
  if (origin.tipo === 'propia') return 'Tiendas propias';
  return \`Aliados \${origin.ejecutivo_responsable || 'sin ejecutivo'}\`;
}

function renderRegistrationLinks(origins) {
  const content = document.getElementById('registration-links-content');
  const preferred = ['Tiendas propias', 'Aliados Luis', 'Aliados Alex', 'Aliados Yeimi'];
  const groups = new Map();
  origins.forEach(origin => {
    const group = linkGroupName(origin);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(origin);
  });
  const names = [...groups.keys()].sort((a, b) => {
    const left = preferred.indexOf(a); const right = preferred.indexOf(b);
    return (left < 0 ? 99 : left) - (right < 0 ? 99 : right) || a.localeCompare(b, 'es');
  });
  content.className = '';
  content.innerHTML = names.map(name => \`<section class="links-section"><h3>\${safeHtml(name)}</h3><div class="links-table-wrap"><table class="links-table"><thead><tr><th>Origen</th><th>Estado</th><th>Usos</th><th>\xDAltimo uso</th><th>Acci\xF3n</th></tr></thead><tbody>\${groups.get(name).map(origin => {
    const link = origin.enlace_activo;
    return \`<tr><td><strong>\${safeHtml(origin.nombre)}</strong><br><span>\${safeHtml(origin.ciudad || origin.codigo)}</span></td><td><span class="links-state \${link ? '' : 'empty'}">\${link ? \`Activo desde \${safeHtml(formatLinkDate(link.created_at))}\` : 'Sin enlace'}</span></td><td>\${Number(origin.total_registros) || 0}</td><td>\${safeHtml(formatLinkDate(link?.ultima_utilizacion_at))}</td><td><button class="links-action \${link ? 'danger' : ''}" type="button" data-origin="\${safeHtml(origin.codigo)}" data-name="\${safeHtml(origin.nombre)}" data-link-id="\${safeHtml(link?.id || '')}">\${link ? 'Revocar y generar nuevo' : 'Generar link'}</button></td></tr>\`;
  }).join('')}</tbody></table></div></section>\`).join('') || '<div class="links-status">No hay or\xEDgenes activos.</div>';
  content.querySelectorAll('[data-origin]').forEach(button => {
    button.addEventListener('click', () => generateRegistrationLink(button.dataset.origin, button.dataset.name, button.dataset.linkId, button));
  });
}

async function loadRegistrationLinks() {
  const content = document.getElementById('registration-links-content');
  content.className = 'links-status'; content.textContent = 'Cargando enlaces\u2026';
  try { renderRegistrationLinks(await auraLinksRequest('/origenes')); }
  catch (error) { content.textContent = error.message; }
}

async function openRegistrationLinksPanel() {
  if (!canManageRegistrationLinks()) return showToast('No tienes permiso para administrar enlaces.', '#EF4444');
  const modal = document.getElementById('registration-links-modal');
  modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
  window.lucide?.createIcons?.();
  await loadRegistrationLinks();
}

function closeRegistrationLinksPanel() {
  const modal = document.getElementById('registration-links-modal');
  modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
}

async function generateRegistrationLink(originCode, originName, activeLinkId, button) {
  if (activeLinkId && !confirm(\`El enlace actual de \${originName} dejar\xE1 de funcionar. \xBFDeseas revocarlo y generar uno nuevo?\`)) return;
  button.disabled = true;
  try {
    if (activeLinkId) await auraLinksRequest(\`/\${encodeURIComponent(activeLinkId)}/revocar\`, { method: 'POST', body: '{}' });
    const result = await auraLinksRequest('', { method: 'POST', body: JSON.stringify({ origen_codigo: originCode }) });
    showGeneratedLink(originName, result.url_completa);
    await loadRegistrationLinks();
  } catch (error) {
    showToast(error.message, '#EF4444'); button.disabled = false;
  }
}

function showGeneratedLink(originName, url) {
  generatedRegistrationLink = String(url || '');
  document.getElementById('generated-link-origin').textContent = originName;
  document.getElementById('generated-link-value').textContent = generatedRegistrationLink;
  const qr = document.getElementById('generated-link-qr'); qr.innerHTML = '';
  if (typeof QRCode === 'function') new QRCode(qr, { text: generatedRegistrationLink, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  else qr.textContent = 'No fue posible generar el QR. Copia el enlace antes de cerrar.';
  const modal = document.getElementById('generated-link-modal'); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
  window.lucide?.createIcons?.();
}

function closeGeneratedLink() {
  const modal = document.getElementById('generated-link-modal');
  modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
  generatedRegistrationLink = ''; document.getElementById('generated-link-value').textContent = '';
  document.getElementById('generated-link-qr').innerHTML = '';
}

async function copyGeneratedLink() {
  if (!generatedRegistrationLink) return;
  await navigator.clipboard.writeText(generatedRegistrationLink);
  showToast('Link copiado.');
}

function downloadGeneratedQr() {
  const qr = document.querySelector('#generated-link-qr canvas, #generated-link-qr img');
  if (!qr) return showToast('QR no disponible.', '#EF4444');
  const anchor = document.createElement('a');
  anchor.download = 'enlace-registro-creditek.png';
  anchor.href = qr.tagName === 'CANVAS' ? qr.toDataURL('image/png') : qr.src;
  anchor.click();
}

function updateDate() {
  const now = new Date();
  const opts = { weekday:'long', day:'numeric', month:'long' };
  document.getElementById('topbar-date').textContent =
    now.toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' }) + ' \xB7 ' +
    now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });

  const h = now.getHours();
  const greet = h < 12 ? 'Buenos d\xEDas' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('greeting-text').textContent = greet + ', Oscar';
  document.getElementById('greeting-sub').textContent =
    now.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' }) +
    ' \xB7 Creditek SAS \xB7 11 tiendas activas';
}

// \u2500\u2500 Navigation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function showSection(id, el) {
  closeIframe();
  document.querySelectorAll('#view-dashboard,#view-configuracion').forEach(v => v.style.display = 'none');
  document.getElementById('view-' + id).style.display = 'block';
  document.getElementById('main-content').style.display = 'block';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('topbar-title').textContent =
    id === 'dashboard' ? 'Panel general' : 'Centro de incidencias';
  document.getElementById('topbar-breadcrumb').textContent = id === 'dashboard' ? 'Ecosistema AURA' : 'AURA \xB7 Soporte';
  if (id === 'configuracion') updateIncidentMeta();
}

async function openModule(url, title, el, appId = '') {
  if (appId === 'portal_b2b' && !hasPermission(auraAccess, appId, 'portal.read')) {
    showToast('No tienes permiso para abrir Portal B2B.', '#EF4444');
    return;
  }
  if (appId === 'sofia' && !hasPermission(auraAccess, appId, 'sofia.use')) {
    showToast('No tienes permiso para abrir este m\xF3dulo.', '#EF4444');
    return;
  }
  if (appId === 'meta_ads' && !hasPermission(auraAccess, appId, 'meta_ads.read')) {
    showToast('No tienes permiso para abrir Meta Ads.', '#EF4444');
    return;
  }
  if (appId === 'convenios' && !canOpenConvenios()) {
    showToast('No tienes permiso para abrir Convenios.', '#EF4444');
    return;
  }
  if (appId === 'finanzas' && !isAuraOwner() && !hasPermission(auraAccess, appId, 'finanzas.read')) {
    showToast('No tienes permiso para abrir Finanzas.', '#EF4444');
    return;
  }
  const destination = new URL(url, location.href);
  if (appId === 'portal_b2b' || destination.pathname.startsWith('/creditek/convenios/')) {
    window.open(destination.href, '_blank', 'noopener,noreferrer');
    return;
  }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const loadId = ++moduleLoadId;
  activeModule = { url, title, appId, el };
  clearTimeout(moduleLoadTimer);
  const iframe = document.getElementById('main-iframe');
  const iv = document.getElementById('iframe-view');
  iv.classList.remove('visible');
  iframe.src = 'about:blank';
  document.getElementById('iframe-title').textContent = title;
  document.getElementById('iframe-link').href = url;
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-breadcrumb').textContent = 'Creditek \xB7 ' + title;
  showToast(\`Cargando \${title}\u2026\`);

  try {
    const embeddedDestination = buildEmbeddedModuleUrl(url);
    if (embeddedDestination.origin !== location.origin) throw new Error('La URL del m\xF3dulo no pertenece a AURA.');
    const response = await fetch(embeddedDestination.href, { cache:'no-store', credentials:'same-origin' });
    if (!response.ok) throw new Error(\`No fue posible abrir \${title} (HTTP \${response.status}).\`);
    if (loadId !== moduleLoadId) return;
    iframe.src = embeddedDestination.href;
    moduleLoadTimer = setTimeout(() => showModuleError(\`La carga de \${title} excedi\xF3 el tiempo permitido.\`), 15000);
  } catch (error) {
    if (loadId === moduleLoadId) showModuleError(error.message || \`No fue posible abrir \${title}.\`);
  }
}

function openModuleFromCard(url, title, appId = '') {
  openModule(url, title, null, appId);
}

function closeIframe() {
  moduleLoadId += 1;
  clearTimeout(moduleLoadTimer);
  activeModule = null;
  document.getElementById('iframe-view').classList.remove('visible');
  document.getElementById('iframe-status').classList.remove('visible');
  document.getElementById('main-iframe').src = 'about:blank';
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('view-dashboard').style.display = 'block';
  document.getElementById('view-configuracion').style.display = 'none';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('[data-dashboard-nav]')?.classList.add('active');
  document.getElementById('topbar-title').textContent = 'Panel general';
  document.getElementById('topbar-breadcrumb').textContent = 'Ecosistema AURA';
}

function showModuleError(message) {
  clearTimeout(moduleLoadTimer);
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('iframe-view').classList.add('visible');
  document.getElementById('iframe-status-title').textContent = 'No fue posible cargar el m\xF3dulo';
  document.getElementById('iframe-status-copy').textContent = sanitizeIncidentText(message);
  document.getElementById('iframe-status-actions').hidden = false;
  document.getElementById('iframe-status').classList.add('visible');
}

function retryModule() {
  if (!activeModule) return closeIframe();
  const { url, title, appId, el } = activeModule;
  openModule(url, title, el, appId);
}

document.getElementById('main-iframe').addEventListener('load', () => {
  const iframe = document.getElementById('main-iframe');
  if (!activeModule || iframe.src === 'about:blank') return;
  clearTimeout(moduleLoadTimer);
  try {
    const body = iframe.contentDocument?.body;
    if (body && iframe.contentWindow.location.origin === location.origin) installDictation(iframe.contentWindow);
    if (!body || !body.children.length || !body.textContent.trim()) {
      showModuleError(\`El m\xF3dulo \${activeModule.title} devolvi\xF3 una pantalla vac\xEDa.\`);
      return;
    }
  } catch (_) {
    // Una navegaci\xF3n autorizada de otro origen puede impedir inspeccionar el DOM.
  }
  document.getElementById('iframe-status').classList.remove('visible');
  document.getElementById('iframe-status-actions').hidden = true;
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('iframe-view').classList.add('visible');
});

window.addEventListener('message', event => {
  if (event.origin === location.origin && event.data?.type === 'aura:close-module') closeIframe();
});

// \u2500\u2500 Centro de incidencias \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function incidentContext() {
  return technicalContext({
    route: activeModule?.url || location.pathname,
    user: auraAccess?.display_name || auraAccess?.email || 'Usuario AURA',
  });
}

function currentIncidentModule() {
  return activeModule?.title || 'Panel general';
}

function openIncidentReporter() {
  const view = document.getElementById('view-configuracion');
  document.getElementById('incident-module').value = currentIncidentModule();
  view.classList.add('incident-overlay');
  view.style.display = 'grid';
  updateIncidentMeta();
  document.getElementById('incident-title').focus();
  if (globalThis.lucide) lucide.createIcons();
}

function closeIncidentReporter() {
  const view = document.getElementById('view-configuracion');
  view.classList.remove('incident-overlay');
  if (document.getElementById('topbar-title').textContent !== 'Centro de incidencias') view.style.display = 'none';
}

function updateIncidentMeta() {
  const element = document.getElementById('incident-meta');
  if (!element) return;
  const context = incidentContext();
  element.replaceChildren(...Object.entries(context).map(([key,value]) => {
    const row = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = \`\${key}: \`;
    row.append(label, document.createTextNode(sanitizeIncidentText(value)));
    return row;
  }));
}

function generateIncidentReport() {
  const error = document.getElementById('incident-error').value.trim();
  const expected = document.getElementById('incident-expected').value.trim();
  if (!error || !expected) {
    showToast('Describe el error y el resultado esperado.', '#EF4444');
    return '';
  }
  incidentReport = buildIncidentReport({
    module: document.getElementById('incident-module').value,
    error,
    expected,
    evidence: document.getElementById('incident-evidence').files[0],
    context: incidentContext(),
    technicalErrors: auraTechnicalErrors,
  });
  document.getElementById('incident-preview').textContent = incidentReport;
  showToast('Reporte seguro generado.');
  return incidentReport;
}

function readIncidentEvidence(file) {
  if (!file) return Promise.resolve(null);
  if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('La evidencia no puede superar 10 MB.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: sanitizeIncidentText(file.name), type: file.type, size: file.size, data: reader.result });
    reader.onerror = () => reject(new Error('No fue posible leer la evidencia.'));
    reader.readAsDataURL(file);
  });
}

async function submitCorporateIncident() {
  const title = document.getElementById('incident-title').value.trim();
  const description = document.getElementById('incident-error').value.trim();
  const expected = document.getElementById('incident-expected').value.trim() || 'Reportar el problema para diagn\xF3stico y correcci\xF3n.';
  const preview = document.getElementById('incident-preview');
  const button = document.getElementById('incident-submit');
  if (title.length < 5 || description.length < 10) {
    preview.textContent = 'Escribe un t\xEDtulo de al menos 5 caracteres y una descripci\xF3n de al menos 10.';
    return;
  }
  const token = await auraAuth.token();
  if (!token) {
    preview.textContent = 'Tu sesi\xF3n AURA venci\xF3. Inicia sesi\xF3n nuevamente antes de enviar.';
    return;
  }
  if (!incidentRequestId) incidentRequestId = crypto.randomUUID();
  button.disabled = true;
  preview.textContent = 'Enviando la incidencia al Centro Corporativo KORA\u2026';
  try {
    const context = incidentContext();
    const evidence = await readIncidentEvidence(document.getElementById('incident-evidence').files[0]);
    const response = await fetch('/creditek/agentes/api/incidents', {
      method: 'POST',
      headers: { authorization: \`Bearer \${token}\`, 'content-type': 'application/json' },
      body: JSON.stringify({
        local_incident_id: incidentRequestId,
        title: sanitizeIncidentText(title),
        description: sanitizeIncidentText(description),
        expected: sanitizeIncidentText(expected),
        module: sanitizeIncidentText(currentIncidentModule()),
        page_name: sanitizeIncidentText(currentIncidentModule()),
        page_url: context.ruta,
        aura_version: context.version,
        browser: context.navegador,
        operating_system: sanitizeIncidentText(navigator.platform || 'No disponible'),
        screen_resolution: \`\${screen.width} \xD7 \${screen.height}\`,
        viewport: context.viewport,
        connection_status: navigator.onLine ? 'online' : 'offline',
        console_errors: auraTechnicalErrors.slice(-10).map(sanitizeIncidentText),
        evidence,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.incident_code) throw new Error(data.error || 'KORA no pudo registrar la incidencia.');
    preview.textContent = \`Incidencia registrada:\\n\${data.incident_code}\${data.warning ? \`\\n\\n\${data.warning}\` : ''}\`;
    incidentRequestId = '';
    showToast(\`Incidencia \${data.incident_code} registrada.\`);
  } catch (error) {
    preview.textContent = sanitizeIncidentText(error.message || 'No fue posible registrar la incidencia en KORA.');
  } finally {
    button.disabled = false;
  }
}

async function copyIncidentReport() {
  const report = incidentReport || generateIncidentReport();
  if (!report) return;
  await navigator.clipboard.writeText(report);
  showToast('Reporte copiado para soporte.');
}

function downloadIncidentReport() {
  const report = incidentReport || generateIncidentReport();
  if (!report) return;
  downloadIncidentText(report);
}

window.addEventListener('error', event => {
  auraTechnicalErrors.push(\`\${event.message || 'Error de JavaScript'} \xB7 \${event.filename || location.pathname}:\${event.lineno || 0}\`);
});
window.addEventListener('unhandledrejection', event => {
  auraTechnicalErrors.push(\`Promesa rechazada: \${event.reason?.message || String(event.reason || 'sin detalle')}\`);
});

// \u2500\u2500 Toast \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function showToast(msg, color='#0B1E3D') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// \u2500\u2500 Entrada \xFAnica: restaura una sesi\xF3n existente \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function initializeAura() {
  auraAccess = await auraAuth.restore();
  if (auraAccess) enterAura();
  else setTimeout(() => document.getElementById('login-email').focus(), 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAura, { once: true });
} else {
  queueMicrotask(initializeAura);
}

Object.assign(window, {
  showSection, openModule, openModuleFromCard, closeIframe, retryModule, toggleAuraSidebar,
  openIncidentReporter, closeIncidentReporter, submitCorporateIncident,
  generateIncidentReport, copyIncidentReport, downloadIncidentReport, showToast,
  openRegistrationLinksPanel, closeRegistrationLinksPanel, closeGeneratedLink,
  copyGeneratedLink, downloadGeneratedQr,
});
<\/script>
</body>
</html>
`;
async function serveAuraShell(request, html2, { fetcher = fetch } = {}) {
  const url = new URL(request.url);
  if (!["/creditek/agentes/", "/creditek/agentes/index.html"].includes(url.pathname)) {
    if (url.hostname !== "aura.crediteksas.com") return new Response("Not found", { status: 404 });
    try {
      return await fetcher(request);
    } catch {
      return new Response("Origin unavailable", { status: 502, headers: { "cache-control": "no-store" } });
    }
  }
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  return new Response(request.method === "HEAD" ? null : html2, { headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-aura-tools-release": "20260915-nova-pwa"
  } });
}
var stdin_default = { fetch: (request) => serveAuraShell(request, shell_index_default) };
var CARIBBEAN_WARDROBE_CONTRACT = "CARIBBEAN EVERYDAY WARDROBE \u2014 APPLIES WHEN PEOPLE ARE REQUESTED:\n- Express the Colombian Caribbean setting through hot-weather everyday clothing, warm natural light and the local commercial environment, never through a presumed regional face, ethnicity or skin tone.\n- Default to breathable cotton or linen, fresh short-sleeved or sleeveless blouses/shirts, lightweight trousers or skirts, sandals or light everyday sneakers. Adults may dress fashionably without cold-weather styling.\n- Unless the operator explicitly requests otherwise, avoid boots, coats, scarves, heavy jackets, thick layers and winter fashion. Do not substitute carnival costumes, beachwear or tourist props.\n- Preserve the operator's requested number of people, adult ages, roles, actions and specific appearance or clothing instructions. Do not add a salesperson or replace two requested friends with a different cast. These are contextual defaults, not a new scene or extra people.";
function patchCaribbeanDirection(html) {
  if (html.includes("const CARIBBEAN_WARDROBE_CONTRACT =")) return html;
  const patches = [
    ["const RECRAFT_ART_DIRECTION =", "const CARIBBEAN_WARDROBE_CONTRACT = " + JSON.stringify(CARIBBEAN_WARDROBE_CONTRACT) + ";\nconst RECRAFT_ART_DIRECTION ="],
    ["    AD_CREATIVE_QUALITY_CONTRACT,", "    CARIBBEAN_WARDROBE_CONTRACT,\n    AD_CREATIVE_QUALITY_CONTRACT,"],
    ["    RECRAFT_ART_DIRECTION,", "    CARIBBEAN_WARDROBE_CONTRACT,\n    RECRAFT_ART_DIRECTION,"]
  ];
  if (patches.some(([from]) => html.split(from).length !== 2)) throw Error("PUBLISHER_SOURCE_CHANGED");
  for (const [from, to] of patches) html = html.replace(from, to);
  return html;
}
async function patchPublisherResponse(response) {
  const original = await response.text();
  let body;
  try {
    body = patchCaribbeanDirection(original);
  } catch {
    body = original;
  }
  const headers = new Headers(response.headers);
  for (const key of ["content-length", "content-encoding", "etag", "last-modified"]) headers.delete(key);
  headers.set("cache-control", "no-store");
  if (body !== original || original.includes("const CARIBBEAN_WARDROBE_CONTRACT =")) headers.set("x-aura-visual-direction", "caribe-20261011");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
function addOrganicEntryNavigation(response, path) {
  const headers = new Headers(response.headers);
  for (const name of ["etag", "content-length", "last-modified"]) headers.delete(name);
  headers.set("cache-control", "no-store");
  const rewriter = new HTMLRewriter();
  if (path.endsWith("creditek-agente-calendario.html")) {
    rewriter.on("body", { element(e) {
      e.prepend('<nav aria-label="Publicaci\xF3n org\xE1nica"><a href="/creditek/agentes/aura-organic-studio.html">Contenido org\xE1nico \xB7 Crear, aprobar calendario y medir \u2192</a></nav>', { html: true });
    } });
  } else {
    rewriter.on('.nav-item[data-aura-owner-only][href="/creditek/agentes/nova-supervision.html"]', { element(e) {
      e.after(`<a class="nav-item" data-organic-app-nav data-aura-owner-only hidden href="/creditek/agentes/aura-organic-studio.html" onclick="openModule('/creditek/agentes/aura-organic-studio.html','Contenido org\xE1nico',this,'organic');return false;"><i data-lucide="images"></i><span>Contenido org\xE1nico</span></a>`, { html: true });
    } });
    rewriter.on("[data-nova-dashboard-card]", { element(e) {
      e.after(`<a class="module-card" data-organic-app-card data-aura-owner-only hidden href="/creditek/agentes/aura-organic-studio.html" onclick="openModuleFromCard('/creditek/agentes/aura-organic-studio.html','Contenido org\xE1nico','organic');return false;" style="text-decoration:none;color:inherit"><div class="module-top"><i data-lucide="images"></i></div><div class="module-name">Contenido org\xE1nico</div><div class="module-desc">Crea y revisa publicaciones de Instagram y Facebook. Solo se programa el calendario aprobado.</div><div class="module-meta">Abrir dentro de AURA \u2192</div></a>`, { html: true });
    } });
  }
  return rewriter.transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}
function organicAppShell(previous) {
  return {
    async fetch(request, env, ctx) {
      const response = await previous.fetch(request, env, ctx);
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && ["/creditek/agentes/creditek-agente-redes", "/creditek/agentes/creditek-agente-redes.html"].includes(path) && response.status === 200 && response.headers.get("content-type")?.includes("text/html")) return patchPublisherResponse(response);
      if (request.method !== "GET" || !["/creditek/agentes/", "/creditek/agentes/index.html"].includes(path) || response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) return response;
      const result = addOrganicEntryNavigation(response, path);
      result.headers.set("x-aura-organic-app-release", "20261011-shell");
      return result;
    }
  };
}
var shell_entry_default = organicAppShell(stdin_default);

// releases/aura-piezas-20261017/candidate.html
var candidate_default = `<!DOCTYPE html>
<html lang="es" data-kora-product="1.0.0" data-kora-version="2.0.4">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AURA | Creditek</title>
<link rel="icon" type="image/png" href="/creditek/shared/branding/creditek-logo.png">
<link rel="apple-touch-icon" href="/creditek/shared/branding/creditek-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/design-system/components/kora-dashboard.css">
<link rel="stylesheet" href="/design-system/components/kora-shell.css?v=2.0.4">
<link rel="stylesheet" href="/design-system/components/kora-product.css">
<link rel="stylesheet" href="/creditek/agentes/aura-premium.css">
<script src="https://unpkg.com/lucide@1.27.0/dist/umd/lucide.min.js" defer><\/script>
<script src="/design-system/components/kora-product.js" defer><\/script>
<script src="aura-module-config.js" defer><\/script>
<script src="aura-agent-bootstrap.js" defer><\/script>
<script src="aura-context-help.js" defer><\/script>
<script type="module">
import { requestAuraImage } from './aura-image-client.mjs';
import { auraAuth } from './aura-auth.mjs';
import { auraSessionToken as storedAuraSessionToken } from './agente3-aura-session.mjs';

async function auraSessionToken() {
  return await auraAuth?.token?.() || storedAuraSessionToken();
}

window.requestAuraImage = requestAuraImage;
window.auraSessionToken = auraSessionToken;
<\/script>
<script>
try {
  ['ck_api_key', 'ck_openai_key', 'ck_meta_token', 'ck_gemini_key'].forEach(key => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
} catch(e) {}
<\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>
<style>
:root {
  --azul: #0B1E3D;
  --turquesa: #00C4CC;
  --blanco: #FFFFFF;
  --bg: #FFFFFF;
  --bg2: #E8F4F8;
  --bg3: #F4FAFB;
  --border: rgba(11,30,61,0.12);
  --border-hover: rgba(0,196,204,0.5);
  --text: #0B1E3D;
  --text2: #2B6C8A;
  --text3: #5A90A8;
  --radius: 14px;
  --radius-sm: 8px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { min-height: 100%; overflow-y: auto; }
body {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100dvh;
  overflow-y: auto;
  overflow-x: clip;
  display: block;
  font-size: 15px;
  line-height: 1.6;
}
.shell { display: flex; flex: 1; min-height: 0; overflow: visible; }
.agent-workspace-panel {
  width: 300px; min-width: 300px;
  background: #E8F4F8;
  border-right: 1px solid rgba(11,30,61,0.10);
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
}
.logo-wrap {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 12px;
}
.logo-img { height: 40px; object-fit: contain; }
.logo-info .logo-title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800; font-size: 14px;
  color: var(--turquesa); letter-spacing: 0.04em;
}
.logo-info .logo-sub {
  font-size: 10px; color: var(--text3);
  text-transform: uppercase; letter-spacing: 0.08em; margin-top: 1px;
}
.sidebar-section { padding: 14px 16px 8px; }
.sidebar-label {
  font-size: 10px; font-weight: 600; color: var(--text3);
  letter-spacing: 0.1em; text-transform: uppercase; padding: 0 4px 8px;
}
.field-group { margin-bottom: 12px; }
.field-label { font-size: 11px; color: var(--text2); margin-bottom: 5px; display: block; padding: 0 4px; }
.field-label > span:not(.ck-tooltip-wrap) { color: #64748B; font-size: 10px; float: right; font-weight: 500; }
select, input[type=text], textarea {
  width: 100%; background: #FFFFFF;
  border: 1px solid rgba(11,30,61,0.15); color: #0B1E3D;
  border-radius: var(--radius-sm); font-family: 'DM Sans', sans-serif;
  font-size: 13px; padding: 9px 12px; outline: none;
  transition: border-color 0.2s, box-shadow 0.2s; appearance: none;
}
select:focus, input:focus, textarea:focus { border-color: #00C4CC; box-shadow: 0 0 0 3px rgba(0,196,204,0.12); }
select option { background: #FFFFFF; }
textarea { resize: vertical; min-height: 72px; line-height: 1.5; }
.platform-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.platform-btn {
  background: #FFFFFF; border: 1px solid rgba(11,30,61,0.15);
  border-radius: var(--radius-sm); padding: 8px 10px;
  cursor: pointer; display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--text2); transition: all 0.15s;
  font-family: 'DM Sans', sans-serif;
}
.platform-btn.active {
  border-color: var(--turquesa); background: rgba(0,196,204,0.12); color: var(--turquesa);
}
.platform-btn:hover:not(.active) { border-color: var(--border-hover); color: var(--text); }
.platform-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.checkbox-row { display: flex; align-items: center; gap: 8px; padding: 7px 4px; cursor: pointer; }
.checkbox-row input[type=checkbox] { accent-color: var(--turquesa); width: 14px; height: 14px; cursor: pointer; }
.checkbox-row label { font-size: 12px; color: var(--text2); cursor: pointer; }
.gen-btn {
  margin: 8px 16px 20px; width: calc(100% - 32px);
  background: #00C4CC; border: none;
  border-radius: var(--radius-sm); color: #FFFFFF;
  font-family: 'Montserrat', sans-serif; font-weight: 700;
  font-size: 13px; letter-spacing: 0.02em;
  padding: 12px 16px; cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.gen-btn:hover { background: #00A8B0; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,196,204,0.3); }
.gen-btn:active { transform: translateY(0); }
.gen-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4); border-top-color: #FFFFFF;
  border-radius: 50%; animation: spin 0.7s linear infinite; display: none;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* \u2500\u2500 Tooltip system (05-jul-2026) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.ck-tooltip-wrap { position: relative; display: inline-block; width: 100%; }
.ck-tooltip-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--turquesa); color: #fff;
  font-size: 9px; font-weight: 700; cursor: help;
  margin-left: 5px; flex-shrink: 0; vertical-align: middle;
  font-family: 'Montserrat', sans-serif;
}
.ck-tooltip {
  display: none; position: fixed; top: auto; left: auto;
  background: #0B1E3D; color: #fff; font-size: 15px; line-height: 1.65;
  padding: 12px 16px; border-radius: 10px; z-index: 9999; width: 300px;
  box-shadow: 0 4px 20px rgba(11,30,61,0.35); pointer-events: none;
  font-family: 'DM Sans', sans-serif; white-space: normal;
  transform: translateX(-50%);
}
.ck-tooltip-wrap:hover .ck-tooltip {
  display: block;
  left: 150px;
  top: calc(var(--tooltip-top, 0px) + 24px);
}
.ck-tooltip b { color: var(--turquesa); }

/* Indicador del detalle del d\xEDa */
.detalle-dia-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; color: var(--text3); padding: 5px 4px 2px;
}
.detalle-dia-val { color: var(--text2); font-style: italic; }
.detalle-dia-btn {
  background: none; border: none; color: var(--turquesa);
  font-size: 10px; cursor: pointer; font-family: 'DM Sans', sans-serif;
  text-decoration: underline; padding: 0;
}

/* Aviso de specs */
.specs-aviso {
  font-size: 10px; color: #f59e0b; padding: 4px 4px 0;
  display: none; line-height: 1.4;
}

/* Campo de contexto por modo */
.modo-contexto-wrap { margin-top: 8px; display: none; }
.modo-contexto-wrap textarea {
  min-height: 60px; font-size: 12px;
  border-color: rgba(0,196,204,0.4);
}
.modo-contexto-lbl {
  font-size: 10px; color: var(--turquesa); font-weight: 600;
  padding: 0 4px 4px; display: block;
}

/* Indicador paso 1 \u2192 paso 2 */
.flujo-indicador {
  font-size: 10px; color: var(--text3); text-align: center;
  padding: 4px 0 2px; letter-spacing: 0.04em;
}
.flujo-indicador span { color: var(--turquesa); font-weight: 700; }
.agent-workspace-main { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: visible; }
.agent-workspace-header {
  padding: 18px 28px 14px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
}
.top-title { font-family: 'Montserrat', sans-serif; font-size: 15px; font-weight: 700; }
.top-sub { font-size: 12px; color: var(--text3); margin-top: 1px; }
.copy-all-btn {
  background: #E8F4F8; border: 1px solid rgba(0,196,204,0.3);
  border-radius: var(--radius-sm); color: #0B1E3D;
  font-size: 12px; padding: 7px 14px; cursor: pointer;
  font-family: 'DM Sans', sans-serif; transition: all 0.15s;
}
.copy-all-btn:hover { border-color: var(--turquesa); color: var(--turquesa); }
.content-area { flex: 1; min-height: 0; overflow-y: auto; overflow-x: clip; padding: 24px 28px 40px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.empty-state {
  min-height: 360px; height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; gap: 12px; padding: 36px;
  background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 18px;
}
.empty-icon {
  width: 72px; height: 72px; border-radius: 20px;
  background: rgba(0,196,204,.10); border: 1px solid rgba(0,196,204,.25);
  display: flex; align-items: center; justify-content: center;
}
.empty-icon::before{content:'\u2726';font-family:'Montserrat',sans-serif;font-size:30px;font-weight:700;color:var(--turquesa)}
.empty-icon img { height: 36px; object-fit: contain; }
.empty-title { font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 700; }
.empty-desc { font-size: 13px; color: var(--text2); max-width: 390px; line-height: 1.55; }
.empty-steps{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:4px}
.empty-step{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:999px;color:#475569;font-size:11px;font-weight:600}
.empty-step b{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--azul);color:#fff;font-size:9px}
.piezas-grid { display: flex; flex-direction: column; gap: 16px; }
.pieza-card {
  background: #FFFFFF; border: 1px solid rgba(11,30,61,0.10);
  border-radius: var(--radius); overflow: hidden;
  animation: fadeIn 0.3s ease;
  box-shadow: 0 2px 12px rgba(11,30,61,0.08);
}
@keyframes fadeIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
.pieza-header {
  padding: 13px 18px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.pieza-platform {
  display: flex; align-items: center; gap: 8px;
  font-family: 'Montserrat', sans-serif; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.pieza-badge {
  font-size: 10px; padding: 3px 8px; border-radius: 20px;
  font-weight: 500; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif;
}
.badge-fb { background: rgba(59,130,246,0.15); color: #60A5FA; }
.badge-ig { background: rgba(236,72,153,0.15); color: #F472B6; }
.badge-wa { background: rgba(37,211,102,0.15); color: #25D366; }
.badge-tt { background: rgba(11,30,61,0.08); color: #0B1E3D; }
.badge-gen { background: rgba(0,196,204,0.15); color: var(--turquesa); }
.char-counter { font-size: 11px; padding: 2px 9px; border-radius: 10px; font-weight: 600; margin-left: auto; white-space: nowrap; }
.char-ok   { background: rgba(34,197,94,0.12);  color: #22c55e; }
.char-warn { background: rgba(234,179,8,0.15);  color: #eab308; }
.char-over { background: rgba(239,68,68,0.15);  color: #ef4444; }
.ajustar-btn { background: transparent; border: 1px solid rgba(239,68,68,0.4); border-radius: 6px; color: #ef4444; font-size: 11px; padding: 3px 9px; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; white-space: nowrap; }
.ajustar-btn:hover { background: rgba(239,68,68,0.1); border-color: #ef4444; }
.ajustar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fmt-toggle { display: flex; gap: 6px; padding: 0 18px 10px; }
.fmt-btn { flex: 1; padding: 8px 10px; background: #FFFFFF; border: 1px solid rgba(11,30,61,0.15); border-radius: var(--radius-sm); color: var(--text2); font-size: 11px; font-weight: 600; cursor: pointer; text-align: center; transition: all .15s; font-family: 'DM Sans', sans-serif; }
.fmt-btn.active { background: rgba(0,196,204,.1); border-color: var(--turquesa); color: var(--turquesa); }
.copy-btn {
  background: transparent; border: 1px solid var(--border);
  border-radius: 6px; color: var(--text3); font-size: 11px;
  padding: 4px 10px; cursor: pointer; font-family: 'DM Sans', sans-serif;
  transition: all 0.15s; display: flex; align-items: center; gap: 4px;
}
.copy-btn:hover { border-color: var(--turquesa); color: var(--turquesa); }
.copy-btn.copied { border-color: var(--turquesa); color: var(--turquesa); }
.pieza-body { padding: 18px; }
.pieza-content {
  font-size: 14px; line-height: 1.75; color: var(--text);
  white-space: pre-wrap; word-break: break-word;
}
.pieza-content em { font-style: normal; color: var(--turquesa); font-weight: 500; }
.pieza-footer {
  padding: 10px 18px; border-top: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.pieza-tag {
  font-size: 11px; padding: 3px 8px;
  background: #F4FAFB; border: 1px solid rgba(11,30,61,0.10);
  border-radius: 20px; color: var(--text3);
}
.hashtag-block {
  margin-top: 12px; padding: 12px 14px;
  background: #F4FAFB; border-radius: var(--radius-sm);
  font-size: 12px; color: var(--text2); line-height: 1.8;
}
.hashtag-block strong {
  display: block; color: var(--text3);
  font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; margin-bottom: 6px;
}
.brief-block {
  margin-top: 12px; padding: 12px 14px;
  background: rgba(0,196,204,0.07);
  border: 1px solid rgba(0,196,204,0.2); border-radius: var(--radius-sm);
}
.brief-block strong {
  display: block; color: var(--turquesa); font-size: 10px;
  letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;
}
.brief-row { display: flex; gap: 8px; font-size: 12px; margin-bottom: 4px; }
.brief-key { color: var(--text3); min-width: 80px; }
.brief-val { color: var(--text); }
.shimmer-card {
  background: #FFFFFF; border: 1px solid rgba(11,30,61,0.10);
  border-radius: var(--radius); padding: 20px 18px; display: none;
  box-shadow: 0 2px 12px rgba(11,30,61,0.08);
}
.shimmer-line {
  height: 12px;
  background: linear-gradient(90deg, #E8F4F8 25%, rgba(0,196,204,0.12) 50%, #E8F4F8 75%);
  background-size: 200% 100%; border-radius: 6px;
  animation: shimmer 1.5s infinite; margin-bottom: 10px;
}
@keyframes shimmer { to { background-position: -200% 0; } }
.shimmer-line.short { width: 60%; }
.shimmer-line.medium { width: 80%; }
.history-item {
  padding: 8px 10px; border-radius: var(--radius-sm);
  cursor: pointer; transition: background 0.15s; border: 1px solid transparent;
}
.history-item:hover { background: #F4FAFB; border-color: rgba(11,30,61,0.12); }
.history-title { font-size: 12px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.history-meta { font-size: 10px; color: var(--text3); margin-top: 1px; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* \u2500\u2500 MODAL API KEY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#apiModal{position:fixed;inset:0;background:rgba(11,30,61,.4);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(6px)}
#apiModal.hidden{display:none}
.m-card{background:#FFFFFF;border:1px solid rgba(11,30,61,.12);border-radius:16px;padding:36px 32px;width:100%;max-width:420px;display:flex;flex-direction:column;gap:18px;box-shadow:0 24px 64px rgba(11,30,61,.12)}
.m-logo{display:flex;align-items:center;gap:12px}
.m-logo img{height:34px;object-fit:contain}
.m-logo-name{font-family:'Montserrat',sans-serif;font-weight:800;font-size:14px;color:#00C4CC;letter-spacing:.05em}
.m-title{font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.05rem;color:#0B1E3D;margin-bottom:3px}
.m-desc{font-size:13px;color:#2B6C8A;line-height:1.6}
.m-field{position:relative}
.m-input{width:100%;background:#FFFFFF;border:1px solid rgba(11,30,61,.15);color:#0B1E3D;border-radius:8px;font-family:monospace;font-size:13px;padding:12px 52px 12px 14px;outline:none;transition:border-color .2s;letter-spacing:.02em}
.m-input:focus{border-color:#00C4CC;box-shadow:0 0 0 3px rgba(0,196,204,.12)}
.m-input::placeholder{color:#5A90A8;font-family:'DM Sans',sans-serif;letter-spacing:0;font-size:12px}
.m-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:#5A90A8;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;padding:4px;transition:color .15s}
.m-eye:hover{color:#00C4CC}
.m-error{font-size:12px;color:#fc814a;display:none;padding:2px 0}
.m-submit{background:#00C4CC;border:none;border-radius:8px;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-weight:700;font-size:14px;letter-spacing:.02em;padding:13px;cursor:pointer;transition:all .2s;width:100%}
.m-submit:hover{background:#00A8B0;transform:translateY(-1px);box-shadow:0 6px 22px rgba(0,196,204,.35)}
.m-note{font-size:11px;color:#5A90A8;text-align:center;line-height:1.6}
.m-note a{color:#00C4CC;text-decoration:none}
.m-note a:hover{text-decoration:underline}
.key-status{display:flex;align-items:center;justify-content:space-between;padding:6px 3px}
.key-dot{width:7px;height:7px;border-radius:50%;background:#00C4CC;display:inline-block;margin-right:5px}
.breadcrumb{display:flex;align-items:center;gap:6px;font-size:12px;background:#E8F4F8;border-bottom:1px solid rgba(11,30,61,0.10);padding:10px 20px;flex-shrink:0}
.breadcrumb a{color:#00C4CC;text-decoration:none;font-weight:600}
.breadcrumb a:hover{text-decoration:underline}
.breadcrumb .sep{color:#5A90A8}
.breadcrumb .cur{color:#2B6C8A}
.toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;opacity:0;transform:translateY(8px);transition:all .3s;pointer-events:none;z-index:500;color:#fff}
.toast.show{opacity:1;transform:translateY(0)}
/* \u2500\u2500 M\xF3dulo generador de im\xE1genes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.img-section{margin-top:20px;background:#FFFFFF;border:1px solid rgba(11,30,61,.10);border-radius:var(--radius);overflow:hidden;display:block;animation:fadeIn .3s ease;box-shadow:0 2px 12px rgba(11,30,61,.08)}
.img-section.visible{display:block}
.img-hdr{padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
.img-hdr-title{font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700}
.img-hdr-badge{font-size:10px;background:rgba(0,196,204,.12);color:var(--turquesa);padding:2px 8px;border-radius:12px;letter-spacing:.04em}
.engine-row{display:flex;gap:8px;padding:14px 18px 8px}
.model-chk-label{display:flex;align-items:center;gap:7px;padding:8px 14px;background:#FFFFFF;border:1.5px solid rgba(11,30,61,.15);border-radius:var(--radius-sm);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;user-select:none}
.model-chk-label:has(input:checked){background:rgba(0,196,204,.1);border-color:var(--turquesa);color:var(--turquesa)}
.model-chk-label.model-chk-active{background:rgba(0,196,204,.1);border-color:var(--turquesa);color:var(--turquesa)}
.model-chk-label:hover{border-color:var(--border-hover);color:var(--text)}
.model-chk-label input[type=checkbox]{accent-color:var(--turquesa);width:14px;height:14px;cursor:pointer;flex-shrink:0}
.img-key-row{padding:0 18px 10px;display:flex;align-items:center;gap:8px}
.img-key-status{font-size:11px;color:var(--text3);display:flex;align-items:center;gap:5px;flex:1}
.img-key-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0}
.img-key-dot.ok{background:#22c55e}
.img-key-btn{font-size:11px;background:none;border:none;color:var(--turquesa);cursor:pointer;text-decoration:underline;font-family:'DM Sans',sans-serif}
.img-prompt-wrap{padding:0 18px 14px}
.img-prompt-lbl{font-size:10px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between}
.img-prompt-reset{background:none;border:none;color:var(--text3);font-size:10px;cursor:pointer;text-decoration:underline;font-family:'DM Sans',sans-serif}
.img-prompt-reset:hover{color:var(--turquesa)}
.img-prompt-ta{width:100%;background:#FFFFFF;border:1px solid rgba(11,30,61,.15);color:#0B1E3D;border-radius:var(--radius-sm);font-size:12px;line-height:1.65;padding:10px 12px;resize:vertical;min-height:108px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s,box-shadow .2s}
.img-prompt-ta:focus{border-color:#00C4CC;box-shadow:0 0 0 3px rgba(0,196,204,.12)}
.img-gen-btn{margin:0 18px 16px;width:calc(100% - 36px);background:#00C4CC;border:1px solid #00C4CC;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;padding:11px;border-radius:var(--radius-sm);cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:.02em}
.img-gen-btn:hover{background:#00A8B0;border-color:#00A8B0}
.img-gen-btn:disabled{opacity:.4;cursor:not-allowed}
.img-btn-row{margin:0 18px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.img-btn-row .img-confirm-btn{margin:0;width:100%}
.img-ab-btn{background:#E8F4F8;border:1px solid rgba(0,196,204,.3);color:#0B1E3D;font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;padding:11px 8px;border-radius:var(--radius-sm);cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;letter-spacing:.02em}
.img-ab-btn:hover{background:rgba(0,196,204,.12);border-color:#00C4CC}
.img-ab-btn:disabled{opacity:.4;cursor:not-allowed}
.img-result{padding:0 18px 18px;display:none}
.img-ab-result{padding:0 18px 18px;display:block!important}
.img-ab-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.img-ab-col{display:flex;flex-direction:column;min-height:220px;padding:14px;background:#F8FAFC;border:1px solid rgba(11,30,61,.10);border-radius:12px;box-shadow:0 1px 3px rgba(11,30,61,.04)}
.img-ab-col-label{text-align:center;font-size:10px;font-weight:700;color:var(--turquesa);letter-spacing:.05em;padding:0 0 7px;text-transform:uppercase}
.img-ab-placeholder{flex:1;min-height:150px;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;color:#94A3B8;border:1.5px dashed rgba(11,30,61,.14);border-radius:10px;background:#FFFFFF;font-size:12px;line-height:1.5}
.img-ab-col:has(.img-output[src]:not([src=""])) .img-ab-placeholder{display:none}
.img-ab-col-err{font-size:11px;color:#ff6b6b;padding:10px 4px;text-align:center;line-height:1.5;border:1px solid rgba(255,107,107,.2);border-radius:8px;margin-top:4px}
.img-output{width:100%;border-radius:10px;border:1px solid var(--border);display:block}
.img-dl-btn{display:block;margin-top:10px;background:var(--turquesa);color:var(--azul);text-align:center;padding:10px;border-radius:var(--radius-sm);font-weight:700;font-size:13px;cursor:pointer;border:none;width:100%;font-family:'Montserrat',sans-serif;letter-spacing:.02em;transition:opacity .2s}
.img-dl-btn:hover{opacity:.85}
.img-err{font-size:12px;color:#ff6b6b;padding:0 18px 16px;line-height:1.6;display:none}
.img-editor{padding:0 18px 18px;display:none;border-top:1px solid var(--border);margin-top:4px}
.img-editor-hdr{font-size:12px;font-weight:700;color:var(--text2);padding:14px 0 10px;letter-spacing:.04em;text-transform:uppercase}
.img-editor-nav{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.img-nav-btn{background:#E8F4F8;border:1px solid rgba(11,30,61,.12);border-radius:6px;color:var(--text2);font-size:11px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
.img-nav-btn:hover:not(:disabled){border-color:var(--turquesa);color:var(--turquesa)}
.img-nav-btn:disabled{opacity:.35;cursor:not-allowed}
.img-version-lbl{font-size:11px;color:var(--text3);margin-left:auto}
.img-edit-ta{width:100%;background:#FFFFFF;border:1px solid rgba(11,30,61,.15);color:#0B1E3D;border-radius:var(--radius-sm);font-size:13px;padding:10px 12px;resize:vertical;min-height:56px;outline:none;font-family:'DM Sans',sans-serif;box-sizing:border-box;transition:border-color .2s,box-shadow .2s;margin-bottom:8px}
.img-edit-ta:focus{border-color:#00C4CC;box-shadow:0 0 0 3px rgba(0,196,204,.12)}
.img-edit-btn{width:100%;background:#00C4CC;border:1px solid #00C4CC;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;padding:10px;border-radius:var(--radius-sm);cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:.02em}
.img-edit-btn:hover{background:#00A8B0;border-color:#00A8B0}
.img-edit-btn:disabled{opacity:.4;cursor:not-allowed}
.img-edit-err{font-size:12px;color:#ff6b6b;padding:8px 0 0;line-height:1.6;display:none}
.img-ab-use-btn{display:block;margin-top:6px;background:rgba(0,196,204,.07);border:1px solid rgba(0,196,204,.3);color:var(--turquesa);text-align:center;padding:7px;border-radius:var(--radius-sm);font-size:11px;font-weight:700;cursor:pointer;width:100%;font-family:'Montserrat',sans-serif;letter-spacing:.03em;transition:all .2s}
.img-ab-use-btn:hover{background:rgba(0,196,204,.16)}
.copy-footer-btn{background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:11px;padding:4px 10px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;margin-left:auto;white-space:nowrap;flex-shrink:0}
.copy-footer-btn:hover{border-color:var(--turquesa);color:var(--turquesa)}
.copy-footer-btn.copied{border-color:var(--turquesa);color:var(--turquesa)}
@keyframes imgFadeIn{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}
.img-output.fade-in{animation:imgFadeIn .35s ease}
/* Modal keys imagen */
/* Producto toggle texto/foto */
.prod-toggle{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:9px;padding:3px;background:#EEF2F6;border:1px solid #E2E8F0;border-radius:10px}
.prod-tab{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:transparent;border:1px solid transparent;border-radius:7px;color:#64748B;font-size:11px;font-weight:650;cursor:pointer;text-align:center;transition:all .15s;font-family:'DM Sans',sans-serif}
.prod-tab.active{background:#FFFFFF;border-color:#D7E0E8;color:#0B1E3D;box-shadow:0 1px 3px rgba(11,30,61,.08)}
.prod-tab-icon{width:14px;height:14px;stroke-width:2}
.prod-file{width:100%;background:#FFFFFF;border:2px dashed rgba(11,30,61,.15);border-radius:var(--radius-sm);color:var(--text2);font-size:12px;padding:10px 12px;cursor:pointer;font-family:'DM Sans',sans-serif}
.prod-file:hover{border-color:var(--turquesa)}
.prod-preview-img{width:100%;border-radius:var(--radius-sm);border:1px solid var(--border);margin-top:6px;display:none;max-height:120px;object-fit:contain}
/* Selector estilo visual */
.estilo-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
.estilo-btn{padding:8px 6px;background:#FFFFFF;border:1px solid rgba(11,30,61,.15);border-radius:var(--radius-sm);color:var(--text2);font-size:11px;cursor:pointer;text-align:center;transition:all .15s;font-family:'DM Sans',sans-serif;line-height:1.4;display:flex;align-items:center;justify-content:center;gap:4px}
.estilo-btn svg{width:14px;height:14px;stroke-width:2;flex:0 0 auto}
.estilo-btn.active{background:rgba(0,196,204,.1);border-color:var(--turquesa);color:var(--turquesa)}
body.kora-product-page .estilo-btn{background:#FFFFFF!important;color:#0B1E3D!important;border:1px solid rgba(11,30,61,.15)!important;box-shadow:none!important}
body.kora-product-page .estilo-btn:hover:not(.active){background:rgba(11,30,61,.04)!important;color:#0B1E3D!important;border-color:rgba(11,30,61,.28)!important}
body.kora-product-page .estilo-btn.active{background:#0B1E3D!important;color:#FFFFFF!important;border-color:#0B1E3D!important;box-shadow:0 2px 8px rgba(11,30,61,.24)!important}
.estilo-custom-ta{width:100%;background:#FFFFFF;border:1px solid rgba(11,30,61,.15);color:#0B1E3D;border-radius:var(--radius-sm);font-size:12px;padding:8px 12px;resize:vertical;min-height:60px;outline:none;font-family:'DM Sans',sans-serif;display:none;transition:border-color .2s,box-shadow .2s}
.estilo-custom-ta:focus{border-color:#00C4CC;box-shadow:0 0 0 3px rgba(0,196,204,.12)}
/* Referencias visuales del mercado */
.refs-status-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 4px 8px}
.refs-status-txt{font-size:10px;color:var(--text3);line-height:1.5;flex:1}
.refs-update-btn{background:rgba(0,196,204,.07);border:1px solid rgba(0,196,204,.2);color:var(--turquesa);font-size:10px;font-weight:700;padding:5px 8px;border-radius:var(--radius-sm);cursor:pointer;font-family:'Montserrat',sans-serif;white-space:nowrap;transition:all .2s;flex-shrink:0;letter-spacing:.02em}
.refs-update-btn:hover{background:rgba(0,196,204,.15);border-color:var(--turquesa)}
.refs-update-btn:disabled{opacity:.4;cursor:not-allowed}
.refs-cancel-btn{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:#ef4444;font-size:10px;font-weight:700;padding:5px 8px;border-radius:var(--radius-sm);cursor:pointer;font-family:'Montserrat',sans-serif;white-space:nowrap;transition:all .2s}
.refs-cancel-btn:hover{background:rgba(239,68,68,.18)}
.refs-brand-list{font-size:10px;color:var(--text3);line-height:1.8;padding:0 4px;display:none}
.refs-brand-item{display:flex;align-items:center;gap:5px}
.refs-brand-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;background:#f59e0b}
.refs-dot-live{background:#22c55e}
.refs-dot-static{background:var(--turquesa)}
.refs-dot-fail{background:#f59e0b}
.refs-dot-ok{background:#22c55e}
.refs-stale{color:#f59e0b}
.refs-images-wrap{padding:2px 4px 8px}
.refs-brand-images{margin-bottom:10px}
.refs-brand-images-name{font-size:9px;font-weight:700;color:var(--text2);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.refs-img-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}
.refs-img-thumb{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:3px;border:1px solid var(--border);display:block;cursor:pointer;transition:border-color .15s,opacity .15s}
.refs-img-thumb:hover{border-color:var(--turquesa);opacity:.85}
/* Titulares de impacto */
.titular-opt{display:block;width:100%;text-align:left;background:#FFFFFF;border:1px solid rgba(11,30,61,.12);border-radius:var(--radius-sm);color:var(--text2);font-size:12px;padding:8px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;margin-bottom:4px}
.titular-opt:hover{border-color:var(--turquesa);color:var(--turquesa);background:rgba(0,196,204,.08)}
.titular-opt.selected{border-color:var(--turquesa);color:var(--turquesa);background:rgba(0,196,204,.12)}
/* Logos de financieras */
.financieras-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
.fin-item{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 6px;background:#FFFFFF;border:1px solid rgba(11,30,61,.12);border-radius:var(--radius-sm);cursor:pointer;transition:all .15s;position:relative}
.fin-item input[type=checkbox]{position:absolute;top:5px;right:5px;accent-color:var(--turquesa);width:13px;height:13px;cursor:pointer}
.fin-item:has(input:checked){background:rgba(0,196,204,.1);border-color:var(--turquesa)}
.fin-logo{height:24px;object-fit:contain;max-width:80px;filter:none;opacity:.5;transition:opacity .15s}
.fin-item:has(input:checked) .fin-logo{opacity:1}
.fin-item span{font-size:10px;color:var(--text3);text-align:center}
.fin-item:has(input:checked) span{color:var(--turquesa)}
.fin-note{font-size:10px;color:var(--text3);line-height:1.5;padding:0 4px}
/* \u2500\u2500 Action buttons row (post-generation) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#action-btns-row{display:none;gap:8px;padding:12px 28px 0;flex-wrap:wrap}
.action-btn{flex:1;min-width:140px;padding:10px 14px;border-radius:var(--radius-sm);font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;letter-spacing:.02em;cursor:pointer;border:1px solid rgba(0,196,204,.3);background:#E8F4F8;color:#0B1E3D;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.action-btn:hover{background:rgba(0,196,204,.12);border-color:#00C4CC;color:#0B1E3D}
.action-btn.active{background:rgba(0,196,204,.15);border-color:#00C4CC}
#canva-brief-panel{display:none;margin:12px 28px 0;background:#FFFFFF;border:1px solid rgba(0,196,204,.25);border-radius:var(--radius);padding:20px;box-shadow:0 2px 12px rgba(11,30,61,.08);animation:fadeIn .25s ease}
.canva-brief-title{font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#00C4CC;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;display:flex;align-items:center;gap:6px}
.canva-brief-row{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:13px;margin-bottom:6px;align-items:start}
.canva-brief-key{color:#5A90A8;font-size:12px;padding-top:1px}
.canva-brief-val{color:#0B1E3D;line-height:1.5}
.canva-brief-swatch{display:inline-flex;align-items:center;gap:4px;margin-right:6px}
.canva-brief-dot{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid rgba(11,30,61,.15);flex-shrink:0}
/* Panel preview antes de imagen */
.img-preview-panel{padding:14px 18px 8px;border-bottom:1px solid var(--border)}
.img-preview-lbl-sec{font-size:10px;font-weight:600;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px;display:block}
.img-prev-field{margin-bottom:10px}
.img-prev-fl{font-size:11px;color:var(--text2);margin-bottom:4px;display:block}
.img-prev-input{width:100%;background:#FFFFFF;border:1px solid rgba(11,30,61,.15);color:#0B1E3D;border-radius:var(--radius-sm);font-size:13px;padding:8px 12px;outline:none;transition:border-color .2s,box-shadow .2s;font-family:'DM Sans',sans-serif}
.img-prev-input:focus{border-color:#00C4CC;box-shadow:0 0 0 3px rgba(0,196,204,.12)}
.img-confirm-btn{width:calc(100% - 36px);margin:12px 18px 4px;background:#00C4CC;border:1px solid #00C4CC;color:#FFFFFF;font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;padding:11px;border-radius:var(--radius-sm);cursor:pointer;transition:all .2s;letter-spacing:.02em;display:block}
.img-confirm-btn:hover{background:#00A8B0;border-color:#00A8B0}

/* Selector de salida \xB7 Imagen / Reel / Multi-producto */
.output-format-section{padding:12px 16px;border-top:1px solid var(--border)}
.format-selector{display:flex;gap:8px;padding:4px;margin-top:8px;background:rgba(11,30,61,.04);border-radius:14px}
.format-btn{flex:1;min-height:44px;border:none;border-radius:10px;background:transparent;color:#64748B;font:600 12px 'DM Sans',sans-serif;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 4px;transition:all .25s cubic-bezier(.25,.46,.45,.94)}
.format-btn.active{background:#0B1E3D;color:#fff;box-shadow:0 2px 8px rgba(11,30,61,.3)}
.format-btn:hover:not(.active){background:rgba(11,30,61,.06);color:#0B1E3D}
.format-btn:active{transform:scale(.95);transition-duration:80ms}
.format-btn svg,.format-btn i{width:20px;height:20px}
body.kora-product-page .format-selector .format-btn:not(.active){background:#FFFFFF!important;color:#64748B!important;border:1px solid rgba(11,30,61,.12)!important;box-shadow:none!important}
body.kora-product-page .format-selector .format-btn.active{background:#0B1E3D!important;color:#FFFFFF!important;border-color:transparent!important;box-shadow:0 2px 8px rgba(11,30,61,.30)!important}
body.kora-product-page .format-selector .format-btn:hover:not(.active){background:rgba(11,30,61,.04)!important;color:#0B1E3D!important;border-color:rgba(11,30,61,.24)!important}
.reel-options{display:none;margin-top:12px;padding:12px;background:rgba(0,196,204,.04);border:1px solid rgba(0,196,204,.15);border-radius:12px}
.reel-options.visible{display:block}
.reel-options label{display:block;margin:0 0 6px;font-size:11px;font-weight:600;color:var(--text2)}
.reel-options select{width:100%;min-height:44px;border-radius:12px;border:1.5px solid var(--border);padding:0 12px;font-size:12px;background:#fff;color:var(--text)}
.reel-options select+label{margin-top:12px}
.reel-cost{margin-top:12px;padding:10px 12px;background:rgba(0,196,204,.06);border-radius:10px;color:var(--text2);font-size:11px;line-height:1.5}
.generation-status{display:none;padding:16px;margin:0 0 16px;border-radius:12px;background:rgba(0,196,204,.06);border:1px solid rgba(0,196,204,.15);font-size:13px;color:var(--text2);text-align:center}
.generation-status.processing{display:block;animation:reelStatusPulse 2s ease-in-out infinite}
.generation-status.success{display:block;color:#166534;background:#DCFCE7;border-color:#86EFAC}
.generation-status.error{display:block;color:#B91C1C;background:#FEE2E2;border-color:#FCA5A5}
.reel-result{margin:0 auto 20px;padding:20px;max-width:560px;text-align:center;background:#fff;border:1px solid rgba(11,30,61,.08);border-radius:16px;box-shadow:0 8px 32px rgba(11,30,61,.10)}
.reel-result video{display:block;max-width:100%;max-height:500px;margin:auto;border-radius:16px;box-shadow:0 8px 32px rgba(11,30,61,.15)}
.reel-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.reel-actions a,.reel-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:12px;font-weight:600;text-decoration:none;cursor:pointer}
.reel-download{background:var(--turquesa);color:#fff;box-shadow:0 2px 8px rgba(0,196,204,.25)}
.reel-send{background:var(--azul);color:#fff;border:0;box-shadow:0 2px 8px rgba(11,30,61,.25)}
.reel-actions :is(a,button):active{transform:scale(.985)}
@keyframes reelStatusPulse{0%,100%{opacity:1}50%{opacity:.7}}
@media(prefers-reduced-motion:reduce){.generation-status.processing{animation:none}.format-btn,.reel-actions :is(a,button){transition:none}}

/* El contenido funcional usa directamente los tokens y superficies KORA. */
.agent-workspace{min-width:0;height:calc(100dvh - var(--ctk-height-topbar));min-height:36rem;background:var(--ctk-color-background)}
.agent-workspace-panel{width:390px;min-width:390px;height:100%;max-height:100%;background:var(--ctk-color-surface);border-right-color:var(--ctk-color-border);overflow-y:auto;overflow-x:clip;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable;transition:width .2s ease,min-width .2s ease,transform .2s ease}
.agent-workspace-main{min-width:0;height:100%;background:var(--ctk-color-background)}
.agent-workspace-header{background:var(--ctk-color-surface);border-bottom-color:var(--ctk-color-border);padding-top:12px;padding-bottom:10px}
.content-area{background:var(--ctk-color-background)}
.pieza-card,.img-card,.empty-icon{border-color:var(--ctk-color-border);border-radius:var(--ctk-radius-xl);box-shadow:var(--ctk-shadow-1)}
.agent-workspace :where(select,input[type=text],textarea,button){border-radius:var(--ctk-radius-sm)}
.workspace-collapse-btn{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid var(--ctk-color-border);color:#475569;padding:7px 10px;font:600 11px 'DM Sans',sans-serif;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.workspace-collapse-btn:hover{background:#F8FAFC;color:#0B1E3D;border-color:#CBD5E1}
.workspace-collapse-btn svg{width:15px;height:15px;transition:transform .2s}
.agent-workspace.form-collapsed .agent-workspace-panel{display:none}
.agent-workspace.form-collapsed .workspace-collapse-btn svg{transform:rotate(180deg)}
.agent-workspace.form-collapsed .workspace-collapse-label::after{content:'Mostrar formulario'}
.agent-workspace:not(.form-collapsed) .workspace-collapse-label::after{content:'Ocultar formulario'}
body.kora-product-page .kora-topbar{min-height:48px;height:48px}
body.kora-product-page .kora-breadcrumb{min-height:0}
@media(max-width:63.999rem){
  .agent-workspace{flex-direction:column;height:auto;min-height:calc(100dvh - var(--ctk-height-topbar));max-width:100%;overflow-x:clip;overflow-y:visible}
  .agent-workspace-panel{width:100%;min-width:0;max-width:100%;max-height:none;overflow:visible;border-right:0;border-bottom:1px solid var(--ctk-color-border)}
  .agent-workspace-panel :where(.prod-toggle,.platform-grid){grid-template-columns:repeat(2,minmax(0,1fr));max-width:100%}
  .agent-workspace-panel :where(button,input,select,textarea){min-width:0;max-width:100%}
  .agent-workspace-main{min-height:42rem;overflow:visible}
  .content-area{overflow:visible}
  .workspace-collapse-btn{display:none}
}

/* Agente 1 \xB7 acabado visual premium 9.5/10 */
.agent-workspace-panel{
  background:linear-gradient(180deg,#EDF5F8 0%,#E4EFF4 100%);
  border-right:1px solid rgba(11,30,61,.06);
  box-shadow:1px 0 8px rgba(11,30,61,.04);
}
.sidebar-label{font-size:9px;font-weight:700;color:#94A3B8;letter-spacing:.12em;text-transform:uppercase;padding:0 4px 10px}
.field-label{font-size:11px;font-weight:600;color:#334155;margin-bottom:6px;letter-spacing:.01em}
.sidebar-section{padding:16px 16px 8px;border-bottom:1px solid rgba(11,30,61,.04)}
.sidebar-section:last-child{border-bottom:0}
.field-group{margin-bottom:14px}
.agent-workspace-panel :where(select,input:not([type=checkbox]):not([type=radio]),textarea){
  background:#FFF;border:1.5px solid rgba(11,30,61,.1);border-radius:10px;
  font-size:13px;padding:11px 14px;min-height:44px;
  transition:border-color .2s cubic-bezier(.25,.46,.45,.94),box-shadow .2s cubic-bezier(.25,.46,.45,.94),background-color .2s cubic-bezier(.25,.46,.45,.94);
  box-shadow:0 1px 2px rgba(11,30,61,.03);
}
.agent-workspace-panel :where(select,input,textarea):focus{
  border-color:#00C4CC;box-shadow:0 0 0 3px rgba(0,196,204,.1),0 1px 2px rgba(11,30,61,.03);outline:0;
}
.agent-workspace-panel :where(select,input,textarea):hover:not(:focus){border-color:rgba(11,30,61,.2)}

.gen-btn{
  margin:12px 16px 24px;width:calc(100% - 32px);background:linear-gradient(135deg,#00C4CC 0%,#00B0B8 100%);
  border:0;border-radius:14px;color:#FFF;font-family:'Montserrat',sans-serif;font-weight:700;font-size:14px;
  letter-spacing:.02em;padding:16px 20px;cursor:pointer;transition:all .25s cubic-bezier(.25,.46,.45,.94);
  display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 4px 16px rgba(0,196,204,.3),0 1px 3px rgba(0,196,204,.2);
  position:relative;overflow:hidden;
}
.gen-btn:hover:not(:disabled){background:linear-gradient(135deg,#00B0B8 0%,#009EA5 100%);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,196,204,.35),0 2px 6px rgba(0,196,204,.25)}
.gen-btn:active:not(:disabled){transform:scale(.98);box-shadow:0 2px 8px rgba(0,196,204,.25);transition-duration:80ms}
.gen-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}

.estilo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.estilo-btn{
  padding:10px 8px;background:#FFF;border:1.5px solid rgba(11,30,61,.1);border-radius:10px;color:#64748B;
  font-size:12px;font-weight:600;cursor:pointer;text-align:center;transition:all .2s cubic-bezier(.25,.46,.45,.94);
  display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;box-shadow:0 1px 2px rgba(11,30,61,.03);
}
.estilo-btn:hover:not(.active){border-color:rgba(11,30,61,.2);background:rgba(11,30,61,.02);color:#0B1E3D}
.estilo-btn.active{background:#0B1E3D;border-color:#0B1E3D;color:#FFF;box-shadow:0 4px 12px rgba(11,30,61,.25)}
.estilo-btn:active{transform:scale(.97);transition-duration:80ms}

.platform-btn{
  background:#FFF;border:1.5px solid rgba(11,30,61,.1);border-radius:10px;padding:10px 12px;min-height:44px;
  cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:500;color:#64748B;
  transition:all .2s ease;box-shadow:0 1px 2px rgba(11,30,61,.03);
}
.platform-btn.active{border-color:#00C4CC;background:rgba(0,196,204,.06);color:#0B1E3D;font-weight:600;box-shadow:0 2px 8px rgba(0,196,204,.12)}
.platform-btn:hover:not(.active){border-color:rgba(11,30,61,.2);color:#0B1E3D}
.checkbox-row{min-height:40px;display:flex;align-items:center;gap:10px;padding:8px 4px;border-radius:8px;transition:background .15s ease}
.checkbox-row:hover{background:rgba(11,30,61,.02)}

.logo-wrap{padding:20px 20px 18px;border-bottom:1px solid rgba(11,30,61,.06);display:flex;align-items:center;gap:14px}
.logo-info .logo-title{font-family:'Montserrat',sans-serif;font-weight:800;font-size:14px;color:#00C4CC;letter-spacing:.04em}
.logo-info .logo-sub{font-size:9px;color:#94A3B8;text-transform:uppercase;letter-spacing:.1em;margin-top:2px}

.empty-state{
  min-height:400px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;
  padding:48px;background:#FFF;border:1px dashed rgba(11,30,61,.1);border-radius:20px;
}
.empty-icon{width:80px;height:80px;border-radius:24px;background:linear-gradient(135deg,rgba(0,196,204,.08),rgba(0,196,204,.15));border:1px solid rgba(0,196,204,.2);display:flex;align-items:center;justify-content:center;margin-bottom:4px}
.empty-title{font-family:'Montserrat',sans-serif;font-size:20px;font-weight:700;color:#0B1E3D;letter-spacing:-.01em}
.empty-desc{font-size:14px;color:#64748B;max-width:400px;line-height:1.6}
.empty-step{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#F8FAFC;border:1px solid rgba(11,30,61,.06);border-radius:999px;color:#475569;font-size:11px;font-weight:600;transition:border-color .15s ease}
.empty-step:hover{border-color:rgba(0,196,204,.3)}
.empty-step b{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#0B1E3D;color:#FFF;font-size:10px}

.pieza-card{background:#FFF;border:1px solid rgba(11,30,61,.06);border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(11,30,61,.06);transition:all .3s cubic-bezier(.25,.46,.45,.94)}
.pieza-card:hover{box-shadow:0 8px 24px rgba(11,30,61,.1);transform:translateY(-1px)}
.pieza-header{padding:14px 20px;border-bottom:1px solid rgba(11,30,61,.04)}
.pieza-body{padding:20px}

.img-ab-col{background:#FAFBFC;border:1.5px solid rgba(11,30,61,.08);border-radius:14px;padding:16px;transition:all .25s ease}
.img-ab-col:hover{border-color:rgba(0,196,204,.2);box-shadow:0 4px 16px rgba(11,30,61,.06)}
.img-ab-placeholder{color:#94A3B8;font-size:13px;text-align:center;padding:32px 16px}
.img-ab-label{font-size:11px;font-weight:700;color:#64748B;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px}
.img-output{width:100%;border-radius:12px;border:1px solid rgba(11,30,61,.06);display:block;box-shadow:0 2px 8px rgba(11,30,61,.06)}
.img-dl-btn{display:block;margin-top:12px;background:linear-gradient(135deg,#00C4CC,#00B0B8);color:#FFF;text-align:center;padding:12px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:0;width:100%;transition:all .2s ease;box-shadow:0 2px 8px rgba(0,196,204,.2)}
.img-dl-btn:hover{background:linear-gradient(135deg,#00B0B8,#009EA5);box-shadow:0 4px 12px rgba(0,196,204,.3);transform:translateY(-1px)}
.img-ab-use-btn{margin-top:8px;background:rgba(0,196,204,.05);border:1.5px solid rgba(0,196,204,.2);color:#00A8AF;padding:10px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;width:100%;transition:all .2s ease}
.img-ab-use-btn:hover{background:rgba(0,196,204,.1);border-color:#00C4CC}

.img-editor{padding:0 20px 20px;border-top:1px solid rgba(11,30,61,.04);margin-top:4px}
.img-editor-hdr{font-size:11px;font-weight:700;color:#64748B;padding:16px 0 12px;letter-spacing:.06em;text-transform:uppercase}
.img-nav-btn{background:#F1F5F9;border:1px solid rgba(11,30,61,.08);border-radius:8px;color:#64748B;font-size:11px;padding:7px 14px;cursor:pointer;transition:all .15s ease;min-height:36px}
.img-nav-btn:hover:not(:disabled){border-color:#00C4CC;color:#00A8AF;background:rgba(0,196,204,.04)}
.img-edit-btn{width:100%;background:linear-gradient(135deg,#00C4CC,#00B0B8);border:0;color:#FFF;font-weight:700;font-size:13px;padding:12px;border-radius:10px;cursor:pointer;transition:all .2s ease;box-shadow:0 2px 8px rgba(0,196,204,.2)}
.img-edit-btn:hover:not(:disabled){background:linear-gradient(135deg,#00B0B8,#009EA5);transform:translateY(-1px)}

.ck-tooltip{background:#0B1E3D;color:#FFF;font-size:13px;line-height:1.65;padding:14px 18px;border-radius:12px;box-shadow:0 8px 32px rgba(11,30,61,.35);width:280px}
.ck-tooltip-icon{width:16px;height:16px;border-radius:50%;background:#00C4CC;color:#FFF;font-size:9px;font-weight:700}

.agent-workspace-header{padding:20px 28px 16px;border-bottom:1px solid rgba(11,30,61,.04);background:rgba(255,255,255,.8);backdrop-filter:saturate(160%) blur(16px);-webkit-backdrop-filter:saturate(160%) blur(16px);position:sticky;top:0;z-index:10}
.top-title{font-family:'Montserrat',sans-serif;font-size:16px;font-weight:700;color:#0B1E3D;letter-spacing:-.01em}
.top-sub{font-size:12px;color:#94A3B8;margin-top:2px}

.action-btn{flex:1;min-width:140px;padding:12px 16px;border-radius:12px;font-weight:700;font-size:12px;cursor:pointer;border:1.5px solid rgba(11,30,61,.1);background:#FFF;color:#0B1E3D;transition:all .2s ease;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;box-shadow:0 1px 3px rgba(11,30,61,.04)}
.action-btn:hover{border-color:#00C4CC;background:rgba(0,196,204,.04);box-shadow:0 4px 12px rgba(0,196,204,.1)}
.action-btn.active{border-color:#00C4CC;background:rgba(0,196,204,.08)}

.fin-item{padding:10px 8px;background:#FFF;border:1.5px solid rgba(11,30,61,.08);border-radius:12px;cursor:pointer;transition:all .2s ease;min-height:64px}
.fin-item:has(input:checked){background:rgba(0,196,204,.06);border-color:#00C4CC;box-shadow:0 2px 8px rgba(0,196,204,.1)}
.fin-item:hover:not(:has(input:checked)){border-color:rgba(11,30,61,.2)}

.copy-btn,.copy-footer-btn{background:#FFF;border:1.5px solid rgba(11,30,61,.08);border-radius:8px;color:#64748B;font-size:11px;padding:6px 12px;cursor:pointer;transition:all .15s ease;min-height:32px}
.copy-btn:hover,.copy-footer-btn:hover{border-color:#00C4CC;color:#00A8AF}
.fmt-btn{flex:1;padding:10px 12px;background:#FFF;border:1.5px solid rgba(11,30,61,.08);border-radius:10px;color:#64748B;font-size:12px;font-weight:600;min-height:40px;transition:all .2s ease}
.fmt-btn.active{background:rgba(0,196,204,.08);border-color:#00C4CC;color:#00A8AF}

.content-area{animation:contentFadeIn .4s cubic-bezier(.16,1,.3,1) forwards}
@keyframes contentFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.agent-workspace-panel::-webkit-scrollbar,.content-area::-webkit-scrollbar{width:6px}
.agent-workspace-panel::-webkit-scrollbar-track,.content-area::-webkit-scrollbar-track{background:transparent}
.agent-workspace-panel::-webkit-scrollbar-thumb,.content-area::-webkit-scrollbar-thumb{background:rgba(11,30,61,.12);border-radius:3px}
.agent-workspace-panel::-webkit-scrollbar-thumb:hover,.content-area::-webkit-scrollbar-thumb:hover{background:rgba(11,30,61,.2)}

@media(prefers-reduced-motion:reduce){
  .content-area{animation:none}
  .gen-btn,.estilo-btn,.platform-btn,.pieza-card,.img-ab-col,.img-dl-btn,.img-ab-use-btn,.img-nav-btn,.img-edit-btn,.action-btn{transition-duration:0ms!important;transform:none!important}
}
@media(prefers-reduced-transparency:reduce){.agent-workspace-header{background:#FFF;backdrop-filter:none;-webkit-backdrop-filter:none}}
@media(prefers-contrast:more){.agent-workspace-header,.agent-workspace-panel{border-color:#64748B}.agent-workspace-panel :where(select,input,textarea){border-color:#475569}}
</style>
<link rel="stylesheet" href="/creditek/agentes/aura-responsive.css">
</head>
<body class="kora-product-page" data-kora-agent-id="agent-1" data-aura-page="design">
<nav class="breadcrumb"><a href="/creditek/agentes/">AURA</a><span class="sep">\u203A</span><span class="cur" data-aura-agent-title>Agente 1 \xB7 Piezas comerciales</span></nav>
<div id="toast" class="toast"></div>

<div id="app" data-kora-shell-root>
<div class="shell agent-workspace">
<aside class="agent-workspace-panel" id="agent-form-panel">
  <div class="sidebar-section">
    <div class="sidebar-label">Configurar pieza</div>
    <div class="field-group">
      <label class="field-label">
        Ciudad / tienda
        <span class="ck-tooltip-wrap" style="float:right;width:auto">
          <span class="ck-tooltip-icon">?</span>
          <span class="ck-tooltip">Selecciona la tienda para la que vas a generar la pieza.<br><b>General Creditek:</b> piezas de marca sin tienda espec\xEDfica.<br><b>Tienda espec\xEDfica:</b> el copy y el CTA (llamado a la acci\xF3n) usan el nombre real de esa tienda.</span>
        </span>
      </label>
      <select id="ciudad" onchange="resetPreviewFields()">
        <option value="">Seleccionar tienda...</option>
        <option value="general">\u{1F3E2} General Creditek</option>
        <option value="todas las ciudades">Todas las ciudades</option>
      </select>
    </div>
    <div class="field-group">
      <label class="field-label">
        Modo de publicidad
        <span class="ck-tooltip-wrap" style="float:right;width:auto">
          <span class="ck-tooltip-icon">?</span>
          <span class="ck-tooltip"><b>Celular a cr\xE9dito:</b> copy de financiaci\xF3n, cuotas, aprobaci\xF3n.<br><b>Promoci\xF3n:</b> oferta de precio, sin mencionar cr\xE9dito.<br><b>Tienda:</b> muestra el local y el equipo.<br><b>Servicio:</b> beneficio puntual (revisi\xF3n, garant\xEDa).<br><b>Captaci\xF3n:</b> engagement (interacci\xF3n), sin producto ni precio.<br><b>Jornada:</b> evento presencial con fecha y lugar.<br><b>Institucional:</b> marca, valores, aniversario.</span>
        </span>
      </label>
      <select id="modo" onchange="updateModoUI()">
        <option value="credito">\u{1F4F1} Celular a cr\xE9dito</option>
        <option value="promo">\u{1F381} Promoci\xF3n especial</option>
        <option value="tienda">\u{1F3EA} Contenido de tienda</option>
        <option value="servicio">\u2705 Servicio / beneficio</option>
        <option value="captacion">\u{1F465} Captaci\xF3n de seguidores</option>
        <option value="jornada">\u{1F4B3} Jornada de cr\xE9dito</option>
        <option value="institucional">\u{1F3E2} Institucional / Marca</option>
      </select>
      <div id="modo-desc" style="font-size:11px;color:var(--text3);padding:5px 4px 0;line-height:1.5;"></div>
      <div class="modo-contexto-wrap" id="modo-contexto-wrap">
        <span class="modo-contexto-lbl">\u2726 \xBFQu\xE9 est\xE1 pasando? (la situaci\xF3n)
          <span class="ck-tooltip-wrap" style="float:right;width:auto;margin-right:40px">
            <span class="ck-tooltip-icon">?</span>
            <span class="ck-tooltip">Brief interno para que la IA entienda el motivo u ocasi\xF3n de esta pieza \u2014 <b>nunca aparece como texto en la imagen</b>.<br>Ejemplo: "Cumplimos 3 a\xF1os atendiendo a Corozal" ayuda a que la escena tenga sentido con esa ocasi\xF3n, pero esas palabras no se imprimen \u2014 para eso existe "Texto 2 de imagen" en Piezas generadas.</span>
          </span>
        </span>
        <textarea id="modo-contexto" oninput="buildImgPrompt()" placeholder="\xBFQU\xC9 est\xE1 pasando? La situaci\xF3n comercial concreta.&#10;Ej: Llegaron 5 Samsung A16 a $599.000, solo hasta el viernes \xB7 Jornada de cr\xE9dito este s\xE1bado en Chin\xFA \xB7 Liquidaci\xF3n de Motorola por fin de temporada"></textarea>
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">
        Tipo de pieza
        <span class="ck-tooltip-wrap" style="float:right;width:auto">
          <span class="ck-tooltip-icon">?</span>
          <span class="ck-tooltip" id="tooltip-tipo-pieza"><b>Oferta de la semana:</b> urgencia + precio + CTA presencial.<br><b>Showcase:</b> producto como protagonista, specs destacadas.<br><b>Testimonio:</b> voz del cliente en primera persona.<br><b>Educativo:</b> explica c\xF3mo funciona el cr\xE9dito.<br><b>Promo urgencia:</b> cuenta regresiva, "solo hoy".<br><b>Detr\xE1s de c\xE1mara:</b> muestra la tienda desde adentro.<br><b>Personalizado:</b> t\xFA defines el tipo.</span>
        </span>
      </label>
      <select id="tipo" onchange="updateTipoUI()">
        <option value="oferta_semana">\u{1F3AF} Oferta de la semana</option>
        <option value="showcase_producto">\u{1F4F1} Showcase de producto</option>
        <option value="testimonio">\u2B50 Testimonio de cliente</option>
        <option value="educativo">\u{1F4DA} Educaci\xF3n financiera</option>
        <option value="promo_urgencia">\u26A1 Promo con urgencia</option>
        <option value="detras_camara">\u{1F3AC} Detr\xE1s de c\xE1mara</option>
        <option value="personalizado">\u270F\uFE0F Personalizado</option>
      </select>
      <input type="text" id="tipo-personalizado" placeholder="Describe el tipo de pieza..." style="display:none;margin-top:6px">
    </div>
    <div class="field-group" id="fg-producto">
      <label class="field-label">Producto / equipo <span>opcional</span></label>
      <div class="prod-toggle" aria-label="Forma de ingresar el producto">
        <button class="prod-tab active" onclick="toggleProdMode('texto',this)"><i data-lucide="align-left" class="prod-tab-icon"></i>Descripci\xF3n</button>
        <button class="prod-tab" onclick="toggleProdMode('foto',this)"><i data-lucide="image-up" class="prod-tab-icon"></i>Foto</button>
      </div>
      <input type="text" id="producto" placeholder="Ej: Samsung Galaxy A17 5G 128GB">
      <div id="prod-foto-wrap" style="display:none;margin-top:6px">
        <input type="file" class="prod-file" id="prod-file" accept="image/*" onchange="onProdFileChange(this)">
        <img class="prod-preview-img" id="prod-preview" src="" alt="Vista previa">
      </div>
    </div>
    <div class="field-group" id="fg-cuota">
      <label class="field-label">Precio de cuota mensual <span>opcional</span></label>
      <input type="text" id="cuota" placeholder="Ej: $157.000/mes">
    </div>
    <div class="field-group" id="fg-inicial">
      <label class="field-label">Cuota inicial <span>opcional</span></label>
      <input type="text" id="inicial" placeholder="Ej: $314.500">
    </div>
    <div class="field-group" id="fg-jornada" style="display:none">
      <label class="field-label">Fecha del evento</label>
      <input type="text" id="jornada-fecha" placeholder="Ej: s\xE1bado 15 de junio">
      <label class="field-label" style="margin-top:8px">Lugar / Tienda</label>
      <input type="text" id="jornada-lugar" placeholder="Ej: Tienda Chin\xFA Cell, Cra 7">
      <label class="field-label" style="margin-top:8px">Hora</label>
      <input type="text" id="jornada-hora" placeholder="Ej: 9am \u2013 5pm">
    </div>
    <div class="field-group" id="fg-specs">
      <label class="field-label">
        Specs t\xE9cnicas en imagen <span>opcional</span>
        <span class="ck-tooltip-wrap" style="float:right;width:auto;margin-right:40px">
          <span class="ck-tooltip-icon">?</span>
          <span class="ck-tooltip">Los valores (RAM, c\xE1mara, bater\xEDa) se toman autom\xE1ticamente de las p\xE1ginas de marcas.<br><b>Requisito:</b> haz clic en "Actualizar" en Referencias del mercado antes de usar.<br>Si no se actualizan, GPT puede <b>inventar los valores</b> \u2014 desmarca para evitarlo.</span>
        </span>
      </label>
      <div class="specs-aviso" id="specs-aviso">\u26A0\uFE0F Referencias sin actualizar \u2014 los valores de specs pueden ser inventados. Haz clic en "Actualizar" primero.</div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-top:6px">
        <label class="checkbox-row"><input type="checkbox" id="spec-ram" checked onchange="buildImgPrompt()"><span style="font-size:12px;color:var(--text2)">RAM</span></label>
        <label class="checkbox-row"><input type="checkbox" id="spec-storage" checked onchange="buildImgPrompt()"><span style="font-size:12px;color:var(--text2)">Almacenamiento</span></label>
        <label class="checkbox-row"><input type="checkbox" id="spec-camera" checked onchange="buildImgPrompt()"><span style="font-size:12px;color:var(--text2)">C\xE1mara principal</span></label>
        <label class="checkbox-row"><input type="checkbox" id="spec-battery" checked onchange="buildImgPrompt()"><span style="font-size:12px;color:var(--text2)">Bater\xEDa</span></label>
        <label class="checkbox-row"><input type="checkbox" id="spec-screen" onchange="buildImgPrompt()"><span style="font-size:12px;color:var(--text2)">Pantalla</span></label>
        <label class="checkbox-row"><input type="checkbox" id="spec-chip" onchange="buildImgPrompt()"><span style="font-size:12px;color:var(--text2)">Procesador</span></label>
        <label class="checkbox-row"><input type="checkbox" id="spec-5g" onchange="buildImgPrompt()"><span style="font-size:12px;color:var(--text2)">Conectividad 5G</span></label>
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">
        Copy secundario <span>opcional</span>
        <span class="ck-tooltip-wrap" style="float:right;width:auto;margin-right:40px">
          <span class="ck-tooltip-icon">?</span>
          <span class="ck-tooltip">Gu\xEDa de tono o enfoque para el copy (texto publicitario) generado \u2014 <b>nunca aparece impreso en la imagen</b>.<br>Ejemplo: "que suene urgente", "enfocarse en la aprobaci\xF3n r\xE1pida", "sin mencionar precio".<br>El texto que S\xCD aparece impreso en la imagen se escribe en <b>Texto 2 de imagen</b>, dentro de "Piezas generadas" \u2192.</span>
        </span>
      </label>
      <textarea id="nota" placeholder="Ej: Ven por tu celular a cr\xE9dito, solo necesitas tu c\xE9dula..." oninput="sincronizarCopySecundario(this.value); buildImgPrompt()"></textarea>
    </div>
    <div class="field-group">
      <label class="field-label">
        \xBFC\xF3mo debe verse? (direcci\xF3n visual) <span>opcional</span>
        <span class="ck-tooltip-wrap" style="float:right;width:auto;margin-right:40px">
          <span class="ck-tooltip-icon">?</span>
          <span class="ck-tooltip">Gu\xEDa de tono, variaci\xF3n o enfoque especial \u2014 <b>nunca aparece como texto en la imagen</b>.<br>\xDAsala para: "no mencionar precio", "tono m\xE1s urgente", "solo para stories", "que se vea de noche", "recrear con m\xE1s luz natural".</span>
        </span>
      </label>
      <textarea id="instruccion-ia-extra" placeholder="C\xD3MO quieres que se vea. Esta instrucci\xF3n manda sobre todo lo dem\xE1s.&#10;Ej: Que se vea de noche con luces de ne\xF3n \xB7 Tono urgente de \xFAltima oportunidad \xB7 M\xE1s luz natural y alegre \xB7 Fondo de playa real de Tol\xFA" oninput="buildImgPrompt()"></textarea>
    </div>
    <div class="field-group">
      <label class="field-label">Fecha especial / Temporada <span>opcional</span></label>
      <select id="fecha-especial" onchange="updateFechaEspecialUI()">
        <option value="">Sin fecha especial</option>
        <option value="madre">\u{1F338} D\xEDa de la Madre (mayo)</option>
        <option value="padre">\u{1F454} D\xEDa del Padre (junio)</option>
        <option value="mundial">\u26BD Mundial de f\xFAtbol</option>
        <option value="navidad">\u{1F384} Navidad (diciembre)</option>
        <option value="amistad">\u2764\uFE0F Amor y Amistad (septiembre)</option>
        <option value="halloween">\u{1F383} Halloween (octubre)</option>
        <option value="anonuevo">\u{1F942} A\xF1o Nuevo</option>
        <option value="clases">\u{1F4DA} Regreso a clases</option>
        <option value="personalizada">\u270F\uFE0F Otra (personalizada)</option>
      </select>
      <input type="text" id="fecha-especial-personalizada" placeholder="Ej: D\xEDa del Polic\xEDa, Semana de vacaciones, Aniversario de la tienda..." style="display:none;margin-top:6px">
    </div>
  </div>
  <div class="sidebar-section">
    <div class="sidebar-label">Plataformas a generar</div>
    <div class="platform-grid">
      <button class="platform-btn active" data-platform="facebook" onclick="togglePlatform(this)">
        <div class="platform-dot" style="background:#60A5FA"></div> Facebook
      </button>
      <button class="platform-btn active" data-platform="instagram" onclick="togglePlatform(this)">
        <div class="platform-dot" style="background:#F472B6"></div> Instagram
      </button>
      <button class="platform-btn active" data-platform="whatsapp" onclick="togglePlatform(this)">
        <div class="platform-dot" style="background:#25D366"></div> WhatsApp
      </button>
      <button class="platform-btn" data-platform="tiktok" onclick="togglePlatform(this)">
        <div class="platform-dot" style="background:#E4E4E7"></div> TikTok
      </button>
    </div>
  </div>
  <div class="sidebar-section" style="padding-bottom:4px">
    <div class="sidebar-label">Extras</div>
    <div class="checkbox-row">
      <input type="checkbox" id="chk-hashtags" checked>
      <label for="chk-hashtags">Incluir hashtags sugeridos</label>
    </div>
    <div class="checkbox-row">
      <input type="checkbox" id="chk-brief">
      <label for="chk-brief">Brief visual para Canva</label>
    </div>
    <div class="checkbox-row">
      <input type="checkbox" id="chk-direccion" onchange="resetPreviewFields()">
      <label for="chk-direccion">Incluir direcci\xF3n de la tienda</label>
    </div>
  </div>
  <div class="sidebar-section" style="padding-bottom:8px">
    <div class="sidebar-label">Logos de financieras en imagen</div>
    <div class="financieras-grid">
      <label class="fin-item">
        <input type="checkbox" id="fin-payjoy" value="payjoy" onchange="onFinancieraChange()">
        <img src="logos/payjoy.png" alt="PayJoy" class="fin-logo">
        <span>PayJoy</span>
      </label>
      <label class="fin-item">
        <input type="checkbox" id="fin-krediya" value="krediya" onchange="onFinancieraChange()">
        <img src="logos/krediya.png" alt="Krediya" class="fin-logo">
        <span>Krediya</span>
      </label>
      <label class="fin-item">
        <input type="checkbox" id="fin-alocredit" value="alocredit" onchange="onFinancieraChange()">
        <img src="logos/alocredit.png" alt="Alo Credit" class="fin-logo">
        <span>Alo Credit</span>
      </label>
      <label class="fin-item">
        <input type="checkbox" id="fin-addi" value="addi" onchange="onFinancieraChange()">
        <img src="logos/addi.png" alt="Addi" class="fin-logo">
        <span>Addi</span>
      </label>
    </div>
    <div class="fin-note">Aparecer\xE1n en la franja inferior de la imagen, alineados horizontalmente</div>
    <div class="fin-note" style="color:#f59e0b;margin-top:3px">\u26A0\uFE0F Los logos de financieras se componen al final, sin consumir una generaci\xF3n adicional.</div>
  </div>
  <div class="sidebar-section" style="padding-bottom:10px">
    <div class="sidebar-label">Servicios IA</div>
    <div class="key-status" style="padding:3px 3px 0">
      <span style="font-size:12px;color:var(--text2)">
        <span class="img-key-dot" id="sidebar-recraft-dot" style="width:7px;height:7px;margin-right:5px;display:inline-block"></span>Recraft V4.1
      </span>
      <button type="button" disabled style="display:none">Backend seguro</button>
    </div>
    <div class="key-status" style="padding:3px 3px 4px">
      <span style="font-size:12px;color:var(--text2)">
        <span class="img-key-dot" id="sidebar-openai-dot" style="width:7px;height:7px;margin-right:5px;display:inline-block"></span>OpenAI / GPT Image 2.5 Flare
      </span>
      <button type="button" disabled style="display:none">Backend seguro</button>
    </div>
  </div>
  <div class="sidebar-section" style="padding-bottom:8px">
    <div class="sidebar-label">Estilo visual de imagen</div>
    <div class="estilo-grid">
      <button class="estilo-btn active" onclick="selectEstilo('formal',this)" title="Composici\xF3n profesional y aspiracional. Paleta azul marino + turquesa dominante. Para piezas institucionales, cr\xE9dito y showcase."><i data-lucide="building-2" aria-hidden="true"></i> Formal</button>
      <button class="estilo-btn" onclick="selectEstilo('costeno',this)" title="Caribe colombiano c\xE1lido y luminoso: arquitectura, vegetaci\xF3n y color regional con una sensibilidad macondiana contempor\xE1nea. Sin carnaval, disfraces ni clich\xE9s tur\xEDsticos."><i data-lucide="sun" aria-hidden="true"></i> Alegre coste\xF1o</button>
      <button class="estilo-btn" onclick="selectEstilo('chistoso',this)" title="Humor comercial inspirado en temas actuales, comportamientos y formatos virales: AURA toma el mecanismo del chiste y crea una pieza original ligada al producto. Nunca copia el meme, la imagen ni el texto ajeno."><i data-lucide="laugh" aria-hidden="true"></i> Chistoso</button>
      <button class="estilo-btn" onclick="selectEstilo('minimalista',this)" title="M\xE1ximo espacio en blanco. Un solo punto focal. Para showcase de producto premium y piezas institucionales limpias."><i data-lucide="square" aria-hidden="true"></i> Minimalista</button>
      <button class="estilo-btn" onclick="selectEstilo('contemporaneo',this)" title="Direcci\xF3n editorial actual: composiciones asim\xE9tricas, fotograf\xEDa aut\xE9ntica, tipograf\xEDa protagonista y detalles gr\xE1ficos de tendencia sin perder claridad comercial."><i data-lucide="sparkles" aria-hidden="true"></i> Contempor\xE1neo</button>
      <button class="estilo-btn" onclick="selectEstilo('custom',this)" title="T\xFA defines el estilo en texto libre. \xDAsalo para campa\xF1as especiales o fechas espec\xEDficas."><i data-lucide="pencil" aria-hidden="true"></i> Personalizar</button>
    </div>
    <div class="detalle-dia-row" id="detalle-dia-row" style="display:none">
      <span>Detalle hoy: <span class="detalle-dia-val" id="detalle-dia-val">\u2014</span></span>
      <button class="detalle-dia-btn" onclick="cambiarDetalleDia()">\u21BA cambiar</button>
    </div>
    <textarea class="estilo-custom-ta" id="estilo-custom" placeholder="Describe el estilo visual que quieres para la imagen..." oninput="buildImgPrompt()"></textarea>
  </div>
  <div class="sidebar-section" style="padding-bottom:8px">
    <div class="sidebar-label">Referencias del mercado</div>
    <div class="refs-status-row">
      <span id="refs-status" class="refs-status-txt">Colores de marca activos \u2014 keywords sin obtener</span>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="refs-cancel-btn" id="refs-cancel-btn" style="display:none" onclick="cancelarReferencias()">\u2715 Cancelar</button>
        <button class="refs-update-btn" id="refs-update-btn" onclick="actualizarReferencias()" title="Obtener keywords actuales de marcas del mercado colombiano">\u{1F504} Actualizar</button>
      </div>
    </div>
    <div id="refs-brand-list" class="refs-brand-list"></div>
    <div id="refs-images" class="refs-images-wrap" style="display:none"></div>
  </div>
  <div class="output-format-section">
    <div class="sidebar-label">Formato de salida</div>
    <div class="format-selector" role="group" aria-label="Formato de salida">
      <button type="button" class="format-btn active" data-format="image" aria-pressed="true" onclick="selectOutputFormat('image',this)"><i data-lucide="image" class="format-icon" aria-hidden="true"></i><span>Imagen</span></button>
      <button type="button" class="format-btn" data-format="reel" aria-pressed="false" onclick="selectOutputFormat('reel',this)"><i data-lucide="film" class="format-icon" aria-hidden="true"></i><span>Reel \xB7 costo alto</span></button>
      <button type="button" class="format-btn" data-format="carousel" aria-pressed="false" onclick="selectOutputFormat('carousel',this)"><i data-lucide="layout-grid" class="format-icon" aria-hidden="true"></i><span>Multi-producto</span></button>
    </div>
    <div id="reel-options" class="reel-options">
      <label for="reel-duration">Duraci\xF3n del Reel</label>
      <select id="reel-duration" onchange="updateReelEstimate()">
        <option value="4" selected>4 segundos</option>
        <option value="6">6 segundos</option>
        <option value="8">8 segundos</option>
      </select>
      <label for="reel-style">Estilo de animaci\xF3n</label>
      <select id="reel-style">
        <option value="rotate">Rotaci\xF3n suave del producto</option>
        <option value="zoom">Zoom al producto</option>
        <option value="slide">Entrada lateral con texto</option>
        <option value="dynamic">Din\xE1mico (IA decide)</option>
      </select>
      <div class="reel-cost" id="reel-cost">\u26A0\uFE0F Operaci\xF3n premium: 2 llamadas previstas (imagen base + Veo 3.1). Se mostrar\xE1 el costo estimado y se pedir\xE1 confirmaci\xF3n antes de generar.</div>
    </div>
  </div>
  <button class="gen-btn" id="gen-btn" onclick="generarContenido()">
    <div class="spinner" id="spinner"></div>
    <span id="gen-label">\u2726 Generar piezas</span>
  </button>
  <div id="history-wrap" style="display:none; padding:0 12px 16px; border-top:1px solid var(--border); padding-top:12px; margin-top:4px;">
    <div class="sidebar-label" style="padding:8px 8px 6px">Historial</div>
    <div id="history-list"></div>
  </div>
</aside>

<main class="agent-workspace-main">
  <div class="agent-workspace-header">
    <div>
      <div class="top-title">Piezas generadas</div>
      <div class="top-sub" id="top-subtitle">Configura los par\xE1metros y presiona generar</div>
      <div id="batch-badge" style="display:none;font-size:11px;color:#00C4CC;font-weight:700;margin-top:2px"></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="workspace-collapse-btn" id="workspace-collapse-btn" type="button" aria-expanded="true" aria-controls="agent-form-panel">
        <i data-lucide="panel-left-close"></i><span class="workspace-collapse-label"></span>
      </button>
      <button class="copy-all-btn" onclick="generarContenido()" id="regen-btn" style="display:none;background:#E8F4F8;color:#00C4CC;border:1px solid rgba(0,196,204,0.3)">\u21BA Regenerar</button>
      <button class="copy-all-btn" onclick="copiarTodo()" id="copy-all-btn" style="display:none">Copiar todo</button>
      <button class="copy-all-btn" onclick="exportarPaquete()" id="export-btn" style="display:none;background:#E8F4F8;color:#00C4CC;border:1px solid rgba(0,196,204,0.3)" title="Descargar ZIP con todos los copies e im\xE1genes">\u{1F4E6} Exportar</button>
    </div>
  </div>
  <!-- \u2550\u2550 ACTION BUTTONS ROW \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
  <div id="action-btns-row">
    <button class="action-btn" id="canva-btn" onclick="toggleCanvaBrief()">\u25E7 Prompt Canva</button>
    <button class="action-btn" onclick="abrirPomelli()">\u2726 Abrir en Pomelli</button>
    <button class="action-btn" id="action-gen-btn" onclick="showImgSection(); generarConModelos()">\u{1F5BC} Generar imagen</button>
    <button class="action-btn" id="cola-btn" onclick="enviarACola()">\u{1F4E4} Enviar a cola</button>
  </div>
  <!-- \u2550\u2550 CANVA BRIEF PANEL \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
  <div id="canva-brief-panel" style="display:none">
    <div class="canva-brief-title">\u25E7 Brief de dise\xF1o para Canva</div>
    <div id="canva-brief-content"></div>
  </div>
  <div class="content-area" id="content-area">
    <div id="generation-status" class="generation-status" role="status" aria-live="polite"></div>
    <div class="empty-state" id="empty-state">
      <div class="empty-icon">
        <img style="display:none" src="/creditek/shared/branding/creditek-logo.png" alt="Creditek">
      </div>
      <div class="empty-title">Tu pr\xF3xima pieza empieza aqu\xED</div>
      <div class="empty-desc">Completa la configuraci\xF3n del formulario y genera copies e im\xE1genes listos para revisar.</div>
      <div class="empty-steps" aria-label="Pasos para generar una pieza">
        <span class="empty-step"><b>1</b>Configura</span>
        <span class="empty-step"><b>2</b>Genera</span>
        <span class="empty-step"><b>3</b>Revisa el resultado</span>
      </div>
    </div>
    <div class="shimmer-card" id="loading-card">
      <div class="shimmer-line short"></div>
      <div class="shimmer-line medium"></div>
      <div class="shimmer-line"></div>
      <div class="shimmer-line short"></div>
      <div class="shimmer-line medium"></div>
    </div>
    <div class="piezas-grid" id="piezas-grid"></div>

    <!-- \u2550\u2550 M\xD3DULO GENERADOR DE IM\xC1GENES \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
    <div class="img-section" id="img-section">
      <div class="img-hdr">
        <span>\u{1F5BC}\uFE0F</span>
        <span class="img-hdr-title">Generar imagen con IA</span>
        <span class="img-hdr-badge">Beta</span>
      </div>
      <div class="engine-row">
        <label class="model-chk-label"><input type="checkbox" id="chk-recraft" checked onchange="updateGenerationEstimate()"> \u{1F4F7} Dise\xF1ador A \xB7 Recraft V4.1</label>
        <label class="model-chk-label"><input type="checkbox" id="chk-dalle" checked onchange="updateGenerationEstimate()"> \u2B21 Dise\xF1ador B \xB7 GPT Image 2.5 Flare</label>
      </div>
      <div class="reel-cost" id="image-cost-estimate">Control de uso de hoy: cargando\u2026</div>
      <div class="fmt-toggle">
        <button class="fmt-btn active" id="fmt-feed" onclick="selectFormat('feed')">\u{1F4F1} Feed (1080\xD71080)</button>
        <button class="fmt-btn" id="fmt-stories" onclick="selectFormat('stories')">\u{1F4F2} Stories (1080\xD71920)</button>
      </div>
      <div class="img-key-row">
        <div class="img-key-status">
          <div class="img-key-dot" id="img-key-dot"></div>
          <span id="img-key-label">Key no configurada</span>
        </div>
        <button class="img-key-btn" id="img-key-row-btn" style="display:none" disabled>Backend seguro</button>
      </div>
      <div class="img-preview-panel" id="img-preview-panel">
        <span class="img-preview-lbl-sec">Vista previa del aviso \u2014 revisa y edita antes de generar imagen</span>
        <div id="titulares-field" style="margin-bottom:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span class="img-prev-fl">Titulares sugeridos \u2014 clic para usar</span>
            <button id="mas-titulares-btn" onclick="generarMasTitulares()" style="background:rgba(0,196,204,.1);border:1px solid var(--turquesa);border-radius:6px;color:var(--turquesa);font-size:11px;font-weight:600;padding:3px 10px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s">\u2726 M\xE1s</button>
          </div>
          <div id="titulares-opts"><span style="font-size:11px;color:var(--text3)">Genera contenido primero para ver opciones...</span></div>
        </div>
        <div class="img-prev-field">
          <span class="img-prev-fl">Titular principal</span>
          <input type="text" class="img-prev-input" id="img-titular" placeholder="\xA1Tu celular desde $157.000/mes!" oninput="buildImgPrompt()">
        </div>
        <div class="img-prev-field">
          <span class="img-prev-fl">Texto 2 de imagen <span style="color:var(--text3);font-size:10px">revisa ortograf\xEDa y redacci\xF3n</span></span>
          <textarea class="img-prev-input" id="img-mensaje" placeholder="Texto que aparecer\xE1 impreso en la imagen, debajo del titular..." oninput="this.dataset.editado='1';buildImgPrompt()" style="min-height:60px;resize:vertical;line-height:1.5"></textarea>
        </div>
        <div class="img-prev-field">
          <span class="img-prev-fl">Precio / cuota mensual</span>
          <input type="text" class="img-prev-input" id="img-precio" placeholder="Cuotas desde $157.000/mes" oninput="buildImgPrompt()">
        </div>
        <div class="img-prev-field">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span class="img-prev-fl">Call to action (CTA)</span>
            <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);cursor:pointer">
              <input type="checkbox" id="chk-cta-activo" checked onchange="buildImgPrompt()" style="accent-color:var(--turquesa);cursor:pointer">
              Incluir en imagen
            </label>
          </div>
          <input type="text" class="img-prev-input" id="img-cta" placeholder="Escr\xEDbenos por WhatsApp" oninput="buildImgPrompt()">
        </div>
      </div>
      <div class="img-prompt-wrap">
        <div class="img-prompt-lbl">
          <span>Prompt de imagen (editable)</span>
          <button class="img-prompt-reset" onclick="resetPreviewFields()">\u21BA Restablecer</button>
        </div>
        <textarea class="img-prompt-ta" id="img-prompt-ta" placeholder="El prompt se genera autom\xE1ticamente al producir los copies..."></textarea>
      </div>
      <button class="img-gen-btn" id="img-gen-btn" onclick="generarImagen()" style="display:none">
        <div class="spinner" id="img-spinner"></div>
        <span id="img-gen-label">\u{1F5BC} Generar imagen</span>
      </button>
      <div class="img-result" id="img-result">
        <img class="img-output" id="img-output" src="" alt="Imagen generada">
        <span id="img-model-lbl" style="display:block;text-align:center;font-size:11px;color:#00C4CC;margin-top:6px;opacity:0.8"></span>
        <button class="img-dl-btn" onclick="descargarImagen()">\u2B07 Descargar PNG</button>
      </div>
      <div class="img-err" id="img-err"></div>
      <div class="img-ab-result" id="img-ab-result" hidden aria-hidden="true">
        <div class="img-ab-cols">
          <div class="img-ab-col">
            <div class="img-ab-col-label" id="img-ab-label-a">\u{1F4F7} Foto producto</div>
            <div class="img-ab-placeholder">Comparaci\xF3n autom\xE1tica desactivada para controlar costos.</div>
            <img class="img-output" id="img-ab-a" src="" alt="Comparaci\xF3n desactivada" style="display:none">
            <div class="img-ab-col-err" id="img-ab-err-a" style="display:none"></div>
            <button class="img-dl-btn" id="img-ab-dl-a" onclick="descargarImagenAB('a')" style="display:none">\u2B07 Descargar</button>
            <button class="img-ab-use-btn" id="img-ab-use-a" onclick="usarImagenDeAB('a')" style="display:none">\u2713 Usar en editor</button>
          </div>
          <div class="img-ab-col">
            <div class="img-ab-col-label">\u2B21 GPT Image 2.5 Flare</div>
            <div class="img-ab-placeholder">La vista previa de GPT Image 2.5 Flare aparecer\xE1 aqu\xED.</div>
            <img class="img-output" id="img-ab-b" src="" alt="GPT Image 2.5 Flare" style="display:none">
            <div class="img-ab-col-err" id="img-ab-err-b" style="display:none"></div>
            <button class="img-dl-btn" id="img-ab-dl-b" onclick="descargarImagenAB('b')" style="display:none">\u2B07 Descargar</button>
            <button class="img-ab-use-btn" id="img-ab-use-b" onclick="usarImagenDeAB('b')" style="display:none">\u2713 Usar en editor</button>
          </div>
        </div>
      </div>
      <div class="img-editor" id="img-editor">
        <div class="img-editor-hdr">\u270F\uFE0F Editar imagen</div>
        <div class="img-editor-nav" id="img-editor-nav">
          <button class="img-nav-btn" id="img-nav-prev" onclick="navegarImgHistory(-1)" disabled>\u2190 Versi\xF3n anterior</button>
          <button class="img-nav-btn" id="img-nav-next" onclick="navegarImgHistory(1)" disabled>Versi\xF3n siguiente \u2192</button>
          <span class="img-version-lbl" id="img-version-lbl"></span>
        </div>
        <textarea class="img-edit-ta" id="img-edit-prompt" placeholder="Ej: cambia el fondo a blanco, elimina las flores, agrega el precio $157.000/mes, hazlo m\xE1s alegre..."></textarea>
        <button class="img-edit-btn" id="img-edit-btn" onclick="aplicarCambioImagen()">
          <div class="spinner" id="img-edit-spinner" style="display:none"></div>
          <span id="img-edit-label">Aplicar cambio</span>
        </button>
        <div class="img-edit-err" id="img-edit-err"></div>
      </div>
    </div>
  </div>
</main>
</div>
</div>

<script>
function showToast(msg, color='#22c55e'){const t=document.getElementById('toast');t.textContent=msg;t.style.background=color;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}

// \u2500\u2500 Cola batch (lote) recibida desde el Calendario (Agente 4) \u2500\u2500\u2500\u2500\u2500\u2500
let batchQueue = null; // { items:[{copy,tipo,producto,ciudad,titulo}], idx }

function cargarItemDeCola(item) {
  if (!item) return;
  if (item.ciudad) {
    const sel = document.getElementById('ciudad');
    const opts = [...sel.options];
    const match = opts.find(o => o.value === item.ciudad || o.value.includes(item.ciudad));
    if (match) { sel.value = match.value; sel.dispatchEvent(new Event('change')); }
  }
  const tipoPost = item.tipo || '';
  const modoSel = document.getElementById('modo');
  if (tipoPost.includes('Producto') || tipoPost.includes('CTA')) {
    modoSel.value = 'credito'; modoSel.dispatchEvent(new Event('change'));
  } else if (tipoPost.includes('Testimonio') || tipoPost.includes('Story')) {
    modoSel.value = 'tienda'; modoSel.dispatchEvent(new Event('change'));
  } else {
    modoSel.value = 'servicio'; modoSel.dispatchEvent(new Event('change'));
  }
  document.getElementById('producto').value = item.producto || '';
  const nota = document.getElementById('nota');
  nota.value = item.copy || '';
  nota.dispatchEvent(new Event('input'));

  // Limpiar piezas/estado de la pieza anterior para no confundir al usuario
  document.getElementById('piezas-grid').innerHTML = '';
  document.getElementById('empty-state').style.display = '';
  document.getElementById('action-btns-row').style.display = 'none';
  document.getElementById('copy-all-btn').style.display = 'none';
  document.getElementById('export-btn').style.display = 'none';
  document.getElementById('regen-btn').style.display = 'none';
  document.getElementById('img-section').classList.remove('visible');
  window.scrollTo(0, 0);
}

function updateBatchUI() {
  const btn = document.getElementById('cola-btn');
  const badge = document.getElementById('batch-badge');
  if (!btn || !badge) return;
  if (batchQueue && Array.isArray(batchQueue.items) && batchQueue.items.length) {
    const total = batchQueue.items.length;
    const pos = (batchQueue.idx || 0) + 1;
    badge.style.display = 'block';
    badge.textContent = \`\u{1F4E4} Cola activa \u2014 pieza \${pos} de \${total}\` + (pos===1 && total>1 ? ' \xB7 T\xEDtulo: '+(batchQueue.items[0].titulo||'') : '');
    btn.style.display = '';
    btn.textContent = pos < total ? \`Siguiente pieza (\${pos}/\${total}) \u2192\` : \`\u2713 \xDAltima pieza (\${pos}/\${total})\`;
  } else {
    badge.style.display = 'none';
    btn.style.display = 'none';
  }
}

function enviarACola() {
  if (!batchQueue || !Array.isArray(batchQueue.items) || !batchQueue.items.length) return;
  const total = batchQueue.items.length;
  if ((batchQueue.idx || 0) >= total - 1) {
    showToast('\u2713 Esa era la \xFAltima pieza de la cola', '#22c55e');
    localStorage.removeItem('ck_batch_queue');
    batchQueue = null;
    updateBatchUI();
    return;
  }
  batchQueue.idx = (batchQueue.idx || 0) + 1;
  localStorage.setItem('ck_batch_queue', JSON.stringify(batchQueue));
  cargarItemDeCola(batchQueue.items[batchQueue.idx]);
  updateBatchUI();
  showToast(\`\u2192 Pieza \${batchQueue.idx + 1} de \${total} cargada\`);
}

// \u2500\u2500 FIX v11 09-jul-2026 (aplicado tarde en esta sesi\xF3n) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Los 4 bloques de estilo (alegre coste\xF1o, chistoso, formal, minimalista) viv\xEDan
// duplicados: completos dentro de generarMasTitulares(), e incompletos (solo 2
// de 4, sin REGLA DE ESPECIFICIDAD ni CUMPLIMIENTO META) dentro de
// generarContenido() \u2014 por eso los titulares iniciales (sin usar el bot\xF3n
// "\u2726 M\xE1s") sal\xEDan gen\xE9ricos. ESTILO_INSTRUCCIONES() centraliza los 4 en un
// solo lugar, para que ambas funciones usen exactamente el mismo texto.
//
// Es una FUNCI\xD3N (no un objeto/constante fija) a prop\xF3sito: v15 Parte 2
// agreg\xF3 \`pick()\` para que cada bloque muestre una variante de ejemplo al azar
// EN CADA GENERACI\xD3N (evita que la IA copie siempre el mismo ejemplo literal).
// Si esto fuera un objeto calculado una sola vez al cargar la p\xE1gina, pick()
// solo se evaluar\xEDa una vez y el "azar" quedar\xEDa congelado toda la sesi\xF3n \u2014
// por eso hay que llamarla como ESTILO_INSTRUCCIONES(), no usarla como valor.
function buildCreativeStyleDirection(estilo = currentEstilo) {
  const directions = {
    costeno: 'Alegre coste\xF1o contempor\xE1neo: comercio cuidado, luz c\xE1lida, vegetaci\xF3n y arquitectura cotidiana del Caribe colombiano; una sensibilidad macondiana sutil, viva y moderna, sin carnaval ni clich\xE9s tur\xEDsticos.',
    chistoso: 'Humor comercial actual del Caribe colombiano: parte de un comportamiento, conversaci\xF3n o formato viral vigente y transforma su mecanismo en una situaci\xF3n original de compra con planteamiento y remate. Nunca copies la imagen, el texto, el personaje ni el logo de un meme ajeno.',
    formal: 'Formal contempor\xE1neo: confianza, precisi\xF3n comercial y jerarqu\xEDa visual limpia; evita lenguaje corporativo gen\xE9rico.',
    minimalista: 'Minimalista: una sola idea comercial concreta, pocas palabras, espacio visual y m\xE1xima claridad.',
    contemporaneo: 'Contempor\xE1neo editorial: composici\xF3n asim\xE9trica, fotograf\xEDa aut\xE9ntica, tipograf\xEDa expresiva, ritmo visual actual y una sola idea comercial; evita plantillas, neones gratuitos y decoraci\xF3n tecnol\xF3gica gen\xE9rica.',
    custom: document.getElementById('estilo-custom')?.value.trim() || 'Direcci\xF3n visual personalizada, concreta y respetuosa.',
  };
  return directions[estilo] || directions.formal;
}

function buildRecentHeadlinePenalty() {
  try {
    const recent = JSON.parse(sessionStorage.getItem('aura_recent_headlines') || '[]').filter(t => typeof t === 'string').slice(-24);
    return recent.length ? \`\\nTITULARES RECIENTES \u2014 no repitas ni parafrasees:\\n\${recent.map(t => \`- \${t}\`).join('\\n')}\` : '';
  } catch { return ''; }
}

function rememberRecentHeadlines(titulares) {
  try {
    const current = JSON.parse(sessionStorage.getItem('aura_recent_headlines') || '[]');
    sessionStorage.setItem('aura_recent_headlines', JSON.stringify([...current, ...titulares].slice(-24)));
  } catch { /* la memoria de variedad nunca bloquea la generaci\xF3n */ }
}

function buildMandatoryUserBrief() {
  const brief = [document.getElementById('instruccion-ia-extra')?.value.trim(), document.getElementById('modo-contexto')?.value.trim()].filter(Boolean).join(' \xB7 ');
  return brief ? \`USER BRIEF \u2014 PRIORIDAD M\xC1XIMA:\\n"\${brief}"\\nConserva cada objeto, escena, ubicaci\xF3n y restricci\xF3n expl\xEDcita; no lo sustituyas por una escena gen\xE9rica.\` : '';
}

function buildExplicitCreativePriority() {
  const additional = document.getElementById('instruccion-ia-extra')?.value.trim() || '';
  const context = document.getElementById('modo-contexto')?.value.trim() || '';
  const note = document.getElementById('nota')?.value.trim() || '';
  const product = document.getElementById('producto')?.value.trim() || '';
  const lines = [
    additional && \`1. INSTRUCCI\xD3N ADICIONAL DEL USUARIO (manda): "\${additional}"\`,
    context && \`2. CONTEXTO ESPEC\xCDFICO DE LA PIEZA: "\${context}"\`,
    note && \`3. MENSAJE/COPY DEL USUARIO: "\${note}"\`,
    product && \`4. PRODUCTO SELECCIONADO: "\${product}"\`,
  ].filter(Boolean);
  return lines.length ? \`JERARQU\xCDA DE CONTEXTO \u2014 NO ALTERAR:\\n\${lines.join('\\n')}\\nDetalle hoy es solo inspiraci\xF3n secundaria: no puede sustituir, contradecir ni dominar estos elementos.\` : '';
}

function buildModeCopyGuard(modo) {
  if (modo === 'promo') return \`MODO PROMOCI\xD3N ESPECIAL \u2014 REGLA DE NEGOCIO:\\n- Enf\xF3cate en ocasi\xF3n, regalo, beneficio, producto, emoci\xF3n y CTA.\\n- No introduzcas por iniciativa propia fiador, codeudor, reportado, estudio, aprobaci\xF3n, cr\xE9dito o financiaci\xF3n. Solo menciona condiciones financieras si el usuario las escribi\xF3 expl\xEDcitamente.\\n- No inventes una marca o modelo cuando Producto est\xE9 vac\xEDo.\`;
  if (modo === 'tienda') return 'MODO TIENDA: habla de la experiencia, el producto y la visita; no inventes cr\xE9dito ni condiciones financieras.';
  if (modo === 'servicio') return 'MODO SERVICIO: explica \xFAnicamente el servicio indicado y una acci\xF3n verificable; no inventes financiaci\xF3n.';
  return '';
}

const COPY_QUALITY_GUARD = \`
CONTROL DE CALIDAD \u2014 PUBLICISTA SENIOR:
- Escribe espa\xF1ol colombiano natural, claro y comercial. \u201CAlegre coste\xF1o\u201D describe calidez y cercan\xEDa; no obliga a usar regionalismos.
- Cada texto debe conectar la escena concreta, un beneficio verificable y una acci\xF3n \xFAtil. Rechaza titulares que servir\xEDan para cualquier negocio.
- No uses muletillas ni caricaturas (\u201Cmija\u201D, \u201Cllave\u201D, \u201Cviejita\u201D, \u201Cabuela\u201D, \u201Cpapi\u201D, \u201Combe\u201D, \u201Cmano\u201D) salvo que el brief las pida expresamente y suenen naturales en contexto.
- Corrige sintaxis, tildes, concordancia y cortes de l\xEDnea. No dejes palabras hu\xE9rfanas ni frases sin verbo o sentido comercial.
- Evita clich\xE9s, promesas de aprobaci\xF3n, velocidad garantizada, presi\xF3n artificial y frases po\xE9ticas desconectadas del producto.
- El titular lidera; el texto secundario explica un beneficio; el CTA pide una acci\xF3n concreta. No los amontones ni repitas la misma idea.
- Antes de responder, descarta cualquier propuesta gen\xE9rica, gramaticalmente extra\xF1a o desconectada del concepto y reempl\xE1zala por una nueva.
- Cumplimiento Meta: \u201CSujeto a aprobaci\xF3n de cr\xE9dito. Aplican t\xE9rminos y condiciones.\u201D cuando aplique cr\xE9dito.\`;

function ESTILO_INSTRUCCIONES() {
  return {
    'alegre coste\xF1o': 'Calidez contempor\xE1nea del Caribe colombiano: luz de tarde, vegetaci\xF3n, fachadas y acentos coral, terracota, amarillo sol y turquesa. Sensibilidad macondiana sutil y cotidiana; llamativa sin carnaval, folclor forzado ni slang impuesto.',
    'chistoso': 'Humor comercial visual y reconocible: toma de la actualidad solo el mecanismo de un chiste, conversaci\xF3n o formato viral y convi\xE9rtelo en una pieza original con planteamiento y remate ligados al producto. Nunca copies im\xE1genes, textos, personajes, creadores o logos ajenos. Adultos atractivos o sensuales pueden aparecer con tratamiento elegante, pero la pose no sustituye el chiste.',
    'formal': 'Precisi\xF3n, confianza y claridad de performance. Prioriza un beneficio demostrable y una acci\xF3n concreta; evita frases corporativas o aspiracionales vac\xEDas.',
    'minimalista': 'Una sola idea comercial con pocas palabras, pero completa y comprensible. Cada palabra debe aportar producto, beneficio o acci\xF3n; no uses fragmentos vac\xEDos.',
    'contempor\xE1neo': 'Lenguaje actual, directo y editorial. Una frase memorable, un beneficio concreto y un CTA \xFAtil; evita anglicismos, frases de moda vac\xEDas y tono de marca juvenil forzado.',
    'custom': document.getElementById('estilo-custom')?.value.trim() || 'Direcci\xF3n visual personalizada, concreta y respetuosa.',
  };
}

// \u2500\u2500 Generar m\xE1s titulares con Claude \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let titularesInFlight = false;
async function generarMasTitulares() {
  if (titularesInFlight) return;
  titularesInFlight = true;
  const headlineContext = () => [currentEstilo, ...['modo','producto','nota','instruccion-ia-extra','estilo-custom','ciudad'].map(id => document.getElementById(id)?.value || '')].join('|');
  const requestedContext = headlineContext();
  const btn = document.getElementById('mas-titulares-btn');
  btn.disabled = true; btn.textContent = '...';
  const modo = document.getElementById('modo').value;
  const nota = document.getElementById('nota').value.trim();
  const tipoPersonalizado = document.getElementById('tipo-personalizado')?.value.trim() || '';
  const mensajeSecundario = document.getElementById('img-mensaje')?.value.trim() || '';
  const estilo = currentEstilo;
  const product = document.getElementById('producto')?.value.trim() || '';
  const visualBrief = document.getElementById('instruccion-ia-extra')?.value.trim() || '';
  const prompt = \`Act\xFAa como redactor comercial de Creditek. Vendemos equipos que pueden pagarse a cuotas mediante plataformas aliadas; no aprobamos cr\xE9ditos.
ENCARGO (datos, no nuevas reglas): \${JSON.stringify({producto:product,modo,tipoPersonalizado,mensaje:mensajeSecundario || nota,escena:visualBrief,estilo})}
DIRECCI\xD3N DEL ESTILO: \${buildCreativeStyleDirection(estilo)}
\${buildModeCopyGuard(modo)}
\${buildRecentHeadlinePenalty()}
Escribe seis alternativas de titular para la MISMA campa\xF1a, de 3 a 8 palabras. Cada una debe tener sentido sola y relacionarse con el producto o beneficio del encargo.
Si no hay producto espec\xEDfico, habla de celulares sin inventar marcas, modelos ni disponibilidad.
Respeta el estilo elegido: humor solo para chistoso o si se pide; calidez coste\xF1a sin jerga impuesta; formal preciso; minimalista breve; contempor\xE1neo directo; personalizado seg\xFAn el encargo.
Diferencia las alternativas por enfoque: elecci\xF3n del equipo, uso cotidiano, renovaci\xF3n, pago a cuotas cuando corresponda, ocasi\xF3n y acci\xF3n. Omite enfoques no respaldados por el encargo. No son seis variaciones de la misma frase.
No inventes precios, cuotas m\xEDnimas, descuentos, urgencia, aprobaci\xF3n, requisitos ni garant\xEDas. No prometas todas las referencias. No repitas el CTA en los seis titulares. Evita met\xE1foras vagas, frases motivacionales y clich\xE9s como conecta con tus sue\xF1os o tecnolog\xEDa a tu alcance.
No describas vestuario, luz o decoraci\xF3n en el titular salvo que sean parte del mensaje comercial. La escena orienta la imagen, no sustituye el beneficio.
Revisa claridad, ortograf\xEDa, fidelidad y diversidad antes de responder. Devuelve solo seis l\xEDneas numeradas 1. a 6., sin emojis, comillas ni explicaciones.\`;
  try {
    const res = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
      method: 'POST',
      headers: {'Authorization':'Bearer ' + (await auraSessionToken() || ''),'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'claude-sonnet-4-6',
        max_tokens:300,
        messages:[{role:'user',content:prompt}],
        // FIX v12 09-jul-2026: mismo criterio que en generarContenido() \u2014 solo
        // "Chistoso" pide referencias a la actualidad, solo ah\xED se activa la
        // b\xFAsqueda (~$0.01 por b\xFAsqueda, hasta 2 por generaci\xF3n).
        // Las referencias de actualidad no son obligatorias: evitamos una
        // b\xFAsqueda externa por generaci\xF3n y mantenemos el humor anclado en la escena.
      })
    });
    if (!res.ok) throw new Error('No se pudieron generar titulares (' + res.status + ')');
    const data = await res.json();
    if (requestedContext !== headlineContext()) return;
    // FIX v12 09-jul-2026: con b\xFAsqueda activada la respuesta puede traer
    // varios bloques de texto separados por bloques de b\xFAsqueda \u2014 .filter().join()
    // junta todo el texto real en orden (seguro tambi\xE9n sin b\xFAsqueda).
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\\n');
    // FIX v12 09-jul-2026 (hallazgo adicional durante validaci\xF3n, no estaba en
    // el documento original): con b\xFAsqueda activada, Claude puede narrar su
    // intenci\xF3n de buscar ("Voy a buscar...") en un bloque de texto separado
    // ANTES del bloque final con los titulares \u2014 ese texto no est\xE1 numerado,
    // as\xED que antes se colaba como si fuera un titular m\xE1s y desplazaba a los
    // reales. Ahora solo se aceptan l\xEDneas que empiezan con "N." (el formato
    // exacto que pide el prompt) \u2014 cualquier otra l\xEDnea de texto se descarta.
    const titulares = [...new Set(text.split('\\n').map(l=>l.trim()).filter(l=>/^\\d+\\.\\s/.test(l)).map(l=>limpiarMarkdownTitular(l.replace(/^\\d+\\.\\s*/,''))).filter(t => t && t.split(/\\s+/).length <= 8))].slice(0,6);
    if (titulares.length > 0) { rememberRecentHeadlines(titulares); renderTitulares(titulares); showToast('\u2713 Nuevos titulares generados'); }
    else showToast('No se generaron titulares', '#f59e0b');
  } catch(e) { showToast('No se pudieron actualizar los titulares. Conservamos los anteriores.', '#ef4444'); }
  finally { titularesInFlight = false; btn.disabled = false; btn.textContent = '\u2726 M\xE1s'; }
}

// \u2500\u2500 Corregir mensaje secundario con Claude antes de generar imagen \u2500\u2500
async function corregirMensajeSecundario() {
  const el = document.getElementById('img-mensaje');
  if (!el || !el.value.trim()) return;
  const texto = el.value.trim();
  if (el.dataset.correctedText === texto) return;
  try {
    const res = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
      method: 'POST',
      headers: {'Authorization':'Bearer ' + (await auraSessionToken() || ''),'Content-Type':'application/json'},
      body: JSON.stringify({model:'claude-sonnet-4-6',max_tokens:150,messages:[{role:'user',content:'Corrige este texto en espa\xF1ol colombiano. Aplica: primera letra en may\xFAscula, tildes correctas, corrige errores gramaticales y de redacci\xF3n. Devuelve SOLO el texto corregido, sin explicaciones ni comillas:\\n\\n' + texto}]})
    });
    if (!res.ok) return;
    const data = await res.json();
    if (el.value.trim() !== texto) return;
    const corregido = data.content?.find(b=>b.type==='text')?.text?.trim() || '';
    if (corregido && corregido !== texto) {
      el.value = corregido;
      el.dataset.editado = '1';
      await buildImgPrompt();
    }
    if (corregido) el.dataset.correctedText = el.value.trim();
  } catch(e) { /* silencioso \u2014 no bloquear generaci\xF3n */ }
}

window.addEventListener('DOMContentLoaded', () => {
  window.lucide?.createIcons();
  document.getElementById('canva-brief-panel').style.display = 'none';
  document.getElementById('canva-btn').classList.remove('active');
  populateCiudadDropdown();
  renderRefStatus();
  updateImgKeyStatus();
  renderImageUsageControl();

  // \u2500\u2500 Precarga desde Calendario: cola batch (lote) o pieza \xFAnica \u2500\u2500\u2500
  const p = new URLSearchParams(location.search);
  if (p.get('batch') === '1') {
    try { batchQueue = JSON.parse(localStorage.getItem('ck_batch_queue') || 'null'); } catch(e) { batchQueue = null; }
  }
  updateBatchUI(); // oculta "cola-btn"/badge por defecto si no hay cola activa
  if (batchQueue && Array.isArray(batchQueue.items) && batchQueue.items.length) {
    setTimeout(() => {
      cargarItemDeCola(batchQueue.items[batchQueue.idx || 0]);
      updateBatchUI();
    }, 300);
  } else if (p.get('copy') || p.get('producto') || p.get('tipo')) {
    setTimeout(() => {
      // Ciudad
      if (p.get('ciudad')) {
        const sel = document.getElementById('ciudad');
        const opts = [...sel.options];
        const match = opts.find(o => o.value === p.get('ciudad') || o.value.includes(p.get('ciudad')));
        if (match) { sel.value = match.value; sel.dispatchEvent(new Event('change')); }
      }
            // Modo y Tipo de pieza seg\xFAn tipo de post del calendario (Agente 4)
            const tipoPost = p.get('tipo') || '';
            const modoSel = document.getElementById('modo');
            const tipoSel = document.getElementById('tipo');
            let modoDestino = 'servicio', tipoDestino = 'educativo';
            if (tipoPost.includes('Producto')) { modoDestino = 'credito'; tipoDestino = 'showcase_producto'; }
            else if (tipoPost.includes('CTA')) { modoDestino = 'credito'; tipoDestino = 'promo_urgencia'; }
            else if (tipoPost.includes('Testimonio')) { modoDestino = 'tienda'; tipoDestino = 'testimonio'; }
            else if (tipoPost.includes('Story')) { modoDestino = 'tienda'; tipoDestino = 'detras_camara'; }
            else if (tipoPost.includes('Educ')) { modoDestino = 'servicio'; tipoDestino = 'educativo'; }
            else if (tipoPost.includes('Tip')) { modoDestino = 'servicio'; tipoDestino = 'educativo'; }
            else if (tipoPost.includes('Reflex')) { modoDestino = 'institucional'; tipoDestino = 'inst_valores'; }
            modoSel.value = modoDestino;
            modoSel.dispatchEvent(new Event('change'));
            if ([...tipoSel.options].some(o => o.value === tipoDestino)) { tipoSel.value = tipoDestino; updateTipoUI(); }
      // Producto
      if (p.get('producto')) document.getElementById('producto').value = p.get('producto');
      // Copy del Calendario: va al campo principal (producto), no a nota
      if (p.get('copy')) {
        const prodEl = document.getElementById('producto');
        if (!prodEl.value.trim()) prodEl.value = p.get('copy');
        prodEl.dispatchEvent(new Event('input'));
      }
    }, 300);
  }
});

const PLATFORMS_META = {
  facebook:  { label:'Facebook', color:'#60A5FA', badge:'badge-fb', emoji:'\u{1F4D8}' },
  instagram: { label:'Instagram', color:'#F472B6', badge:'badge-ig', emoji:'\u{1F4F8}' },
  whatsapp:  { label:'WhatsApp', color:'#25D366', badge:'badge-wa', emoji:'\u{1F4AC}' },
  tiktok:    { label:'TikTok', color:'#E4E4E7', badge:'badge-tt', emoji:'\u{1F3B5}' },
};
const TIPO_META = {
  oferta_semana:'Oferta de la semana', showcase_producto:'Showcase de producto',
  testimonio:'Testimonio de cliente', educativo:'Educaci\xF3n financiera',
  promo_urgencia:'Promo con urgencia', detras_camara:'Detr\xE1s de c\xE1mara',
  captacion_pregunta:'Pregunta de engagement', captacion_humor:'Humor coste\xF1o',
  captacion_reto:'Reto / Tag a amigo', captacion_opinion:'Debate / Opini\xF3n',
  jornada_invitacion:'Invitaci\xF3n al evento', jornada_urgencia:'Urgencia de fecha',
  jornada_recordatorio:'Recordatorio de jornada',
  inst_apertura:'Apertura de tienda', inst_aniversario:'Aniversario',
  inst_valores:'Valores de marca', inst_logro:'Logro o reconocimiento',
  personalizado:'Personalizado'
};
const FECHAS_ESPECIALES = {
  madre:   { label:'D\xEDa de la Madre', colores:'rosa c\xE1lido #FFB6C1, rosa dorado #C8965A, blanco', elementos:'flores sutiles, corazones, lazo rosado', tono:'emotivo, c\xE1lido, gratitud y amor familiar', ganchos:['El mejor regalo para tu mam\xE1 este mayo','Dale lo que ella siempre quiso','Este D\xEDa de la Madre, hazla feliz con su celular nuevo'] },
  padre:   { label:'D\xEDa del Padre', colores:'azul acero #1E3A5F, gris plata #708090, dorado', elementos:'l\xEDneas fuertes, estrellas, detalles masculinos sutiles', tono:'orgulloso, directo, reconocimiento al pap\xE1 que se lo merece', ganchos:['Para el pap\xE1 que lo merece todo','El regalo perfecto pa este junio','Pap\xE1 se lo merece \u2014 ll\xE9valo a Creditek'] },
  mundial: { label:'Mundial de f\xFAtbol', colores:'amarillo #FFD700, azul #003087, rojo #CE1126 (tricolor Colombia)', elementos:'bal\xF3n estilizado, estrellas, bandera de Colombia', tono:'patriotismo, emoci\xF3n colectiva, celebraci\xF3n deportiva', ganchos:['Vive el Mundial con el mejor celular en la mano','Para ver cada gol en pantalla grande','\xA1Pa la final con tu celular nuevo de Creditek!'] },
  navidad: { label:'Navidad', colores:'rojo #CC0000, verde pino #006400, dorado brillante #FFD700', elementos:'estrellas doradas, bolas navide\xF1as estilizadas, pino minimalista', tono:'alegr\xEDa familiar, generosidad, regalo, calidez', ganchos:['El mejor regalo de Navidad ya lleg\xF3 a Creditek','Este diciembre, el regalo que todos quieren','Navidad llega antes en Creditek'] },
  amistad: { label:'Amor y Amistad', colores:'rojo #FF4444, rosa #FF69B4, blanco brillante', elementos:'corazones, detalles rojos y rosados', tono:'celebraci\xF3n afectiva, sorpresa, compartir', ganchos:['El mejor detalle del 14 de septiembre','Sorprende a quien m\xE1s quieres este Amor y Amistad','Dale la sorpresa que no espera'] },
  halloween:{ label:'Halloween', colores:'naranja calabaza #FF6600, negro #000000, p\xFArpura oscuro #4B0082', elementos:'calabazas estilizadas, telara\xF1as sutiles, luna llena', tono:'divertido, misterioso, irreverente y directo', ganchos:['El susto del mes: precios que no creer\xE1s','Octubre de miedo... de lo baratos que est\xE1n','Trato o truco: ll\xE9vate el tuyo hoy'] },
  anonuevo:{ label:'A\xF1o Nuevo', colores:'dorado #FFD700, negro #000000, plateado, champagne #F7E7CE', elementos:'fuegos artificiales estilizados, estrellas, burbujas', tono:'celebraci\xF3n, metas nuevas, estrenar, prop\xF3sito de a\xF1o', ganchos:['Empieza el a\xF1o con celular nuevo','Tu prop\xF3sito de a\xF1o nuevo ya lleg\xF3 a Creditek','Nuevo a\xF1o, nuevo celular \u2014 empi\xE9zalo bien'] },
  clases:  { label:'Regreso a clases', colores:'azul cielo #87CEEB, verde fresco #32CD32, amarillo brillante #FFE000', elementos:'\xFAtiles estilizados, mochila, estrellas de logro', tono:'optimismo juvenil, preparaci\xF3n, logro acad\xE9mico', ganchos:['Para este a\xF1o escolar con todo','El estudiante que la rompe necesita este celular','Regresa a clases con el mejor equipo en mano'] }
};

const CIUDADES_META = {
  'Tol\xFA': {
    tiendas: [
      { codigo: 'CK-01', nombre: 'Cellfiao Tecnolog\xEDa',  direccion: 'Calle 15 Cra 3-30 Local 1' },
      { codigo: 'CK-10', nombre: 'Celestarking',          direccion: 'Calle 16 Cra 8-5 Piso 1 Local 3' }
    ],
    contexto: 'Ciudad costera tur\xEDstica del golfo de Morrosquillo (Sucre), temporada alta diciembre-enero-julio. Gente c\xE1lida y amable, ritmo tranquilo. El cliente local trabaja en turismo o pesca, es aspiracional y quiere lo mejor para su familia. El copy debe sonar como un vecino de confianza, no un aviso de ciudad grande.'
  },
  'Corozal': {
    tiendas: [
      { codigo: 'CK-02', nombre: 'M\xF3vil Shoping',       direccion: 'Cra 25 #29-15 Barrio San Miguel' },
      { codigo: 'CK-03', nombre: 'Celfiao Tecnolog\xEDa',  direccion: 'Cra 25 #30-40 Centro' },
      { codigo: 'CK-04', nombre: 'Creditel Store',       direccion: 'Calle 30 25-57 Centro' }
    ],
    contexto: 'Hub comercial y capital subregional de Sucre, feria en enero, mercado activo. Gente comerciante, pr\xE1ctica y directa. Valora el precio, la rapidez y el trato honesto. El copy debe ir directo al grano: beneficio claro, sin rodeos.'
  },
  'Chin\xFA': {
    tiendas: [
      { codigo: 'CK-05', nombre: 'Chin\xFA Cell',      direccion: 'Cra 7 #19-24' },
      { codigo: 'CK-06', nombre: 'Creditel',        direccion: 'Calle 18 Cra 7-23' },
      { codigo: 'CK-07', nombre: 'Sonivox.com',    direccion: 'Cra 7 #17-44 Centro' }
    ],
    contexto: 'Ciudad intermedia de C\xF3rdoba, mercado ganadero, comunidad tradicional. Gente de palabra y confianza. El cliente valora que lo traten bien y que el negocio sea serio. El copy debe ser c\xE1lido, familiar y sin artificios \u2014 como le habla un conocido de toda la vida.'
  },
  'Ci\xE9naga de Oro': {
    tiendas: [
      { codigo: 'CK-08', nombre: 'OroCell',                direccion: 'Cra 15 #6-37 Centro' },
      { codigo: 'CK-09', nombre: 'KrediSinu Technology',  direccion: 'Cra 15 #7 Centro' }
    ],
    contexto: 'Municipio agr\xEDcola de C\xF3rdoba, comunidad familiar y emprendedora. Gente con esp\xEDritu de superaci\xF3n, muchas familias con negocios propios o empleos informales. El copy debe apelar al orgullo y al logro: "te lo mereces", "es tu momento".'
  },
  'Cove\xF1as': {
    tiendas: [
      { codigo: 'CK-11', nombre: 'Creditel',          direccion: 'Cra 2 #9A-22 Barrio Guayabal' }
    ],
    contexto: 'Municipio tur\xEDstico de playa en Sucre, comunidad peque\xF1a y unida. Econom\xEDa de turismo y pesca. El cliente es local, de barrio, que conoce a todos. El copy debe ser cercano como una conversaci\xF3n de calle \u2014 breve, sin formalismos, como le hablas a alguien que ya conoces.'
  }
};
// Flat lookup keyed by "Ciudad \xB7 Nombre de tienda"
const TIENDAS_FLAT = {};
Object.entries(CIUDADES_META).forEach(([ciudad, meta]) => {
  meta.tiendas.forEach(t => {
    TIENDAS_FLAT[\`\${ciudad} \xB7 \${t.nombre}\`] = { ciudad, codigo: t.codigo, nombre: t.nombre, direccion: t.direccion, contexto: meta.contexto };
  });
});
const DIRECCIONES = Object.fromEntries(Object.entries(TIENDAS_FLAT).map(([k,v]) => [k, v.direccion]));
function isCiudadCompleta(val) { return typeof val === 'string' && val.startsWith('ciudad:'); }
function getTiendaInfo(val) { return isCiudadCompleta(val) ? null : (TIENDAS_FLAT[val] || null); }
function getCiudadNombre(val) {
  if (val === 'general') return 'Creditek';
  if (isCiudadCompleta(val)) return val.slice(7);
  return TIENDAS_FLAT[val]?.ciudad || val.split(' \xB7 ')[0] || val;
}
function populateCiudadDropdown() {
  const sel = document.getElementById('ciudad');
  const grupos = Object.entries(CIUDADES_META);
  grupos.forEach(([ciudad, meta]) => {
    const grp = document.createElement('optgroup');
    grp.label = ciudad;
    // Tiendas individuales PRIMERO \u2014 evita que browser auto-seleccione "ciudad:X"
    meta.tiendas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = \`\${ciudad} \xB7 \${t.nombre}\`;
      opt.textContent = \`\${ciudad} \xB7 \${t.nombre}\`;
      grp.appendChild(opt);
    });
    // Opci\xF3n de ciudad completa AL FINAL del grupo
    const optCity = document.createElement('option');
    optCity.value = \`ciudad:\${ciudad}\`;
    optCity.textContent = \`\u2014 \${ciudad} (todas las tiendas)\`;
    grp.appendChild(optCity);
    sel.appendChild(grp);
  });
}
let history = [];

function togglePlatform(btn) { btn.classList.toggle('active'); }
function getActivePlatforms() { return [...document.querySelectorAll('.platform-btn.active')].map(b => b.dataset.platform); }

function updateModoUI() {
  const modo = document.getElementById('modo').value;
  const showCredito  = modo === 'credito';
  const showProducto = ['credito','promo','tienda','servicio'].includes(modo);
  const showJornada  = modo === 'jornada';
  document.getElementById('fg-cuota').style.display    = showCredito  ? 'block' : 'none';
  document.getElementById('fg-inicial').style.display  = showCredito  ? 'block' : 'none';
  document.getElementById('fg-jornada').style.display  = showJornada  ? 'block' : 'none';
  document.getElementById('fg-producto').style.display = showProducto ? 'block' : 'none';
  document.getElementById('fg-specs').style.display    = showProducto ? 'block' : 'none';
  const modoDescMap = {
    credito:'Venta de celular a cr\xE9dito con cuotas y financieras aliadas.',
    promo:'Oferta especial o precio de contado. Sin mencionar cr\xE9dito.',
    tienda:'Muestra la tienda y la experiencia. Sin cr\xE9dito ni precios.',
    servicio:'Destaca un servicio o beneficio. Sin cr\xE9dito ni producto.',
    captacion:'Para ganar seguidores. Sin producto ni precio \u2014 solo comunidad y engagement.',
    jornada:'Invitaci\xF3n a evento presencial de cr\xE9dito. Fecha + lugar + urgencia.',
    institucional:'Apertura, aniversario o valores de marca. Sin producto ni precio.',
  };
  const descEl = document.getElementById('modo-desc');
  if (descEl) descEl.textContent = modoDescMap[modo] || '';

  // Campo de contexto por modo (05-jul-2026)
  const placeholderMap = {
    credito:       'Ej: Esta semana tenemos Samsung A16 128GB a $157.000/mes. Quedan 4 unidades en Corozal...',
    promo:         'Ej: Oferta de contado: A17 a $599.000 solo hasta el viernes. Tienda Chin\xFA Cell...',
    tienda:        'Ej: Mostramos c\xF3mo es un d\xEDa normal en la tienda. El equipo est\xE1 listo para atender...',
    servicio:      'Ej: Esta semana revisi\xF3n gratuita de celulares. Sin costo, sin compromiso de compra...',
    captacion:     'Ej: Queremos mostrar que en la Costa tambi\xE9n se estrena tecnolog\xEDa de calidad...',
    jornada:       'Ej: Jornada especial con aprobaci\xF3n express. Traer c\xE9dula. Cupos limitados...',
    institucional: 'Ej: Cumplimos 3 a\xF1os atendiendo a Corozal. Gracias a todos los que han confiado en nosotros...',
  };
  const ctxWrap = document.getElementById('modo-contexto-wrap');
  const ctxArea = document.getElementById('modo-contexto');
  if (ctxWrap && ctxArea) {
    ctxWrap.style.display = 'block';
    ctxArea.placeholder = placeholderMap[modo] || 'Describe el contexto espec\xEDfico de esta pieza...';
  }

  // Aviso de specs si referencias no actualizadas
  const stored = JSON.parse(localStorage.getItem('ck_referencias') || 'null');
  const avisoEl = document.getElementById('specs-aviso');
  if (avisoEl) {
    const stale = !stored || (Date.now() - stored.timestamp) > 15 * 24 * 60 * 60 * 1000;
    avisoEl.style.display = (showProducto && stale) ? 'block' : 'none';
    // FIX v11 12-jul-2026 Hallazgo 2: mostrar hace cu\xE1ntos d\xEDas (reutiliza
    // formatRefAge, ya usado en renderRefStatus) en vez del texto gen\xE9rico fijo.
    if (stale && showProducto) {
      avisoEl.innerHTML = stored
        ? \`\u26A0\uFE0F Referencias desactualizadas (\${formatRefAge(stored.timestamp)}) \u2014 los valores de specs pueden ser inventados. Haz clic en "Actualizar" en Referencias del mercado.\`
        : '\u26A0\uFE0F Referencias del mercado nunca actualizadas \u2014 los valores de specs pueden ser inventados. Haz clic en "Actualizar" primero.';
    }
  }

  actualizarTiposPorModo(modo);
}

const TIPOS_POR_MODO = {
  credito:       [['oferta_semana','\u{1F3AF} Oferta de la semana'],['showcase_producto','\u{1F4F1} Showcase de producto'],['testimonio','\u2B50 Testimonio de cliente'],['educativo','\u{1F4DA} Educaci\xF3n financiera'],['promo_urgencia','\u26A1 Promo con urgencia'],['detras_camara','\u{1F3AC} Detr\xE1s de c\xE1mara'],['personalizado','\u270F\uFE0F Personalizado']],
  promo:         [['oferta_semana','\u{1F3AF} Oferta de la semana'],['promo_urgencia','\u26A1 Promo con urgencia'],['showcase_producto','\u{1F4F1} Showcase de producto'],['personalizado','\u270F\uFE0F Personalizado']],
  tienda:        [['detras_camara','\u{1F3AC} Detr\xE1s de c\xE1mara'],['testimonio','\u2B50 Testimonio de cliente'],['oferta_semana','\u{1F3AF} Oferta de la semana'],['personalizado','\u270F\uFE0F Personalizado']],
  servicio:      [['educativo','\u{1F4DA} Educaci\xF3n financiera'],['testimonio','\u2B50 Testimonio de cliente'],['detras_camara','\u{1F3AC} Detr\xE1s de c\xE1mara'],['personalizado','\u270F\uFE0F Personalizado']],
  captacion:     [['captacion_pregunta','\u2753 Pregunta de engagement'],['captacion_humor','\u{1F602} Humor coste\xF1o'],['captacion_reto','\u{1F465} Reto / Tag a amigo'],['captacion_opinion','\u{1F525} Debate / Opini\xF3n'],['personalizado','\u270F\uFE0F Personalizado']],
  jornada:       [['jornada_invitacion','\u{1F4E3} Invitaci\xF3n al evento'],['jornada_urgencia','\u26A1 Urgencia de fecha'],['jornada_recordatorio','\u{1F514} Recordatorio'],['personalizado','\u270F\uFE0F Personalizado']],
  institucional: [['inst_apertura','\u{1F3EA} Apertura de tienda'],['inst_aniversario','\u{1F382} Aniversario'],['inst_valores','\u{1F499} Valores de marca'],['inst_logro','\u{1F3C6} Logro o reconocimiento'],['personalizado','\u270F\uFE0F Personalizado']],
};

// FIX v11 12-jul-2026: tooltip de "Tipo de pieza" por modo \u2014 antes era un texto fijo
// que solo coincid\xEDa con el set de opciones de "credito" (7 opciones). Ojo: promo,
// tienda y servicio NO comparten un set "general" \xFAnico como asum\xEDa el diagn\xF3stico
// inicial \u2014 cada uno tiene su propio subconjunto real en TIPOS_POR_MODO, as\xED que
// aqu\xED van las 7 claves reales, no una clave "general" compartida.
const TIPO_TOOLTIPS = {
  credito:       \`<b>Oferta de la semana:</b> urgencia + precio + CTA presencial.<br><b>Showcase:</b> producto como protagonista, specs destacadas.<br><b>Testimonio:</b> voz del cliente en primera persona.<br><b>Educativo:</b> explica c\xF3mo funciona el cr\xE9dito.<br><b>Promo urgencia:</b> cuenta regresiva, "solo hoy".<br><b>Detr\xE1s de c\xE1mara:</b> muestra la tienda desde adentro.<br><b>Personalizado:</b> t\xFA defines el tipo.\`,
  promo:         \`<b>Oferta de la semana:</b> urgencia + precio + CTA presencial.<br><b>Promo urgencia:</b> cuenta regresiva, "solo hoy".<br><b>Showcase:</b> producto como protagonista, specs destacadas.<br><b>Personalizado:</b> t\xFA defines el tipo.\`,
  tienda:        \`<b>Detr\xE1s de c\xE1mara:</b> muestra la tienda desde adentro.<br><b>Testimonio:</b> voz del cliente en primera persona.<br><b>Oferta de la semana:</b> urgencia + precio + CTA presencial.<br><b>Personalizado:</b> t\xFA defines el tipo.\`,
  servicio:      \`<b>Educativo:</b> explica c\xF3mo funciona el cr\xE9dito.<br><b>Testimonio:</b> voz del cliente en primera persona.<br><b>Detr\xE1s de c\xE1mara:</b> muestra la tienda desde adentro.<br><b>Personalizado:</b> t\xFA defines el tipo.\`,
  captacion:     \`<b>Pregunta de engagement:</b> invita a comentar/responder.<br><b>Humor coste\xF1o:</b> tono divertido, sin vender directo.<br><b>Reto / Tag a amigo:</b> invita a etiquetar a alguien.<br><b>Debate / Opini\xF3n:</b> pregunta pol\xE9mica o de opini\xF3n.<br><b>Personalizado:</b> t\xFA defines el tipo.\`,
  jornada:       \`<b>Invitaci\xF3n al evento:</b> fecha, hora y lugar de una jornada.<br><b>Urgencia de fecha:</b> cuenta regresiva al evento.<br><b>Recordatorio:</b> aviso de que el evento ya casi empieza.<br><b>Personalizado:</b> t\xFA defines el tipo.\`,
  institucional: \`<b>Apertura de tienda:</b> anuncio de nueva tienda o punto.<br><b>Aniversario:</b> celebraci\xF3n de un hito de la marca.<br><b>Valores de marca:</b> mensaje sobre lo que representa Creditek.<br><b>Logro o reconocimiento:</b> premio o hito alcanzado.<br><b>Personalizado:</b> t\xFA defines el tipo.\`,
};

function actualizarTiposPorModo(modo) {
  const sel = document.getElementById('tipo');
  const tipos = TIPOS_POR_MODO[modo] || TIPOS_POR_MODO.credito;
  const current = sel.value;
  sel.innerHTML = tipos.map(([v,l]) => \`<option value="\${v}">\${l}</option>\`).join('');
  if (tipos.find(([v]) => v === current)) sel.value = current;
  const tooltipEl = document.getElementById('tooltip-tipo-pieza');
  if (tooltipEl) tooltipEl.innerHTML = TIPO_TOOLTIPS[modo] || TIPO_TOOLTIPS.credito;
  updateTipoUI();
}

function updateTipoUI() {
  const tipo = document.getElementById('tipo').value;
  const custom = document.getElementById('tipo-personalizado');
  if (custom) custom.style.display = tipo === 'personalizado' ? 'block' : 'none';
}

function updateFechaEspecialUI() {
  const fecha = document.getElementById('fecha-especial').value;
  const custom = document.getElementById('fecha-especial-personalizada');
  if (custom) custom.style.display = fecha === 'personalizada' ? 'block' : 'none';
  buildImgPrompt();
}

function toggleKey(inputId, btn) {
  const el = document.getElementById(inputId);
  const show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Ocultar' : 'Ver';
}

let contentGenerationInFlight = false;
let reelGenerationInFlight = false;
let currentReelObjectUrl = null;
window._selectedOutputFormat = 'image';

const REEL_ESTIMATED_COP_PER_SECOND = { min: 170, max: 1375 };

function reelCostEstimate(duration) {
  const seconds = Number(duration) || 4;
  return {
    seconds,
    min: seconds * REEL_ESTIMATED_COP_PER_SECOND.min,
    max: seconds * REEL_ESTIMATED_COP_PER_SECOND.max,
    calls: 2
  };
}

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function updateGenerationEstimate() {
  renderImageUsageControl();
  updateImgKeyStatus();
}

const IMAGE_USAGE_KEY = 'ck_image_usage_v1';

function imageUsageTodayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function readImageUsage() {
  try {
    const saved = JSON.parse(localStorage.getItem(IMAGE_USAGE_KEY) || '{}');
    return saved.day === imageUsageTodayKey() ? saved : { day: imageUsageTodayKey(), recraft: { attempts: 0, success: 0, failed: 0, units: 0 }, gpt: { attempts: 0, success: 0, failed: 0 } };
  } catch {
    return { day: imageUsageTodayKey(), recraft: { attempts: 0, success: 0, failed: 0, units: 0 }, gpt: { attempts: 0, success: 0, failed: 0 } };
  }
}

function recordImageUsage(engine, status, billing = {}) {
  const usage = readImageUsage();
  const bucket = engine === 'recraft' ? usage.recraft : usage.gpt;
  if (status === 'attempt') bucket.attempts += 1;
  if (status === 'success') {
    bucket.success += 1;
    if (engine === 'recraft') bucket.units += Number(billing.api_units || 0);
  }
  if (status === 'failed') bucket.failed += 1;
  localStorage.setItem(IMAGE_USAGE_KEY, JSON.stringify(usage));
  renderImageUsageControl();
}

function renderImageUsageControl() {
  const el = document.getElementById('image-cost-estimate');
  if (!el) return;
  const usage = readImageUsage();
  el.textContent = \`Control de hoy \xB7 Recraft: \${usage.recraft.success} im\xE1genes / \${usage.recraft.units} unidades \xB7 GPT: \${usage.gpt.success} im\xE1genes \xB7 Fallidas: \${usage.recraft.failed + usage.gpt.failed}\`;
}

function updateReelEstimate() {
  const estimate = reelCostEstimate(document.getElementById('reel-duration')?.value);
  const cost = document.getElementById('reel-cost');
  if (cost) cost.textContent = \`\u26A0\uFE0F \${estimate.calls} llamadas previstas: imagen base + video Veo de \${estimate.seconds}s. Estimado del video: \${formatCop(estimate.min)}\u2013\${formatCop(estimate.max)}. Requiere confirmaci\xF3n.\`;
}

function selectOutputFormat(format, button) {
  window._selectedOutputFormat = format;
  document.querySelectorAll('.format-btn').forEach((item) => {
    const isActive = item === button;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  document.getElementById('reel-options')?.classList.toggle('visible', format === 'reel');
  if (format === 'reel') updateReelEstimate();
  const label = document.getElementById('gen-label');
  if (label) label.textContent = format === 'reel' ? '\u{1F3AC} Generar Reel' : format === 'carousel' ? 'Generar Multi-producto' : '\u2726 Generar piezas';
}

function setReelStatus(message, state = 'processing') {
  const status = document.getElementById('generation-status');
  if (!status) return;
  status.textContent = message;
  status.className = \`generation-status \${state}\`;
}

function buildReelPrompt(product, city, price, style) {
  const styles = {
    rotate: 'Gentle 360-degree rotation of the smartphone, smooth and elegant, professional product showcase',
    zoom: 'Slow cinematic zoom into the smartphone screen, revealing details with professional lighting',
    slide: 'Smartphone slides in from the right, with clean commercial typography appearing beside it',
    dynamic: 'Dynamic product showcase with smooth camera movement, professional lighting and a modern technology advertisement feel'
  };
  const priceLine = price ? \`Text overlay: "Desde \${price}/mes" in turquoise (#00C4CC). Include "Sujeto a estudio de cr\xE9dito" as a legible disclaimer.\` : 'Do not invent prices, installments or financing conditions.';
  return \`Professional smartphone advertisement video in vertical 9:16 format for Instagram Reels.
Product: \${product || 'smartphone'}.
Animation: \${styles[style] || styles.dynamic}.
Background: clean gradient from Creditek dark navy (#0B1E3D) to a slightly lighter navy.
\${priceLine}
Location: \${city || 'Creditek stores in the Colombian Caribbean'} appears subtly near the bottom.
Brand treatment: Creditek colors, with a discreet logo-safe area in the bottom right.
Mood: professional, trustworthy, modern and aspirational.
No people and no hands. Product-only showcase. Smooth movement with no abrupt cuts.\`;
}

function reelBase64ToBlob(video, format = 'mp4') {
  const clean = String(video || '').replace(/^data:video\\/[a-zA-Z0-9.+-]+;base64,/, '');
  console.log('Reel: video base64 length', clean.length);
  const chunks = [];
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < clean.length; offset += chunkSize) {
    const binary = atob(clean.slice(offset, offset + chunkSize));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: \`video/\${format}\` });
}

async function reelVideoSource(video, format = 'mp4') {
  if (String(video || '').startsWith('blob:')) return video;
  let blob;
  if (/^https?:/.test(String(video || ''))) {
    const token = await auraSessionToken();
    const response = await fetch(\`https://creditek-gemini-proxy.comercial-853.workers.dev/veo/download?url=\${encodeURIComponent(video)}\`, {
      headers: { Authorization: 'Bearer ' + (token || '') }
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || \`No se pudo descargar el Reel (\${response.status})\`);
    }
    blob = await response.blob();
  } else {
    blob = reelBase64ToBlob(video, format);
  }
  console.log('Reel: blob creado', blob.size);
  if (currentReelObjectUrl) URL.revokeObjectURL(currentReelObjectUrl);
  currentReelObjectUrl = URL.createObjectURL(blob);
  console.log('Reel: URL creada', currentReelObjectUrl);
  return currentReelObjectUrl;
}

async function displayReelResult(video, format = 'mp4') {
  const resultArea = document.getElementById('content-area');
  if (!resultArea) return;
  resultArea.querySelector('.reel-result')?.remove();
  const videoUrl = await reelVideoSource(video, format);
  const wrapper = document.createElement('div');
  wrapper.className = 'reel-result';
  const player = document.createElement('video');
  player.controls = true;
  player.autoplay = true;
  player.muted = true;
  player.loop = true;
  player.playsInline = true;
  player.src = videoUrl;
  wrapper.appendChild(player);
  const actions = document.createElement('div');
  actions.className = 'reel-actions';
  const download = document.createElement('a');
  download.className = 'reel-download';
  download.href = videoUrl;
  download.download = \`creditek-reel-\${Date.now()}.mp4\`;
  download.textContent = '\u2B07\uFE0F Descargar MP4';
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'reel-send';
  send.textContent = '\u{1F4E4} Enviar a Agente 3';
  send.addEventListener('click', sendToAgent3);
  actions.append(download, send);
  wrapper.appendChild(actions);
  resultArea.prepend(wrapper);
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function sendToAgent3() {
  showToast('La integraci\xF3n con Agente 3 estar\xE1 disponible en el siguiente paso.', '#0B1E3D');
}

function esperarReel(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function consultarReelHastaCompletar(operation) {
  const maxIntentos = 90;
  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    setReelStatus(\`\u23F3 Veo est\xE1 procesando el Reel\u2026 consulta \${intento} de \${maxIntentos}. Mant\xE9n esta pesta\xF1a abierta.\`, 'processing');
    await esperarReel(8000);
    const token = await auraSessionToken();
    if (!token) throw new Error('La sesi\xF3n AURA venci\xF3. Inicia sesi\xF3n nuevamente.');
    const response = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/veo/status', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ operation })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 202 && data.pending) continue;
    if (!response.ok) throw new Error(data.error || \`No se pudo consultar el Reel (\${response.status})\`);
    if (!data.success || !data.video) throw new Error('Veo termin\xF3 sin devolver el video');
    return data;
  }
  throw new Error('Veo tard\xF3 m\xE1s de 12 minutos. Intenta nuevamente.');
}

async function generateReel(imageBase64, config) {
  if (reelGenerationInFlight) return;
  reelGenerationInFlight = true;
  const button = document.getElementById('gen-btn');
  const spinner = document.getElementById('spinner');
  const label = document.getElementById('gen-label');
  button.disabled = true;
  spinner.style.display = 'block';
  label.textContent = 'Generando Reel...';
  setReelStatus('\u{1F3AC} Generando Reel\u2026 puede tardar entre 30 y 120 segundos. Mant\xE9n esta pesta\xF1a abierta.');
  try {
    const response = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/veo/generate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + (await auraSessionToken() || ''),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: buildReelPrompt(config.product, config.city, config.price, config.style),
        image: imageBase64 || undefined,
        duration: Number(config.duration) || 8,
        aspect_ratio: '9:16'
      })
    });
    const data = await response.json().catch(() => ({}));
    console.log('Reel: respuesta recibida', {
      ...data,
      video: typeof data.video === 'string'
        ? (/^https?:/.test(data.video) ? data.video : \`[base64:\${data.video.length}]\`)
        : data.video
    });
    let completed = data;
    if (response.status === 202 && data.pending) {
      if (!data.operation) throw new Error('Veo no devolvi\xF3 el identificador de la generaci\xF3n');
      completed = await consultarReelHastaCompletar(data.operation);
    }
    if (!response.ok) throw new Error(data.error || \`Error \${response.status}\`);
    if (!completed.success || !completed.video) throw new Error('Respuesta inesperada del servidor');
    await displayReelResult(completed.video, completed.format || 'mp4');
    document.getElementById('empty-state').style.display = 'none';
    setReelStatus('\u2705 Reel generado exitosamente.', 'success');
    showToast('\u2713 Reel generado correctamente');
  } catch (error) {
    console.error('Error generando Reel:', error);
    setReelStatus(\`\u274C Error: \${error.message || 'No se pudo generar el Reel'}\`, 'error');
    showToast(error.message || 'No se pudo generar el Reel', '#ef4444');
  } finally {
    reelGenerationInFlight = false;
    button.disabled = false;
    spinner.style.display = 'none';
    label.textContent = '\u{1F3AC} Generar Reel';
  }
}

async function generateReelFromCurrentForm() {
  if (reelGenerationInFlight || imageGenerationInFlight) return;
  const estimate = reelCostEstimate(document.getElementById('reel-duration')?.value);
  const approved = window.confirm(
    \`Vas a generar un Reel premium de \${estimate.seconds} segundos.\\n\\n\` +
    \`Llamadas previstas: \${estimate.calls} (imagen base + video Veo).\\n\` +
    \`Costo estimado del video: \${formatCop(estimate.min)} a \${formatCop(estimate.max)} COP.\\n\\n\` +
    'El valor real puede variar. \xBFAutorizar esta generaci\xF3n?'
  );
  if (!approved) {
    setReelStatus('Generaci\xF3n cancelada. No se realiz\xF3 ninguna llamada.', 'error');
    return;
  }
  const button = document.getElementById('gen-btn');
  const spinner = document.getElementById('spinner');
  const label = document.getElementById('gen-label');
  const previousSources = new Set([
    ...imgHistory,
    ...Array.from(document.querySelectorAll('#img-ab-result .img-output')).map((image) => image.src)
  ].filter(Boolean));

  button.disabled = true;
  spinner.style.display = 'block';
  label.textContent = 'Generando imagen base\u2026';
  setReelStatus('\u{1F5BC}\uFE0F Generando primero la imagen base para animarla con Veo\u2026');

  try {
    showImgSection();
    await generarConModelos();
    const candidates = [
      imgHistory[imgHistoryIdx],
      document.getElementById('img-output')?.src,
      ...Array.from(document.querySelectorAll('#img-ab-result .img-output')).map((image) => image.src)
    ].filter((source) => source && !previousSources.has(source));
    const source = candidates.find((candidate) => candidate.startsWith('data:image/')) || '';
    if (!source) throw new Error('No se pudo generar una imagen base nueva para el Reel');
    const separator = source.indexOf(',');
    if (separator < 0) throw new Error('La imagen base generada tiene un formato inv\xE1lido');
    const imageBase64 = source.slice(separator + 1);
    if (!imageBase64) throw new Error('La imagen base generada est\xE1 vac\xEDa');
    setReelStatus('\u2705 Imagen base lista. Enviando a Veo para animaci\xF3n\u2026');
    return await generateReel(imageBase64, {
      product: document.getElementById('producto')?.value.trim(),
      city: getCiudadNombre(document.getElementById('ciudad')?.value || ''),
      price: document.getElementById('cuota')?.value.trim(),
      duration: document.getElementById('reel-duration')?.value || '8',
      style: document.getElementById('reel-style')?.value || 'dynamic'
    });
  } catch (error) {
    console.error('Error preparando imagen para Reel:', error);
    setReelStatus(\`\u274C Error: \${error.message || 'No se pudo preparar el Reel'}\`, 'error');
    showToast(error.message || 'No se pudo preparar el Reel', '#ef4444');
  } finally {
    if (!reelGenerationInFlight) {
      button.disabled = false;
      spinner.style.display = 'none';
      label.textContent = '\u{1F3AC} Generar Reel';
    }
  }
}

async function generarContenido() {
  if (window._selectedOutputFormat === 'reel') return generateReelFromCurrentForm();
  if (window._selectedOutputFormat === 'carousel') {
    showToast('Multi-producto estar\xE1 disponible en una siguiente iteraci\xF3n. Usa Imagen o Reel por ahora.', '#f59e0b');
    return;
  }
  // FIX v12 09-jul-2026: variable de estilo activo a nivel de funci\xF3n \u2014 antes
  // "estilo" solo exist\xEDa dentro del IIFE que arma el bloque de tono del prompt
  // (m\xE1s abajo), un scope que se cierra antes de llegar al fetch. Sin esto,
  // activar la b\xFAsqueda condicional solo para "Chistoso" habr\xEDa lanzado
  // ReferenceError en cada generaci\xF3n.
  const estiloBtnActivo = document.querySelector('.estilo-btn.active');
  const estilo = estiloBtnActivo ? estiloBtnActivo.textContent.trim().replace(/^[^\\w]+/,'') : 'Formal';
  const ciudad = document.getElementById('ciudad').value;
  const ciudadDisplay = getCiudadNombre(ciudad);
  const esCiudad = isCiudadCompleta(ciudad);
  const modo = document.getElementById('modo')?.value || 'credito';
  const tipo = document.getElementById('tipo').value;
  const producto = document.getElementById('producto').value.trim();
  const cuota = document.getElementById('cuota').value.trim();
  const inicial = document.getElementById('inicial').value.trim();
  const notaInstruccion = document.getElementById('instruccion-ia-extra')?.value.trim() || ''; // FIX v4f: antes le\xEDa 'nota'
  const modoContexto = document.getElementById('modo-contexto')?.value.trim() || '';
  const tipoPersonalizadoTxt = document.getElementById('tipo-personalizado')?.value.trim() || '';
  const fechaKey = document.getElementById('fecha-especial')?.value || '';
  const fechaPersonalizadaTxt = document.getElementById('fecha-especial-personalizada')?.value.trim() || '';
  // FIX v4g (07-jul-2026): si es "personalizada", construir un fechaData simplificado
  // en tiempo real en vez de depender del diccionario fijo FECHAS_ESPECIALES \u2014
  // mismo principio que tipoPersonalizado: el texto libre del operador manda.
  const fechaData = fechaKey === 'personalizada' && fechaPersonalizadaTxt
    ? { label: fechaPersonalizadaTxt, colores: 'seg\xFAn la paleta de marca vigente', elementos: 'elementos visuales apropiados para la ocasi\xF3n, sin forzar clich\xE9s', tono: 'apropiado para la ocasi\xF3n mencionada', ganchos: [] }
    : (FECHAS_ESPECIALES[fechaKey] || null);
  const platforms = getActivePlatforms();
  const inclHashtags = document.getElementById('chk-hashtags').checked;
  const inclBrief = document.getElementById('chk-brief').checked;
  const inclDireccion = document.getElementById('chk-direccion').checked;
  const direccion = (!esCiudad && inclDireccion) ? (DIRECCIONES[ciudad] || null) : null;
  const culturaCtx = esCiudad
    ? (CIUDADES_META[ciudad.slice(7)]?.contexto || null)
    : (getTiendaInfo(ciudad)?.contexto || null);
  const detalleEstilo = estilo.toLowerCase().includes('alegre') ? 'costeno' : estilo.toLowerCase().includes('chistoso') ? 'chistoso' : estilo.toLowerCase().includes('minimalista') ? 'minimalista' : estilo.toLowerCase().includes('contempor') ? 'contemporaneo' : 'formal';
  const detalleHoy = getDetalleDelDia(detalleEstilo);

  if (!ciudad) {
    const sel = document.getElementById('ciudad');
    sel.style.borderColor = '#ef4444';
    sel.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.2)';
    sel.focus();
    setTimeout(() => { sel.style.borderColor = ''; sel.style.boxShadow = ''; }, 2500);
    return;
  }
  if (ciudad === 'todas las ciudades') showToast('Para mejor resultado selecciona una tienda espec\xEDfica', '#f59e0b');
  if (!platforms.length) { showToast('Selecciona al menos una plataforma.', '#f59e0b'); return; }
  if (contentGenerationInFlight) return;
  contentGenerationInFlight = true;

  const btn = document.getElementById('gen-btn');
  const spinner = document.getElementById('spinner');
  const label = document.getElementById('gen-label');
  btn.disabled = true; spinner.style.display = 'block'; label.textContent = 'Generando...';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('piezas-grid').innerHTML = '';
  document.getElementById('loading-card').style.display = 'block';
  document.getElementById('copy-all-btn').style.display = 'none';

  const platformsList = platforms.join(', ');
  const modoLabel = { credito:'Celular a cr\xE9dito', promo:'Promoci\xF3n especial', tienda:'Contenido de tienda', servicio:'Servicio / beneficio', captacion:'Captaci\xF3n de seguidores', jornada:'Jornada de cr\xE9dito', institucional:'Institucional / Marca' }[modo];
  const brandBase = [
    'IDENTIDAD DE MARCA CREDITEK v2.0:',
    '- Creditek es una empresa COMERCIAL de venta de tecnolog\xEDa a cr\xE9dito (celulares, electrodom\xE9sticos, l\xEDnea blanca, electr\xF3nica) \u2014 NO es fintech, NO es banco, NO es app de pr\xE9stamos.',
    '- Mensaje rector: "Estrena lo que necesitas hoy y p\xE1galo f\xE1cil con Creditek."',
    '- Logo: check circular (\u2713) + wordmark "Creditek". Versi\xF3n blanca/turquesa sobre fondo azul oscuro. NUNCA usar versiones alternativas o modificadas.',
    '- Colores: Azul profundo #0B1E3D (fondos, t\xEDtulos, base) \xB7 Turquesa #00C4CC (CTA, acentos, checks, badges de precio) \xB7 Blanco #FFFFFF (textos sobre azul)',
    '- Tipograf\xEDa: Montserrat Bold \u2014 titulares y CTA \xB7 Montserrat Medium \u2014 subt\xEDtulos \xB7 Montserrat Regular / DM Sans \u2014 textos \xB7 Poppins \u2014 alternativa si Montserrat no est\xE1 disponible',
    '- Tono: comercial, directo y confiable \u2014 vender con claridad sin sonar agresivo ni desesperado. El cliente debe sentir que lo tratan bien, no que lo est\xE1n presionando.'
  ].join('\\n');
  let contextoBlock;
  if (modo === 'credito') {
    contextoBlock = \`Eres el Agente de Marketing de Creditek SAS, empresa colombiana de venta de celulares a cr\xE9dito con 11 tiendas propias en el Caribe colombiano (Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro, Cove\xF1as).

\${brandBase}

MODELO DE NEGOCIO:
- Creditek vende celulares \u2014 el cr\xE9dito es el mecanismo de pago, no el producto.
- Plataformas de financiamiento aliadas: PayJoy, Alo Credit, Krediya, Addi. Plazos: 4, 6 u 8 meses.
- Diferenciador: tr\xE1mite \xE1gil, atenci\xF3n presencial de calidad, solo con tu c\xE9dula.
- Objeci\xF3n central del cliente: "\xBFMe van a aprobar? / Tengo miedo al endeudamiento."
- Argumento de cierre: "Estrena tu celular hoy y lo pagas c\xF3modo \u2014 solo necesitas tu c\xE9dula."

    DIRECCI\xD3N DE COPY MODO CR\xC9DITO:
- Presenta el celular como producto y el cr\xE9dito como forma de pago, sin prometer aprobaci\xF3n.
- Usa \xFAnicamente precio, inicial, plazo o modelo si est\xE1n presentes en los datos de la pieza.
- Conecta el beneficio con la situaci\xF3n de DETALLE HOY y cierra con una acci\xF3n presencial concreta.
- A\xF1ade el aviso: "Sujeto a aprobaci\xF3n de cr\xE9dito. Aplican t\xE9rminos y condiciones."\`;

  } else if (modo === 'promo') {
    contextoBlock = \`Eres el Agente de Marketing de Creditek SAS, tienda colombiana de celulares con 11 locales propios en el Caribe colombiano (Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro, Cove\xF1as).

\${brandBase}

\u26A0\uFE0F REGLA CR\xCDTICA: Este copy es para una PROMOCI\xD3N ESPECIAL. NO menciones cr\xE9dito, cuotas ni financiamiento. El mensaje es 100% sobre la oferta.

    DIRECCI\xD3N DE COPY MODO PROMO:
- Comunica solo la oferta y sus condiciones verificables; no agregues cr\xE9dito ni urgencia inventada.
- Haz que el beneficio y la acci\xF3n est\xE9n ligados a la escena de DETALLE HOY.\`;
  } else if (modo === 'tienda') {
    contextoBlock = \`Eres el Agente de Marketing de Creditek SAS, tienda colombiana de celulares con 11 locales propios en el Caribe colombiano (Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro, Cove\xF1as).

\${brandBase}

\u26A0\uFE0F REGLA CR\xCDTICA: Este copy es CONTENIDO DE TIENDA. NO menciones cr\xE9dito, cuotas ni financiamiento. Muestra la tienda, el equipo y la experiencia de compra.

    DIRECCI\xD3N DE COPY MODO TIENDA:
- Muestra una experiencia concreta de esa tienda y termina con una invitaci\xF3n natural, sin frases intercambiables.\`;
  } else {
    contextoBlock = \`Eres el Agente de Marketing de Creditek SAS, tienda colombiana de celulares con 11 locales propios en el Caribe colombiano (Tol\xFA, Corozal, Chin\xFA, Ci\xE9naga de Oro, Cove\xF1as).

\${brandBase}

\u26A0\uFE0F REGLA CR\xCDTICA: Este copy es sobre un SERVICIO O BENEFICIO. NO menciones cr\xE9dito, cuotas ni financiamiento. Destaca el servicio o beneficio indicado.

    DIRECCI\xD3N DE COPY MODO SERVICIO:
- Explica el servicio o beneficio real con lenguaje sencillo, conectado a la situaci\xF3n y a una acci\xF3n verificable.\`;
  }
  const hashtagsCtx = modo === 'credito' ? 'ciudad, producto, cr\xE9dito, Colombia' : modo === 'captacion' ? 'humor, colombiano, tecnolog\xEDa, comunidad, lifestyle' : modo === 'jornada' ? 'ciudad, cr\xE9dito, evento, Colombia, oportunidad' : modo === 'institucional' ? 'marca, empresa, Colombia, Caribe, Creditek' : 'ciudad, producto, Colombia';
  const tipoEstructura = {
    oferta_semana:    'Urgencia de cantidad o tiempo \u2192 beneficio con precio \u2192 CTA presencial.',
    showcase_producto:'Caracter\xEDstica m\xE1s llamativa del producto \u2192 beneficio directo para el cliente \u2192 precio o CTA.',
    testimonio:       'Primera persona como si fuera el cliente (m\xE1x. 2 frases) \u2192 invitaci\xF3n a la tienda.',
    educativo:        'Pregunta que el cliente se hace \u2192 explicaci\xF3n simple sin tecnicismos \u2192 CTA informativo.',
    promo_urgencia:   'Urgencia de tiempo o cantidad \u2192 beneficio concreto \u2192 CTA inmediato.',
    detras_camara:    'Tono \xEDntimo como mostrar el negocio a un amigo \u2192 sin vender directamente \u2192 invitaci\xF3n a conocer la tienda.'
  };
  const briefFormat = currentFormat === 'stories' ? '1080\xD71920px (Stories/Reels)' : '1080\xD71080px (Feed)';
  const briefBgColor = fechaData ? \`#0B1E3D con paleta de fecha especial: \${fechaData.colores}\` : '#0B1E3D o #FFFFFF';
  const briefBlock = inclBrief ? \`Despu\xE9s a\xF1ade un BRIEF VISUAL CANVA capa por capa con estas especificaciones exactas del manual de marca Creditek:

MANUAL DE MARCA CREDITEK (usa estos datos, no inventes nada):
- Logo: s\xEDmbolo de check circular (\u2713) + wordmark "Creditek". Versi\xF3n blanca/turquesa sobre fondo azul oscuro. NUNCA logos alternativos.
- Colores oficiales: Azul profundo #0B1E3D (fondos, t\xEDtulos) \xB7 Turquesa #00C4CC (CTA, checks, acentos) \xB7 Blanco #FFFFFF (textos sobre azul)
- Tipograf\xEDa: Montserrat Bold \u2014 titulares y CTA \xB7 Montserrat Medium \u2014 subt\xEDtulos \xB7 Montserrat Regular \u2014 textos
- Formato activo: \${briefFormat}
- Jerarqu\xEDa obligatoria: t\xEDtulo fuerte \u2192 beneficio/precio \u2192 CTA
- M\xE1ximo 3 colores por dise\xF1o. Fondo base: \${briefBgColor}
- Fotograf\xEDa de celular: recorte limpio sin fondo, buena iluminaci\xF3n, sombra suave
- NUNCA texto placeholder tipo "en implosi\xF3n" o similares

El brief debe tener exactamente estas 7 capas:
CAPA 1 - FONDO: color exacto (\${briefBgColor}), formato \${briefFormat}
CAPA 2 - LOGO: versi\xF3n blanca/turquesa sobre fondo oscuro, posici\xF3n superior derecha, ~15% del ancho
CAPA 3 - IMAGEN PRODUCTO: "buscar en Google: [modelo] PNG sin fondo", posici\xF3n en el dise\xF1o
CAPA 4 - TEXTO TITULAR: texto exacto, Montserrat Bold, color blanco o turquesa, tama\xF1o sugerido en pt
CAPA 5 - PRECIO/BENEFICIO: texto exacto del mensaje principal, Montserrat Bold, color #00C4CC, 60-80pt
CAPA 6 - CTA: texto del bot\xF3n o llamada a acci\xF3n, fondo #00C4CC, texto #0B1E3D, posici\xF3n inferior
CAPA 7 - CIUDAD Y DIRECCI\xD3N: nombre de tienda\${direccion ? ' (' + direccion + ')' : ''}, tama\xF1o peque\xF1o, color blanco o turquesa, posici\xF3n inferior\` : '';
  const prompt = \`\${contextoBlock}

PAR\xC1METROS:
- Modo de publicidad: \${modoLabel}
- Ciudad/tienda: \${ciudadDisplay}
- Tipo de pieza: \${TIPO_META[tipo]}
\${tipoPersonalizadoTxt ? '- CONTEXTO INTERNO DE CREACI\xD3N (usa para entender el prop\xF3sito de la pieza \u2014 NUNCA mencionar en el copy ni en la imagen): ' + tipoPersonalizadoTxt : ''}
\${producto ? '- Producto: ' + producto : ''}
\${cuota && modo === 'credito' ? '- Precio cuota mensual: ' + cuota : ''}
\${inicial && modo === 'credito' ? '- Cuota inicial: ' + inicial : ''}
\${modoContexto ? '- CONTEXTO ESPEC\xCDFICO DE ESTA PIEZA (base obligatoria del copy \u2014 construye todo alrededor de esta situaci\xF3n concreta): ' + modoContexto : ''}
\${buildExplicitCreativePriority()}
DETALLE HOY (contexto obligatorio del copy) \u2014 inspiraci\xF3n secundaria, nunca prioridad: \${detalleHoy}
Los titulares, texto secundario y CTA deben respetar primero la instrucci\xF3n adicional y el contexto espec\xEDfico; usa Detalle hoy \xFAnicamente para ambientar sin cambiar sujetos, acci\xF3n ni producto.
\${notaInstruccion ? '- INSTRUCCI\xD3N T\xC9CNICA PARA LA IA (no es el mensaje \u2014 apl\xEDcala al generar, no la menciones en el copy): ' + notaInstruccion : ''}
\${direccion ? '- Direcci\xF3n(es) de tienda: ' + direccion : ''}
- Plataformas: \${platformsList}

\${['captacion','institucional','jornada','promo','tienda','servicio'].includes(modo) ? \`PERFIL DE AUDIENCIA \u2014 MODO \${modoLabel.toUpperCase()}:
\${modo === 'captacion' ? '- Audiencia general en redes sociales. Objetivo: engagement, likes, comentarios, seguidores nuevos. NO vender, NO mencionar cr\xE9dito ni precios.' : ''}
\${modo === 'institucional' ? '- Audiencia general e inversionistas sociales. Objetivo: construir confianza y reconocimiento de marca Creditek. NO mencionar precios ni condiciones de cr\xE9dito.' : ''}
\${modo === 'jornada' ? '- Clientes potenciales de la zona que quieren cr\xE9dito ese d\xEDa. Objetivo: asistencia al evento presencial. Urgencia de fecha.' : ''}
\${modo === 'promo' ? '- Personas interesadas en la ocasi\xF3n, el regalo, el beneficio y el producto. No introducir condiciones de cr\xE9dito no solicitadas.' : ''}
\${modo === 'tienda' ? '- Personas que quieren conocer la tienda y la experiencia de compra, sin financiaci\xF3n inventada.' : ''}
\${modo === 'servicio' ? '- Personas que necesitan el servicio descrito y una acci\xF3n concreta para recibir orientaci\xF3n.' : ''}\` :
\`PERFIL DEL CLIENTE REAL (habla DIRECTAMENTE a esta persona):
- Hombre o mujer, 25-45 a\xF1os, ingreso familiar $1.2M\u2013$2.5M/mes
- Usa Nequi o Daviplata, no tiene cuenta bancaria formal
- No tiene historial crediticio o lo tiene manchado
- Su \xFAltimo celular lo compr\xF3 hace 2-3 a\xF1os \u2014 ya est\xE1 da\xF1ado, lento o roto
- Aspira a darle tecnolog\xEDa a su familia, que sus hijos tengan lo que necesitan
- Ha ido a otras tiendas y lo han tratado mal porque "no tiene cupo"
- Le da verg\xFCenza preguntar si le aprueban
- Cuando le dicen que s\xED, siente alivio y orgullo
El copy debe hacerlo sentir que Creditek es diferente: aqu\xED s\xED lo atienden bien, aqu\xED puede solicitarlo sin miedo, aqu\xED nadie lo juzga.\`}

\${culturaCtx ? \`CONTEXTO DE CIUDAD \u2014 \${ciudadDisplay}:\\n\${culturaCtx}\\n\${!esCiudad && getTiendaInfo(ciudad)?.nombre ? \`Tienda: \${getTiendaInfo(ciudad).nombre}. Puedes mencionar este nombre cuando aporte autenticidad local (ej: "Vis\xEDtanos en \${getTiendaInfo(ciudad).nombre}").\` : \`CTA de ciudad: usa "Vis\xEDtanos en \${ciudadDisplay}" sin nombrar tienda espec\xEDfica.\`}\\n\\n\` : ''}\${(()=>{
  const btns = [...document.querySelectorAll('.estilo-btn.active')];
  const estilo = btns.length ? btns[0].textContent.trim().replace(/^[^a-zA-Z\xE1\xE9\xED\xF3\xFA\xF1]+/,'').toLowerCase().trim() : 'formal';
  // FIX v11 09-jul-2026 (aplicado tarde en esta sesi\xF3n): este map antes solo
  // ten\xEDa 2 de los 4 estilos (alegre coste\xF1o, chistoso) y ninguno ten\xEDa REGLA
  // DE ESPECIFICIDAD ni CUMPLIMIENTO META \u2014 por eso los titulares iniciales
  // (los que salen sin darle a "\u2726 M\xE1s") eran gen\xE9ricos. Ahora reutiliza los
  // mismos 4 estilos reforzados de ESTILO_INSTRUCCIONES(), la misma funci\xF3n
  // que ya usa generarMasTitulares(), para que ambos caminos generen con el
  // mismo est\xE1ndar de calidad y cumplimiento.
  const map = ESTILO_INSTRUCCIONES();
  const key = Object.keys(map).find(k => estilo.includes(k.split(' ')[0]));
  return key ? map[key] + '\\n\\n' : '';
})()}
\${COPY_QUALITY_GUARD}
\${buildModeCopyGuard(modo)}
\${detalleEstilo === 'chistoso' ? \`INVESTIGACI\xD3N DE HUMOR ACTUAL \u2014 OBLIGATORIA:
- Usa la b\xFAsqueda web una sola vez para identificar una conversaci\xF3n, comportamiento, formato de humor o tema vigente que pueda conectarse de forma natural con tecnolog\xEDa, compras o la vida cotidiana.
- No copies ni recrees una publicaci\xF3n existente. Extrae \xFAnicamente el mecanismo del chiste y escribe una versi\xF3n original para Creditek.
- No uses pol\xEDtica, tragedias, accidentes, menores, datos privados, burlas a grupos protegidos, personajes o logos ajenos.
- Si la actualidad no ofrece una conexi\xF3n clara con el producto, usa una observaci\xF3n cotidiana vigente en vez de forzar una tendencia.
- La publicaci\xF3n siempre queda como propuesta para revisi\xF3n humana; no afirmes que ser\xE1 viral.\` : ''}
LENGUAJE Y TONO OBLIGATORIO:
- Habla como un vendedor colombiano cercano y respetuoso, no como una marca corporativa
\${culturaCtx && (culturaCtx.includes('tradicional') || culturaCtx.includes('ganadero')) ? '- Registro: usa "usted" si el contexto lo pide; c\xE1lido, de confianza, como alguien del mismo pueblo.' : '- Registro: tuteo natural y directo, como alguien que ya conoce al cliente.'}
- Frases cortas y directas. Una idea por frase.
- PROHIBIDO: anglicismos, tecnicismos, frases corporativas como "potencia tu experiencia", "descubre", "innovador", "soluciones", "adquirir"

COPY MALO \u2014 NUNCA HACER ESTO (anti-patrones prohibidos):
\u274C "Descubre la innovadora experiencia de adquirir tecnolog\xEDa de punta con nuestras soluciones financieras."
\u274C "Potencia tu estilo de vida con nuestros equipos de \xFAltima generaci\xF3n."
\u274C "Aprovecha esta incre\xEDble oportunidad de financiamiento flexible."
\u274C "\xA1Cont\xE1ctanos ahora y nuestros asesores te guiar\xE1n!" (gen\xE9rico, sin ciudad, sin persona real)
\u274C Mencionar precios que no fueron especificados expl\xEDcitamente por el usuario
\u274C Usar "Ey" o slang urbano en Chin\xFA o Ci\xE9naga de Oro (registro respetuoso / usted)
\u274C "Aprobado para todo el mundo sin revisar nada" \u2014 falso y genera desconfianza legal
\u274C "Cualquier equipo sin condiciones" \u2014 impreciso y puede crear expectativas falsas
\u274C "Compra ya o pierdes todo" / lenguaje de urgencia agresiva o amenazante
PROHIBIDO adem\xE1s: "upgrade", "top", "lifestyle", "innovador", "potencia tu experiencia", "descubre", "soluciones", "adquirir", "tecnolog\xEDa de punta", "fintech", "cr\xE9dito digital"

ORTOGRAF\xCDA Y REDACCI\xD3N OBLIGATORIA \u2014 aplicar SIEMPRE antes de entregar:
1. Primera letra de cada texto en MAY\xDASCULA
2. Tildes correctas (tecnolog\xEDa, electrodom\xE9sticos, cr\xE9dito, f\xE1cil, etc.)
3. Corregir redacci\xF3n del usuario \u2014 "lo mejor que electrodom\xE9sticos" \u2192 "lo mejor en electrodom\xE9sticos"
4. Signos de puntuaci\xF3n correctos
5. NUNCA copiar texto del usuario con errores \u2014 siempre corregir antes de usar

L\xCDMITES DE CARACTERES (respetar siempre):
- Facebook: 300\u2013400 caracteres \xB7 storytelling breve, gancho emocional \xB7 Gancho \u2192 beneficio \u2192 CTA a tienda
- Instagram: 150\u2013200 caracteres \xB7 visual y directo \xB7 Primera l\xEDnea = gancho; copy m\xEDnimo
- WhatsApp: m\xE1x. 3 frases \xB7 como mensaje de amigo o conocido \xB7 Noticia \u2192 beneficio \u2192 pregunta/CTA
- TikTok: 2 l\xEDneas m\xE1x. \xB7 brutal, para el scroll \xB7 Primera l\xEDnea detiene, segunda convierte

\${fechaData ? \`FECHA ESPECIAL \u2014 \${fechaData.label}:
- Adapta el tono del copy a esta emoci\xF3n: \${fechaData.tono}
- Ganchos sugeridos para esta fecha: \${fechaData.ganchos.join(' / ')}
- Menciona la fecha de forma natural si encaja con el mensaje. No la fuerces.

\` : ''}ESTRUCTURA PARA ESTE TIPO DE PIEZA (\${TIPO_META[tipo]}):
\${tipoEstructura[tipo] || 'Gancho fuerte \u2192 beneficio concreto \u2192 CTA directo.'}

INSTRUCCIONES POR PLATAFORMA:
Genera el copy para CADA plataforma solicitada. Respeta los l\xEDmites de caracteres indicados arriba.
- Facebook: storytelling breve con gancho emocional, CTA clara a la tienda.
- Instagram: primera l\xEDnea es el gancho, copy visual y directo.
- WhatsApp: conversacional como un mensaje de un conocido. M\xE1ximo 3 frases.
- TikTok: primera l\xEDnea brutal que pare el scroll, segunda l\xEDnea el beneficio, nada m\xE1s.
\${direccion ? '- IMPORTANTE: Incluye la direcci\xF3n de la tienda en el CTA o al final de cada copy, de forma natural seg\xFAn el tono de cada plataforma.' : ''}

\${inclHashtags ? 'Despu\xE9s a\xF1ade:\\nHASHTAGS: 10-12 hashtags con ' + hashtagsCtx : ''}
\${briefBlock}

Despu\xE9s a\xF1ade:
[TITULARES]
3 titulares de ALTO IMPACTO para imagen publicitaria. TRANSFORMA el mensaje \u2014 NO lo copies.
Extrae la emoci\xF3n o beneficio central y expr\xE9salo de forma nueva e inesperada.
- M\xE1ximo 6 palabras cada uno. Sin emojis. Sin "Creditek".
- Nivel: Nike, Coca-Cola, Claro Colombia
- PROHIBIDO: copiar palabras del mensaje, frases gen\xE9ricas
- Uno emocional, uno directo con giro creativo, uno con sabor coste\xF1o
Formato exacto:
1. {titular}
2. {titular}
3. {titular}

Formato EXACTO de la respuesta completa:
\${platforms.map(p => \`[PLATAFORMA: \${PLATFORMS_META[p].label}]\\n{copy}\`).join('\\n\\n')}

\${inclHashtags ? '[HASHTAGS]\\n{hashtags}' : ''}
\${inclBrief ? '\\n[BRIEF VISUAL CANVA]\\n{brief}' : ''}

[TITULARES]
1. ...
2. ...
3. ...\`;

  try {
    const response = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + (await auraSessionToken() || ''),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }],
        ...(detalleEstilo === 'chistoso' ? { tools: [{ type:'web_search_20250305', name:'web_search', max_uses:1 }] } : {})
      })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = response.status === 401 ? 'Sesi\xF3n inv\xE1lida o vencida. Inicia sesi\xF3n nuevamente.' :
                  response.status === 429 ? 'L\xEDmite de uso alcanzado. Espera un momento e intenta de nuevo.' :
                  errData.error?.message || \`Error \${response.status}\`;
      throw new Error(msg);
    }
    const data = await response.json();
    // FIX v12 09-jul-2026: con b\xFAsqueda activada, la respuesta puede traer
    // varios bloques de texto separados por bloques de b\xFAsqueda en el medio.
    // .find() se quedaba solo con el primero \u2014 .filter().join() junta todo el
    // texto real en orden, sin importar cu\xE1ntas b\xFAsquedas haya hecho Claude.
    // Seguro tambi\xE9n para cuando NO hay b\xFAsqueda (los otros 3 estilos).
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\\n');
    document.getElementById('loading-card').style.display = 'none';
    renderPiezas(text, platforms, tipo, ciudad, inclHashtags, inclBrief);
    const h = { ciudad, modo, tipo: TIPO_META[tipo], producto: producto||'\u2014', timestamp: new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}), raw: text, platforms };
    history.unshift(h); if (history.length > 8) history.pop();
    renderHistory();
    document.getElementById('top-subtitle').textContent = TIPO_META[tipo]+' \xB7 '+ciudad+' \xB7 '+platforms.length+' plataforma'+(platforms.length>1?'s':'');
    document.getElementById('copy-all-btn').style.display = 'block';
    document.getElementById('export-btn').style.display = 'block';
    document.getElementById('regen-btn').style.display = 'block';
    document.getElementById('action-btns-row').style.display = 'flex';
    document.getElementById('canva-brief-panel').style.display = 'none';
    document.getElementById('canva-btn').classList.remove('active');
    document.getElementById('img-mensaje').dataset.editado = '';
    showToast('\u2713 Piezas generadas correctamente');
    showImgSection();
    setTimeout(() => {
      const firstBtn = document.querySelector('.titular-opt');
      if (firstBtn) firstBtn.click();
    }, 300);
  } catch(err) {
    document.getElementById('loading-card').style.display = 'none';
    document.getElementById('piezas-grid').innerHTML = \`<div style="color:#ff6b6b;font-size:13px;padding:20px 0;line-height:1.6">\${err.message || 'Error de conexi\xF3n. Intenta de nuevo.'}</div>\`;
    showToast(err.message || 'Error al generar', '#ef4444');
    console.error('API error:', err);
  }
  btn.disabled = false; spinner.style.display = 'none'; label.textContent = '\u2726 Generar piezas';
  contentGenerationInFlight = false;
  document.getElementById('canva-brief-panel').style.display = 'none';
  document.getElementById('canva-btn').classList.remove('active');
}

function renderPiezas(text, platforms, tipo, ciudad, inclHashtags, inclBrief) {
  const grid = document.getElementById('piezas-grid');
  grid.innerHTML = '';
  ['facebook','instagram','whatsapp','tiktok'].filter(p => platforms.includes(p)).forEach(platform => {
    const meta = PLATFORMS_META[platform];
    const lk = platform.charAt(0).toUpperCase()+platform.slice(1);
    const regex = new RegExp('\\\\[PLATAFORMA:\\\\s*'+lk+'\\\\]([\\\\s\\\\S]*?)(?=\\\\[PLATAFORMA:|\\\\[HASHTAGS\\\\]|\\\\[BRIEF|$)','i');
    const match = text.match(regex);
    if (!match) return;
    const copy = match[1].trim();
    const card = document.createElement('div');
    card.className = 'pieza-card';
    card.dataset.platform = platform;
    card.innerHTML = \`
      <div class="pieza-header">
        <div class="pieza-platform">
          <div style="width:10px;height:10px;border-radius:50%;background:\${meta.color};flex-shrink:0"></div>
          \${meta.emoji} \${meta.label}
          <span class="pieza-badge \${meta.badge}">\${TIPO_META[tipo]}</span>
        </div>
      </div>
      <div class="pieza-body"><div class="pieza-content">\${fmt(copy)}</div></div>
      <div class="pieza-footer">
        <span class="pieza-tag">\${ciudad}</span>
        <span class="pieza-tag">\${lk}</span>
        \${charCounterHTML(platform, copy.length)}
        \${copy.length > (CHAR_LIMITS[platform] || 400) ? \`<button class="ajustar-btn" onclick="ajustarCopy(this, '\${platform}', \${CHAR_LIMITS[platform] || 400})">\u2702 Ajustar</button>\` : ''}
        <button class="copy-footer-btn" onclick="copiarTexto(this,\\\`\${esc(copy)}\\\`)"><span>\u{1F4CB} Copiar</span></button>
      </div>\`;
    grid.appendChild(card);
  });

  if (inclHashtags) {
    const hm = text.match(/\\[HASHTAGS\\]([\\s\\S]*?)(?=\\[BRIEF|\\[PLATAFORMA|$)/i);
    if (hm) {
      const ht = hm[1].trim();
      const c = document.createElement('div'); c.className = 'pieza-card';
      c.innerHTML = \`<div class="pieza-header"><div class="pieza-platform"># Hashtags<span class="pieza-badge badge-gen" style="margin-left:8px">SEO social</span></div><button class="copy-btn" onclick="copiarTexto(this,\\\`\${esc(ht)}\\\`)"><span>Copiar</span></button></div><div class="pieza-body"><div class="hashtag-block"><strong>Para pegar al final de tus posts</strong>\${ht}</div></div>\`;
      grid.appendChild(c);
    }
  }
  // Parse titulares
  const tm = text.match(/\\[TITULARES\\]([\\s\\S]*?)$/i);
  if (tm) {
    const titLines = tm[1].trim().split('\\n').filter(l => l.trim());
    const titulares = titLines.map(l => limpiarMarkdownTitular(l.replace(/^\\d+\\.\\s*/, ''))).filter(Boolean).slice(0, 6);
    rememberRecentHeadlines(titulares);
    renderTitulares(titulares);
  }

  if (inclBrief) {
    const bm = text.match(/\\[BRIEF VISUAL CANVA\\]([\\s\\S]*?)(?=\\[TITULARES\\]|$)/i);
    if (bm) {
      const bt = bm[1].trim();
      const lines = bt.split('\\n').filter(l=>l.trim());
      let rows = lines.map(l=>{const i=l.indexOf(':');if(i>0){const k=l.slice(0,i).replace(/^[-\u2022*]\\s*/,'').trim();const v=l.slice(i+1).trim();return \`<div class="brief-row"><span class="brief-key">\${k}</span><span class="brief-val">\${v}</span></div>\`;}return \`<div class="brief-row"><span class="brief-val">\${l.replace(/^[-\u2022*]\\s*/,'')}</span></div>\`;}).join('');
      const c = document.createElement('div'); c.className = 'pieza-card';
      c.innerHTML = \`<div class="pieza-header"><div class="pieza-platform">\u{1F3A8} Brief visual Canva<span class="pieza-badge badge-gen" style="margin-left:8px">Dise\xF1o</span></div><button class="copy-btn" onclick="copiarTexto(this,\\\`\${esc(bt)}\\\`)"><span>Copiar</span></button></div><div class="pieza-body"><div class="brief-block"><strong>Instrucciones para Canva</strong>\${rows}</div></div>\`;
      grid.appendChild(c);
    }
  }
}

function fmt(text){ return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\*\\*(.+?)\\*\\*/g,'<em>$1</em>').replace(/\\*(.+?)\\*/g,'<em>$1</em>'); }
function esc(str){ return str.replace(/\`/g,'\\\\\`').replace(/\\$/g,'\\\\$'); }
// FIX v13 09-jul-2026: los titulares que devuelve Claude van directo a un
// <input> de texto plano ("Titular principal") y a botones de selecci\xF3n \u2014
// a diferencia de fmt() (que convierte ** a <em> para HTML), aqu\xED no hay
// d\xF3nde renderizar HTML, as\xED que los asteriscos de markdown deben eliminarse
// por completo, no convertirse.
function limpiarMarkdownTitular(texto) {
  return (texto || '').replace(/\\*\\*/g, '').replace(/\\*/g, '').replace(/_{1,2}/g, '').trim();
}
function copiarTexto(btn, texto) {
  const span = btn.querySelector('span');
  const original = span ? span.textContent : btn.textContent;
  navigator.clipboard.writeText(texto).then(() => {
    btn.classList.add('copied');
    if (span) span.textContent = '\u2713 Copiado'; else btn.textContent = '\u2713 Copiado';
    setTimeout(() => {
      btn.classList.remove('copied');
      if (span) span.textContent = original; else btn.textContent = original;
    }, 2000);
  });
}
function copiarTodo(){ const cards=document.querySelectorAll('.pieza-content,.hashtag-block,.brief-block'); let all=''; cards.forEach(c=>{all+=c.innerText+'\\n\\n---\\n\\n';}); navigator.clipboard.writeText(all.trim()).then(()=>{ const btn=document.getElementById('copy-all-btn'); btn.textContent='\u2713 Copiado todo'; setTimeout(()=>{btn.textContent='Copiar todo';},2000); }); }

async function exportarPaquete() {
  if (typeof JSZip === 'undefined') { showToast('JSZip no disponible. Verifica tu conexi\xF3n a internet.', '#ef4444'); return; }
  const btn = document.getElementById('export-btn');
  btn.disabled = true; btn.textContent = '\u23F3 Empacando...';
  try {
    const zip = new JSZip();
    const ciudadRaw = document.getElementById('ciudad').value || 'creditek';
    const ciudad = ciudadRaw.split(' \xB7 ')[0].toLowerCase().replace(/\\s+/g,'-');
    const ts = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'2-digit'}).replace(/\\//g,'-');
    const folder = zip.folder(\`creditek-\${ciudad}-\${ts}\`);

    // Copy per platform (reads current DOM \u2014 reflects any ajustar edits)
    document.querySelectorAll('.pieza-card[data-platform]').forEach(card => {
      const p = card.dataset.platform;
      const el = card.querySelector('.pieza-content');
      if (el) folder.file(\`\${p}.txt\`, el.innerText.trim());
    });

    // Hashtags
    const htEl = document.querySelector('.hashtag-block');
    if (htEl) {
      const htText = htEl.innerText.replace(/^Para pegar[^\\n]*\\n/,'').trim();
      if (htText) folder.file('hashtags.txt', htText);
    }

    // Brief visual
    const brEl = document.querySelector('.brief-block');
    if (brEl) {
      const brText = brEl.innerText.replace(/^Instrucciones[^\\n]*\\n/,'').trim();
      if (brText) folder.file('brief-canva.txt', brText);
    }

    // Titulares
    const tits = [...document.querySelectorAll('.titular-opt')].map(b => b.textContent.trim()).filter(Boolean);
    if (tits.length) folder.file('titulares.txt', tits.join('\\n'));

    // Imagen principal (single engine)
    const imgSrc = imgHistory[imgHistoryIdx];
    if (imgSrc && imgSrc.startsWith('data:')) {
      const modelName = (lastImgModelLabel || 'imagen').toLowerCase().replace(/\\s+/g,'-');
      folder.file(\`\${modelName}.png\`, imgSrc.split(',')[1], { base64: true });
    }

    // Im\xE1genes A/B
    const abA = document.getElementById('img-ab-a');
    const abB = document.getElementById('img-ab-b');
    if (abA?.src?.startsWith('data:')) folder.file('imagen-gemini.png', abA.src.split(',')[1], { base64: true });
    if (abB?.src?.startsWith('data:')) folder.file('imagen-gpt.png', abB.src.split(',')[1], { base64: true });

    const hasContent = folder.files && Object.keys(folder.files).length > 0;
    if (!hasContent) { showToast('No hay contenido para exportar a\xFAn.', '#f59e0b'); btn.disabled=false; btn.textContent='\u{1F4E6} Exportar'; return; }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = \`creditek-\${ciudad}-\${ts}.zip\`; a.click();
    URL.revokeObjectURL(url);
    showToast('\u2713 Paquete ZIP descargado');
  } catch(e) {
    showToast('Error al generar ZIP: ' + (e.message || ''), '#ef4444');
    console.error(e);
  }
  btn.disabled = false; btn.textContent = '\u{1F4E6} Exportar';
}

function usarImagenDeAB(side) {
  const el = document.getElementById(\`img-ab-\${side}\`);
  if (!el?.src?.startsWith('data:')) return;
  imgHistory = [el.src];
  imgHistoryIdx = 0;
  mostrarImgVersion(el.src);
  const labelEl = side === 'a' ? document.getElementById('img-ab-label-a') : null;
  const label = labelEl ? labelEl.textContent.replace(/^[\u2726\u2B21]\\s+/,'') : 'GPT Image 2.5 Flare';
  document.getElementById('img-model-lbl').textContent = \`Usando: \${label}\`;
  document.getElementById('img-result').style.display = 'block';
  document.getElementById('img-editor').style.display = 'block';
  renderImgHistoryNav();
  document.getElementById('img-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  showToast(\`\u2713 Imagen de \${label} lista para editar\`);
}

async function ajustarCopy(btn, platform, maxChars) {
  const card = btn.closest('.pieza-card');
  const contentEl = card.querySelector('.pieza-content');
  const copyBtn = card.querySelector('.copy-btn');
  const originalText = contentEl.innerText.trim();
  btn.disabled = true; btn.textContent = '...';
  try {
    const response = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (await auraSessionToken() || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: \`Acorta este copy de \${platform} para que tenga M\xC1XIMO \${maxChars} caracteres. Mant\xE9n el gancho, el beneficio principal y el CTA. Conserva el tono informal y colombiano. No agregues nada nuevo. Responde SOLO con el copy acortado, sin explicaciones ni comillas.\\n\\nCopy original:\\n\${originalText}\` }] })
    });
    const data = await response.json();
    const trimmed = data.content?.find(b => b.type === 'text')?.text?.trim() || '';
    if (!trimmed) throw new Error('Sin respuesta');
    contentEl.innerHTML = fmt(trimmed);
    const footer = btn.closest('.pieza-footer');
    const counter = footer.querySelector('.char-counter');
    const pct = trimmed.length / maxChars;
    const cls = pct > 1 ? 'char-over' : pct >= 0.8 ? 'char-warn' : 'char-ok';
    counter.className = \`char-counter \${cls}\`;
    counter.textContent = \`\${pct > 1 ? '\u26A0 ' : ''}\${trimmed.length}/\${maxChars} car.\`;
    if (copyBtn) copyBtn.setAttribute('onclick', \`copiarTexto(this,\\\`\${esc(trimmed)}\\\`)\`);
    const footerCopyBtn = card.querySelector('.copy-footer-btn');
    if (footerCopyBtn) footerCopyBtn.setAttribute('onclick', \`copiarTexto(this,\\\`\${esc(trimmed)}\\\`)\`);
    if (trimmed.length <= maxChars) btn.remove();
    else { btn.disabled = false; btn.textContent = '\u2702 Ajustar'; }
  } catch(e) { showToast('Error al ajustar: ' + (e.message||''), '#ef4444'); btn.disabled = false; btn.textContent = '\u2702 Ajustar'; }
}
function renderHistory(){ const wrap=document.getElementById('history-wrap'); const list=document.getElementById('history-list'); if(!history.length){wrap.style.display='none';return;} wrap.style.display='block'; list.innerHTML=history.map((h,i)=>\`<div class="history-item" onclick="restoreHistory(\${i})"><div class="history-title">\${h.tipo} \xB7 \${h.ciudad}</div><div class="history-meta">\${h.producto} \xB7 \${h.timestamp}</div></div>\`).join(''); }
function restoreHistory(idx) {
  const h = history[idx];
  if (!h) return;
  document.getElementById('canva-brief-panel').style.display = 'none';
  document.getElementById('canva-btn').classList.remove('active');
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('piezas-grid').innerHTML = '';
  const tipoKey = Object.keys(TIPO_META).find(k => TIPO_META[k] === h.tipo) || 'oferta_semana';
  renderPiezas(h.raw, h.platforms, tipoKey, h.ciudad, document.getElementById('chk-hashtags').checked, document.getElementById('chk-brief').checked);
  document.getElementById('top-subtitle').textContent = h.tipo + ' \xB7 ' + h.ciudad;
  document.getElementById('copy-all-btn').style.display = 'block';
  document.getElementById('ciudad').value = h.ciudad;
  if (h.modo) document.getElementById('modo').value = h.modo;
  document.getElementById('tipo').value = tipoKey;
  updateModoUI();
  document.querySelectorAll('.platform-btn').forEach(b => {
    b.classList.toggle('active', h.platforms.includes(b.dataset.platform));
  });
}

function renderTitulares(titulares) {
  const wrap = document.getElementById('titulares-opts');
  if (!wrap || !titulares.length) return;
  document.querySelectorAll('.titular-opt').forEach(b => b.classList.remove('selected'));
  wrap.innerHTML = titulares.map(t =>
    \`<button class="titular-opt" onclick="selectTitular(this,'\${t.replace(/'/g,"\\\\'")}')">\${t}</button>\`
  ).join('');
}
function selectTitular(btn, text) {
  document.querySelectorAll('.titular-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('img-titular').value = limpiarMarkdownTitular(text);
  buildImgPrompt();
}

// \u2500\u2500 M\xF3dulo generador de im\xE1genes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let currentEngine = 'dalle';
let currentEstilo = 'formal';
let currentFormat = 'feed';
let productoImgBase64 = null;
let imgHistory = [];
let imgHistoryIdx = 0;
let lastImgModelLabel = '';

const CHAR_LIMITS = { facebook: 400, instagram: 200, whatsapp: 250, tiktok: 100 };
function charCounterHTML(platform, len) {
  const max = CHAR_LIMITS[platform] || 400;
  const pct = len / max;
  const cls = pct > 1 ? 'char-over' : pct >= 0.8 ? 'char-warn' : 'char-ok';
  return \`<span class="char-counter \${cls}">\${pct > 1 ? '\u26A0 ' : ''}\${len}/\${max} car.</span>\`;
}
function selectFormat(fmt) {
  currentFormat = fmt;
  document.getElementById('fmt-feed').classList.toggle('active', fmt === 'feed');
  document.getElementById('fmt-stories').classList.toggle('active', fmt === 'stories');
  buildImgPrompt();
}
let logoBase64 = null;
const financierasCache = {};

const FINANCIERAS = [
  { id: 'payjoy',    label: 'PayJoy',    file: 'logos/payjoy.png' },
  { id: 'krediya',   label: 'Krediya',   file: 'logos/krediya.png' },
  { id: 'alocredit', label: 'Alo Credit',file: 'logos/alocredit.png' },
  { id: 'addi',      label: 'Addi',      file: 'logos/addi.png' },
];

function getSelectedFinancieras() {
  return FINANCIERAS.filter(f => document.getElementById('fin-' + f.id)?.checked);
}

async function loadFinancieraB64(fin) {
  if (financierasCache[fin.id]) return financierasCache[fin.id];
  try {
    const resp = await fetch(fin.file);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => { financierasCache[fin.id] = e.target.result; resolve(e.target.result); };
      reader.readAsDataURL(blob);
    });
  } catch(e) { return null; }
}

async function loadAllSelectedFinancieras() {
  const selected = getSelectedFinancieras();
  const results = await Promise.all(selected.map(f => loadFinancieraB64(f)));
  return selected.map((f, i) => ({ label: f.label, b64: results[i] })).filter(x => x.b64);
}

function onFinancieraChange() {
  buildImgPrompt();
}

function selectEngine(engine) {
  currentEngine = engine;
  updateImgKeyStatus();
}

function toggleProdMode(mode, btn) {
  document.querySelectorAll('.prod-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('producto').style.display = mode === 'texto' ? 'block' : 'none';
  document.getElementById('prod-foto-wrap').style.display = mode === 'foto' ? 'block' : 'none';
  if (mode === 'texto') productoImgBase64 = null;
}

function onProdFileChange(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    productoImgBase64 = e.target.result;
    const img = document.getElementById('prod-preview');
    img.src = e.target.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// Tooltip posici\xF3n din\xE1mica (v4b, 05-jul-2026)
document.addEventListener('mouseover', function(e) {
  const wrap = e.target.closest('.ck-tooltip-wrap');
  if (!wrap) return;
  const tooltip = wrap.querySelector('.ck-tooltip');
  if (!tooltip) return;
  const rect = wrap.getBoundingClientRect();
  tooltip.style.position = 'fixed';
  tooltip.style.left = '160px';
  tooltip.style.top = (rect.bottom + 6) + 'px';
  tooltip.style.transform = 'none';
  tooltip.style.width = '300px'; // FIX v4g: sincronizado con el ancho nuevo del CSS .ck-tooltip (antes 240px pisaba el cambio a 300px)
  tooltip.style.zIndex = '9999';
});
function selectEstilo(estilo, btn) {
  currentEstilo = estilo;
  document.querySelectorAll('.estilo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelector('.estilo-custom-ta').style.display = estilo === 'custom' ? 'block' : 'none';
  // Mostrar detalle del d\xEDa (05-jul-2026)
  const detRow = document.getElementById('detalle-dia-row');
  const detVal = document.getElementById('detalle-dia-val');
  if (detRow && detVal && estilo !== 'custom') {
    detRow.style.display = 'flex';
    detVal.textContent = getDetalleDelDia(estilo);
  } else if (detRow) {
    detRow.style.display = 'none';
  }
  buildImgPrompt();
}

// Permite cambiar el detalle del d\xEDa manualmente (05-jul-2026)
let detalleOverride = {};
let detalleChangeInFlight = false;
async function cambiarDetalleDia() {
  const btn = document.querySelector('.detalle-dia-btn');
  if (detalleChangeInFlight) return;
  detalleChangeInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = 'generando\u2026'; }
  try {
    const actual = document.getElementById('detalle-dia-val')?.textContent?.trim() || detalleCreativoActual(currentEstilo);
    let siguiente = await proponerDetalleCreativoConIA(currentEstilo, { force: true, avoid: actual });
    if (conceptosSustancialmenteIguales(siguiente, actual)) {
      siguiente = propuestaFallbackDiferente(currentEstilo, actual);
    }
    if (conceptosSustancialmenteIguales(siguiente, actual)) {
      showToast('No se pudo obtener una idea nueva. Intenta nuevamente.', '#ef4444');
      return;
    }
    detalleOverride[currentEstilo] = siguiente;
    const detVal = document.getElementById('detalle-dia-val');
    if (detVal) detVal.textContent = siguiente;
    await buildImgPrompt();
  } finally {
    detalleChangeInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = '\u21BA cambiar'; }
  }
}

async function loadLogoBase64() {
  if (logoBase64) return logoBase64;
  try {
    const resp = await fetch('/creditek/shared/branding/creditek-logo.png', { cache: 'no-store' });
    if (!resp.ok) throw new Error('No se pudo cargar el logo oficial de Creditek.');
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => { logoBase64 = e.target.result; resolve(logoBase64); };
      reader.onerror = () => reject(new Error('logo-no-legible'));
      reader.readAsDataURL(blob);
    });
  } catch(e) {
    throw new Error('No se pudo cargar el logo oficial de Creditek. La imagen no se entregar\xE1 sin marca.');
  }
}

function confirmarPreviewYGenerar() {
  generarConModelos();
}

// FIX v4k (07-jul-2026): sincroniza "Copy secundario" \u2192 "Texto 2 de imagen"
// en tiempo real, respetando si el usuario ya edit\xF3 el campo derecho a mano.
function sincronizarCopySecundario(valor) {
  const mensajeEl = document.getElementById('img-mensaje');
  if (mensajeEl && !mensajeEl.dataset.editado) mensajeEl.value = valor;
}

function resetPreviewFields() {
  const modo  = document.getElementById('modo')?.value || 'credito';
  const cuota = document.getElementById('cuota').value.trim();
  const ciudad = document.getElementById('ciudad').value;
  const esCiudadReset = isCiudadCompleta(ciudad);
  const tiendaInfo = getTiendaInfo(ciudad);
  const nombreCta = esCiudadReset ? getCiudadNombre(ciudad) : (tiendaInfo?.nombre || getCiudadNombre(ciudad));
  const sinPrecio = ['captacion','institucional','jornada'].includes(modo);
  const precioWrap = document.getElementById('img-precio')?.closest('.img-prev-field');
  if (precioWrap) precioWrap.style.display = sinPrecio ? 'none' : 'block';
  // Nota especial \u2014 se lee antes para decidir si el titular se autocompleta
  const notaVal = document.getElementById('nota')?.value.trim() || '';
  const titularDefaults = {
    credito:       cuota ? \`\xA1Tu celular desde \${cuota}!\` : '\xA1El tuyo te est\xE1 esperando!',
    promo:         '\xA1Aprovecha esta promoci\xF3n!',
    tienda:        '\xA1Vis\xEDtanos hoy!',
    servicio:      'Te atendemos con gusto',
    captacion:     '\xBFA qui\xE9n le ha pasado esto? \u{1F447}',
    jornada:       '\xA1Ven y estrena ese mismo d\xEDa!',
    institucional: 'Aqu\xED te atendemos bien, siempre.',
  };
  const precioDefaults = {
    credito:  cuota,   // vac\xEDo si el usuario no escribi\xF3 precio \u2014 nunca inventar
    promo:    '',
    tienda:   '',
    servicio: ''
  };
  const hayTitularSeleccionado = document.querySelector('.titular-opt.selected');
  if (!hayTitularSeleccionado && !notaVal) {
    document.getElementById('img-titular').value = titularDefaults[modo] || titularDefaults.credito;
  }
  document.getElementById('img-precio').value  = precioDefaults[modo] ?? '';
  // FIX v4k (07-jul-2026): Oscar confirma que "Copy secundario" (sidebar) y
  // "Texto 2 de imagen" (panel derecho) S\xCD deben sincronizarse \u2014 es el mismo
  // dato en 2 pasos, no 2 campos independientes. Se restaura la auto-copia,
  // respetando dataset.editado para no pisar una edici\xF3n manual del usuario
  // en "Texto 2 de imagen".
  const mensajeEl = document.getElementById('img-mensaje');
  if (mensajeEl && notaVal && !mensajeEl.dataset.editado) mensajeEl.value = notaVal;
  const chkEl = document.getElementById('chk-direccion');
  const inclDirImg = chkEl ? chkEl.checked : false;
  if (inclDirImg && (esCiudadReset || ciudad === 'general')) showToast('Direcci\xF3n no disponible para esta selecci\xF3n', '#f59e0b');
  const dirImg = (!esCiudadReset && inclDirImg) ? (tiendaInfo?.direccion || DIRECCIONES[ciudad] || null) : null;
  console.log('[chk-direccion] checkbox activo:', inclDirImg,
    '| chkEl encontrado:', !!chkEl,
    '| ciudad:', ciudad,
    '| esCiudadCompleta:', esCiudadReset,
    '| tiendaInfo encontrada:', tiendaInfo ? \`\${tiendaInfo.nombre} / \${tiendaInfo.direccion}\` : null,
    '| direcci\xF3n resultante:', dirImg,
    '| CTA final:', dirImg ? \`Vis\xEDtanos en \${nombreCta} \xB7 \${dirImg}\` : \`Vis\xEDtanos en \${nombreCta}\`);
  const ctaDefaults = {
    captacion:     'Escr\xEDbenos por WhatsApp',
    institucional: 'Escr\xEDbenos por WhatsApp',
    jornada:       \`Vis\xEDtanos en \${nombreCta}\`,
    credito:       ciudad && ciudad !== 'general' ? \`Vis\xEDtanos en \${nombreCta}\` : 'Escr\xEDbenos por WhatsApp',
    promo:         ciudad && ciudad !== 'general' ? \`Vis\xEDtanos en \${nombreCta}\` : 'Escr\xEDbenos por WhatsApp',
    tienda:        ciudad && ciudad !== 'general' ? \`Vis\xEDtanos en \${nombreCta}\` : 'Escr\xEDbenos por WhatsApp',
    servicio:      ciudad && ciudad !== 'general' ? \`Cont\xE1ctanos en \${nombreCta}\` : 'Cont\xE1ctanos',
  };
  const ctaBase = ctaDefaults[modo] || \`Vis\xEDtanos en \${nombreCta}\`;
  document.getElementById('img-cta').value = dirImg ? \`\${ctaBase} \xB7 \${dirImg}\` : ctaBase;
  buildImgPrompt();
}

function syncModelUI() {
  ['chk-recraft', 'chk-dalle'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.closest('label')?.classList.toggle('model-chk-active', !!el.checked);
  });
}

function updateImgKeyStatus() {
  syncModelUI();
  const useRecraft = document.getElementById('chk-recraft')?.checked;
  const useDalle  = document.getElementById('chk-dalle')?.checked;
  const recraftOk = true;
  const dalleOk   = true;
  const btn = document.getElementById('img-key-row-btn');

  if (useRecraft || useDalle) {
    document.getElementById('img-key-dot').className = 'img-key-dot ok';
    const parts = [];
    if (useRecraft && recraftOk) parts.push('Recraft V4.1');
    if (useDalle  && dalleOk)  parts.push('GPT Image 2.5 Flare');
    document.getElementById('img-key-label').textContent = parts.join(' \xB7 ') + ' configurado';
    btn.style.display = 'none';
  } else {
    document.getElementById('img-key-dot').className = 'img-key-dot';
    document.getElementById('img-key-label').textContent = 'Selecciona un modelo';
    btn.style.display = 'none';
  }
  // Update sidebar key dots
  const sgd = document.getElementById('sidebar-recraft-dot');
  const sod = document.getElementById('sidebar-openai-dot');
  if (sgd) sgd.className = 'img-key-dot' + (recraftOk ? ' ok' : '');
  if (sod) sod.className = 'img-key-dot' + (dalleOk  ? ' ok' : '');
}

// Detalle Hoy se construye con el contexto actual y puede solicitar una nueva
// direcci\xF3n creativa a IA, sin recurrir a un banco cerrado de escenas.
let _detalleContador = 0;
const recentCreativeConcepts = [];
const creativeDetailByStyle = {};
let creativeConceptRequest = null;
const creativeFallbackByStyle = {
  formal: [
    'Una asesora presenta el celular sobre una mesa limpia mientras el cliente revisa opciones con confianza.',
    'Un comprador compara dos celulares en una vitrina luminosa y elige con tranquilidad el que mejor le conviene.',
    'Una entrega elegante del celular convierte una decisi\xF3n planeada en un momento de satisfacci\xF3n familiar.'
  ],
  costeno: [
    'Dos amigos prueban el celular nuevo en la terraza del barrio y celebran la compra con una sonrisa espont\xE1nea.',
    'Una vendedora muestra el celular junto a una ventana abierta mientras la conversaci\xF3n avanza con calidez.',
    'Una familia comparte fotos del celular nuevo en el parque del barrio durante una tarde luminosa.'
  ],
  chistoso: [
    'El celular viejo tarda tanto en abrir la c\xE1mara que el nuevo ya tom\xF3 la foto y todos celebran el remate.',
    'El cliente llega con cargador, bater\xEDa externa y cables; la asesora le muestra un celular cuya bater\xEDa resuelve el enredo.',
    'Dos amigos compiten por la mejor selfie: el celular nuevo enfoca perfecto y el viejo solo captura el dedo.'
  ],
  minimalista: [
    'El celular nuevo descansa sobre una superficie clara y concentra toda la atenci\xF3n en su dise\xF1o.',
    'Una mano sostiene el celular frente a una pared luminosa, con una composici\xF3n serena y precisa.',
    'El reflejo limpio de la pantalla destaca el celular como la \xFAnica decisi\xF3n importante de la escena.'
  ],
  contemporaneo: [
    'Una escena editorial asim\xE9trica en una tienda de tecnolog\xEDa actual: una persona compara el celular en primer plano y el espacio negativo organiza el mensaje con intenci\xF3n.',
    'Un acercamiento documental de una entrega de celular, con gesto aut\xE9ntico, encuadre inesperado y detalles gr\xE1ficos discretos inspirados en dise\xF1o editorial actual.',
    'El celular ocupa el primer plano mientras una interacci\xF3n comercial real sucede detr\xE1s, con luz natural, recorte fotogr\xE1fico audaz y ritmo visual contempor\xE1neo.'
  ],
  custom: [
    'Una escena comercial concreta convierte la idea del brief en un momento claro y f\xE1cil de recordar.',
    'El producto aparece en uso dentro de una situaci\xF3n cotidiana que conecta directamente con el brief.',
    'Una acci\xF3n sencilla del cliente transforma el brief en una escena comercial cercana y comprensible.'
  ]
};

function normalizarConcepto(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
}

function conceptosSustancialmenteIguales(a, b) {
  const left = normalizarConcepto(a);
  const right = normalizarConcepto(b);
  if (!left || !right) return true;
  if (left === right) return true;
  const aWords = new Set(left.split(' '));
  const bWords = new Set(right.split(' '));
  const shared = [...aWords].filter(word => bWords.has(word)).length;
  return shared / Math.max(aWords.size, bWords.size) >= 0.82;
}

function propuestaFallbackDiferente(estilo, avoid = '') {
  const pool = creativeFallbackByStyle[estilo] || creativeFallbackByStyle.custom;
  const usadas = new Set([...recentCreativeConcepts, avoid].map(normalizarConcepto));
  const next = pool.find(candidate => !usadas.has(normalizarConcepto(candidate))
    && ![...usadas].some(previous => conceptosSustancialmenteIguales(candidate, previous)));
  if (next) return next;
  const producto = document.getElementById('producto')?.value.trim() || 'el producto';
  const brief = document.getElementById('instruccion-ia-extra')?.value.trim()
    || document.getElementById('modo-contexto')?.value.trim() || '';
  const base = brief || \`una escena cotidiana con \${producto}\`;
  return \`\${base}. El producto aparece en una acci\xF3n nueva, clara y comercialmente \xFAtil.\`;
}

function detalleCreativoActual(estilo) {
  return creativeDetailByStyle[estilo] || getDetalleDelDia(estilo);
}

async function proponerDetalleCreativoConIA(estilo, { force = false, avoid = '' } = {}) {
  if (!force && creativeDetailByStyle[estilo]) return creativeDetailByStyle[estilo];
  if (creativeConceptRequest) return creativeConceptRequest;
  const actual = avoid || detalleCreativoActual(estilo);
  const producto = document.getElementById('producto')?.value.trim() || 'tecnolog\xEDa';
  const brief = document.getElementById('instruccion-ia-extra')?.value.trim() || document.getElementById('modo-contexto')?.value.trim() || '';
  const styleRequirement = estilo === 'chistoso'
    ? 'Usa una b\xFAsqueda web para identificar un tema, conversaci\xF3n, comportamiento o formato de humor vigente que pueda conectarse naturalmente con celulares, cr\xE9dito, bater\xEDa, c\xE1mara, compras o vida cotidiana. Toma \xFAnicamente el mecanismo del chiste y crea una idea original con planteamiento y remate visual ligados al producto, comprensible sin leer un caption. Nunca copies la imagen, texto, personaje, creador, celebridad o logo de la referencia; evita pol\xEDtica, tragedias, accidentes, objetificaci\xF3n y estereotipos. Sonre\xEDr, posar o ser sensual no es por s\xED solo humor.'
    : estilo === 'costeno'
      ? 'Representa vida cotidiana luminosa del Caribe colombiano con calidez macondiana sutil, sin carnaval ni postal tur\xEDstica.'
      : '';
  creativeConceptRequest = (async () => {
    try {
      let retryForRepeated = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const recientes = recentCreativeConcepts.slice(-12).join(' | ') || 'ninguno';
        const retryInstruction = attempt === 1
          ? 'La respuesta anterior fue repetida. Cambia por completo la acci\xF3n, el escenario y el recurso visual.'
          : '';
      const res = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
        method: 'POST',
        headers: {'Authorization':'Bearer ' + (await auraSessionToken() || ''),'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-6',
          max_tokens:100,
          messages:[{role:'user',content:\`Prop\xF3n UNA idea visual comercial nueva para \${producto}. Estilo: \${estilo}. Brief: \${brief || 'ninguno'}. \${styleRequirement} No repitas ni parafrasees estos conceptos recientes: \${recientes}. \${retryInstruction} Devuelve solo una frase concreta, plausible y distinta, m\xE1ximo 24 palabras.\`}],
          ...(estilo === 'chistoso' ? { tools: [{ type:'web_search_20250305', name:'web_search', max_uses:1 }] } : {})
        })
      });
      const data = await res.json();
      const concepto = (data.content?.find(b => b.type === 'text')?.text || '').replace(/["\\n]/g, ' ').trim();
      if (!res.ok || concepto.length < 8 || conceptosSustancialmenteIguales(concepto, actual)
        || recentCreativeConcepts.some(previous => conceptosSustancialmenteIguales(concepto, previous))) {
        retryForRepeated = true;
        if (attempt === 0) continue;
        throw new Error('concepto repetido o inv\xE1lido');
      }
      creativeDetailByStyle[estilo] = concepto;
      recentCreativeConcepts.push(concepto);
      if (recentCreativeConcepts.length > 24) recentCreativeConcepts.shift();
      const detVal = document.getElementById('detalle-dia-val');
      if (detVal && currentEstilo === estilo) detVal.textContent = concepto;
      await buildImgPrompt();
      return concepto;
      } catch {
        if (retryForRepeated && attempt === 0) continue;
        break;
      }
    }
      const fallback = propuestaFallbackDiferente(estilo, actual);
      creativeDetailByStyle[estilo] = fallback;
      recentCreativeConcepts.push(fallback);
      return fallback;
    } finally {
      creativeConceptRequest = null;
    }
  })();
  return creativeConceptRequest;
}

function getDetalleDelDia(estilo) {
  if (detalleOverride && detalleOverride[estilo]) return detalleOverride[estilo];
  const contexto = document.getElementById('modo-contexto')?.value.trim()
    || document.getElementById('instruccion-ia-extra')?.value.trim()
    || document.getElementById('nota')?.value.trim();
  const producto = document.getElementById('producto')?.value.trim();
  const ciudad = document.getElementById('ciudad')?.selectedOptions?.[0]?.textContent?.trim();
  const fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', month: 'long', day: 'numeric' });
  _detalleContador++;
  if (contexto) return \`\${contexto}\${producto ? \`, con \${producto}\` : ''}\${ciudad ? \` en \${ciudad}\` : ''}\`;
  return \`Una escena \${estilo} de \${producto || 'tecnolog\xEDa nueva'}\${ciudad ? \` en \${ciudad}\` : ''}, con una acci\xF3n comercial clara y un detalle visual inesperado de \${fecha}\`;
}

// FIX v13 12-jul-2026: completa el procesador de un modelo cuando el cat\xE1logo
// (STATIC del Worker o scraping en vivo) no lo tiene. Usa el proxy seguro
// de Claude autenticado con la sesi\xF3n de AURA. Si Claude tampoco tiene
// certeza, devuelve null \u2014 nunca se muestra un valor inventado.
async function obtenerProcesadorConIA(nombreModelo) {
  try {
    const res = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
      method: 'POST',
      headers: {'Authorization':'Bearer ' + (await auraSessionToken() || ''),'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 30,
        messages: [{ role: 'user', content: \`\xBFCu\xE1l es el procesador/chipset del celular "\${nombreModelo}"? Responde SOLO el nombre del procesador, sin explicaci\xF3n, m\xE1ximo 5 palabras. Si no lo sabes con certeza, responde exactamente: "No disponible".\` }]
      })
    });
    const data = await res.json();
    const respuesta = data.content?.find(b => b.type === 'text')?.text?.trim();
    return (respuesta && respuesta !== 'No disponible') ? respuesta : null;
  } catch {
    return null; // fallback silencioso \u2014 el badge de procesador simplemente no se incluye
  }
}

async function buildImgPrompt() {
  // \u2500\u2500 Variables comunes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const producto       = document.getElementById('producto').value.trim() || 'smartphone';
  const ciudad         = document.getElementById('ciudad').value || 'Colombia';
  const modo           = document.getElementById('modo')?.value || 'credito';
  const tipo           = document.getElementById('tipo')?.value || 'oferta_semana';
  const notaInstruccion = document.getElementById('instruccion-ia-extra')?.value.trim() || ''; // FIX v4f: antes le\xEDa 'nota'
  const isStories      = currentFormat === 'stories';
  const formatSpec     = isStories ? '1080x1920px vertical (Stories/Reels)' : '1080x1080px square (Feed)';
  const esCiudad       = isCiudadCompleta(ciudad);
  const tiendaInfo     = getTiendaInfo(ciudad);
  const nombreCta      = esCiudad ? getCiudadNombre(ciudad) : (tiendaInfo?.nombre || getCiudadNombre(ciudad));
  const estiloCustomVal = document.getElementById('estilo-custom')?.value.trim();
  const refBlock       = getRefBlock();
  const explicitPriority = buildExplicitCreativePriority();
  const visualBriefBlock = explicitPriority
    ? \`\${explicitPriority}\\nSUJETOS OBLIGATORIOS: deriva las personas, objetos y relaciones del brief; no los sustituyas por Detalle hoy.\\nACCI\xD3N OBLIGATORIA: representa la acci\xF3n central indicada por el usuario.\\nELEMENTOS SECUNDARIOS: usa Detalle hoy solo como ambiente compatible.\\nELEMENTOS A EVITAR: cualquier sujeto o acci\xF3n que contradiga el brief, una escena de una sola persona cuando el brief pide interacci\xF3n, o un ambiente secundario convertido en concepto principal.\`
    : 'SUJETOS Y ACCI\xD3N: deriva el foco de la escena del contexto espec\xEDfico; Detalle hoy solo puede ambientar y nunca debe convertirse en el sujeto principal.';

  // \u2500\u2500 MODOS SIN CELULAR (captacion, institucional, jornada) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (['captacion','institucional','jornada'].includes(modo)) {
    const tipoPersonalizado = document.getElementById('tipo-personalizado')?.value.trim() || '';
    const titularVal = document.getElementById('img-titular')?.value.trim() || 'Aqu\xED te atendemos bien, siempre.';
    const ctaVal     = document.getElementById('img-cta')?.value.trim() || \`Escr\xEDbenos por WhatsApp\`;
    const mensajeVal = document.getElementById('img-mensaje')?.value.trim() || '';
    const jornadaFecha = document.getElementById('jornada-fecha')?.value.trim() || '';
    const jornadaLugar = document.getElementById('jornada-lugar')?.value.trim() || '';
    const jornadaHora  = document.getElementById('jornada-hora')?.value.trim()  || '';

    // \u2500\u2500 Cuando hay texto personalizado, ese texto manda completamente \u2500\u2500
    const conceptoPrincipal = tipoPersonalizado
      ? \`INTERNAL BRIEF (private \u2014 NEVER show, mention or render any part of this in the image): "\${tipoPersonalizado}". Use only to understand the purpose of this piece.\`
      : {
          institucional: 'Brand institutional post. Pure brand identity. Clean minimal premium design \u2014 large logo, bold headline, generous white space.',
          captacion:     'Community engagement post. Bold large typography as visual hero. Caribbean Colombian energy. Fun turquoise graphic elements.',
          jornada: [
            'Credit event poster.',
            jornadaFecha ? \` EVENT DATE "\${jornadaFecha}" as visual hero in large turquoise numbers.\` : ' Do NOT invent or render any specific date \u2014 none was provided, omit it completely.',
            jornadaLugar ? \` Location: "\${jornadaLugar}".\` : ' Do NOT invent or render any specific address or location \u2014 none was provided, omit it completely.',
            jornadaHora  ? \` Time: "\${jornadaHora}".\` : ' Do NOT invent or render any specific time \u2014 none was provided, omit it completely.',
          ].join(''),
        }[modo] || 'Brand identity post. Creditek logo prominent. Clean, commercial, compelling.';

    const detalleDia = getDetalleDelDia(currentEstilo);
    const estiloRico = {
      formal:     \`Professional, trustworthy, aspirational. Geometric accents in turquoise at low opacity. Corporate credibility. Use the user brief as the visual focus; secondary detail only: \${detalleDia}.\`,
      costeno:    \`Warm, luminous everyday life from Colombia's Caribbean region with subtle contemporary Macondian character: sun-washed walls, leafy plants, breezy natural light and controlled coral, terracotta, sun-yellow and turquoise accents. Use the user brief as the visual focus; secondary detail only: \${detalleDia}. Make it inviting and scroll-stopping, never dark, corporate, carnival-like or touristy.\`,
      chistoso:   \`An original visual setup and punchline grounded in an everyday cellphone purchase in Colombia's Caribbean region. When a current trend or meme mechanism inspired the concept, reinterpret only its comedic structure; never reproduce the source image, wording, characters, creator, celebrity likeness or third-party logo. Smiling, posing, being fashionable or sensual alone are not humor. Attractive, glamorous or sensual adults are allowed when relevant, treated tastefully and with agency. Use the user brief as the focus; secondary detail only: \${detalleDia}. Never depict minors, nudity, explicit sexual content, degrading or objectifying framing, a US-style store, a Bogot\xE1 luxury shop or a regional stereotype.\`,
      minimalista:\`Ultra minimal. Maximum white space. One strong visual from the user brief; secondary detail only: \${detalleDia}.\`,
      contemporaneo:\`Contemporary editorial retail art direction: asymmetric composition, authentic documentary-style photography, bold scale contrast, restrained graphic accents and intentional negative space. The product and commercial action must remain unmistakable. Avoid template-like layouts, generic neon technology effects and decorative people. Secondary detail only: \${detalleDia}.\`,
      custom:     estiloCustomVal ? \`Custom style: \${estiloCustomVal}\` : 'Professional clean modern.',
    }[currentEstilo] || 'Professional brand design.';

    const reglas = tipoPersonalizado
      ? [
          '- Interpret the operator message visually \u2014 show what it describes.',
          '- NO invented prices or specific financial amounts.',
          '- ALL text in Spanish. Do not render the word Creditek or any logo; reserve one clean brand zone for the official asset.',
          '- All text sharp and fully legible.',
        ]
      : [
          '- NO smartphones or device renders.',
          '- NO prices, NO peso signs, NO credit terms.',
          '- ALL text in Spanish. Do not render the word Creditek or any logo; reserve one clean brand zone for the official asset.',
          '- All text sharp and fully legible.',
        ];

    // FIX v1, 04-jul-2026: antes esta regla era fija para los 4 estilos, forzando
    // 80% de navy+turquesa incluso en Chistoso/Costeno, donde no aplica - ahi la
    // marca solo necesita estar presente en el CTA y el logo, no dominar el fondo.
    const paletaPorEstilo = {
      formal:      { paleta: 'azul marino #0B1E3D y turquesa #00C4CC como anclas de marca, blanco luminoso y uno o dos acentos contempor\xE1neos derivados de la escena', dominio: 'marca reconocible sin convertir el lienzo en un bloque azul; ning\xFAn color plano debe ocupar m\xE1s del 55%.' },
      chistoso:    { paleta: 'colores vivos y c\xE1lidos tomados de una tienda cotidiana del Caribe colombiano, con turquesa #00C4CC como acento de marca', dominio: 'el remate visual y el producto dominan; el color acompa\xF1a el humor sin convertir la escena en moda, carnaval o una tienda extranjera.' },
      costeno:     { paleta: 'luz c\xE1lida y una paleta caribe\xF1a controlada: coral, terracota, amarillo sol, verdes de vegetaci\xF3n y turquesa #00C4CC como acento de marca', dominio: 'fotograf\xEDa luminosa de borde a borde; azul marino solo en texto o peque\xF1os anclajes. Nunca fondo oscuro dominante, gris corporativo, panel blanco institucional, carnaval ni saturaci\xF3n de clich\xE9s.' },
      minimalista: { paleta: 'azul marino #0B1E3D | turquesa #00C4CC | blanco #FFFFFF', dominio: 'mucho espacio en blanco \u2014 azul marino y turquesa como \xFAnicos acentos puntuales, sin llenar el lienzo.' },
      contemporaneo:{ paleta: 'azul marino #0B1E3D | turquesa #00C4CC | blanco #FFFFFF | un neutral c\xE1lido controlado', dominio: 'base de marca dominante con un solo neutral editorial; contraste sofisticado, sin neones gen\xE9ricos ni colores decorativos sin funci\xF3n.' },
      custom:      { paleta: 'azul marino #0B1E3D | turquesa #00C4CC | blanco #FFFFFF', dominio: 'azul marino + turquesa m\xEDnimo 80% del dise\xF1o.' },
    };
    const paletaEstilo = paletaPorEstilo[currentEstilo] || paletaPorEstilo.formal;

    const prompt = [
      'ROLE: Senior advertising art director for Colombian Caribbean brand. Create a commercially compelling, visually rich image.',
      \`FORMAT: \${formatSpec}\`,
      visualBriefBlock,
      '',
      \`CORE CONCEPT: \${conceptoPrincipal}\`,
      tipoPersonalizado ? null : (
        { inst_apertura:'ADD: celebratory ribbon or confetti in turquoise.',
          inst_aniversario:'ADD: large milestone number in turquoise.',
          inst_valores:'ADD: clean icon \u2014 heart or shield \u2014 in turquoise.',
          inst_logro:'ADD: trophy or star graphic.',
          captacion_pregunta:'ADD: oversized question mark in turquoise as background element.',
          captacion_humor:'ADD: ONE genuine Caribbean commercial moment \u2014 a real everyday scene, never a stack of tropical clich\xE9s (no piling palms + confetti + flowers + coconut together).',
          jornada_urgencia:'ADD: countdown clock in turquoise. Maximum urgency.',
        }[tipo] || null
      ),
      '',
      \`VISUAL STYLE: \${estiloRico}\`,
      '',
      'BRAND IDENTITY \u2014 ADAPT TO THE SELECTED STYLE:',
      \`- PALETTE: \${paletaEstilo.paleta}\`,
      \`- COLOR BALANCE: \${paletaEstilo.dominio}\`,
      '- Do not render any logo, word Creditek, placeholder, rectangle, white panel, badge or empty frame. The official asset is composited after generation exactly once in natural negative space.',
      '- Typography: Montserrat ExtraBold headlines, DM Sans body.',
      '',
      'EXACT SPANISH TEXT TO RENDER IN IMAGE:',
      \`- HEADLINE (large, bold): "\${titularVal}"\`,
      mensajeVal ? \`- SECONDARY MESSAGE (smaller, independent zone): "\${mensajeVal}" \u2014 place it separately from the headline when the image allows\` : null,
      document.getElementById('chk-cta-activo')?.checked !== false ? \`- CTA BUTTON: "\${ctaVal}" \u2014 turquoise #00C4CC background, navy #0B1E3D text, rounded corners\` : null,
      jornadaFecha ? \`- EVENT DATE (VERY LARGE): "\${jornadaFecha}"\` : null,
      jornadaLugar ? \`- LOCATION: "\${jornadaLugar}"\` : null,
      jornadaHora  ? \`- TIME: "\${jornadaHora}"\` : null,
      '',
      'SPANISH PROOFREADING \u2014 CRITICAL before rendering any text:',
      '- Capitalize first letter of every sentence and "Creditek"',
      '- Fix grammar: "de acercamos"\u2192"nos acercamos", "la tecnolog\xEDa de que"\u2192"la tecnolog\xEDa que"',
      '- Correct accents: tecnolog\xEDa, cr\xE9dito, cuotas, f\xE1cil, etc.',
      '- Natural Colombian Spanish \u2014 no awkward phrasing',
      '',
      'RULES:',
      reglas.join('\\n'),
      '- Make it COMMERCIALLY COMPELLING. No empty backgrounds. Every element intentional.',
      refBlock,
    ].filter(l => l !== null).join('\\n');

    document.getElementById('img-prompt-ta').value = prompt;
    return;
  }

  // \u2500\u2500 MODOS CON CELULAR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const cuota      = document.getElementById('cuota').value.trim();
  const inicial    = document.getElementById('inicial').value.trim();
  const precioEl   = document.getElementById('img-precio');
  const titularEl  = document.getElementById('img-titular');
  const ctaEl      = document.getElementById('img-cta');
  const mensajeVal = document.getElementById('img-mensaje')?.value.trim() || '';
  const fechaKey   = document.getElementById('fecha-especial')?.value || '';
  const fechaPersonalizadaTxt = document.getElementById('fecha-especial-personalizada')?.value.trim() || '';
  // FIX v4g (07-jul-2026): mismo criterio que en generarContenido() \u2014 fecha personalizada
  // construye un fechaData en tiempo real en vez de depender del diccionario fijo.
  const fechaData  = fechaKey === 'personalizada' && fechaPersonalizadaTxt
    ? { label: fechaPersonalizadaTxt, colores: 'seg\xFAn la paleta de marca vigente', elementos: 'elementos visuales apropiados para la ocasi\xF3n, sin forzar clich\xE9s', tono: 'apropiado para la ocasi\xF3n mencionada', ganchos: [] }
    : (FECHAS_ESPECIALES[fechaKey] || null);
  const inclDir    = !esCiudad && document.getElementById('chk-direccion').checked;
  const dir        = inclDir ? (tiendaInfo?.direccion || DIRECCIONES[ciudad] || null) : null;
  const ctaFallback = dir ? \`Vis\xEDtanos en \${nombreCta} \xB7 \${dir}\` : \`Vis\xEDtanos en \${nombreCta}\`;
  const titular    = titularEl?.value.trim() || (cuota ? \`\xA1Tu celular desde \${cuota}!\` : \`\xA1Vis\xEDtanos en \${nombreCta}!\`);
  const precio     = precioEl?.value.trim() || '';
  const cta        = ctaEl?.value.trim() || ctaFallback;
  const modoLabel  = { credito:'Cr\xE9dito de celular', promo:'Promoci\xF3n', tienda:'Tienda', servicio:'Servicio' }[modo] || modo;
  const formatoLabel = isStories ? 'Stories / TikTok vertical 1080\xD71920 px' : 'Feed cuadrado 1080\xD71080 px';
  const variableGraphicDirection = 'DIRECCI\xD3N GR\xC1FICA VARIABLE: usa el lienzo completo y decide seg\xFAn escena y espacio negativo entre composici\xF3n editorial, texto lateral, superior/inferior, banda peque\xF1a, tarjeta discreta o texto sobre fotograf\xEDa con contraste. Cambia la soluci\xF3n entre generaciones. PROHIBIDO usar un gran bloque o degradado azul como plantilla recurrente, concentrar todo el texto en una zona azul o dejar grandes vac\xEDos sin intenci\xF3n.';
  const layoutGuide = isStories
    ? \`Composici\xF3n VERTICAL 1080\xD71920 px: producto protagonista y textos jerarquizados con aire. \${variableGraphicDirection}\`
    : \`Composici\xF3n CUADRADA 1080\xD71080 px: producto y textos jerarquizados con equilibrio visual. \${variableGraphicDirection}\`;

  const paletaPorEstilo_B = {
    formal:      { paleta: 'azul marino #0B1E3D y turquesa #00C4CC como anclas de marca, blanco luminoso y uno o dos acentos contempor\xE1neos derivados de la escena', dominio: 'marca reconocible sin convertir el lienzo en un bloque azul; ning\xFAn color plano debe ocupar m\xE1s del 55%.' },
    chistoso:    { paleta: 'colores vivos y c\xE1lidos tomados de una tienda cotidiana del Caribe colombiano, con turquesa #00C4CC como acento de marca', dominio: 'el remate visual y el producto dominan; el color acompa\xF1a el humor sin convertir la escena en moda, carnaval o una tienda extranjera.' },
    costeno:     { paleta: 'luz c\xE1lida y una paleta caribe\xF1a controlada: coral, terracota, amarillo sol, verdes de vegetaci\xF3n y turquesa #00C4CC como acento de marca', dominio: 'fotograf\xEDa luminosa de borde a borde; azul marino solo en texto o peque\xF1os anclajes. Nunca fondo oscuro dominante, gris corporativo, panel blanco institucional, carnaval ni saturaci\xF3n de clich\xE9s.' },
    minimalista: { paleta: 'azul marino #0B1E3D | turquesa #00C4CC | blanco #FFFFFF', dominio: 'mucho espacio en blanco \u2014 azul marino y turquesa como \xFAnicos acentos puntuales, sin llenar el lienzo.' },
    contemporaneo:{ paleta: 'azul marino #0B1E3D | turquesa #00C4CC | blanco #FFFFFF | un neutral c\xE1lido controlado', dominio: 'base de marca dominante con un solo neutral editorial; contraste sofisticado, sin neones gen\xE9ricos ni colores decorativos sin funci\xF3n.' },
    custom:      { paleta: 'azul marino #0B1E3D | turquesa #00C4CC | blanco #FFFFFF', dominio: 'azul marino + turquesa m\xEDnimo 80% del dise\xF1o.' },
  };
  const paletaEstilo = paletaPorEstilo_B[currentEstilo] || paletaPorEstilo_B.formal;
  const tipoPersonalizadoVal = document.getElementById('tipo-personalizado')?.value.trim() || '';
  const tipoImgMap = {
    oferta_semana:    \`Oferta de la semana: \${producto} protagonista grande y bien iluminado.\${precio ? \` Badge de precio "\${precio}" muy prominente en turquesa #00C4CC, n\xFAmeros grandes y en negrita.\` : ''} Analiza el espacio negativo y distribuye titular, precio, producto y CTA en zonas independientes; no uses una columna vertical fija.\`,
    showcase_producto:\`Showcase del producto: \${producto} apoyado o sostenido de forma natural dentro de la escena (en una mano, sobre una mesa/vitrina, o en uso) \u2014 NUNCA flotando en el aire ni como recorte pegado. Debe verse como parte f\xEDsica real de la fotograf\xEDa, con sombra de contacto realista donde toca la superficie. Bordes n\xEDtidos, fondo limpio. Texto m\xEDnimo. El producto ocupa el 60\u201365% de la composici\xF3n. Etiquetas de specs flotantes si aplica (esto s\xED puede ser un elemento gr\xE1fico superpuesto, distinto al producto).\`,
    testimonio:       \`Testimonio: tono c\xE1lido y humano. Gran comilla de apertura en turquesa #00C4CC. Frase testimonial de cliente en texto blanco grande y centrado. Silueta o retrato de persona en un costado. Sin imagen del producto.\`,
    educativo:        \`Contenido educativo: dise\xF1o limpio e informativo. \xCDconos en turquesa #00C4CC (checks, n\xFAmeros, flechas) sobre fondo azul marino. Jerarqu\xEDa de lectura clara, aspecto de tarjeta \xFAtil \u2014 no aviso agresivo.\`,
    promo_urgencia:   \`Promo con urgencia: composici\xF3n de alta energ\xEDa. Badge "SOLO HOY" o elemento de cuenta regresiva en turquesa #00C4CC. Producto \${producto} con cinta o elemento diagonal de destaque.\${precio ? \` Precio "\${precio}" en n\xFAmeros muy grandes y en negrita.\` : ''} Alto contraste, lectura visual inmediata.\`,
    detras_camara:    \`Detr\xE1s de c\xE1mara: atm\xF3sfera aut\xE9ntica del interior de una tienda Creditek. Iluminaci\xF3n natural, vitrina con celulares visibles, personas en ambiente real de tienda. Estilo documental \u2014 sin overlays gr\xE1ficos pesados.\`,
  };
  const tipoDesc = (tipo === 'personalizado' && tipoPersonalizadoVal)
    ? tipoPersonalizadoVal
    : (tipoImgMap[tipo] || tipoImgMap.oferta_semana);

  const SPEC_FIELDS = [
    { id:'spec-ram', label:'RAM', key:'ram' }, { id:'spec-storage', label:'Almacenamiento', key:'almacenamiento' },
    { id:'spec-camera', label:'C\xE1mara', key:'camara' }, { id:'spec-battery', label:'Bater\xEDa', key:'bateria' },
    { id:'spec-screen', label:'Pantalla', key:'pantalla' }, { id:'spec-chip', label:'Procesador', key:'procesador' },
    { id:'spec-5g', label:'5G', key:null },
  ];
  const checkedSpecs = SPEC_FIELDS.filter(s => document.getElementById(s.id)?.checked);
  let foundSpecs = {};
  let foundModelo = null;
  if (checkedSpecs.length > 0 && producto.length > 3) {
    var storedRefs = JSON.parse(localStorage.getItem('ck_referencias') || 'null');
    if (storedRefs?.brands) {
      const prod = producto.toLowerCase();
      // Fix 05-jul-2026: buscar por palabras clave individuales en vez del string completo
      // "samsung a16" encuentra "samsung galaxy a16 128gb" porque comparte "samsung" y "a16"
      const prodTokens = prod.split(/\\s+/).filter(t => t.length > 1);
      outer: for (const [, d] of Object.entries(storedRefs.brands)) {
        for (const m of (d.modelos || [])) {
          const n = m.nombre.toLowerCase();
          const nTokens = n.split(/\\s+/);
          const matches = prodTokens.filter(t => nTokens.some(nt => nt.includes(t) || t.includes(nt)));
          if (matches.length >= Math.min(2, prodTokens.length)) { foundSpecs = m.specs||{}; foundModelo = m; break outer; }
        }
      }
    }
    // FIX v13 12-jul-2026: si el usuario pidi\xF3 el badge de "Procesador" y el
    // modelo encontrado en el cat\xE1logo no lo tiene (caso confirmado: ninguno
    // de los 39 modelos de STATIC en el Worker ten\xEDa este campo), completar
    // con una consulta ligera a Claude en vez de dejarlo vac\xEDo o dejar que la
    // IA de imagen lo invente. Reutiliza el proxy seguro de Claude. Se cachea en
    // el mismo localStorage.ck_referencias para no repetir la llamada la
    // pr\xF3xima vez que se genere con el mismo modelo.
    const pideProcesador = checkedSpecs.some(s => s.id === 'spec-chip');
    if (pideProcesador && foundModelo && !foundSpecs.procesador) {
      const procesadorIA = await obtenerProcesadorConIA(foundModelo.nombre);
        if (procesadorIA) {
          foundModelo.specs = { ...(foundModelo.specs || {}), procesador: procesadorIA };
          foundSpecs = foundModelo.specs;
          localStorage.setItem('ck_referencias', JSON.stringify(storedRefs));
        }
    }
  }
  const specsItems = checkedSpecs.map(s => (!s.key ? '5G' : (foundSpecs[s.key] || s.label)));
  // FIX v14 12-jul-2026 (Parte B): antes se ped\xEDa un callout "flotante alrededor
  // del producto" sin indicar d\xF3nde \u2014 GPT Image 2 dibujaba el label de c\xE1mara
  // apuntando al aire en vez de al m\xF3dulo real. Solo la c\xE1mara tiene una
  // ubicaci\xF3n f\xEDsica real y visible; el resto (RAM, almacenamiento, bater\xEDa,
  // procesador, 5G) no corresponde a ning\xFAn punto del celular, as\xED que se
  // agrupan aparte en vez de intentar se\xF1alar algo que no existe.
  const specCamIdx = checkedSpecs.findIndex(s => s.id === 'spec-camera');
  const specCamItem = specCamIdx >= 0 ? specsItems[specCamIdx] : null;
  const specOtrosItems = specsItems.filter((_, i) => checkedSpecs[i].id !== 'spec-camera');
  const specsBlock = checkedSpecs.length > 0
    ? [
        specCamItem ? \`Label de c\xE1mara ("\${specCamItem}"): el m\xF3dulo de c\xE1mara trasero SIEMPRE est\xE1 en la esquina superior trasera del celular (arriba, cerca del borde) \u2014 dibuja este label con una l\xEDnea gu\xEDa delgada que apunte EXACTAMENTE a ese m\xF3dulo de lentes, nunca al centro ni a los bordes de la pantalla.\` : null,
        specOtrosItems.length ? \`Otras specs (\${specOtrosItems.join(', ')}): no corresponden a un punto f\xEDsico visible del celular \u2014 agr\xFApalas en un solo bloque de labels apilados a un costado del producto (nunca sueltas ni apuntando al aire). Cada label: fondo turquesa #00C4CC, texto blanco, tipograf\xEDa peque\xF1a y limpia, sin tapar la pantalla.\` : null,
      ].filter(Boolean).join(' ')
    : \`Sin especificaciones t\xE9cnicas ni callout labels alrededor del producto. Dise\xF1o limpio centrado en el producto y el mensaje.\`;

  const detalleDiaMsg = getDetalleDelDia(currentEstilo);
  const mensajeMap = {
    formal:      \`Tono comercial profesional, confiable y aspiracional. Resaltar el beneficio principal del equipo. Detalle visual secundario: \${detalleDiaMsg}.\`,
    costeno:     \`Tono caribe\xF1o colombiano aut\xE9ntico, comercial y luminoso \u2014 un cliente disfrutando su celular nuevo como foco claro de la escena. Sensibilidad macondiana contempor\xE1nea y sutil: luz de tarde, brisa sugerida, vegetaci\xF3n frondosa, fachadas o texturas regionales y acentos coral, terracota, amarillo sol o turquesa, sin acumularlos. Escena: \${detalleDiaMsg}. Debe sentirse como un momento plausible de Corozal, Chin\xFA, Tol\xFA o Ci\xE9naga, no como una campa\xF1a institucional ni una postal tur\xEDstica. Prohibidos carnaval, comparsa, confeti, disfraces, m\xE1scaras, sombreros folcl\xF3ricos y decoraciones tropicales apiladas.\`,
    chistoso:    /lavadora|\\bmoto\\b|nevera|televisor|\\btv\\b|estufa|licuadora|parlante|bicicleta|colchon/i.test(producto||'')
      ? \`Humor visual cotidiano sobre \${producto}: planteamiento reconocible y remate claro ligado a su uso o beneficio. Si el concepto naci\xF3 de una tendencia o meme actual, transforma solo su mecanismo c\xF3mico en una escena original: no copies imagen, texto, personajes, creador, celebridad ni logos. Sonre\xEDr, posar o ser sensual no cuenta por s\xED solo como chiste. Se permiten adultos atractivos o sensuales con tratamiento elegante, no expl\xEDcito y no degradante. Escena realista de comercio del Caribe colombiano; sin tienda extranjera, objetificaci\xF3n ni estereotipos. Detalle visual: \${detalleDiaMsg}. NO mencionar ni mostrar celulares: el producto de esta pieza no es un celular.\`
      : \`Humor visual cotidiano: planteamiento reconocible y remate claro entre el celular viejo y \${producto}, ligado a una ventaja real. Si el concepto naci\xF3 de una tendencia o meme actual, transforma solo su mecanismo c\xF3mico en una escena original: no copies imagen, texto, personajes, creador, celebridad ni logos. Sonre\xEDr, posar o ser sensual no cuenta por s\xED solo como chiste. Se permiten adultos atractivos o sensuales con tratamiento elegante, no expl\xEDcito y no degradante. Escena realista de una tienda o calle comercial del Caribe colombiano; sin local estadounidense o bogotano de lujo, objetificaci\xF3n ni estereotipos. Detalle secundario: \${detalleDiaMsg}.\`,
    minimalista: \`Tono sereno y aspiracional. Menos texto, m\xE1s espacio en blanco. Un solo elemento visual derivado del brief; detalle secundario: \${detalleDiaMsg}.\`,
    contemporaneo:\`Direcci\xF3n editorial contempor\xE1nea, segura y comercial. Producto y acci\xF3n real como protagonistas, encuadre asim\xE9trico, tipograf\xEDa con contraste de escala y m\xE1ximo dos personas con funci\xF3n narrativa. Sin poses de celebraci\xF3n artificial, neones gen\xE9ricos ni adornos sin prop\xF3sito. Detalle secundario: \${detalleDiaMsg}.\`,
    custom:      estiloCustomVal || \`Estilo libre. Aplicar criterio art\xEDstico seg\xFAn las instrucciones.\`,
  };
  const mensajeEstilo = mensajeMap[currentEstilo] || mensajeMap.formal;

  const fechaBgMap = {
    madre:'fondo blanco #FFFFFF, texto azul marino #0B1E3D, acentos rosado #FF85A2',
    padre:'fondo azul marino profundo #0B1E3D', mundial:'fondo azul marino muy oscuro #001233',
    navidad:'fondo verde bosque profundo #0A2015', amistad:'fondo borgo\xF1a oscuro #1A0010',
    halloween:'fondo casi negro #0D0D0D', anonuevo:'fondo negro #050505',
    clases:'fondo blanco #FFFFFF con acentos azul cielo #87CEEB',
  };
  const fondoPorEstilo = {
    formal: 'escena fotogr\xE1fica o fondo editorial contempor\xE1neo; azul marino solo como ancla, nunca como bloque plano dominante',
    costeno: 'escena fotogr\xE1fica luminosa de borde a borde, con luz natural c\xE1lida, vegetaci\xF3n o arquitectura caribe\xF1a cotidiana; sin fondo oscuro dominante ni panel institucional',
    chistoso: 'tienda compacta o calle comercial cotidiana del Caribe colombiano, con vitrinas y mostradores accesibles, luz c\xE1lida y escala de pueblo o ciudad intermedia; nunca boutique de lujo, centro comercial, local estadounidense ni arquitectura bogotana gen\xE9rica',
    minimalista: 'fondo blanco #FFFFFF o muy claro, limpio y con espacio negativo intencional',
    contemporaneo: 'escena fotogr\xE1fica o fondo editorial contempor\xE1neo, luminoso y comercial; azul marino solo como ancla puntual',
    custom: 'fondo coherente con la direcci\xF3n visual escrita por el usuario; si no se especifica, contempor\xE1neo, luminoso y comercial',
  };
  const bgSpec = (fechaData && fechaBgMap[fechaKey])
    ? fechaBgMap[fechaKey]
    : (fondoPorEstilo[currentEstilo] || fondoPorEstilo.formal);
  const fechaImgBlock = fechaData ? \`Tem\xE1tica \${fechaData.label}: incorporar paleta secundaria (\${fechaData.colores}) y elementos decorativos sutiles (\${fechaData.elementos}). Estos acentos estacionales complementan la identidad Creditek, no la reemplazan.\` : '';

  const selectedFins = getSelectedFinancieras();
  const _refsForFin = JSON.parse(localStorage.getItem('ck_referencias') || 'null');
  const FIN_CONTEXT_FALLBACK = {
    payjoy:    { nombre:'PayJoy CO',  tagline:'Financia desde $0 de inicial', beneficios:'Solicitud con c\xE9dula \xB7 Sin codeudor' },
    krediya:   { nombre:'Krediya',    tagline:'Cr\xE9dito digital r\xE1pido',       beneficios:'Proceso 100% digital \xB7 Solicitud en minutos' },
    addi:      { nombre:'Addi CO',    tagline:'Compra ahora, paga despu\xE9s',   beneficios:'BNPL \xB7 Sin intereses en plazos cortos' },
    alocredit: { nombre:'Alo Credit', tagline:'Cr\xE9dito f\xE1cil',               beneficios:'Inmediato \xB7 Sin historial crediticio requerido' },
  };
  const finStrip = selectedFins.length ? \`Franja inferior: banda horizontal delgada (fondo blanco o semitransparente) con logos peque\xF1os de: \${selectedFins.map(f=>f.label).join(', ')}. Logos limpios, legibles, alineados horizontalmente. Cada logo aparece UNA SOLA VEZ. NO duplicar logos.\` : '';
  const finContextBlock = modo === 'credito' && selectedFins.length ? \`\\nFINANCIERAS ALIADAS:\\n\${selectedFins.map(f => { const stored2 = _refsForFin?.brands?.[FIN_CONTEXT_FALLBACK[f.id]?.nombre]?.finInfo; const ctx = stored2 || FIN_CONTEXT_FALLBACK[f.id]; return ctx ? \`- \${ctx.nombre||f.label}: \${ctx.tagline}. \${ctx.beneficios}.\` : \`- \${f.label}\`; }).join('\\n')}\` : '';

  const priceRule = (precio || inicial)
    ? \`Mostrar \xDANICAMENTE estos valores exactos: \${[precio&&\`cuota \${precio}\`, inicial&&\`inicial \${inicial}\`].filter(Boolean).join(' / ')}. NO agregar, inventar ni modificar ning\xFAn otro monto.\`
    : 'NO mostrar ning\xFAn precio, n\xFAmero con signo de pesos, monto ni cifra financiera. Sin "$", sin "COP", sin badges de precio. Omitir completamente el \xE1rea de precio.';

  const knownBrands = ['Samsung','Xiaomi','Motorola','OPPO','Realme','Infinix','Honor','TCL','iPhone','Apple'];
  const detectedBrand = knownBrands.find(b => producto.toLowerCase().includes(b.toLowerCase()));
  const isApple = detectedBrand === 'iPhone' || detectedBrand === 'Apple';
  const brandBlock = (detectedBrand && !isApple) ? \`CR\xCDTICO: El smartphone DEBE ser un \${producto} Android con marca \${detectedBrand} visible. NUNCA un iPhone.\` : isApple ? \`Dispositivo es \${producto} (Apple). Respetar dise\xF1o exacto de Apple.\` : '';
  const storeNameBlock = (tiendaInfo?.nombre && !esCiudad) ? \`CR\xCDTICO: el bot\xF3n CTA debe decir exactamente "\${tiendaInfo.nombre}". No modificar.\` : '';

  const lineas = [
    \`ROL: Director de arte publicitario senior especializado en redes sociales, retail de celulares y cr\xE9dito comercial colombiano.\`,
    \`FORMATO: \${formatoLabel}\`, \`LAYOUT: \${layoutGuide}\`, \`\`,
    \`PRODUCTO: \${producto}\`,
    checkedSpecs.length > 0 && specsItems.length > 0 ? \`SPECS: \${specsItems.join(', ')}\` : null,
    precio  ? \`CUOTA MENSUAL: \${precio}\` : null,
    inicial ? \`CUOTA INICIAL: \${inicial}\` : null,
    \`MODALIDAD: \${modoLabel}\`, \`\`,
    \`COMPOSICI\xD3N: \${tipoDesc}\`, specsBlock, \`\`,
    \`ESTILO "\${currentEstilo}": \${mensajeEstilo}\`,
    variableGraphicDirection,
    buildMandatoryUserBrief(),
    notaInstruccion ? \`INSTRUCCI\xD3N OPERADOR: \${notaInstruccion}\` : null, \`\`,
    \`TEXTOS EXACTOS EN LA IMAGEN (en espa\xF1ol colombiano, sin traducir):\`,
    \`1. Titular: "\${titular}" \u2014 Montserrat Bold, posici\xF3n destacada, m\xE1x. 2 l\xEDneas\`,
    mensajeVal ? \`\${2}. Mensaje secundario: "\${mensajeVal}" \u2014 ub\xEDcalo en una zona propia, no debajo del titular por defecto\` : null,
    precio  ? \`\${mensajeVal?3:2}. Cuota: "\${precio}" \u2014 n\xFAmeros grandes, turquesa #00C4CC, muy visible\` : null,
    inicial ? \`\${[mensajeVal,precio].filter(Boolean).length+2}. Inicial: "Desde \${inicial}" \u2014 badge turquesa #00C4CC\` : null,
    document.getElementById('chk-cta-activo')?.checked !== false ? \`\${[mensajeVal,precio,inicial].filter(Boolean).length+2}. Bot\xF3n CTA: "\${cta}" \u2014 zona independiente con respiraci\xF3n propia; fondo turquesa, texto azul marino, esquinas redondeadas\` : null,
    \`\${[mensajeVal,precio,inicial].filter(Boolean).length+3}. Tienda/Ciudad: "\${nombreCta}"\`, \`\`,
    \`CORRECCI\xD3N ORTOGR\xC1FICA OBLIGATORIA \u2014 antes de renderizar cualquier texto:\`,
    \`- Primera letra de cada frase en may\xFAscula. "Creditek" siempre con C may\xFAscula.\`,
    \`- Tildes correctas: tecnolog\xEDa, cr\xE9dito, cuotas, f\xE1cil, tambi\xE9n, etc.\`,
    \`- Corregir gram\xE1tica: "de acercamos"\u2192"nos acercamos", preposiciones correctas\`,
    \`- Espa\xF1ol colombiano natural \u2014 sin frases forzadas\`,
    \`IDENTIDAD VISUAL:\`,
    \`- Fondo: \${bgSpec}\`,
    \`- Paleta: \${paletaEstilo.paleta}\`,
    \`- Dominio: \${paletaEstilo.dominio}\`,
    \`- BRAND ZONE: reserva una sola zona limpia e integrada para el asset oficial Creditek. No dibujes, escribas ni inventes el logo o la palabra Creditek; el asset se a\xF1adir\xE1 despu\xE9s en esa zona. No ubicarlo sobre rostros, producto o titular.\`,
    \`- Tipograf\xEDa: Montserrat Bold titulares; DM Sans secundarios\`,
    finStrip        ? \`- \${finStrip}\`     : null,
    finContextBlock ? finContextBlock      : null,
    fechaImgBlock   ? \`- \${fechaImgBlock}\` : null, \`\`,
    \`RESTRICCIONES:\`,
    \`- IDIOMA: todos los textos en espa\xF1ol colombiano. Nunca en ingl\xE9s.\`,
    \`- MARCA: no renderizar la palabra "Creditek" ni ning\xFAn logo generado por IA; solo se a\xF1adir\xE1 el asset oficial una vez.\`,
    \`- NO inventar specs, precios o modelos no especificados.\`,
    \`- Textos n\xEDtidos y completamente legibles.\`,
    \`- Proporciones reales del dispositivo, iluminaci\xF3n de estudio.\`,
    \`- \${/lavadora|\\bmoto\\b|nevera|televisor|\\btv\\b|estufa|licuadora|parlante|bicicleta|colchon/i.test(producto||'') ? 'PRODUCTO EXACTO' : 'CELULAR EXACTO'}: debe ser \${producto}. No inventar modelos ni mezclar con otro tipo de producto \u2014 si el producto NO es un celular, NO incluir ning\xFAn celular en la imagen.\`,
    \`- COHERENCIA PROMESA\u2013IMAGEN: si el titular o mensaje menciona un celular/producto, debe verse inequ\xEDvocamente y ocupar al menos 20% del \xE1rea visual \xFAtil; no entregar una escena de personas felices donde el producto sea diminuto o inexistente.\`,
    \`- ACCI\xD3N COMERCIAL CRE\xCDBLE: las personas deben comparar, probar, recibir o mostrar el producto. M\xE1ximo dos protagonistas y ninguna persona decorativa sin funci\xF3n narrativa. Evitar celebraci\xF3n exagerada, poses de cat\xE1logo y sonrisas artificiales.\`,
    \`- JERARQU\xCDA PREMIUM: m\xE1ximo tres bloques textuales (titular, apoyo, CTA), cada uno en una zona distinta. Mantener margen seguro m\xEDnimo del 7% y una altura de logo de separaci\xF3n entre la zona de marca y el titular.\`,
    \`- CTA COMPLETO: debe conservar exactamente el texto aprobado. Nunca acortarlo a "Vis\xEDtanos" si el original incluye tienda/ciudad, ni agregar la palabra Creditek por iniciativa propia.\`,
    \`- DIRECCI\xD3N DE ARTE: ning\xFAn color, tarjeta, diagonal, ne\xF3n o adorno puede aparecer sin una funci\xF3n de jerarqu\xEDa o lectura. Evitar est\xE9tica tecnol\xF3gica gen\xE9rica y aspecto de plantilla repetida.\`,
    \`- PRECIOS: \${priceRule}\`,
    \`- NO agregar textos, frases promocionales, urgencia ("solo hoy", "\xFAltima oportunidad", cuentas regresivas, etc.) ni llamados a la acci\xF3n que NO est\xE9n listados expl\xEDcitamente en "TEXTOS EXACTOS EN LA IMAGEN" arriba.\`,
    brandBlock     ? \`- \${brandBlock}\`     : null,
    storeNameBlock ? \`- \${storeNameBlock}\` : null,
    refBlock,
  ].filter(l => l !== null).join('\\n');

  document.getElementById('img-prompt-ta').value = lineas;
}

// \u2500\u2500 PROMPT DEDICADO PARA GEMINI (Imagen 4) \u2014 02-jul-2026 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Gemini/Imagen 4 es un modelo de DIFUSI\xD3N, no un motor de capas: etiquetas
// tipo "TITULAR:", hex, pt, "Capa X" se leen como texto a dibujar y confunden
// al modelo (diagn\xF3stico confirmado + recomendaci\xF3n de la propia Gemini,
// 02-jul-2026). Esta funci\xF3n es independiente de buildImgPrompt() (GPT) \u2014
// no la toca ni depende de ella.
//
// [Actualizado 03-jul-2026] Ya NO se reserva la esquina superior derecha.
// Decisi\xF3n: la imagen debe salir completa, igual que la de GPT. El logo
// se resuelve por separado (ver FIX 4 / decisi\xF3n pendiente con Oscar).
function buildImgPromptGeminiFallback() {
  const producto   = document.getElementById('producto').value.trim() || 'smartphone';
  const ciudad     = document.getElementById('ciudad').value || 'Colombia';
  const modo       = document.getElementById('modo')?.value || 'credito';
  const esCiudad   = isCiudadCompleta(ciudad);
  const tiendaInfo = getTiendaInfo(ciudad);
  const nombreCta  = esCiudad ? getCiudadNombre(ciudad) : (tiendaInfo?.nombre || getCiudadNombre(ciudad));
  const estiloCustomVal = document.getElementById('estilo-custom')?.value.trim();

  const colorMap = {
    formal:      'tonos azul marino profundo con acentos turquesa, elegante y confiable',
    costeno:     'luz natural c\xE1lida del Caribe colombiano, vegetaci\xF3n y arquitectura regional cotidiana con acentos coral, terracota, amarillo sol y turquesa; car\xE1cter macondiano sutil y contempor\xE1neo, llamativo sin carnaval, folclor forzado ni postal tur\xEDstica',
    chistoso:    'colores vivos y c\xE1lidos de una tienda cotidiana del Caribe colombiano; humor visual con planteamiento y remate, con adultos de estilo libre cuando aporten al concepto y sin local extranjero',
    minimalista: 'azul marino profundo, mucho espacio en blanco, muy pocos elementos',
    contemporaneo:'azul marino profundo, blanco y turquesa con un \xFAnico neutral c\xE1lido; est\xE9tica editorial actual, limpia y sofisticada, sin neones tecnol\xF3gicos gen\xE9ricos',
    custom:      estiloCustomVal || 'azul marino y turquesa, estilo moderno',
  };
  const colorDesc = colorMap[currentEstilo] || colorMap.formal;
  const detalleDiaGem = getDetalleDelDia(currentEstilo);
  const toqueTropical = currentEstilo === 'costeno'
    ? \`, con como mucho un detalle coste\xF1o sutil y natural (\${detalleDiaGem}) \u2014 nunca varios combinados, para que se vea vida real y no una fiesta armada\`
    : \` \u2014 incorporar este detalle visual, sutil: \${detalleDiaGem}\`;

  // \u2500\u2500 MODOS SIN CELULAR (captaci\xF3n, institucional, jornada) \u2500\u2500
  if (['captacion','institucional','jornada'].includes(modo)) {
    const tipoPersonalizado = document.getElementById('tipo-personalizado')?.value.trim() || '';
    const titularVal   = document.getElementById('img-titular')?.value.trim() || 'Aqu\xED te atendemos bien, siempre.';
    const mensajeVal   = document.getElementById('img-mensaje')?.value.trim() || '';
    const jornadaFecha = document.getElementById('jornada-fecha')?.value.trim() || '';
    const jornadaLugar = document.getElementById('jornada-lugar')?.value.trim() || '';
    const jornadaHora  = document.getElementById('jornada-hora')?.value.trim()  || '';
    const escena = tipoPersonalizado || 'una publicaci\xF3n de marca limpia y atractiva';

    return [
      \`Anuncio publicitario en redes sociales sobre \${escena}\${toqueTropical}.\`,
      \` El fondo es en \${colorDesc}.\`,
      \` En el centro est\xE1 escrito en letras grandes y gruesas el texto "\${titularVal}".\`,
      mensajeVal   ? \` Debajo, en letras m\xE1s peque\xF1as, dice "\${mensajeVal}".\` : '',
      jornadaFecha ? \` En n\xFAmeros muy grandes y destacados aparece la fecha del evento: "\${jornadaFecha}".\` : '',
      jornadaLugar ? \` El nombre del lugar del evento aparece claramente: "\${jornadaLugar}".\` : '',
      jornadaHora  ? \` El horario del evento aparece visible: "\${jornadaHora}".\` : '',
      ' Reserva una sola zona de espacio negativo real para el asset oficial de marca, integrada en la escena; no crees una franja blanca o un encabezado artificial solo para alojarlo. No escribas ni dibujes Creditek ni ning\xFAn logo.',
      \` Composici\xF3n limpia, comercial y llamativa, estilo publicidad moderna, usando todo el lienzo de borde a borde, sin zonas vac\xEDas.\`,
    ].filter(Boolean).join('');
  }

  // \u2500\u2500 MODOS CON CELULAR (cr\xE9dito, promo, tienda, servicio) \u2500\u2500
  const cuota      = document.getElementById('cuota').value.trim();
  const precioEl   = document.getElementById('img-precio');
  const titularEl  = document.getElementById('img-titular');
  const ctaEl      = document.getElementById('img-cta');
  const mensajeVal = document.getElementById('img-mensaje')?.value.trim() || '';
  const inclDir    = !esCiudad && document.getElementById('chk-direccion').checked;
  const dir        = inclDir ? (tiendaInfo?.direccion || DIRECCIONES[ciudad] || null) : null;
  const ctaFallback = dir ? \`Vis\xEDtanos en \${nombreCta} \xB7 \${dir}\` : \`Vis\xEDtanos en \${nombreCta}\`;
  const titular    = titularEl?.value.trim() || (cuota ? \`\xA1Tu celular desde \${cuota}!\` : \`\xA1Vis\xEDtanos en \${nombreCta}!\`);
  const precio     = precioEl?.value.trim() || '';
  const cta        = ctaEl?.value.trim() || ctaFallback;
  const ctaActivo  = document.getElementById('chk-cta-activo')?.checked !== false;

  const knownBrands = ['Samsung','Xiaomi','Motorola','OPPO','Realme','Infinix','Honor','TCL','iPhone','Apple'];
  const detectedBrand = knownBrands.find(b => producto.toLowerCase().includes(b.toLowerCase()));
  const marcaTxt = (detectedBrand && detectedBrand !== 'iPhone' && detectedBrand !== 'Apple')
    ? \` de la marca \${detectedBrand}\` : '';
  // Evita redundancia tipo "un tel\xE9fono celular cualquier celular" cuando el
  // producto es gen\xE9rico (promos sin modelo espec\xEDfico, ej. regalo de accesorios).
  const esOtroProducto = /lavadora|\\bmoto\\b|nevera|televisor|\\btv\\b|estufa|licuadora|parlante|bicicleta|colchon/i.test(producto || '');
  const esGenerico = !producto || producto.toLowerCase() === 'smartphone' || producto.toLowerCase().startsWith('cualquier');
  const productoDesc = esOtroProducto
    ? producto
    : (esGenerico ? 'un tel\xE9fono celular moderno' : \`un tel\xE9fono celular \${producto}\`);

  return [
    \`Fotograf\xEDa publicitaria de \${productoDesc}\${marcaTxt}, en \${colorDesc}\${toqueTropical}.\`,
    \` El tel\xE9fono se ve inequ\xEDvocamente, ocupa al menos una quinta parte de la imagen y est\xE1 grande y bien iluminado, como en una vitrina de tienda. Si aparecen personas, m\xE1ximo dos y deben comparar, probar, recibir o mostrar el producto con gestos naturales; nunca posar o celebrar sin motivo.\`,
    \` Escrito en letras grandes y gruesas est\xE1 el texto "\${titular}".\`,
    mensajeVal ? \` Debajo, en letras m\xE1s peque\xF1as, dice "\${mensajeVal}".\` : '',
    precio ? \` En n\xFAmeros grandes en color turquesa aparece "\${precio}".\` : '',
    ctaActivo ? \` En la parte inferior hay un bot\xF3n turquesa que dice "\${cta}".\` : '',
    ' Reserva una sola zona de espacio negativo real para el asset oficial de marca, integrada en la escena (superior, inferior o lateral seg\xFAn el contenido). No crees una franja blanca o un encabezado artificial solo para alojarlo; no escribas ni dibujes Creditek ni ning\xFAn logo.',
    \` Composici\xF3n comercial, limpia y llamativa, estilo publicidad de retail, usando todo el lienzo con intenci\xF3n y manteniendo aire seguro alrededor de textos, rostros, producto y zona de marca.\`,
  ].filter(Boolean).join('');
}

// \u2500\u2500 TRADUCTOR CON CLAUDE PARA GEMINI (Fix 5, 02-jul-2026) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// En vez de una plantilla fija, le pedimos a Claude Sonnet 4.6 (ya configurado
// en este Hub \u2014 mismo patr\xF3n que corregirMensajeSecundario()) que redacte una
// escena narrativa rica para Imagen 4, a partir de los mismos datos de negocio.
// Si la llamada segura a Claude falla, cae autom\xE1ticamente al
// template est\xE1tico de Fix 3 (buildImgPromptGeminiFallback) \u2014 nunca bloquea
// la generaci\xF3n.
async function buildImgPromptGemini() {

  const producto = document.getElementById('producto').value.trim() || 'smartphone';
  const modo     = document.getElementById('modo')?.value || 'credito';
  const estiloCustomVal = document.getElementById('estilo-custom')?.value.trim();
  const detalleDiaClaude = getDetalleDelDia(currentEstilo);
  const estiloDescMap = {
    formal:      \`profesional, confiable, elegante \u2014 incorporar este detalle visual: \${detalleDiaClaude}\`,
    costeno:     \`caribe\xF1o colombiano comercial, luminoso y c\xE1lido \u2014 sensibilidad macondiana contempor\xE1nea expresada con luz de tarde, vegetaci\xF3n y arquitectura regional cotidiana, no con fiesta ni disfraces. Escena plausible: \${detalleDiaClaude}. Acentos coral, terracota, amarillo sol y turquesa controlados; nunca fondo l\xFAgubre, plantilla corporativa ni clich\xE9s tur\xEDsticos apilados\`,
    chistoso:    \`humor visual actual del Caribe colombiano con planteamiento y remate ligados al producto. Si el concepto parte de una tendencia o meme, transforma solo su mecanismo c\xF3mico en una escena original; nunca copies imagen, texto, personajes, creador, celebridad ni logos. Sonre\xEDr, posar o ser sensual no cuenta por s\xED solo como chiste. Escena: \${detalleDiaClaude}. Se permiten adultos atractivos o sensuales con tratamiento elegante, no expl\xEDcito y no degradante. Sin objetificaci\xF3n, estereotipos, boutique estadounidense, centro comercial de lujo ni arquitectura bogotana gen\xE9rica\`,
    minimalista: \`minimalista, mucho espacio en blanco, sereno \u2014 un solo elemento visual: \${detalleDiaClaude}\`,
    contemporaneo:\`editorial contempor\xE1neo y comercial \u2014 fotograf\xEDa aut\xE9ntica, encuadre asim\xE9trico, contraste de escala, producto inequ\xEDvoco y m\xE1ximo dos personas con funci\xF3n narrativa; sin poses exageradas, plantillas repetidas ni neones gen\xE9ricos. Incorporar de forma secundaria: \${detalleDiaClaude}\`,
    custom:      estiloCustomVal || 'moderno',
  };
  const estiloDesc = estiloDescMap[currentEstilo] || estiloDescMap.formal;

  let titular, mensajeVal, precio, cta, jornadaFecha, jornadaLugar, jornadaHora;
  if (['captacion','institucional','jornada'].includes(modo)) {
    titular      = document.getElementById('img-titular')?.value.trim() || 'Aqu\xED te atendemos bien, siempre.';
    mensajeVal   = document.getElementById('img-mensaje')?.value.trim() || '';
    precio       = '';
    jornadaFecha = document.getElementById('jornada-fecha')?.value.trim() || '';
    jornadaLugar = document.getElementById('jornada-lugar')?.value.trim() || '';
    jornadaHora  = document.getElementById('jornada-hora')?.value.trim()  || '';
    cta          = document.getElementById('chk-cta-activo')?.checked !== false
                   ? (document.getElementById('img-cta')?.value.trim() || 'S\xEDguenos en Creditek') : '';
  } else {
    jornadaFecha = '';
    jornadaLugar = '';
    jornadaHora  = '';
    const cuota      = document.getElementById('cuota').value.trim();
    const ciudad     = document.getElementById('ciudad').value || 'Colombia';
    const esCiudad   = isCiudadCompleta(ciudad);
    const tiendaInfo = getTiendaInfo(ciudad);
    const nombreCta  = esCiudad ? getCiudadNombre(ciudad) : (tiendaInfo?.nombre || getCiudadNombre(ciudad));
    titular    = document.getElementById('img-titular')?.value.trim() || (cuota ? \`\xA1Tu celular desde \${cuota}!\` : \`\xA1Vis\xEDtanos en \${nombreCta}!\`);
    mensajeVal = document.getElementById('img-mensaje')?.value.trim() || '';
    precio     = document.getElementById('img-precio')?.value.trim() || '';
    cta        = document.getElementById('chk-cta-activo')?.checked !== false
                   ? (document.getElementById('img-cta')?.value.trim() || \`Vis\xEDtanos en \${nombreCta}\`) : '';
  }

  const instruccion = \`Eres un Director de Arte experto en prompt engineering para modelos de difusi\xF3n de Google (Imagen 4 / Gemini). Tu objetivo es recibir un brief de dise\xF1o y traducirlo a UN SOLO p\xE1rrafo narrativo en espa\xF1ol de m\xE1ximo 80 palabras.

REGLA DE MARCA: no renderices el logo ni escribas la palabra Creditek. Reserva una sola zona de branding integrada en espacio negativo real (superior, inferior o lateral seg\xFAn la escena); no crees una franja blanca o un encabezado artificial solo para alojarlo. El asset oficial se a\xF1adir\xE1 despu\xE9s una \xFAnica vez.

RESTRICCIONES ESTRICTAS \u2014 NUNCA incluyas en tu salida:
- Palabras t\xE9cnicas: "capa", "layout", "composici\xF3n", "vector", "PNG", "feed", "1080px"
- C\xF3digos hex ni tama\xF1os en puntos. Trad\xFAcelos: azul marino oscuro, letras muy grandes
- Nombres de tipograf\xEDas. Usa: tipograf\xEDa sans-serif gruesa y moderna
- Comillas dobles para NADA excepto texto literal a renderizar en la imagen

F\xD3RMULA OBLIGATORIA \u2014 escribe en este orden exacto:
1. ESCENA BASE: tipo de imagen y est\xE9tica general
2. SUJETO PRINCIPAL: cuando el brief mencione un celular o producto, debe verse inequ\xEDvocamente y dominar el primer plano; la persona interact\xFAa con \xE9l de forma comercial real (comparar, probar, recibir o mostrar), nunca como decoraci\xF3n. M\xE1ximo dos personas, ambas con funci\xF3n narrativa. Personas colombianas de clase media trabajadora en ambiente comercial digno. Vestuario casual contempor\xE1neo real de la Costa Caribe colombiana. Gestos naturales, nunca celebraci\xF3n exagerada, disfraz folcl\xF3rico, carnaval, estampados excesivos, pobreza ni tienda humilde.
3. ENTORNO: ambiente, colores, accesorios.
4. TEXTOS: cada texto como objeto f\xEDsico con ubicaci\xF3n exacta usando la f\xF3rmula: "en [ubicaci\xF3n] est\xE1 escrito el texto [TEXTO ENTRE COMILLAS]". No incluyas logos ni nombres de marca.
5. ILUMINACI\xD3N: calidad fotogr\xE1fica, vibrante, profesional. Conserva aire alrededor de textos, producto, rostros y futura marca; no pegues elementos a los bordes.

BRIEF DE LA PIEZA:
Producto: \${producto}
Estilo/tono: \${estiloDesc}
Titular: \${titular}
\${mensajeVal ? \`Mensaje secundario: \${mensajeVal}\` : ''}
\${precio ? \`Precio/cuota: \${precio}\` : ''}
\${cta ? \`CTA (bot\xF3n): \${cta} \u2014 bot\xF3n en turquesa de marca (nunca el verde gen\xE9rico de WhatsApp)\` : ''}
\${jornadaFecha ? \`Fecha del evento: \${jornadaFecha}\` : ''}
\${jornadaLugar ? \`Lugar: \${jornadaLugar}\` : ''}
\${jornadaHora  ? \`Horario: \${jornadaHora}\` : ''}

Responde SOLO con el prompt final. Sin explicaciones, sin markdown.\`;

  try {
    const res = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
      method: 'POST',
      headers: {'Authorization':'Bearer ' + (await auraSessionToken() || ''),'Content-Type':'application/json'},
      body: JSON.stringify({model:'claude-sonnet-4-6', max_tokens: 400, messages:[{role:'user', content: instruccion}]})
    });
    const data = await res.json();
    const promptGenerado = data.content?.find(b=>b.type==='text')?.text?.trim() || '';
    if (promptGenerado && promptGenerado.length > 30) return promptGenerado;
    return buildImgPromptGeminiFallback();
  } catch(e) {
    return buildImgPromptGeminiFallback();
  }
}

// \u2500\u2500 PIPELINE v4d (07-jul-2026): variante "solo foto" para Gemini \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Gemini genera \xDANICAMENTE la fotograf\xEDa de escena \u2014 sin texto, sin logo.
// GPT compone titular/precio/CTA/logo encima en el paso 2 del pipeline
// (ver generarConPipelineGeminiGPT() m\xE1s abajo). Reutiliza la misma l\xF3gica
// de escena/sujeto/estilo de buildImgPromptGemini(), quitando los bloques
// de texto y cualquier reserva de esquina para el logo.
async function buildImgPromptGeminiFotoLimpia() {
  const producto = document.getElementById('producto').value.trim() || 'smartphone';
  const estiloCustomVal = document.getElementById('estilo-custom')?.value.trim();
  const detalleDiaClaude = getDetalleDelDia(currentEstilo);
  const estiloDescMap = {
    formal:      \`profesional, confiable, elegante \u2014 incorporar este detalle visual: \${detalleDiaClaude}\`,
    costeno:     \`caribe\xF1o colombiano comercial, luminoso y c\xE1lido \u2014 sensibilidad macondiana contempor\xE1nea expresada con luz de tarde, vegetaci\xF3n y arquitectura regional cotidiana, no con fiesta ni disfraces. Escena plausible: \${detalleDiaClaude}. Acentos coral, terracota, amarillo sol y turquesa controlados; nunca fondo l\xFAgubre, plantilla corporativa ni clich\xE9s tur\xEDsticos apilados\`,
    chistoso:    \`humor visual actual del Caribe colombiano con planteamiento y remate ligados al producto. Si el concepto parte de una tendencia o meme, transforma solo su mecanismo c\xF3mico en una escena original; nunca copies imagen, texto, personajes, creador, celebridad ni logos. Sonre\xEDr, posar o ser sensual no cuenta por s\xED solo como chiste. Escena: \${detalleDiaClaude}. Se permiten adultos atractivos o sensuales con tratamiento elegante, no expl\xEDcito y no degradante. Sin objetificaci\xF3n, estereotipos, boutique estadounidense, centro comercial de lujo ni arquitectura bogotana gen\xE9rica\`,
    minimalista: \`minimalista, mucho espacio en blanco, sereno \u2014 un solo elemento visual: \${detalleDiaClaude}\`,
    contemporaneo:\`editorial contempor\xE1neo y comercial \u2014 fotograf\xEDa aut\xE9ntica, encuadre asim\xE9trico, contraste de escala, producto protagonista y m\xE1ximo dos personas con funci\xF3n narrativa; sin poses exageradas, plantillas repetidas ni neones gen\xE9ricos. Incorporar de forma secundaria: \${detalleDiaClaude}\`,
    custom:      estiloCustomVal || 'moderno',
  };
  const estiloDesc = estiloDescMap[currentEstilo] || estiloDescMap.formal;

  const fallbackEstatico = () => {
    const colorMap = {
      formal:      'tonos azul marino profundo con acentos turquesa, elegante y confiable',
      costeno:     'luz natural c\xE1lida del Caribe colombiano, vegetaci\xF3n y arquitectura regional cotidiana con acentos coral, terracota, amarillo sol y turquesa; car\xE1cter macondiano sutil y contempor\xE1neo, llamativo sin carnaval, folclor forzado ni postal tur\xEDstica',
      chistoso:    'colores vivos y c\xE1lidos de una tienda cotidiana del Caribe colombiano; humor visual con planteamiento y remate, con adultos de estilo libre cuando aporten al concepto y sin local extranjero',
      minimalista: 'azul marino profundo, mucho espacio en blanco, muy pocos elementos',
      contemporaneo:'azul marino profundo, blanco y turquesa con un \xFAnico neutral c\xE1lido; fotograf\xEDa editorial actual y sofisticada, sin neones tecnol\xF3gicos gen\xE9ricos',
      custom:      estiloCustomVal || 'azul marino y turquesa, estilo moderno',
    };
    const colorDesc = colorMap[currentEstilo] || colorMap.formal;
    return \`Fotograf\xEDa publicitaria realista de \${producto}, en \${colorDesc}. El producto se ve grande y bien iluminado, como en una vitrina de tienda. Composici\xF3n fotogr\xE1fica limpia, comercial, sin ning\xFAn texto, letra o logo en la imagen \u2014 solo la escena. Usar todo el lienzo de borde a borde, sin zonas vac\xEDas.\`;
  };


  const instruccion = \`Eres un Director de Arte experto en prompt engineering para modelos de difusi\xF3n de Google (Imagen 4 / Gemini). Tu objetivo es describir SOLO una fotograf\xEDa de escena \u2014 SIN NING\xDAN TEXTO, SIN LOGO \u2014 en UN SOLO p\xE1rrafo narrativo en espa\xF1ol de m\xE1ximo 60 palabras. El texto y el logo se agregan despu\xE9s con otro motor; tu escena debe quedar completamente limpia para eso.

RESTRICCIONES ESTRICTAS \u2014 NUNCA incluyas en tu salida:
- Ning\xFAn texto a renderizar, ninguna palabra entre comillas, ning\xFAn titular ni CTA
- Ninguna menci\xF3n de logo, marca Creditek escrita, ni zona reservada para nada
- Palabras t\xE9cnicas: "capa", "layout", "composici\xF3n", "vector", "PNG", "feed", "1080px"
- C\xF3digos hex ni tama\xF1os en puntos. Trad\xFAcelos: azul marino oscuro
- Nombres de tipograf\xEDas

F\xD3RMULA OBLIGATORIA \u2014 escribe en este orden exacto:
1. ESCENA BASE: tipo de fotograf\xEDa y est\xE9tica general
2. SUJETO PRINCIPAL: cuando el brief mencione un celular o producto, debe dominar el primer plano y verse inequ\xEDvocamente. M\xE1ximo dos personas, ambas comparando, probando, recibiendo o mostrando el producto con gestos naturales. Personas colombianas de clase media trabajadora en ambiente comercial digno, con ropa casual contempor\xE1nea real de la Costa Caribe colombiana. NUNCA celebraci\xF3n exagerada, pose decorativa, disfraz folcl\xF3rico, carnaval, pobreza, tienda humilde ni ropa desgastada.
3. ENTORNO E ILUMINACI\xD3N: ambiente, colores, accesorios, calidad fotogr\xE1fica vibrante y profesional

BRIEF DE LA PIEZA:
Producto: \${producto}
Estilo/tono: \${estiloDesc}

Responde SOLO con el prompt final. Sin explicaciones, sin markdown.\`;

  try {
    const res = await fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/anthropic/messages', {
      method: 'POST',
      headers: {'Authorization':'Bearer ' + (await auraSessionToken() || ''),'Content-Type':'application/json'},
      body: JSON.stringify({model:'claude-sonnet-4-6', max_tokens: 300, messages:[{role:'user', content: instruccion}]})
    });
    const data = await res.json();
    const promptGenerado = data.content?.find(b=>b.type==='text')?.text?.trim() || '';
    if (promptGenerado && promptGenerado.length > 20) return promptGenerado;
    return fallbackEstatico();
  } catch(e) {
    return fallbackEstatico();
  }
}


// \u2500\u2500 Sistema de referencias visuales del mercado \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const BRAND_COLORS = {
  'Samsung CO':  { primary: '#1428A0', label: 'navy blue \u2014 premium tech' },
  'Xiaomi CO':   { primary: '#FF6900', label: 'orange \u2014 energetic youth' },
  'Motorola CO': { primary: '#005A9C', label: 'corporate blue \u2014 trusted' },
  'OPPO CO':     { primary: '#1D4289', label: 'deep blue \u2014 premium' },
  'Realme CO':   { primary: '#FFD700', label: 'gold \u2014 value flagship' },
  'Honor CO':    { primary: '#C8102E', label: 'red \u2014 bold tech' },
  'Infinix CO':  { primary: '#FF0000', label: 'red \u2014 youthful energy' },
  'TCL CO':      { primary: '#E4002B', label: 'red \u2014 approachable value' },
  'PayJoy CO':   { primary: '#00A651', label: 'green \u2014 accessible credit' },
  'Krediya':     { primary: '#FF6B00', label: 'orange \u2014 plataforma de cr\xE9dito aliada' },
  'Addi CO':     { primary: '#A259FF', label: 'purple \u2014 modern BNPL' },
  'Alo Credit':  { primary: '#00B4D8', label: 'cyan \u2014 digital credit' },
};
const MARKET_REFS = [
  ['Samsung CO',  'https://www.samsung.com/co/smartphones/'],
  ['Xiaomi CO',   'https://www.mi.com/co'],
  ['Motorola CO', 'https://www.motorola.com/co/smartphones'],
  ['OPPO CO',     'https://www.oppo.com/co/smartphones/'],
  ['Realme CO',   'https://www.realme.com/co/smartphones/'],
  ['TCL CO',      'https://www.tcl.com/co/es/smartphones.html'],
  ['Infinix CO',  'https://www.infinixmobility.com/co'],
  ['Honor CO',    'https://www.honor.com/co/phones/'],
  ['PayJoy CO',   'https://www.payjoy.com/co'],
  ['Krediya',     'https://www.krediya.com.co'],
  ['Addi CO',     'https://www.addi.com/co'],
  ['Alo Credit',  'https://www.alocredit.co'],
];
const REFS_TTL = 15 * 24 * 60 * 60 * 1000;
let refsCancelled = false;

function extractKeywords(html) {
  const parts = [];
  const t = html.match(/<title[^>]*>([^<]{3,80})<\\/title>/i);
  if (t) parts.push(t[1].trim());
  const d = html.match(/name=["']description["'][^>]*content=["']([^"']{10,120})/i) ||
            html.match(/content=["']([^"']{10,120})["'][^>]*name=["']description["']/i);
  if (d) parts.push(d[1].trim());
  const h = html.match(/<h1[^>]*>([^<]{3,60})<\\/h1>/i);
  if (h) parts.push(h[1].replace(/<[^>]+>/g,'').trim());
  return parts.filter(Boolean).join(' | ').slice(0,160);
}

async function fetchWithTimeout(url, ms=4000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid); return r;
  } catch(e) { clearTimeout(tid); throw e; }
}

async function fetchBrandKeywords(url) {
  const proxy = \`https://api.allorigins.win/get?url=\${encodeURIComponent(url)}\`;
  const res = await fetchWithTimeout(proxy);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const data = await res.json();
  return extractKeywords(data.contents || '');
}

function getRefBlock() {
  const stored = JSON.parse(localStorage.getItem('ck_referencias') || 'null');
  const colorLines = Object.entries(BRAND_COLORS)
    .map(([name, c]) => \`- \${name}: \${c.primary} (\${c.label})\`).join('\\n');
  const kwLines = stored?.brands
    ? Object.entries(stored.brands).filter(([,d]) => d.keywords)
        .map(([name, d]) => \`- \${name}: \${d.keywords.slice(0,100)}\`).join('\\n')
    : '';
  const kwBlock = kwLines ? \`\\nMarket keywords (live):\\n\${kwLines}\` : '';

  // Enriquecimiento autom\xE1tico: si el producto coincide con un modelo guardado,
  // agregar nombre y specs al prompt. Nunca incluir precioLista \u2014 el precio
  // siempre viene del formulario del usuario.
  let modelBlock = '';
  if (stored?.brands) {
    const producto = (document.getElementById('producto')?.value || '').trim().toLowerCase();
    if (producto.length > 3) {
      outer: for (const [, d] of Object.entries(stored.brands)) {
        for (const m of (d.modelos || [])) {
          const n = m.nombre.toLowerCase();
          if (n.includes(producto) || producto.includes(n.split(' ').slice(0, 3).join(' '))) {
            const specsStr = m.specs ? Object.values(m.specs).join(', ') : '';
            modelBlock = \`\\nModelo de referencia: \${m.nombre}\${specsStr ? \` \u2014 \${specsStr}\` : ''}\`;
            break outer;
          }
        }
      }
    }
  }

  return \`\\n\\nCOLOMBIAN PHONE MARKET VISUAL CONTEXT:\\nBrand colors for reference (use as market context only):\\n\${colorLines}\${kwBlock}\${modelBlock}\\nNOTA: Los colores de marca Creditek (#0B1E3D + #00C4CC) siempre tienen prioridad. TODOS los textos en la imagen deben estar en espa\xF1ol colombiano, nunca en ingl\xE9s.\`;
}

function formatRefAge(ts) {
  const days = Math.floor((Date.now() - ts) / (24*60*60*1000));
  if (days === 0) return 'keywords actualizadas hoy';
  if (days === 1) return 'keywords hace 1 d\xEDa';
  return \`keywords hace \${days} d\xEDas\`;
}

function renderRefStatus() {
  const stored = JSON.parse(localStorage.getItem('ck_referencias') || 'null');
  const statusEl  = document.getElementById('refs-status');
  const listEl    = document.getElementById('refs-brand-list');
  const imagesEl  = document.getElementById('refs-images');
  if (!statusEl) return;
  if (!stored) {
    statusEl.textContent = 'Colores de marca activos \u2014 keywords sin obtener';
    statusEl.className = 'refs-status-txt';
    if (listEl)   listEl.style.display   = 'none';
    if (imagesEl) imagesEl.style.display = 'none';
    return;
  }
  const stale = (Date.now() - stored.timestamp) > REFS_TTL;
  statusEl.textContent = stale
    ? \`\u26A0 \${formatRefAge(stored.timestamp)} \u2014 actualizar recomendado\`
    : formatRefAge(stored.timestamp);
  statusEl.className = 'refs-status-txt' + (stale ? ' refs-stale' : '');
  if (listEl && stored.brands) {
    listEl.innerHTML = Object.entries(stored.brands)
      .filter(([n]) => !n.endsWith(' MX'))
      .map(([n, d]) => {
        const hasLive   = (d.keywords?.length > 0) || d.src === 'live';
        const hasStatic = (d.modelos?.length > 0)  || !!d.finInfo;
        const dotClass  = hasLive ? 'refs-dot-live' : hasStatic ? 'refs-dot-static' : 'refs-dot-fail';
        return \`<div class="refs-brand-item"><span class="refs-brand-dot \${dotClass}"></span>\${n}</div>\`;
      }).join('');
    listEl.style.display = 'block';
  }
  if (imagesEl) imagesEl.style.display = 'none';
}

function cancelarReferencias() {
  refsCancelled = true;
  document.getElementById('refs-cancel-btn').style.display = 'none';
  document.getElementById('refs-update-btn').disabled = false;
  document.getElementById('refs-status').textContent = 'Actualizaci\xF3n cancelada';
}

async function actualizarReferencias() {
  refsCancelled = false;
  const btn       = document.getElementById('refs-update-btn');
  const cancelBtn = document.getElementById('refs-cancel-btn');
  const statusEl  = document.getElementById('refs-status');
  btn.disabled = true;
  cancelBtn.style.display = 'inline-block';

  // Lanzar fetch de im\xE1genes al Worker en paralelo (no bloqueante)
  const workerImagesPromise = fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/brand-references')
    .then(r => r.json()).catch(() => ({ results: [] }));

  // Fetch de keywords secuencial (comportamiento existente)
  const total = MARKET_REFS.length;
  const brands = {};
  for (let i = 0; i < total; i++) {
    if (refsCancelled) break;
    const [name, url] = MARKET_REFS[i];
    statusEl.textContent = \`Obteniendo keywords \${i + 1}/\${total}: \${name}...\`;
    try { brands[name] = { url, keywords: await fetchBrandKeywords(url) }; }
    catch(e) { brands[name] = { url, keywords: '' }; }
  }

  if (!refsCancelled) {
    // Recoger im\xE1genes del Worker (probablemente ya termin\xF3 mientras se buscaban keywords)
    statusEl.textContent = 'Obteniendo im\xE1genes de referencia...';
    const workerData = await workerImagesPromise;
    if (workerData?.results) {
      for (const r of workerData.results) {
        // Guardar nombre, specs e imagenRef. precioLista se descarta \u2014 el precio viene del formulario.
        const modelos = (r.modelos || []).map(({ nombre, specs, imagenRef }) => ({ nombre, specs, imagenRef }));
        const src = r.url === 'static' ? 'static'
          : (r.url === 'google-shopping' || r.url === 'amazon-mx') ? (modelos.length > 0 ? 'live' : 'static')
          : (r.url && r.status === 200 && modelos.length > 0) ? 'live' : 'static';
        if (brands[r.marca]) { brands[r.marca].modelos = modelos; brands[r.marca].src = src; }
        else brands[r.marca] = { url: r.url || '', keywords: '', modelos, src };
      }
    }
    if (workerData?.financieras) {
      for (const [nombre, info] of Object.entries(workerData.financieras)) {
        if (!brands[nombre]) brands[nombre] = { url: info.url || '', keywords: '' };
        brands[nombre].finInfo = info;
      }
    }
    localStorage.setItem('ck_referencias', JSON.stringify({ timestamp: Date.now(), brands }));
    showToast('\u2713 Referencias del mercado actualizadas');
  }
  renderRefStatus();
  btn.disabled = false;
  cancelBtn.style.display = 'none';
  buildImgPrompt();
}

function showImgSection() {
  document.getElementById('img-section').classList.add('visible');
  document.getElementById('canva-brief-panel').style.display = 'none';
  document.getElementById('canva-btn').classList.remove('active');
  resetPreviewFields();
  updateImgKeyStatus();
  syncModelUI();
  loadLogoBase64().catch(() => { /* la precarga no bloquea; generar mostrar\xE1 el error accionable */ });
  // Refresh brand-refs modelos + financieras cache silently in background
  fetch('https://creditek-gemini-proxy.comercial-853.workers.dev/brand-references')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      const stored = JSON.parse(localStorage.getItem('ck_referencias') || '{"brands":{}}');
      const brands = stored.brands || {};
      for (const r of (data.results || [])) {
        const modelos = (r.modelos || []).map(({ nombre, specs, imagenRef }) => ({ nombre, specs, imagenRef }));
        const src = r.url === 'static' ? 'static'
          : (r.url === 'google-shopping' || r.url === 'amazon-mx') ? (modelos.length > 0 ? 'live' : 'static')
          : (r.url && r.status === 200 && modelos.length > 0) ? 'live' : 'static';
        if (brands[r.marca]) { brands[r.marca].modelos = modelos; brands[r.marca].src = src; }
        else brands[r.marca] = { url: r.url || '', keywords: '', modelos, src };
      }
      for (const [nombre, info] of Object.entries(data.financieras || {})) {
        if (!brands[nombre]) brands[nombre] = { url: info.url || '', keywords: '' };
        brands[nombre].finInfo = info;
      }
      localStorage.setItem('ck_referencias', JSON.stringify({ timestamp: Date.now(), brands }));
    })
    .catch(() => {});
}

let imageGenerationInFlight = false;
function beginImageGeneration() {
  if (imageGenerationInFlight) return false;
  imageGenerationInFlight = true;
  return true;
}
function finishImageGeneration() {
  imageGenerationInFlight = false;
}

async function generarImagen(callerBtn = null) {
  if (!beginImageGeneration()) return;
  // FIX v4e (06-jul-2026): feedback visual INMEDIATO al hacer clic \u2014
  // antes, corregirMensajeSecundario() corr\xEDa primero y dejaba el bot\xF3n
  // "muerto" 2-5 segundos sin ninguna se\xF1al para el usuario.
  const btn = document.getElementById('img-gen-btn');
  const spinner = document.getElementById('img-spinner');
  const label = document.getElementById('img-gen-label');
  const visibleBtn = callerBtn || btn;
  const resultDiv = document.getElementById('img-result');
  const errDiv = document.getElementById('img-err');

  visibleBtn.disabled = true;
  const originalLabel = callerBtn ? visibleBtn.textContent : null;
  if (callerBtn) visibleBtn.textContent = '\u23F3 Generando\u2026';
  spinner.style.display = 'block'; label.textContent = '\u23F3 Generando\u2026';
  resultDiv.style.display = 'none'; errDiv.style.display = 'none';

  try {
    // El estado debe pintarse antes de cualquier correcci\xF3n o llamada de red.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    label.textContent = 'Corrigiendo texto...';
    await corregirMensajeSecundario();
    label.textContent = 'Generando imagen...'; // avanza el mensaje de estado a la fase de imagen

    const isWorkerEngine = currentEngine === 'recraft';
    const key = '';

    const prompt = document.getElementById('img-prompt-ta').value.trim();
    if (!prompt) return;
    // FIX v4f (06-jul-2026): buildImgPromptGemini() hace su propia llamada de red
    // (redacci\xF3n del prompt visual v\xEDa Claude) \u2014 sin este mensaje, el label se
    // queda est\xE1tico varios segundos dando sensaci\xF3n de que no est\xE1 avanzando.
    if (isWorkerEngine) label.textContent = 'Preparando fotograf\xEDa humana...';

    lastImgModelLabel = currentEngine === 'recraft' ? 'Recraft V4.1' : 'GPT Image 2.5 Flare';
    const src = currentEngine === 'recraft'
      ? await generarConRecraft(prompt)
      : await generarConDalle(key, prompt);
    imgHistory = [src];
    imgHistoryIdx = 0;
    mostrarImgVersion(src);
    resultDiv.style.display = 'block';
    document.getElementById('img-model-lbl').textContent = \`Generado con \${lastImgModelLabel}\`;
    document.getElementById('img-editor').style.display = 'block';
    renderImgHistoryNav();
    showToast('\u2713 Imagen generada correctamente');
  } catch(err) {
    errDiv.textContent = err.message || 'Error al generar imagen. Verifica tu sesi\xF3n.';
    errDiv.style.display = 'block';
    showToast(err.message || 'Error al generar imagen', '#ef4444');
  } finally {
    visibleBtn.disabled = false;
    if (callerBtn && originalLabel) visibleBtn.textContent = originalLabel;
    spinner.style.display = 'none'; label.textContent = '\u{1F5BC} Generar imagen';
    finishImageGeneration();
  }
}

// \u2500\u2500 COMPOSICI\xD3N DEL LOGO OFICIAL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function quitarFondoBlancoDelLogo(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const max = Math.max(px[i], px[i + 1], px[i + 2]);
    const min = Math.min(px[i], px[i + 1], px[i + 2]);
    if (min > 238 && max - min < 14) px[i + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
}

function puntajeZonaLogo(ctx, x, y, width, height) {
  const sample = ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height))).data;
  let brightness = 0, variation = 0, previous = null;
  for (let i = 0; i < sample.length; i += 16) {
    const luminance = (sample[i] * 0.2126 + sample[i + 1] * 0.7152 + sample[i + 2] * 0.0722) / 255;
    brightness += luminance;
    if (previous !== null) variation += Math.abs(luminance - previous);
    previous = luminance;
  }
  const average = brightness / Math.max(1, sample.length / 16);
  const flatLightPenalty = average > 0.9 && variation < 0.08 ? 0.8 : 0;
  return variation + Math.abs(average - 0.58) * 0.18 + flatLightPenalty;
}

function elegirUbicacionLogo(ctx, canvas, logoWidth, logoHeight) {
  const margin = canvas.width * 0.032;
  const candidates = [
    [margin, margin], [canvas.width - logoWidth - margin, margin],
    [margin, canvas.height - logoHeight - margin], [canvas.width - logoWidth - margin, canvas.height - logoHeight - margin],
    [margin, (canvas.height - logoHeight) / 2], [canvas.width - logoWidth - margin, (canvas.height - logoHeight) / 2],
    [(canvas.width - logoWidth) / 2, canvas.height - logoHeight - margin],
  ];
  return candidates.map(([x, y]) => ({ x, y, score: puntajeZonaLogo(ctx, x, y, logoWidth, logoHeight) })).sort((a, b) => a.score - b.score)[0];
}

function luminosidadZonaLogo(ctx, x, y, width, height) {
  const data = ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height))).data;
  let total = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 16) {
    total += (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    samples++;
  }
  return total / Math.max(1, samples);
}

function adaptarLogoAFondoOscuro(logoCtx, width, height) {
  // Conserva el check turquesa oficial y convierte \xFAnicamente el wordmark
  // azul marino a blanco. Es la misma marca para fondos oscuros, no una caja.
  const imageData = logoCtx.getImageData(0, 0, width, height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const max = Math.max(px[i], px[i + 1], px[i + 2]);
    const min = Math.min(px[i], px[i + 1], px[i + 2]);
    if (max < 118 && max - min < 84) {
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
    }
  }
  logoCtx.putImageData(imageData, 0, 0);
}

function calcularDimensionesLogo(ctx, canvas, logoCanvas) {
  const base = Math.min(canvas.width, canvas.height);
  const margin = Math.max(16, Math.round(base * 0.032));
  const initialWidth = Math.max(base * 0.215, Math.min(base * 0.255, canvas.width * 0.235));
  const initialHeight = initialWidth * (logoCanvas.height / logoCanvas.width);
  const zone = elegirUbicacionLogo(ctx, canvas, initialWidth, initialHeight);
  const complexity = Math.min(1, Math.max(0, zone.score / 1.45));
  const ratio = 0.26 - complexity * 0.035;
  const maxWidth = Math.max(1, canvas.width - margin * 2);
  const logoWidth = Math.min(maxWidth, Math.min(base * 0.29, Math.max(base * 0.215, canvas.width * ratio)));
  return { logoWidth, logoHeight: logoWidth * (logoCanvas.height / logoCanvas.width) };
}

async function componerLogoSobreImagen(dataUrlImagen) {
  const logo = await loadLogoBase64();
  if (!logo) throw new Error('No se pudo cargar el logo oficial de Creditek. La imagen no se entregar\xE1 sin marca.');
  return new Promise((resolve, reject) => {
    const imgBase = new Image();
    imgBase.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = imgBase.width; canvas.height = imgBase.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgBase, 0, 0);
      const imgLogo = new Image();
      imgLogo.onload = () => {
        try {
          const logoCanvas = document.createElement('canvas');
          logoCanvas.width = imgLogo.width; logoCanvas.height = imgLogo.height;
          const logoCtx = logoCanvas.getContext('2d', { willReadFrequently: true });
          logoCtx.drawImage(imgLogo, 0, 0);
          quitarFondoBlancoDelLogo(logoCtx, logoCanvas.width, logoCanvas.height);
          const { logoWidth: logoAncho, logoHeight: logoAlto } = calcularDimensionesLogo(ctx, canvas, logoCanvas);
          const pos = elegirUbicacionLogo(ctx, canvas, logoAncho, logoAlto);
          if (luminosidadZonaLogo(ctx, pos.x, pos.y, logoAncho, logoAlto) < 0.54) {
            adaptarLogoAFondoOscuro(logoCtx, logoCanvas.width, logoCanvas.height);
          }
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.32)';
          ctx.shadowBlur = Math.max(6, canvas.width * 0.009);
          ctx.shadowOffsetY = Math.max(1, canvas.width * 0.002);
          ctx.drawImage(logoCanvas, pos.x, pos.y, logoAncho, logoAlto);
          ctx.restore();
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(new Error('No se pudo aplicar el logo oficial de Creditek. La imagen no se entregar\xE1 sin marca.'));
        }
      };
      imgLogo.onerror = () => reject(new Error('No se pudo aplicar el logo oficial de Creditek. La imagen no se entregar\xE1 sin marca.'));
      imgLogo.src = logo;
    };
    imgBase.onerror = () => reject(new Error('No se pudo validar la imagen generada. La pieza no se habilit\xF3.'));
    imgBase.src = dataUrlImagen;
  });
}

const IMAGE_WORKER_URL = 'https://creditek-gemini-proxy.comercial-853.workers.dev';
const GPT_BRANDING_GUARD = 'BRANDING LOCK: generate with NO logo, NO word Creditek, NO brand name and NO interpreted mark. Do not draw a placeholder, rectangle, white panel, badge or empty frame for branding; leave only natural negative space. The official asset is composited after generation exactly once.';
const COMMERCIAL_DESIGN_CONTRACT = \`COMMERCIAL DESIGN CONTRACT \u2014 MANDATORY:
- This is a paid social advertisement whose primary purpose is to stop the scroll and sell the specified product or offer.
- Deliver a contemporary 2026 retail campaign concept, not a generic corporate flyer, presentation slide or rigid template.
- Establish an immediate visual hook, a clear product/people focal point, strong hierarchy and a CTA readable on a mobile screen.
- Use intentional contrast, depth, scale, asymmetry and controlled color accents. Avoid a flat navy background occupying most of the canvas.
- Preserve generous but purposeful breathing room. Never stack every text element in one centered column.
- Show authentic Colombian Caribbean adults naturally interacting with the product when people are requested. Casting may be ordinary, attractive, glamorous or sensual when relevant; keep it tasteful, clearly adult and non-explicit, with agency and product relevance. Avoid minors, nudity, degrading or objectifying framing, stock-photo smiles and empty streets.
- Render only the exact approved Spanish copy. Never invent urgency badges such as SOLO HOY, prices, discounts, dates or claims.
- Reserve natural negative space for the official Creditek logo. Never write, imitate, reconstruct or crop the brand name; the exact official check-symbol plus wordmark is composited after generation.
- The finished concept must look ready for a professional Meta Ads campaign and remain legible at phone-feed size.\`;
const CARIBBEAN_WARDROBE_CONTRACT = "CARIBBEAN EVERYDAY WARDROBE \u2014 APPLIES WHEN PEOPLE ARE REQUESTED:\\n- Express the Colombian Caribbean setting through hot-weather everyday clothing, warm natural light and the local commercial environment, never through a presumed regional face, ethnicity or skin tone.\\n- Default to breathable cotton or linen, fresh short-sleeved or sleeveless blouses/shirts, lightweight trousers or skirts, sandals or light everyday sneakers. Adults may dress fashionably without cold-weather styling.\\n- Unless the operator explicitly requests otherwise, avoid boots, coats, scarves, heavy jackets, thick layers and winter fashion. Do not substitute carnival costumes, beachwear or tourist props.\\n- Preserve the operator's requested number of people, adult ages, roles, actions and specific appearance or clothing instructions. Do not add a salesperson or replace two requested friends with a different cast. These are contextual defaults, not a new scene or extra people.";
const RECRAFT_ART_DIRECTION = \`DESIGNER A \u2014 RECRAFT: create one full-bleed editorial retail photograph with natural Caribbean light and the people and action explicitly requested by the operator as the focal point. Use a customer-adviser interaction only when no other cast or action was specified. The store environment remains visible across the entire canvas. Place the approved headline, supporting copy and compact CTA directly over calm areas of the photograph with strong contrast and mobile readability. Use no solid header, footer, card, beige or white panel, detached banner, empty block or framed template. The CTA may occupy at most 35% of the canvas width. Do not generate any trademark, company name, check symbol or wordmark; one verified brand asset is added after generation.\`;
const GPT_ART_DIRECTION = \`DESIGNER B \u2014 GPT IMAGE: create an independent premium retail concept with sophisticated typography, dynamic composition, restrained modern color blocking and a conversion-focused human story. Build a visual triangle connecting the main customer interaction, headline and CTA. Keep the CTA clearly readable on a phone and approximately 20\u201325% more prominent than ordinary body copy, without becoming a banner. Place supporting copy on a calm high-contrast area or a subtle dark translucent scrim. Reduce background crowd density when needed so one believable customer-adviser interaction leads the scene. Reserve at least 6% safe margin around the natural logo zone. Avoid decorative bands that cut through the photograph. It must remain visibly different from Designer A.\`;
const COSTENO_VISUAL_CONTRACT = \`SELECTED STYLE \u2014 ALEGRE COSTE\xD1O, MANDATORY:
- Express Colombia's Caribbean region through warm daylight, airy atmosphere, leafy vegetation, sun-washed architecture and a controlled palette of coral, terracotta, sun-yellow, green and Creditek turquoise.
- Aim for subtle contemporary Macondian warmth: everyday regional life made visually memorable, inviting and slightly poetic, while remaining a believable commercial scene.
- The result must be brighter and more eye-catching than the formal style. Navy may appear only in typography or small brand anchors; it must never dominate the background.
- Do not interpret "coste\xF1o" as carnival, party or folklore. No confetti, comparsa, costumes, masks, folkloric hats, tourist-postcard staging, exaggerated tropical props or stacked regional clich\xE9s.
- Reject dark, gloomy, beige, gray, overly sober or institutional compositions; reject corporate white panels, presentation-slide layouts and rigid centered templates.\`;
const CHISTOSO_VISUAL_CONTRACT = \`SELECTED STYLE \u2014 CHISTOSO, MANDATORY:
- Build one instantly understandable visual setup and punchline tied to the product, its use or a real shopping friction. The joke must work visually before reading the caption.
- The concept may be inspired by a current conversation, behavior or meme format found through research, but must transform it into a new Creditek situation. Borrow the comedic mechanism, never the protected expression.
- Never reproduce or closely imitate an existing individualized meme image, wording, composition, character, creator asset, celebrity likeness, screenshot, watermark or third-party logo.
- Smiling, laughing, posing, attractive friends or colorful clothes alone are not humor. Reject and recompute any concept without a genuine comic turn.
- Ground the scene in an accessible cellphone store or everyday commercial street from Colombia's Caribbean region, comparable to Corozal, Chin\xFA, Tol\xFA, Ci\xE9naga or Monter\xEDa: compact scale, glass counters, practical displays, warm daylight and ordinary customers.
- Never depict a US flagship, Manhattan-style street, Bogot\xE1 luxury shop, upscale mall, fashion boutique, influencer photoshoot or generic international showroom.
- Attractive, glamorous or sensual adults and fashion-forward styling are allowed when they strengthen the concept. Keep every person clearly adult, confident and agentic; no nudity, explicit sexual content, fetishization, degrading or objectifying framing, or sexual focus unrelated to the product.
- Do not use degrading caricatures, ridicule, forced slang, carnival props or regional stereotypes.
- Keep the product and commercial benefit accurate. Humor must make the piece more memorable, never obscure what is being offered.\`;

function buildSelectedVisualStyleContract() {
  if (currentEstilo === 'costeno') return COSTENO_VISUAL_CONTRACT;
  if (currentEstilo === 'chistoso') return CHISTOSO_VISUAL_CONTRACT;
  if (currentEstilo === 'minimalista') return 'SELECTED STYLE \u2014 MINIMALISTA: one commercial idea, restrained elements and intentional negative space; keep the product and CTA unmistakable.';
  if (currentEstilo === 'contemporaneo') return 'SELECTED STYLE \u2014 CONTEMPOR\xC1NEO: current editorial photography, asymmetric rhythm and expressive hierarchy without generic technology effects.';
  if (currentEstilo === 'custom') return \`SELECTED STYLE \u2014 CUSTOM: \${document.getElementById('estilo-custom')?.value.trim() || 'follow the operator visual brief exactly.'}\`;
  return 'SELECTED STYLE \u2014 FORMAL: trustworthy and polished retail communication with a clean hierarchy, without looking like a presentation slide.';
}
const RETAIL_STORE_SCENE_CONTRACT = \`RETAIL STORE SCENE CONTRACT \u2014 MANDATORY WHEN A STORE OR IN-STORE CUSTOMERS ARE REQUESTED:
- The setting must be unmistakably an accessible Colombian Caribbean cellphone store, not a generic social venue, luxury boutique or international showroom.
- Use the scale and practical character of a real store in Corozal, Chin\xFA, Tol\xFA, Ci\xE9naga or Monter\xEDa: glass display counters, wall accessories, tiled or simple commercial flooring, warm-climate daylight and ordinary local customers. Never use a US flagship, Manhattan street, Bogot\xE1 luxury shop or upscale shopping mall.
- Choose framing that supports the operator scene and selected style. Use a wide establishing shot only when the whole store is the requested subject.
- When the store is the main subject, show recognizable context: glass cellphone display counters, wall-mounted phones or accessories, a service counter, commercial lighting and sales advisers helping customers.
- Preserve the requested number of people and their roles. Only use a crowd if the operator explicitly requests one. Prefer believable interaction and a composition that supports the selected style.
- Preserve clear spatial depth and enough architecture to identify the location even if all advertising copy is hidden.
- Close-ups and shallow depth of field are allowed when requested or appropriate to the selected style; keep enough context for the intended scene.
- Never resemble a restaurant, caf\xE9, bar, party, event hall, residential interior or empty street. Fashion-forward or sensual adult casting is allowed when relevant, but it must remain tasteful, non-explicit, agentic and connected to the product; never depict minors, nudity or degrading or objectifying framing. Do not invent readable prices, offers or third-party brand marks inside the store.\`;

const AD_CREATIVE_QUALITY_CONTRACT = \`9.5/10 AD CREATIVE QUALITY GATE \u2014 SELF-CHECK BEFORE RENDERING:
- Use one dominant visual idea. People, product, headline and decorative graphics must not compete for equal attention.
- Preserve a clear mobile-feed hierarchy: visual story first, headline second, CTA third, official logo zone fourth.
- Use the selected-style palette. In Alegre coste\xF1o, navy and turquoise are small recognizable brand anchors while warm regional colors and natural light lead the photograph.
- Keep overlays purposeful and restrained. Avoid giant diagonal bands, excessive dark filters, crowded badges, duplicated frames or decorative elements that cut through faces, hands, devices or the store.
- People must perform varied believable actions: asking an adviser, comparing devices, viewing a display or receiving assistance. Do not make everyone pose, smile at the same phone or face the camera.
- Every approved text element must remain readable at phone-feed size with safe margins and sufficient contrast.
- Before rendering, reject and recompute any composition containing invented copy, a dominant floating device, an ambiguous venue, obstructed people/product, weak hierarchy or an unbalanced brand palette.\`;

function buildRetailStoreSceneContract(prompt = '') {
  const normalized = String(prompt).toLowerCase();
  const requestsStoreScene = /\\b(tienda|local|punto de venta|almac[e\xE9]n|vitrina|mostrador|jornada|clientes comprando|calle comercial|negocios de celulares|pueblo|in[- ]?store|retail store|shop)\\b/.test(normalized);
  return requestsStoreScene ? RETAIL_STORE_SCENE_CONTRACT : '';
}

function buildProductProminenceContract() {
  const product = document.getElementById('producto')?.value.trim() || '';
  const genericProduct = !product || /^(smartphone|celular|tel[e\xE9]fono|cualquier)/i.test(product);
  const hasSpecificProduct = Boolean(productoImgBase64) || !genericProduct;
  if (!hasSpecificProduct) {
    return \`PRODUCT DISCIPLINE \u2014 NO SPECIFIC MODEL PROVIDED:
- Do not add any floating, oversized, cut-out or hero smartphone/device.
- The visible store displays already communicate the category; people and the retail experience are the visual story.
- Background phones may appear only naturally inside display counters, shelves or customers' hands.\`;
  }
  return \`PRODUCT DISCIPLINE \u2014 SPECIFIC PRODUCT PROVIDED:
- Feature only the selected/reference product. Never substitute or invent another model.
- The product may occupy at most 20% of the full canvas and must be naturally integrated in a hand, display counter or believable retail setting.
- No giant floating cut-out, no edge crop and no product covering customers, store depth, headline, CTA or official logo zone.\`;
}

function buildExactTextAllowlist() {
  const allowed = [
    document.getElementById('img-titular')?.value.trim(),
    document.getElementById('img-mensaje')?.value.trim(),
    document.getElementById('chk-cta-activo')?.checked !== false ? document.getElementById('img-cta')?.value.trim() : '',
    document.getElementById('jornada-fecha')?.value.trim(),
    document.getElementById('jornada-lugar')?.value.trim(),
    document.getElementById('jornada-hora')?.value.trim(),
  ].filter(Boolean);
  const list = allowed.length ? allowed.map(value => \`- "\${value}"\`).join('\\n') : '- No generated text is authorized.';
  return \`EXACT TEXT ALLOWLIST \u2014 ZERO EXCEPTIONS:
The image may contain only these exact strings:
\${list}
Do not add SOLO HOY, urgency badges, prices, discounts, dates, slogans, store signs, product labels, legal claims or any other readable words. If a text is not listed above, it must not appear.\`;
}

function buildAdCreativeQualityPrompt(prompt = '') {
  return [
    CARIBBEAN_WARDROBE_CONTRACT,
    AD_CREATIVE_QUALITY_CONTRACT,
    buildRetailStoreSceneContract(prompt),
    buildProductProminenceContract(),
    buildExactTextAllowlist(),
  ].filter(Boolean).join('\\n\\n');
}

function buildRecraftProviderPrompt(prompt = '') {
  const sourceWithoutBrandInstructions = String(prompt);
  const priorityPrefix = [
    'BRAND: do not render the Creditek logo or wordmark; the exact official asset is applied afterwards. Preserve the operator scene and chosen style.',
    CARIBBEAN_WARDROBE_CONTRACT,
    RECRAFT_ART_DIRECTION,
    buildSelectedVisualStyleContract(),
    buildRetailStoreSceneContract(prompt),
    buildProductProminenceContract(),
    buildExactTextAllowlist(),
  ].filter(Boolean).join('\\n\\n');
  const separator = '\\n\\nSOURCE CREATIVE BRIEF \u2014 retain the following details in priority order:\\n';
  const maxLength = 9500;
  const available = Math.max(0, maxLength - priorityPrefix.length - separator.length);
  if (sourceWithoutBrandInstructions.length > available) throw new Error('El encargo visual es demasiado largo para Recraft. Ac\xF3rtalo o usa GPT; no se recortar\xE1 tu instrucci\xF3n.');
  const sourceBrief = sourceWithoutBrandInstructions;
  return \`\${priorityPrefix}\${separator}\${sourceBrief}\`;
}
const GPT_TEXT_LAYOUT_CONTRACT = 'TEXT LAYOUT CONTRACT: analyze the rendered photograph before composing. Detect faces/rostros, people/personas, hands/manos, product/producto, gaze direction/direcci\xF3n de mirada, clean zones, contrast/contraste and negative space/espacio negativo. Headline, secondary copy, CTA and logo are independent elements that may occupy different zones. Do not place secondary directly below headline by default. Do not place CTA directly below secondary by default. Never use a single vertical text column unless the image analysis genuinely requires it. Keep safe margins, legibility and a clear hierarchy without covering faces, hands or product.';
const GPT_LAYOUT_GUARD = 'ART DIRECTION: treat the headline as the highest visual hierarchy. Give secondary copy its own quieter area and give the CTA its own breathing room and visual zone. Keep the official logo in a separate visible brand zone. Use the full canvas and choose the arrangement from the scene and negative space; do not use fixed coordinates or a repeated template. Never stack headline, secondary copy and CTA tightly in one area, leave large empty areas without intention, repeat blue blocks, or place every generation identically. Preserve legibility, balance, air and a professional advertising finish.';
const GPT_LAYOUT_PATTERNS = [
  'editorial-left-right: place the headline in the cleanest left or right negative-space column, with secondary copy and CTA separated on the opposite side',
  'headline-top-support-separated: use the upper zone for the headline, but move supporting copy to a lower or lateral calm zone and keep the CTA independently placed',
  'headline-lateral-cta-opposite: anchor the headline laterally near the gaze direction and place the CTA on the opposite safe area, with secondary copy elsewhere',
  'asymmetric-negative-space: use the subject or product as the visual anchor and distribute headline, secondary copy and CTA across three intentional negative-space zones',
  'headline-bottom-support-upper-lateral: place the headline in a safe lower zone while secondary copy sits upper or lateral and the CTA occupies its own breathable area',
];

function buildGptLayoutGuard() {
  let recent = [];
  try {
    recent = JSON.parse(sessionStorage.getItem('aura_recent_gpt_layouts') || '[]')
      .filter(value => Number.isInteger(value) && value >= 0 && value < GPT_LAYOUT_PATTERNS.length)
      .slice(-5);
  } catch { /* la memoria visual no bloquea una generaci\xF3n */ }
  const patternIndex = GPT_LAYOUT_PATTERNS.findIndex((_, index) => !recent.includes(index));
  const selectedIndex = patternIndex >= 0 ? patternIndex : 0;
  try {
    sessionStorage.setItem('aura_recent_gpt_layouts', JSON.stringify([...recent, selectedIndex].slice(-5)));
  } catch { /* la memoria visual no bloquea una generaci\xF3n */ }
  const recentForPrompt = recent.slice(-3);
  const recentText = recentForPrompt.length
    ? \`Evita repetir estos enfoques recientes: \${recentForPrompt.map(index => GPT_LAYOUT_PATTERNS[index]).join(' | ')}.\`
    : 'No existe un patr\xF3n reciente que debas repetir.';
  return \`\${GPT_TEXT_LAYOUT_CONTRACT} \${GPT_LAYOUT_GUARD} Before composing, analyze faces, people, hands, product, gaze direction, contrast, clean zones, negative space and overall balance. Use the 1080x1350 or 1080x1080 canvas fully and choose an intentional composition, not a fixed template: \${GPT_LAYOUT_PATTERNS[selectedIndex]}. \${recentText} If the photograph does not support it, choose another professional safe arrangement. Never put text over faces, important hands, product, edges or low-contrast areas.\`;
}

async function llamarBackendImagen(path, payload) {
  return window.requestAuraImage(path, payload);
}

async function generarConRecraft(prompt) {
  const data = await llamarBackendImagen('/recraft/images', {
    prompt: buildRecraftProviderPrompt(prompt),
    format: currentFormat === 'stories' ? 'stories' : 'feed',
    images: 1
  });
  const pred = data.predictions?.[0];
  if (!pred?.bytesBase64Encoded) throw new Error('Recraft no devolvi\xF3 imagen.');
  lastImgModelLabel = data.label || 'Recraft V4.1';
  const mime = pred.mimeType || 'image/png';
  const b64 = pred.bytesBase64Encoded.replace(/\\s/g, '');
  return await componerLogoSobreImagen(\`data:\${mime};base64,\${b64}\`);
}

async function generarConGemini(key, prompt, soloFoto = false, imagenRefDataUrl = null, esEdicion = false) {
  // FIX 03-jul-2026: relaci\xF3n de aspecto exacta para calzar con GPT
  // (GPT: 1024x1024 = 1:1 \xB7 1024x1536 = 2:3).
  // gemini3pro S\xCD admite 2:3 exacto. El respaldo Imagen 4 :predict NO admite
  // 2:3 (solo 1:1/3:4/4:3/9:16/16:9) \u2014 usa 3:4 como la m\xE1s cercana si se cae ah\xED.
  const aspectRatioG3       = currentFormat === 'stories' ? '2:3' : '1:1';

  async function llamarWorker(reqBody) {
    const data = await llamarBackendImagen('/generate', reqBody);
    const pred = data.predictions?.[0];
    if (!pred?.bytesBase64Encoded) throw new Error('El Worker no devolvi\xF3 imagen.');
    lastImgModelLabel = data.label || 'Gemini';
    const mime = pred.mimeType || 'image/png';
    const b64 = pred.bytesBase64Encoded.replace(/\\s/g, '');
    return \`data:\${mime};base64,\${b64}\`;
  }

  const reqBase = { prompt };

  // FIX v16 12-jul-2026: imagen ACTUAL a editar (viene de aplicarCambioImagen,
  // currentSrc = data URL en memoria, nunca tuvo URL p\xFAblica) \u2014 a diferencia
  // del logo (imageUrl, se descarga), esta ya llega en base64 y se manda tal
  // cual al Worker, que la agrega como un segundo inlineData junto al logo.
  if (imagenRefDataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(imagenRefDataUrl);
    if (m) { reqBase.imageMimeType = m[1]; reqBase.imageBase64 = m[2]; }
  }

  // Gemini solo genera la escena y deja la brand zone; el asset oficial se
  // compone una \xFAnica vez despu\xE9s. Nunca se env\xEDa el logo al modelo, evitando
  // logo generado + logo oficial duplicado.
  let src;
  try {
    src = await llamarWorker({ ...reqBase, aspectRatio: aspectRatioG3, engine: 'gemini3pro' });
  } catch (errPrincipal) {
    // Control de costo: una acci\xF3n del usuario equivale a una sola llamada.
    // Nunca se cobra un segundo intento autom\xE1tico con otro motor.
    console.warn('[generarConGemini] fall\xF3 el intento \xFAnico; respaldo autom\xE1tico deshabilitado:', errPrincipal.message);
    throw new Error(esEdicion
      ? 'No se pudo editar la imagen. No se realiz\xF3 un segundo intento autom\xE1tico.'
      : 'No se pudo generar la imagen con Gemini. No se realiz\xF3 un respaldo autom\xE1tico.');
  }
  // FIX v4d (07-jul-2026): si es para el pipeline, devolver la foto CRUDA sin
  // overlay de logo \u2014 GPT se encarga del logo y el texto en el paso 2.
  // Una edici\xF3n parte de una pieza que ya tiene el asset oficial: conservarlo
  // evita sumar una segunda marca al resultado editado.
  if (soloFoto || esEdicion) return src;
  return await componerLogoSobreImagen(src);
}

async function generarConDalle(key, prompt) {
  const finLogos = await loadAllSelectedFinancieras();
  const layoutGuard = buildGptLayoutGuard();
  const qualityContract = buildAdCreativeQualityPrompt(prompt);
  const selectedStyleContract = buildSelectedVisualStyleContract();
  let inputPayload;
  if (productoImgBase64 || finLogos.length) {
    const content = [];
    if (productoImgBase64) {
      content.push({ type: 'input_text', text: 'Reference product photo \u2014 feature this product prominently in the advertisement:' });
      content.push({ type: 'input_image', image_url: productoImgBase64 });
    }
    for (const fin of finLogos) {
      content.push({ type: 'input_text', text: \`Partner financing logo for bottom strip (\${fin.label}):\` });
      content.push({ type: 'input_image', image_url: fin.b64 });
    }
    content.push({ type: 'input_text', text: \`\${COMMERCIAL_DESIGN_CONTRACT}\\n\${GPT_ART_DIRECTION}\\n\${selectedStyleContract}\\n\${qualityContract}\\n\${GPT_BRANDING_GUARD}\\n\${layoutGuard}\\n\${prompt}\` });
    inputPayload = [{ role: 'user', content }];
  } else {
    inputPayload = \`\${COMMERCIAL_DESIGN_CONTRACT}\\n\${GPT_ART_DIRECTION}\\n\${selectedStyleContract}\\n\${qualityContract}\\n\${GPT_BRANDING_GUARD}\\n\${layoutGuard}\\n\${prompt}\`;
  }
  const data = await llamarBackendImagen('/openai/responses', {
    model: 'gpt-5.6',
    input: inputPayload,
    tools: [{ type: 'image_generation', action: 'generate', size: currentFormat === 'stories' ? '1024x1536' : '1024x1024' }]
  });
  const imageCall = data.output?.find(o => o.type === 'image_generation_call');
  const b64 = imageCall?.result;
  if (!b64) throw new Error('OpenAI no devolvi\xF3 imagen. Revisa la consola para ver la respuesta completa.');
  // OpenAI recibe instrucciones de brand zone, pero nunca el logo ni el
  // nombre Creditek. El asset oficial se compone una sola vez aqu\xED.
  return await componerLogoSobreImagen('data:image/png;base64,' + b64);
}

// \u2500\u2500 PIPELINE v4d (07-jul-2026): Gemini genera la foto, GPT compone encima \u2500\u2500
// Idea central: cada motor hace lo que sabe hacer mejor. Gemini \u2192 fotograf\xEDa
// realista sin texto ni logo. GPT \u2192 recibe esa foto como input_image de
// referencia + el logo + el copy, y compone titular/precio/CTA/logo como
// capas limpias encima, en vez de que el logo se pegue por Canvas despu\xE9s.
// FIX v4d (nota de Cowork): el doc original pasaba \`null\` como key de Gemini
// en el paso 1 \u2014 se cambi\xF3 para recibir y usar la key real del usuario
// (mismo criterio que generarConModelos usa para las otras 2 opciones),
// evitando ignorar silenciosamente una key de Gemini ya configurada.
async function generarConPipelineGeminiGPT(keyOpenAI, keyGemini, promptGeminiFoto, promptComposicionGPT) {
  // Paso 1 \u2014 Gemini genera la foto limpia (sin texto, sin logo)
  const fotoBase = await generarConGemini(keyGemini, promptGeminiFoto, /* soloFoto */ true);
  const layoutGuard = buildGptLayoutGuard();

  // Paso 2 \u2014 GPT recibe la foto como referencia + copy. El logo oficial se
  // compone una \xFAnica vez despu\xE9s, nunca como segunda marca dentro de GPT.
  const content = [
    { type: 'input_text', text: \`\${GPT_BRANDING_GUARD} Base photograph \u2014 do not regenerate the scene. Add clean graphic layers only:\` },
    { type: 'input_image', image_url: fotoBase },
  ];
  content.push({ type: 'input_text', text: \`\${promptComposicionGPT}\\n\\n\${layoutGuard}\` });

  const data = await llamarBackendImagen('/openai/responses', {
    model: 'gpt-5.6',
    input: [{ role: 'user', content }],
    tools: [{ type: 'image_generation', action: 'generate', size: currentFormat === 'stories' ? '1024x1536' : '1024x1024' }]
  });
  const imageCall = data.output?.find(o => o.type === 'image_generation_call');
  const b64 = imageCall?.result;
  if (!b64) throw new Error('OpenAI no devolvi\xF3 imagen del pipeline.');
  return await componerLogoSobreImagen('data:image/png;base64,' + b64);
}

function mostrarImgVersion(src) {
  const el = document.getElementById('img-output');
  el.classList.remove('fade-in');
  void el.offsetWidth;
  el.src = src;
  el.classList.add('fade-in');
}

function renderImgHistoryNav() {
  const total = imgHistory.length;
  const idx = imgHistoryIdx;
  document.getElementById('img-nav-prev').disabled = idx <= 0;
  document.getElementById('img-nav-next').disabled = idx >= total - 1;
  document.getElementById('img-version-lbl').textContent = total > 1 ? \`Versi\xF3n \${idx + 1} de \${total}\` : '';
  document.getElementById('img-editor-nav').style.display = total > 1 ? 'flex' : 'none';
}

function navegarImgHistory(dir) {
  const newIdx = imgHistoryIdx + dir;
  if (newIdx < 0 || newIdx >= imgHistory.length) return;
  imgHistoryIdx = newIdx;
  mostrarImgVersion(imgHistory[imgHistoryIdx]);
  renderImgHistoryNav();
}

async function aplicarCambioImagen() {
  const instruccion = document.getElementById('img-edit-prompt').value.trim();
  if (!instruccion) { showToast('Escribe qu\xE9 quieres cambiar', '#ef4444'); return; }
  const currentSrc = imgHistory[imgHistoryIdx];
  if (!currentSrc) return;

  const btn = document.getElementById('img-edit-btn');
  const spinner = document.getElementById('img-edit-spinner');
  const label = document.getElementById('img-edit-label');
  const errEl = document.getElementById('img-edit-err');
  btn.disabled = true; spinner.style.display = 'block'; label.textContent = 'Aplicando...'; errEl.style.display = 'none';

  try {
    const promptBase = document.getElementById('img-prompt-ta').value.trim();
    let newSrc;

    if (currentEngine === 'recraft') {
      throw new Error('La edici\xF3n autom\xE1tica de Recraft est\xE1 deshabilitada para evitar cobros inesperados. Genera una nueva versi\xF3n con confirmaci\xF3n.');
    } else {
      // FIX v16 12-jul-2026: antes se mandaba SOLO texto (prompt original +
      // instrucci\xF3n) \u2014 la IA nunca "ve\xEDa" currentSrc, por eso regeneraba todo
      // desde cero (logo, colores, specs distintos en cada edici\xF3n). Ahora se
      // adjunta currentSrc como input_image, mismo patr\xF3n ya usado y
      // funcionando en generarConDalle() (logo/producto/financieras) \u2014
      // confirmado contra la documentaci\xF3n de OpenAI Responses API: input_image
      // + image_url acepta data URLs base64 directamente, no solo URLs remotas.
      const editPrompt = \`\${promptBase}\\n\\nMODIFICACI\xD3N SOLICITADA: \${instruccion}\\n\\nIMPORTANTE: la imagen adjunta es la pieza ACTUAL \u2014 ed\xEDtala aplicando \xFAnicamente el cambio solicitado. Mant\xE9n exactamente igual todo lo dem\xE1s (logo, colores de marca, textos, specs, composici\xF3n). NO regeneres la pieza desde cero.\`;
      const data = await llamarBackendImagen('/openai/responses', {
        model: 'gpt-5.6', input: [{ role: 'user', content: [
          { type: 'input_text', text: editPrompt },
          { type: 'input_image', image_url: currentSrc },
        ] }], tools: [{ type: 'image_generation', action: 'edit', size: currentFormat === 'stories' ? '1024x1536' : '1024x1024' }]
      });
      const imageCall = data.output?.find(o => o.type === 'image_generation_call');
      const b64 = imageCall?.result;
      if (!b64) throw new Error('OpenAI no devolvi\xF3 imagen editada.');
      newSrc = 'data:image/png;base64,' + b64;
    }

    imgHistory = imgHistory.slice(0, imgHistoryIdx + 1);
    imgHistory.push(newSrc);
    if (imgHistory.length > 3) imgHistory.shift();
    imgHistoryIdx = imgHistory.length - 1;
    mostrarImgVersion(newSrc);
    renderImgHistoryNav();
    document.getElementById('img-edit-prompt').value = '';
    showToast('\u2713 Imagen editada correctamente');
  } catch(e) {
    errEl.textContent = e.message || 'Error al editar la imagen.';
    errEl.style.display = 'block';
    showToast(e.message || 'Error al editar', '#ef4444');
  }
  btn.disabled = false; spinner.style.display = 'none'; label.textContent = 'Aplicar cambio';
}

async function generarAB() {
  if (!beginImageGeneration()) return;
  const approved = window.confirm('La comparaci\xF3n A/B genera 2 im\xE1genes pagadas (Gemini + GPT). \xBFAutorizar las 2 llamadas?');
  if (!approved) {
    finishImageGeneration();
    showToast('Comparaci\xF3n cancelada. No se realiz\xF3 ninguna llamada.', '#f59e0b');
    return;
  }
  const keyGemini = '';
  const keyOpenAI = '';
  const prompt = document.getElementById('img-prompt-ta').value.trim();
  if (!prompt) { imageGenerationInFlight = false; showToast('Genera el copy primero para obtener el prompt de imagen', '#ef4444'); return; }
  const promptGemini = await buildImgPromptGemini(); // FIX 02-jul-2026

  const btn = document.getElementById('img-ab-btn');
  const spinner = document.getElementById('img-ab-spinner');
  const label = document.getElementById('img-ab-label');
  const resultDiv = document.getElementById('img-ab-result');

  btn.disabled = true; spinner.style.display = 'block'; label.textContent = 'Generando ambas...';

  // Reset state
  ['a', 'b'].forEach(s => {
    document.getElementById(\`img-ab-\${s}\`).style.display = 'none';
    document.getElementById(\`img-ab-err-\${s}\`).style.display = 'none';
    document.getElementById(\`img-ab-dl-\${s}\`).style.display = 'none';
    document.getElementById(\`img-ab-use-\${s}\`).style.display = 'none';
  });
  document.getElementById('img-ab-label-a').textContent = '\u{1F4F7} Foto producto';
  resultDiv.style.display = 'block';

  const [gemRes, dalleRes] = await Promise.allSettled([
    generarConGemini(keyGemini, promptGemini),
    generarConDalle(keyOpenAI, prompt)
  ]);

  if (gemRes.status === 'fulfilled') {
    const img = document.getElementById('img-ab-a');
    img.src = gemRes.value; img.style.display = 'block';
    document.getElementById('img-ab-label-a').textContent = \`\u2726 \${lastImgModelLabel}\`;
    document.getElementById('img-ab-dl-a').style.display = 'block';
    document.getElementById('img-ab-use-a').style.display = 'block';
  } else {
    const err = document.getElementById('img-ab-err-a');
    err.textContent = gemRes.reason?.message || 'Error Gemini'; err.style.display = 'block';
  }

  if (dalleRes.status === 'fulfilled') {
    const img = document.getElementById('img-ab-b');
    img.src = dalleRes.value; img.style.display = 'block';
    document.getElementById('img-ab-dl-b').style.display = 'block';
    document.getElementById('img-ab-use-b').style.display = 'block';
  } else {
    const err = document.getElementById('img-ab-err-b');
    err.textContent = dalleRes.reason?.message || 'Error GPT Image 2.5 Flare'; err.style.display = 'block';
  }

  btn.disabled = false; spinner.style.display = 'none'; label.textContent = '\u26A1 Comparar A/B';
  const ok = (gemRes.status === 'fulfilled' ? 1 : 0) + (dalleRes.status === 'fulfilled' ? 1 : 0);
  if (ok === 2) showToast('\u2713 Ambas im\xE1genes generadas');
  else if (ok === 1) showToast('Una imagen generada, la otra fall\xF3', '#f59e0b');
  else showToast('Error en ambas generaciones', '#ef4444');
  imageGenerationInFlight = false;
}

function descargarImagenAB(side) {
  const src = document.getElementById(\`img-ab-\${side}\`).src;
  if (!src || src === window.location.href) return;
  const a = document.createElement('a');
  a.href = src; a.download = \`creditek-ab-\${side === 'a' ? 'gemini' : 'gpt'}-\${Date.now()}.png\`;
  a.target = '_blank'; a.click();
}


async function generarConModelos() {
  if (!beginImageGeneration()) return;
  const btn = document.getElementById('action-gen-btn');
  btn.disabled = true;
  btn.textContent = '\u23F3 Generando...';
  // Ceder dos frames: el primero permite al navegador aplicar disabled/texto;
  // el segundo garantiza que el usuario vea el estado antes del trabajo pesado.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
  await corregirMensajeSecundario();
  // FIX v13 12-jul-2026: buildImgPrompt() ahora es async (puede consultar a
  // Claude el procesador faltante) \u2014 aqu\xED S\xCD hace falta esperarlo, porque la
  // siguiente l\xEDnea lee el textarea inmediatamente. Los dem\xE1s ~15 call sites
  // de buildImgPrompt() en el archivo (onchange/oninput de la UI) no leen su
  // resultado justo despu\xE9s, as\xED que no necesitaron cambio.
  await buildImgPrompt();
  const prompt = document.getElementById('img-prompt-ta').value.trim();
  if (!prompt) { showToast('Genera el copy primero para obtener el prompt de imagen', '#ef4444'); return; }
  const useRecraft  = document.getElementById('chk-recraft')?.checked;
  const useDalle    = document.getElementById('chk-dalle')?.checked;

  const MODELS = [
    { id: 'recraft',  label: '\u{1F4F7} Recraft V4.1',            checked: useRecraft },
    { id: 'dalle',    label: '\u2B21 GPT Image 2.5 Flare',      checked: useDalle },
  ];
  const selected = MODELS.filter(m => m.checked);

  if (selected.length === 0) { showToast('Selecciona al menos un modelo', '#f59e0b'); return; }
  const keyOpenAI = '';

  document.getElementById('img-result').style.display     = 'none';
  document.getElementById('img-ab-result').style.display  = 'none';
  document.getElementById('img-err').style.display        = 'none';

  const callEngine = async (id) => {
    recordImageUsage(id === 'recraft' ? 'recraft' : 'gpt', 'attempt');
    try {
      const result = id === 'recraft'
        ? await generarConRecraft(prompt)
        : await generarConDalle(keyOpenAI, prompt);
      recordImageUsage(id === 'recraft' ? 'recraft' : 'gpt', 'success', id === 'recraft' ? { api_units: 35 } : {});
      return result;
    } catch (error) {
      recordImageUsage(id === 'recraft' ? 'recraft' : 'gpt', 'failed');
      throw error;
    }
  };

  if (selected.length === 1) {
    const m = selected[0];
    currentEngine = m.id;
    try {
      lastImgModelLabel = m.label.replace(/^(?:\u2726|\u2B21|\u25C8|\u{1F517})\\s+/, '');
      const src = await callEngine(m.id);
      imgHistory = [src]; imgHistoryIdx = 0;
      mostrarImgVersion(src);
      const imgResultEl = document.getElementById('img-result');
      imgResultEl.style.display = 'block';
      console.log('[generarConModelos] img-result display:', imgResultEl.style.display, '| img-section visible:', document.getElementById('img-section').classList.contains('visible'), '| img-output src length:', document.getElementById('img-output').src?.length);
      document.getElementById('img-model-lbl').textContent = \`Generado con \${lastImgModelLabel}\`;
      document.getElementById('img-editor').style.display = 'block';
      renderImgHistoryNav();
      showToast('\u2713 Imagen generada correctamente');
    } catch(err) {
      const errDiv = document.getElementById('img-err');
      errDiv.textContent = err.message || 'Error al generar imagen.';
      errDiv.style.display = 'block';
      showToast(err.message || 'Error al generar imagen', '#ef4444');
    }
  } else {
    const abResult = document.getElementById('img-ab-result');
    const abCols   = abResult.querySelector('.img-ab-cols');
    abCols.style.gridTemplateColumns = selected.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr';
    abCols.innerHTML = '';

    let okCount = 0;
    const placeholders = selected.map(m => { const el = document.createElement('div'); el.className = 'img-ab-col'; el.textContent = m.label + ' \xB7 preparando\u2026'; abCols.appendChild(el); return el; });
    abResult.style.display = 'block';
    const results = await Promise.all(selected.map(async (m, i) => {
      let res;
      try { res = { status: 'fulfilled', value: await callEngine(m.id) }; }
      catch (reason) { res = { status: 'rejected', reason }; }
      const col = document.createElement('div');
      col.className = 'img-ab-col';

      const lbl = document.createElement('div');
      lbl.className = 'img-ab-col-label';
      lbl.textContent = m.label;
      col.appendChild(lbl);

      if (res.status === 'fulfilled') {
        okCount++;
        const imgSrc = res.value;
        const img = document.createElement('img');
        img.className = 'img-output'; img.src = imgSrc; img.alt = m.label;
        col.appendChild(img);

        const dlBtn = document.createElement('button');
        dlBtn.className = 'img-dl-btn'; dlBtn.textContent = '\u2B07 Descargar';
        dlBtn.onclick = () => { const a = document.createElement('a'); a.href = imgSrc; a.download = \`creditek-\${m.id}-\${Date.now()}.png\`; a.target = '_blank'; a.click(); };
        col.appendChild(dlBtn);

        const useBtn = document.createElement('button');
        useBtn.className = 'img-ab-use-btn'; useBtn.textContent = '\u2713 Usar en editor';
        useBtn.onclick = () => {
          currentEngine = m.id;
          imgHistory = [imgSrc]; imgHistoryIdx = 0;
          mostrarImgVersion(imgSrc);
          document.getElementById('img-result').style.display = 'block';
          document.getElementById('img-model-lbl').textContent = \`Generado con \${m.label.replace(/^(?:\u2726|\u2B21|\u25C8|\u{1F517})\\s+/, '')}\`;
          document.getElementById('img-editor').style.display = 'block';
          renderImgHistoryNav();
          abResult.style.display = 'none';
          showToast('\u2713 Imagen seleccionada para edici\xF3n');
        };
        col.appendChild(useBtn);
      } else {
        const errEl = document.createElement('div');
        errEl.className = 'img-ab-col-err'; errEl.style.display = 'block';
        errEl.textContent = res.reason?.message || \`Error en \${m.label}\`;
        col.appendChild(errEl);
      }
      placeholders[i].replaceWith(col);
      return res;
    }));

    const firstOk = results.findIndex(r => r.status === 'fulfilled');
    if (firstOk >= 0 && abResult.style.display !== 'none') currentEngine = selected[firstOk].id;
    if (okCount === selected.length) showToast(\`\u2713 \${okCount} im\xE1genes generadas\`);
    else if (okCount > 0) showToast(\`\${okCount} de \${selected.length} im\xE1genes generadas\`, '#f59e0b');
    else showToast('Error en todas las generaciones', '#ef4444');
  }

  } finally {
    btn.disabled = false;
    btn.textContent = '\u{1F5BC} Generar imagen';
    finishImageGeneration();
  }
}

function descargarImagen() {
  const src = imgHistory[imgHistoryIdx] || document.getElementById('img-output').src;
  if (!src) return;
  const a = document.createElement('a');
  a.href = src;
  a.download = \`creditek-imagen-\${Date.now()}.png\`;
  a.target = '_blank';
  a.click();
}

// \u2500\u2500 Bot\xF3n "Abrir en Pomelli" \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function abrirPomelli() {
  const prompt = document.getElementById('img-prompt-ta').value.trim();
  if (!prompt) { showToast('Genera el contenido primero para obtener el prompt', '#f59e0b'); return; }
  navigator.clipboard.writeText(prompt).then(() => {
    showToast('Prompt copiado \u2014 p\xE9galo en Pomelli');
    window.open('https://labs.google.com/pomelli', '_blank');
  }).catch(() => {
    showToast('No se pudo copiar al portapapeles', '#ef4444');
  });
}

// \u2500\u2500 Bot\xF3n "Prompt Canva" \u2014 toggle panel con brief \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function toggleCanvaBrief() {
  const panel = document.getElementById('canva-brief-panel');
  const btn   = document.getElementById('canva-btn');
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    btn.classList.remove('active');
    return;
  }
  buildImgPrompt();
  // Construir contenido del brief
  const producto  = document.getElementById('producto').value.trim() || '\u2014';
  const titular   = document.getElementById('img-titular').value.trim() || '\u2014';
  const precio    = document.getElementById('img-precio').value.trim();
  const cta       = document.getElementById('img-cta').value.trim() || '\u2014';
  const formato   = currentFormat === 'stories' ? 'Stories 1080\xD71920px' : 'Feed 1080\xD71080px';
  const estiloMap = {
    formal:      'Retail profesional \u2014 composici\xF3n geom\xE9trica, alto contraste, tipograf\xEDa precisa',
    costeno:     'Caribe\xF1o colombiano luminoso \u2014 acentos regionales y sensibilidad macondiana contempor\xE1nea, sin carnaval ni folclor forzado',
    chistoso:    'Humor visual actual \u2014 una situaci\xF3n original de nuestras tiendas inspirada en el mecanismo de un tema o formato vigente, nunca en copiar la pieza ajena',
    minimalista: 'Minimalista \u2014 espacio generoso, producto h\xE9roe, tipograf\xEDa elegante',
    contemporaneo:'Editorial contempor\xE1neo \u2014 fotograf\xEDa aut\xE9ntica, composici\xF3n asim\xE9trica, tipograf\xEDa expresiva y producto protagonista',
    custom:      document.getElementById('estilo-custom')?.value.trim() || 'Personalizado'
  };
  const estiloDesc = estiloMap[currentEstilo] || estiloMap.formal;

  function row(key, val) {
    return \`<div class="canva-brief-row"><span class="canva-brief-key">\${key}</span><span class="canva-brief-val">\${val}</span></div>\`;
  }
function swatch(hex, name) {
    return \`<span class="canva-brief-swatch"><span class="canva-brief-dot" style="background:\${hex}"></span>\${name} \${hex}</span>\`;
  }

  const html = [
    row('Producto', producto),
    row('Formato', formato),
    row('Paleta', swatch('#0B1E3D','Azul marino') + swatch('#00C4CC','Turquesa') + swatch('#FFFFFF','Blanco')),
    row('Tipograf\xEDa', 'Montserrat Bold \u2014 titulares \xB7 DM Sans \u2014 cuerpo'),
    row('Titular', \`<strong>\${titular}</strong>\`),
    precio ? row('Precio / Cuota', precio) : '',
    row('CTA', cta),
    row('Estilo visual', estiloDesc),
    row('Capa 1 \u2013 Fondo', 'Azul marino #0B1E3D \xB7 ' + formato),
    row('Capa 2 \u2013 Logo', 'Creditek blanco/turquesa \xB7 esquina superior derecha \xB7 ~15% ancho'),
    row('Capa 3 \u2013 Producto', \`"\${producto} PNG sin fondo" \xB7 posici\xF3n derecha o centrada\`),
    row('Capa 4 \u2013 Titular', \`"\${titular}" \xB7 Montserrat Bold \xB7 blanco o turquesa \xB7 ~80\u2013100pt\`),
    precio ? row('Capa 5 \u2013 Precio/CTA', \`"\${precio}" \xB7 Montserrat Bold \xB7 #00C4CC \xB7 60\u201380pt\`) : row('Capa 5 \u2013 Mensaje', 'Subt\xEDtulo o beneficio principal \xB7 #00C4CC \xB7 40\u201360pt'),
    row('Capa 6 \u2013 Bot\xF3n CTA', \`"\${cta}" \xB7 fondo #00C4CC \xB7 texto #0B1E3D \xB7 posici\xF3n inferior\`),
    row('Capa 7 \u2013 Marca', 'Nombre de tienda + direcci\xF3n \xB7 texto peque\xF1o \xB7 blanco o turquesa \xB7 pie de imagen'),
  ].filter(Boolean).join('');

  document.getElementById('canva-brief-content').innerHTML = html;
  panel.style.display = 'block';
  btn.classList.add('active');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const workspaceCollapseButton = document.getElementById('workspace-collapse-btn');
if (workspaceCollapseButton) {
  workspaceCollapseButton.addEventListener('click', () => {
    const workspace = workspaceCollapseButton.closest('.agent-workspace');
    const collapsed = workspace.classList.toggle('form-collapsed');
    workspaceCollapseButton.setAttribute('aria-expanded', String(!collapsed));
  });
}

<\/script>
</body>
</html>
`;

// releases/aura-piezas-20261017/entry.mjs
var entry_default = { ...shell_entry_default, async fetch(request, env, ctx) {
  const response = await shell_entry_default.fetch(request, env, ctx);
  const path = new URL(request.url).pathname;
  if (request.method !== "GET" || !["/creditek/agentes/creditek-agente-redes", "/creditek/agentes/creditek-agente-redes.html"].includes(path) || response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) return response;
  const original = await response.text();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(original)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (digest !== "54888e3c3c596f04380ded5a146e4b42cb8da5c8e71151508b8b9392aac685aa") return new Response(original, { status: response.status, headers: response.headers });
  const headers = new Headers(response.headers);
  for (const key of ["etag", "content-length", "content-encoding", "last-modified"]) headers.delete(key);
  headers.set("cache-control", "no-store");
  headers.set("x-aura-piezas-release", "20261017");
  return new Response(candidate_default, { status: 200, headers });
} };
export {
  entry_default as default
};
