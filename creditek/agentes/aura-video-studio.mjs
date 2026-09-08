import { auraAuth } from './aura-auth.mjs';
import { auraSessionToken as storedAuraSessionToken } from './agente3-aura-session.mjs';
import {
  VIDEO_DURATION_SECONDS,
  VIDEO_MOTIONS,
  buildVideoPrompt,
  canApproveVideo,
  canDownloadVideo,
  estimateVideoCost,
  validateSourceImage,
} from './aura-video-domain.mjs';

const WORKER_URL = 'https://creditek-gemini-proxy.comercial-853.workers.dev';
const DB_NAME = 'aura-video-studio-v1';
const STORE_NAME = 'drafts';
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_ATTEMPTS = 90;

const elements = Object.fromEntries([
  'sourceImage', 'sourcePreview', 'dropLabel', 'product', 'city', 'motion',
  'generate', 'generationStatus', 'resultPanel', 'resultVideo', 'approve',
  'regenerate', 'discard', 'download', 'approvalState', 'history', 'emptyHistory',
].map((id) => [id, document.getElementById(id)]));

let sourceFile = null;
let sourceObjectUrl = '';
let currentDraft = null;
let resultObjectUrl = '';
let generationInFlight = false;

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function showStatus(message, kind = 'processing') {
  elements.generationStatus.textContent = message;
  elements.generationStatus.className = `status visible ${kind}`;
}

function clearStatus() {
  elements.generationStatus.textContent = '';
  elements.generationStatus.className = 'status';
}

function setBusy(busy) {
  generationInFlight = busy;
  elements.generate.disabled = busy;
  elements.regenerate.disabled = busy;
  elements.generate.textContent = busy ? 'Generando video…' : 'Generar video de 8 segundos';
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try { result = action(store); }
    catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(result?.result); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

function saveDraft(draft) {
  return withStore('readwrite', (store) => store.put(draft));
}

function getDraft(id) {
  return withStore('readonly', (store) => store.get(id));
}

async function listDrafts() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer la imagen aprobada.'));
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64, type = 'video/mp4') {
  const clean = String(base64 || '').replace(/^data:video\/[a-zA-Z0-9.+-]+;base64,/, '');
  const chunks = [];
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < clean.length; offset += chunkSize) {
    const binary = atob(clean.slice(offset, offset + chunkSize));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type });
}

async function authenticatedRequest(path, body) {
  const token = await auraAuth?.token?.() || storedAuraSessionToken();
  if (!token) throw new Error('La sesión AURA venció. Vuelve al panel e inicia sesión.');
  const response = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !(response.status === 202 && data.pending)) {
    throw new Error(data.error || `No se pudo completar la solicitud (${response.status}).`);
  }
  return { response, data };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pollVideo(operation) {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    showStatus(`Veo está animando la pieza… revisión ${attempt} de ${MAX_POLL_ATTEMPTS}.`, 'processing');
    await wait(POLL_INTERVAL_MS);
    const { response, data } = await authenticatedRequest('/veo/status', { operation });
    if (response.status === 202 && data.pending) continue;
    if (!data.success || !data.video) throw new Error('Veo terminó sin devolver el video.');
    return data;
  }
  throw new Error('La generación tardó más de 12 minutos. Puedes intentarlo nuevamente.');
}

function releaseResultUrl() {
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
  resultObjectUrl = '';
}

function renderDraft(draft) {
  currentDraft = draft;
  releaseResultUrl();
  resultObjectUrl = URL.createObjectURL(draft.videoBlob);
  elements.resultVideo.src = resultObjectUrl;
  elements.resultPanel.hidden = false;
  const approved = canDownloadVideo(draft.status);
  elements.approvalState.textContent = approved ? 'Aprobado por revisión humana' : draft.status === 'descartado' ? 'Descartado' : 'Pendiente de tu aprobación';
  elements.approvalState.className = `approval-state ${approved ? 'approved' : draft.status === 'descartado' ? 'discarded' : 'pending'}`;
  elements.approve.hidden = !canApproveVideo(draft.status);
  elements.discard.hidden = draft.status === 'descartado';
  elements.download.hidden = !approved;
  elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderHistory() {
  const drafts = await listDrafts();
  elements.emptyHistory.hidden = drafts.length > 0;
  elements.history.innerHTML = '';
  drafts.forEach((draft) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.dataset.draftId = draft.id;
    const title = document.createElement('strong');
    title.textContent = draft.product;
    const meta = document.createElement('span');
    meta.textContent = `${new Date(draft.createdAt).toLocaleString('es-CO')} · ${draft.status.replaceAll('_', ' ')} · ${formatCop(draft.costCop)}`;
    button.append(title, meta);
    button.addEventListener('click', async () => {
      const selected = await getDraft(button.dataset.draftId);
      if (selected?.videoBlob) renderDraft(selected);
    });
    elements.history.appendChild(button);
  });
}

async function generateVideo() {
  if (generationInFlight) return;
  const validation = validateSourceImage(sourceFile);
  if (validation) { showStatus(validation, 'error'); return; }
  const product = elements.product.value.trim();
  if (!product) { showStatus('Escribe el producto o nombre de la pieza.', 'error'); return; }
  const cost = estimateVideoCost();
  const confirmed = window.confirm(`Este intento cuesta aproximadamente US$${cost.usd.toFixed(2)} (${formatCop(cost.cop)}). ¿Generar el video?`);
  if (!confirmed) return;
  setBusy(true);
  try {
    showStatus('Preparando una copia de la imagen aprobada. El archivo original no se modifica.', 'processing');
    const image = await fileToBase64(sourceFile);
    const motion = elements.motion.value;
    const { response, data } = await authenticatedRequest('/veo/generate', {
      prompt: buildVideoPrompt({ product, city: elements.city.value, motion }),
      image,
      duration: VIDEO_DURATION_SECONDS,
      aspect_ratio: '9:16',
    });
    let completed = data;
    if (response.status === 202 && data.pending) {
      if (!data.operation) throw new Error('Veo no devolvió el identificador de la generación.');
      completed = await pollVideo(data.operation);
    }
    if (!completed.success || !completed.video) throw new Error('El servidor no devolvió un video válido.');
    const now = new Date().toISOString();
    const draft = {
      id: crypto.randomUUID(),
      product,
      city: elements.city.value.trim(),
      motion,
      duration: VIDEO_DURATION_SECONDS,
      costUsd: cost.usd,
      costCop: cost.cop,
      status: 'pendiente_aprobacion',
      createdAt: now,
      updatedAt: now,
      videoBlob: base64ToBlob(completed.video),
    };
    await saveDraft(draft);
    renderDraft(draft);
    await renderHistory();
    showStatus('Video generado. Revísalo: todavía no está aprobado ni publicado.', 'success');
  } catch (error) {
    console.error('[AURA-VIDEO]', error);
    showStatus(error.message || 'No se pudo generar el video.', 'error');
  } finally {
    setBusy(false);
  }
}

async function updateDraftStatus(status) {
  if (!currentDraft) return;
  currentDraft = { ...currentDraft, status, updatedAt: new Date().toISOString() };
  await saveDraft(currentDraft);
  renderDraft(currentDraft);
  await renderHistory();
  showStatus(status === 'aprobado' ? 'Video aprobado. Ya puedes descargarlo para publicación.' : 'Video descartado. No se enviará a publicación.', status === 'aprobado' ? 'success' : 'info');
}

function downloadApprovedVideo() {
  if (!currentDraft || !canDownloadVideo(currentDraft.status)) return;
  const link = document.createElement('a');
  link.href = resultObjectUrl;
  link.download = `aura-${currentDraft.product.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video'}-${currentDraft.id.slice(0, 8)}.mp4`;
  link.click();
}

function selectSource(file) {
  const validation = validateSourceImage(file);
  if (validation) { showStatus(validation, 'error'); return; }
  sourceFile = file;
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  sourceObjectUrl = URL.createObjectURL(file);
  elements.sourcePreview.src = sourceObjectUrl;
  elements.sourcePreview.hidden = false;
  elements.dropLabel.querySelector('strong').textContent = file.name;
  clearStatus();
}

elements.sourceImage.addEventListener('change', () => selectSource(elements.sourceImage.files?.[0]));
elements.dropLabel.addEventListener('dragover', (event) => { event.preventDefault(); elements.dropLabel.classList.add('dragging'); });
elements.dropLabel.addEventListener('dragleave', () => elements.dropLabel.classList.remove('dragging'));
elements.dropLabel.addEventListener('drop', (event) => {
  event.preventDefault();
  elements.dropLabel.classList.remove('dragging');
  selectSource(event.dataTransfer?.files?.[0]);
});
elements.generate.addEventListener('click', generateVideo);
elements.regenerate.addEventListener('click', generateVideo);
elements.approve.addEventListener('click', () => updateDraftStatus('aprobado'));
elements.discard.addEventListener('click', () => updateDraftStatus('descartado'));
elements.download.addEventListener('click', downloadApprovedVideo);

const cost = estimateVideoCost();
document.getElementById('costUsd').textContent = `US$${cost.usd.toFixed(2)}`;
document.getElementById('costCop').textContent = `aprox. ${formatCop(cost.cop)} por intento`;
Object.entries(VIDEO_MOTIONS).forEach(([value, label]) => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  elements.motion.appendChild(option);
});
renderHistory().catch((error) => console.error('[AURA-VIDEO-HISTORY]', error));
window.addEventListener('beforeunload', () => { releaseResultUrl(); if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl); });
