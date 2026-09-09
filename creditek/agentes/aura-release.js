(function (root) {
  'use strict';
  // Product release, independent from design-system and navigation versions.
  const version = '1.2.0';
  root.AuraRelease = Object.freeze({ version, label: `AURA v${version}` });
  async function render() {
    const labels = document.querySelectorAll('[data-aura-release]');
    labels.forEach(label => { label.textContent = root.AuraRelease.label; });
    try {
      const response = await fetch('/creditek/agentes/aura-build-manifest.json', {
        cache: 'no-store', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Release unavailable');
      const release = await response.json();
      const loadedBuild = document.querySelector('meta[name="aura-build"]')?.content;
      if (release.version !== version || !/^[a-f0-9]{64}$/.test(release.build || '') || loadedBuild !== release.build) {
        throw new Error('Loaded release differs from deployment');
      }
      labels.forEach(label => {
        label.textContent = `${root.AuraRelease.label} · ${release.build.slice(0, 8)}`;
        label.title = `Compilación verificada: ${release.build}`;
      });
    } catch {
      labels.forEach(label => {
        label.textContent = `${root.AuraRelease.label} · Recarga para verificar actualización`;
      });
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
    else void render();
  }
}(globalThis));
