const MODEL_CONFIG = {
  left:  { size: '5x15',  captures: 3, slots: 6 },
  right: { size: '10x15', captures: 6, slots: 6 },
};

const StudioState = {
  model    : null,     
  frame    : null,       
  photoData: [],         
  livePreviewSlots: [],
};

let welcomeStream   = null;
let cameraStream    = null;
let photoTakenCount = 0;
let isCountingDown  = false;
let currentFilter   = 'normal';

const THEME_CATEGORIES = ['free', 'premium', 'custom'];
const CUSTOM_LOCKED_MESSAGE = 'Masukin token dulu buat akses bingkai custom';
const PREMIUM_TAG_HTML =
  '<span class="theme-tag"><img src="assets/images/premium.png" alt="" width="12" height="12">Premium</span>';

let activeThemeCategory = 'free';
const dom = {};

function byId(elementId) {
  return document.getElementById(elementId);
}

function cacheDomElements() {
  dom.themeGrid         = byId('theme-grid');
  dom.themeTabs         = byId('theme-tabs');
  dom.themePreview      = byId('theme-preview');
  dom.nextThemeButton   = byId('btn-next-theme');
  dom.liveFrameOverlay  = byId('live-frame-overlay');
  dom.tokenModal        = byId('token-modal');
  dom.tokenInput        = byId('token-input');
  dom.tokenError        = byId('token-error');
  dom.tokenSubmitButton = byId('btn-token-submit');
}

document.addEventListener('DOMContentLoaded', async () => {
  requireLoggedIn('studio.html');
  cacheDomElements();
  setupThemeEvents();
  setupTokenModal();
  startWelcomeCamera();
  await loadStudioData();
});

async function loadStudioData() {
  try {
    await Promise.all([loadFrames(), refreshPremiumStatus(), restoreCustomFrames()]);
  } catch (err) {
    showToast(err.message || 'Gagal memuat bingkai.');
  }
}

function goToScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'screen-theme') showThemeScreen();
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


function setupThemeEvents() {
  dom.themeGrid.addEventListener('click', (event) => {
    const option = event.target.closest('.theme-option');
    if (option) onThemeClick(Number(option.dataset.frameId), option.dataset.allowed === 'true');
  });
  dom.themeTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.theme-tab');
    if (tab) switchThemeTab(tab.dataset.category);
  });
  byId('btn-open-token').addEventListener('click', openTokenModal);
}

function showThemeScreen() {
  if (StudioState.frame) activeThemeCategory = StudioState.frame.category;
  renderThemeGrid();
}

function switchThemeTab(category) {
  if (!THEME_CATEGORIES.includes(category) || category === activeThemeCategory) return;
  activeThemeCategory = category;
  renderThemeGrid();
}

function getThemesForActiveTab() {
  const { size } = MODEL_CONFIG[StudioState.model];
  if (activeThemeCategory === 'custom') return getCustomFramesBySize(size);
  return getFramesBySize(size).filter((frame) => frame.category === activeThemeCategory);
}

function getEmptyThemeMessage() {
  if (activeThemeCategory !== 'custom') return 'Belum ada bingkai untuk model ini. Hubungi admin.';
  return hasCustomAccess() ? 'Belum ada bingkai custom untuk model ini.' : CUSTOM_LOCKED_MESSAGE;
}

function buildThemeOptionHtml(frame) {
  const { allowed } = checkFrameAccess(frame);
  const premiumTag = frame.category === 'premium' ? PREMIUM_TAG_HTML : '';
  return `
    <div class="theme-item">
      <div class="theme-option" data-frame-id="${frame.id}" data-allowed="${allowed}">
        <img src="${frame.image_url}" alt="${escapeHtml(frame.name)}" loading="lazy" decoding="async">
      </div>
      ${premiumTag}
    </div>`;
}

function updateThemeTabs() {
  dom.themeTabs.querySelectorAll('.theme-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.category === activeThemeCategory);
  });
}

function markSelectedTheme() {
  dom.themeGrid.querySelectorAll('.theme-option').forEach((option) => {
    option.classList.toggle('selected', Number(option.dataset.frameId) === StudioState.frame?.id);
  });
}

function renderThemeGrid() {
  const themes = getThemesForActiveTab();
  updateThemeTabs();

  if (!themes.length) {
    dom.themeGrid.innerHTML = `<p class="theme-empty">${getEmptyThemeMessage()}</p>`;
  } else {
    dom.themeGrid.innerHTML = themes.map(buildThemeOptionHtml).join('');
    if (!StudioState.frame) selectFirstAllowedTheme(themes);
    markSelectedTheme();
  }
  dom.nextThemeButton.disabled = !StudioState.frame;
}

function selectFirstAllowedTheme(themes) {
  const firstAllowed = themes.find((frame) => checkFrameAccess(frame).allowed);
  if (firstAllowed) applyThemeSelection(firstAllowed);
}

function applyThemeSelection(frame) {
  StudioState.frame = frame;
  dom.liveFrameOverlay.src = frame.image_url;
  dom.liveFrameOverlay.style.display = 'block';
  dom.themePreview.style.backgroundImage = `url('${frame.image_url}')`;
  dom.nextThemeButton.disabled = false;
}

function onThemeClick(frameId, allowed) {
  if (!allowed) {
    location.href = 'premium.html';
    return;
  }
  const frame = findFrameById(frameId);
  if (!frame) return;
  applyThemeSelection(frame);
  markSelectedTheme();
}


function setupTokenModal() {
  byId('btn-token-cancel').addEventListener('click', closeTokenModal);
  dom.tokenSubmitButton.addEventListener('click', submitToken);
  dom.tokenInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitToken();
  });
}

function openTokenModal() {
  dom.tokenInput.value = '';
  setTokenError('');
  dom.tokenModal.classList.add('open');
  dom.tokenInput.focus();
}

function closeTokenModal() {
  dom.tokenModal.classList.remove('open');
}

function setTokenError(message) {
  dom.tokenError.textContent = message;
}

function setTokenBusy(isBusy) {
  dom.tokenSubmitButton.disabled = isBusy;
  dom.tokenSubmitButton.textContent = isBusy ? 'Memeriksa...' : 'Buka';
}

function describeTokenResult(frames) {
  const { size } = MODEL_CONFIG[StudioState.model];
  if (frames.some((frame) => frame.size === size)) return 'Token valid. Bingkai custom terbuka.';
  return `Token valid, tapi bingkainya untuk ukuran ${frames[0].size}. Pilih model yang sesuai.`;
}

async function submitToken() {
  const token = dom.tokenInput.value.trim();
  if (!token) {
    setTokenError('Masukkan token terlebih dahulu.');
    return;
  }

  setTokenBusy(true);
  try {
    const frames = await verifyCustomToken(token);
    closeTokenModal();
    activeThemeCategory = 'custom';
    renderThemeGrid();
    showToast(describeTokenResult(frames));
  } catch (err) {
    setTokenError(err.message || 'Token tidak valid.');
  } finally {
    setTokenBusy(false);
  }
}

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
    img.crossOrigin = 'anonymous'; 
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
  const saveBtn = byId('btn-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  try {
    await saveAndSharePhoto(byId('result-canvas'), StudioState.frame.id);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Simpan';
  }
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