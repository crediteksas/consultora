(async function () {
  const labels = document.querySelectorAll('[data-kora-release]');
  if (!labels.length) return;
  try {
    const response = await fetch('/kora-build-manifest.json', {cache:'no-store', signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Manifest unavailable');
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release.version || '') || release.runtimeMatchesRelease !== true) throw new Error('Unverified release');
    const date = new Date(release.deployedAt);
    const updated = Number.isFinite(date.getTime()) ? ' · Actualizado ' + date.toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'}) : '';
    labels.forEach(label => { label.textContent = 'KORA ' + release.version + updated; });
  } catch {
    labels.forEach(label => { label.textContent = 'No fue posible comprobar la versión publicada. Recarga con conexión.'; });
  }
}());
