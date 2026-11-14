'use strict';

/* ====== KONFIGURASI ====== */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/library/d/1aB4rdJ4HcxxXTry2-gnHuaCWfuSGcpR6UF9e9MRYSR2docxE64vPVSvb/1', // URL Web App Google Apps Script (berakhiran /exec)
  MAX_WIDTH: 1280,                   // lebar maksimum foto sebelum diunggah
  QUALITY: 0.85,                     // kualitas JPEG
  PAGE_SIZE: 24                      // jumlah foto per muatan galeri
};

const $ = (id) => document.getElementById(id);
const booth = $('booth'), video = $('video'), preview = $('preview'), canvas = $('canvas');
const state = { stream: null, facing: 'user', dataUrl: null, photos: [], offset: 0, hasMore: false, lbIndex: -1, busy: false };

/* ====== UTILITAS ====== */
let toastTimer;
function toast(msg, isError) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
function setBoothState(s) { booth.dataset.state = s; }
function boothMessage(msg, ok) {
  const el = $('boothMsg');
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg;
  el.classList.toggle('ok', !!ok);
  el.hidden = false;
}
function setBusy(on, text) {
  state.busy = on;
  $('busy').hidden = !on;
  if (text) $('busyText').textContent = text;
  $('uploadBtn').disabled = on;
  $('retakeBtn').disabled = on;
}
function apiReady() { return CONFIG.API_URL && !CONFIG.API_URL.startsWith('PASTE_'); }
function uniqueName() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `photo_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${rand}.jpg`;
}

/* ====== KAMERA ====== */
function stopStream() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
  video.srcObject = null;
}

function cameraErrorText(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError': return 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser, lalu tekan Start Camera lagi.';
    case 'NotFoundError':
    case 'OverconstrainedError': return 'Kamera tidak ditemukan di perangkat ini.';
    case 'NotReadableError': return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut, lalu coba lagi.';
    default: return 'Kamera tidak dapat dibuka. Coba muat ulang halaman.';
  }
}

async function startCamera() {
  boothMessage('');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    boothMessage('Browser ini belum mendukung akses kamera. Buka lewat Chrome atau Safari dengan alamat HTTPS.');
    return;
  }
  stopStream();
  $('startBtn').disabled = true;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: state.facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = state.stream;
    await video.play();
    const settings = state.stream.getVideoTracks()[0].getSettings();
    if (settings.facingMode) state.facing = settings.facingMode === 'environment' ? 'environment' : 'user';
    video.classList.toggle('mirror', state.facing === 'user');
    setBoothState('live');
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    $('switchBtn').hidden = cams.length < 2;
  } catch (err) {
    setBoothState('idle');
    boothMessage(cameraErrorText(err));
  } finally {
    $('startBtn').disabled = false;
  }
}

function switchCamera() {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  startCamera();
}

function runCountdown() {
  return new Promise((resolve) => {
    const el = $('countdown');
    let n = 3;
    el.textContent = n; el.hidden = false;
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(iv); el.hidden = true; resolve(); }
      else el.textContent = n;
    }, 1000);
  });
}

async function takePhoto() {
  if (!state.stream || !video.videoWidth) return;
  $('shotBtn').disabled = true;
  try {
    if ($('timerChk').checked) await runCountdown();
    const scale = Math.min(1, CONFIG.MAX_WIDTH / video.videoWidth);
    const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.save();
    if (state.facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    state.dataUrl = canvas.toDataURL('image/jpeg', CONFIG.QUALITY);
    preview.src = state.dataUrl;
    preview.hidden = false;
    stopStream();
    boothMessage('');
    setBoothState('preview');
  } finally {
    $('shotBtn').disabled = false;
  }
}

function retake() {
  if (state.busy) return;
  state.dataUrl = null;
  preview.hidden = true;
  preview.removeAttribute('src');
  startCamera();
}

/* ====== UPLOAD ====== */
async function uploadPhoto() {
  if (!state.dataUrl || state.busy) return;
  if (!apiReady()) { boothMessage('Alamat server belum diatur. Isi API_URL di script.js.'); return; }
  boothMessage('');
  setBusy(true, 'Mengunggah…');
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // menghindari preflight CORS
      body: JSON.stringify({ action: 'upload', image: state.dataUrl, filename: uniqueName() })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Upload gagal');
    state.dataUrl = null;
    setBusy(false);
    setBoothState('done');
    boothMessage('Foto berhasil diunggah. Terima kasih!', true);
    toast('Foto berhasil diunggah');
    loadGallery(true);
  } catch (err) {
    setBusy(false);
    // Foto tetap di preview supaya bisa dicoba lagi.
    boothMessage('Unggahan gagal: ' + (err.message || 'periksa koneksi internet') + '. Tekan Upload Photo untuk mencoba lagi.');
    toast('Unggahan gagal', true);
  }
}

function shootAgain() {
  preview.hidden = true;
  preview.removeAttribute('src');
  boothMessage('');
  startCamera();
}

/* ====== GALERI ====== */
function showGalleryState(kind, msg, withRetry) {
  const box = $('galleryState');
  box.innerHTML = '';
  if (!kind) { box.hidden = true; return; }
  const p = document.createElement('p');
  p.textContent = msg;
  box.appendChild(p);
  if (withRetry) {
    const b = document.createElement('button');
    b.className = 'btn btn-primary'; b.type = 'button'; b.textContent = 'Coba Lagi';
    b.addEventListener('click', () => loadGallery(true));
    box.appendChild(b);
  }
  box.hidden = false;
}

function renderTiles(from) {
  const grid = $('grid');
  state.photos.slice(from).forEach((photo, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tile';
    btn.setAttribute('aria-label', 'Perbesar foto');
    const img = document.createElement('img');
    img.src = photo.url; img.alt = 'Foto tamu pernikahan'; img.loading = 'lazy'; img.decoding = 'async';
    btn.appendChild(img);
    btn.addEventListener('click', () => openLightbox(from + i));
    li.appendChild(btn);
    grid.appendChild(li);
  });
}

async function loadGallery(reset) {
  if (!apiReady()) { showGalleryState('error', 'Alamat server belum diatur. Isi API_URL di script.js.', false); return; }
  if (reset) { state.photos = []; state.offset = 0; $('grid').innerHTML = ''; $('moreBtn').hidden = true; }
  $('refreshBtn').disabled = true; $('moreBtn').disabled = true;
  if (reset) showGalleryState('loading', 'Memuat foto…', false);
  try {
    const url = `${CONFIG.API_URL}?action=gallery&offset=${state.offset}&limit=${CONFIG.PAGE_SIZE}&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Galeri gagal dimuat');
    const from = state.photos.length;
    state.photos = state.photos.concat(data.photos || []);
    state.offset = state.photos.length;
    state.hasMore = !!data.hasMore;
    if (!state.photos.length) showGalleryState('empty', 'Belum ada foto. Jadilah yang pertama mengambil foto di photobooth.', false);
    else showGalleryState(null);
    renderTiles(from);
    $('moreBtn').hidden = !state.hasMore;
  } catch (err) {
    if (!state.photos.length) showGalleryState('error', 'Galeri tidak dapat dimuat. Periksa koneksi internet, lalu coba lagi.', true);
    else toast('Gagal memuat foto berikutnya', true);
  } finally {
    $('refreshBtn').disabled = false; $('moreBtn').disabled = false;
  }
}

/* ====== LIGHTBOX ====== */
const lb = $('lightbox');
function openLightbox(i) {
  state.lbIndex = i;
  const p = state.photos[i];
  $('lbImg').src = p.full || p.url;
  $('lbImg').alt = 'Foto ' + (i + 1) + ' dari ' + state.photos.length;
  $('lbDownload').href = p.download || p.full || p.url;
  $('lbPrev').disabled = i === 0;
  $('lbNext').disabled = i === state.photos.length - 1;
  if (!lb.open) lb.showModal();
}
function stepLightbox(d) {
  const n = state.lbIndex + d;
  if (n >= 0 && n < state.photos.length) openLightbox(n);
}

/* ====== EVENT ====== */
$('startBtn').addEventListener('click', startCamera);
$('switchBtn').addEventListener('click', switchCamera);
$('shotBtn').addEventListener('click', takePhoto);
$('retakeBtn').addEventListener('click', retake);
$('uploadBtn').addEventListener('click', uploadPhoto);
$('againBtn').addEventListener('click', shootAgain);
$('refreshBtn').addEventListener('click', () => loadGallery(true));
$('moreBtn').addEventListener('click', () => loadGallery(false));
$('lbClose').addEventListener('click', () => lb.close());
$('lbPrev').addEventListener('click', () => stepLightbox(-1));
$('lbNext').addEventListener('click', () => stepLightbox(1));
lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
lb.addEventListener('close', () => { $('lbImg').removeAttribute('src'); });
document.addEventListener('keydown', (e) => {
  if (!lb.open) return;
  if (e.key === 'ArrowLeft') stepLightbox(-1);
  if (e.key === 'ArrowRight') stepLightbox(1);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && booth.dataset.state === 'live') { stopStream(); setBoothState('idle'); } });

loadGallery(true);
