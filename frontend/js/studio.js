const MODEL_CONFIG = {
  left:  { size: '5x15',  captures: 3, slots: 6 },
  right: { size: '10x15', captures: 6, slots: 6 },
};

const StudioState = {
  model    : null,        // 'left' | 'right'
  frame    : null,        // selected frame row from API
  photoData: [],          // captured shot dataURLs
  livePreviewSlots: [],
};

let welcomeStream = null;
let cameraStream = null;
let photoTakenCount = 0;
let isCountingDown = false;
let currentFilter = 'normal';

document.addEventListener('DOMContentLoaded', async () => {
  requireLoggedIn('studio.html');
  startWelcomeCamera();
  await loadFrames();
  await refreshPremiumStatus();
});


function goToScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'screen-theme') renderThemeGrid();
  if (screenId === 'screen-result') processResult();
}

function startApp() {
  goToScreen('screen-frame');
}


async function startWelcomeCamera() {
  try {
    if (!welcomeStream) {
      welcomeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    }
    const video = document.getElementById('welcome-video');
    if (video) {
      video.srcObject = welcomeStream;
      await video.play();
    }
  } catch {
    console.log('Kamera belum aktif.');
  }
}


function selectModel(model) {
  StudioState.model = model;
  StudioState.frame = null;

  document.querySelectorAll('.frame-option').forEach((el) => el.classList.remove('selected'));
  document.getElementById(`frame-${model}-option`).classList.add('selected');
  document.getElementById('btn-next-frame-model').disabled = false;
}

function renderThemeGrid() {
  const grid = document.getElementById('theme-grid');
  const config = MODEL_CONFIG[StudioState.model];
  const themes = getFramesBySize(config.size);
  const nextBtn = document.getElementById('btn-next-theme');

  if (!themes.length) {
    grid.innerHTML = '<p style="opacity:.6">Belum ada bingkai untuk model ini. Hubungi admin.</p>';
    nextBtn.disabled = true;
    return;
  }

  grid.innerHTML = themes.map((frame) => {
    const access = checkFrameAccess(frame);
    const lockBadge = frame.type === 'premium' ? '<span class="theme-lock"></span>' : '';
    const selectedClass = StudioState.frame?.id === frame.id ? 'selected' : '';
    return `
      <div class="theme-option ${selectedClass}" data-frame-id="${frame.id}" data-allowed="${access.allowed}">
        <img src="${frame.image_url}" alt="${escapeHtml(frame.name)}">
        ${lockBadge}
      </div>`;
  }).join('');

  grid.querySelectorAll('.theme-option').forEach((el) => {
    el.addEventListener('click', () => onThemeClick(Number(el.dataset.frameId), el.dataset.allowed === 'true'));
  });

  nextBtn.disabled = !StudioState.frame;

  if (!StudioState.frame) {
    const firstAllowed = themes.find((frame) => checkFrameAccess(frame).allowed);
    if (firstAllowed) onThemeClick(firstAllowed.id, true);
  }
}

function onThemeClick(frameId, allowed) {
  const frame = getAllFrames().find((item) => item.id === frameId);
  if (!allowed) {
    location.href = 'premium.html';
    return;
  }
  StudioState.frame = frame;

  const overlay = document.getElementById('live-frame-overlay');
  overlay.src = frame.image_url;
  overlay.style.display = 'block';

  document.getElementById('theme-preview').style.backgroundImage = `url('${frame.image_url}')`;
  document.getElementById('btn-next-theme').disabled = false;
  renderThemeGrid();
}

// ---------- Camera session ----------

function setFilter(type) {
  currentFilter = type;
  const video = document.getElementById('video');
  video.classList.toggle('filter-bw', type === 'bw');
  document.getElementById('filter-normal').classList.toggle('active', type === 'normal');
  document.getElementById('filter-bw').classList.toggle('active', type === 'bw');
}

async function startCameraSession() {
  if (!StudioState.frame) return;

  StudioState.photoData = [];
  photoTakenCount = 0;
  isCountingDown = false;

  const config = MODEL_CONFIG[StudioState.model];
  StudioState.livePreviewSlots = new Array(config.slots).fill(null);

  const overlay = document.getElementById('live-frame-overlay');
  overlay.src = StudioState.frame.image_url;
  overlay.style.display = 'block';

  document.getElementById('btn-next-frame').disabled = true;
  renderLivePreview();
  updateCameraCounter();

  try {
    cameraStream = cameraStream || welcomeStream
      || await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = document.getElementById('video');
    video.srcObject = cameraStream;
    await video.play();
    setFilter(currentFilter);
  } catch {
    alert('Gagal mengakses kamera.');
  }
}

function updateCameraCounter() {
  const config = MODEL_CONFIG[StudioState.model];
  document.getElementById('camera-counter').textContent = `Foto ${photoTakenCount}/${config.captures}`;
}

function renderLivePreview() {
  const config = MODEL_CONFIG[StudioState.model];
  const slotsContainer = document.getElementById('live-frame-slots');
  const retakeLayer = document.getElementById('retake-layer');
  slotsContainer.innerHTML = '';
  retakeLayer.innerHTML = '';

  for (let i = 0; i < config.slots; i++) {
    const slotEl     = document.createElement('div');
    slotEl.className = 'live-slot';
    if (StudioState.livePreviewSlots[i]) {
      const img = document.createElement('img');
      img.src   = StudioState.livePreviewSlots[i];
      slotEl.appendChild(img);
    }
    slotsContainer.appendChild(slotEl);
  }

  const previewBox = document.getElementById('live-frame-preview').getBoundingClientRect();
  slotsContainer.querySelectorAll('.live-slot').forEach((slotEl, i) => {
    if (!StudioState.livePreviewSlots[i]) return;
    const rect = slotEl.getBoundingClientRect();
    const btn = document.createElement('button');
    btn.className   = 'retake-btn';
    btn.textContent = 'Retake';
    btn.style.top   = `${rect.top - previewBox.top + 10}px`;
    btn.style.left  = `${rect.left - previewBox.left + rect.width / 2 - 50}px`;
    btn.onclick     = (event) => { event.stopPropagation(); retakeSlot(i); };
    retakeLayer.appendChild(btn);
  });
}

function startCountdown() {
  const config = MODEL_CONFIG[StudioState.model];
  if (isCountingDown || photoTakenCount >= config.captures) return;

  isCountingDown = true;
  const overlay = document.getElementById('countdown-overlay');
  const text = document.getElementById('countdown-text');
  let count = 3;
  text.textContent = count;
  overlay.classList.add('active');

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      text.textContent = count;
      return;
    }
    text.textContent = '';
    overlay.classList.remove('active');
    clearInterval(interval);
    isCountingDown = false;
    capturePhoto();
  }, 1000);
}

function capturePhoto() {
  const config = MODEL_CONFIG[StudioState.model];
  if (photoTakenCount >= config.captures) return;

  const video = document.getElementById('video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.filter = currentFilter === 'bw' ? 'grayscale(1)' : 'none';
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';

  const dataUrl = canvas.toDataURL('image/jpeg');
  StudioState.photoData.push(dataUrl);
  photoTakenCount++;

  updateLivePreviewWithNewPhoto(dataUrl);
  flashEffect();
  updateCameraCounter();

  if (photoTakenCount >= config.captures) {
    document.getElementById('btn-next-frame').disabled = false;
  }
}

function flashEffect() {
  const flash = document.getElementById('flash-effect');
  flash.classList.add('active');
  setTimeout(() => flash.classList.remove('active'), 150);
}

function updateLivePreviewWithNewPhoto(dataUrl) {
  if (StudioState.model === 'left') {
    let filled = 0;
    for (let i = 0; i < StudioState.livePreviewSlots.length && filled < 2; i++) {
      if (!StudioState.livePreviewSlots[i]) {
        StudioState.livePreviewSlots[i] = dataUrl;
        filled++;
      }
    }
  } else {
    const idx = StudioState.livePreviewSlots.findIndex((slot) => !slot);
    if (idx !== -1) StudioState.livePreviewSlots[idx] = dataUrl;
  }
  renderLivePreview();
}

function retakeSlot(slotIndex) {
  const config = MODEL_CONFIG[StudioState.model];
  const photoToRemove = StudioState.livePreviewSlots[slotIndex];
  if (!photoToRemove) return;

  StudioState.livePreviewSlots[slotIndex] = null;
  if (StudioState.model === 'left') {
    StudioState.livePreviewSlots = StudioState.livePreviewSlots.map(
      (slot, i) => (i !== slotIndex && slot === photoToRemove ? null : slot),
    );
  }

  const idx = StudioState.photoData.indexOf(photoToRemove);
  if (idx > -1) StudioState.photoData.splice(idx, 1);
  photoTakenCount = StudioState.photoData.length;

  if (photoTakenCount < config.captures) {
    document.getElementById('btn-next-frame').disabled = true;
  }
  updateCameraCounter();
  renderLivePreview();
}

// ---------- Result canvas ----------

async function processResult() {
  const canvas = document.getElementById('result-canvas');
  const ctx = canvas.getContext('2d');
  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true;

  const W = 600;
  const H = 900;
  canvas.width = W;
  canvas.height = H;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const slots = StudioState.model === 'left' ? duplicateForLeftModel(StudioState.photoData) : StudioState.photoData;

  const topOffset  = H * 0.07;
  const sideOffset = W * 0.03;
  const gridW      = W - sideOffset * 2;
  const gridH      = H * 0.68;
  const gapX       = gridW * 0.06;
  const gapY       = gridH * 0.035;
  const slotW      = (gridW - gapX) / 2;
  const slotH      = (gridH - gapY * 2) / 3;

  for (let i  = 0; i < slots.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x   = sideOffset + col * (slotW + gapX);
    const y   = topOffset + row * (slotH + gapY);

    ctx.save();
    roundedRectPath(ctx, x, y, slotW, slotH, 6);
    ctx.clip();
    if (slots[i]) {
      const img = await loadImage(slots[i]);
      drawImageCover(ctx, img, x, y, slotW, slotH);
    } else {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(x, y, slotW, slotH);
    }
    ctx.restore();
  }

  try {
    const frameImg = await loadImageStrict(StudioState.frame.image_url);
    ctx.drawImage(frameImg, 0, 0, W, H);
  } catch {
    console.warn('Gambar bingkai gagal dimuat.');
  }

  saveBtn.disabled = false;
}

function duplicateForLeftModel(photos) {
  const slots = [];
  photos.forEach((photo) => slots.push(photo, photo));
  return slots;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(Object.assign(new Image(), { width: 1, height: 1 }));
    img.src = src;
  });
}

function loadImageStrict(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${src}`));
    img.src = src;
  });
}

function drawImageCover(ctx, img, x, y, w, h) {
  if (!img?.width || !img?.height) return;
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx, sy, sw, sh;

  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}


async function saveAndPrintResult() {
  const canvas = document.getElementById('result-canvas');
  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    await apiRequest('/photos', {
      method: 'POST',
      body: { image_data: dataUrl, frame_id: StudioState.frame.id },
    });

    showToast('Foto tersimpan! Foto otomatis terhapus dalam 3 hari.');
    downloadCanvasImage(canvas);
    await printPhoto(dataUrl);
  } catch (err) {
    showToast(err.message || 'Gagal menyimpan foto.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Simpan';
  }
}

function downloadCanvasImage(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const link = document.createElement('a');
  link.download = `snapmomen-${Date.now()}.jpg`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function resetApp() {
  StudioState.photoData = [];
  photoTakenCount = 0;
  goToScreen('screen-welcome');
}

window.addEventListener('beforeunload', () => {
  cameraStream?.getTracks().forEach((track) => track.stop());
  welcomeStream?.getTracks().forEach((track) => track.stop());
});