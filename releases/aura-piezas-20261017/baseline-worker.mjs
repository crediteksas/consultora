// releases/aura-organic-20261011/baseline/shell-index.html
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

// releases/aura-organic-20261011/baseline/shell-entry.mjs
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

// src/aura-caribbean-direction.mjs
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

// src/aura-organic-overlay.mjs
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

// src/aura-organic-shell.mjs
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

// releases/aura-organic-20261011/shell-entry.mjs
var shell_entry_default = organicAppShell(stdin_default);
export {
  shell_entry_default as default
};
