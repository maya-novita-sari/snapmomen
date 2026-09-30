const USER_FILTER_ALL = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireLoggedIn('dashboard-admin.html');
  if (!user) return;
  if (user.role !== 'admin') {
    showToast('Halaman ini khusus admin.');
    location.href = 'studio.html';
    return;
  }

  renderNavActions('#navActions');
  setupSidebarNavigation();
  setupLogout();
  setupFrameModal();
  setupTokenModal();
  setupCodeModal();
  setupPrinterPanel();
  setupUserFilter();
  setupPhotoPanels();

  await Promise.all([
    loadStats(), loadAdminFrames(), loadCodes(), loadHistory(), loadUsers(),
    loadPhotoList('hasil', { reset: true }), loadPhotoList('galeri', { reset: true }),
  ]);
  renderFramesGrid();
});

// ---------- Shared helpers ----------

function setButtonState(buttonId, label, isDisabled) {
  const button = document.getElementById(buttonId);
  button.textContent = label;
  button.disabled = isDisabled;
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    showToast(`Gagal menyalin otomatis. Salin manual: ${text}`);
  }
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('open');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
}

// ---------- Sidebar ----------

function setupSidebarNavigation() {
  document.querySelector('.admin-sidebar').addEventListener('click', (event) => {
    const link = event.target.closest('.side-link[data-panel]');
    if (link) showPanel(link);
  });
  document.getElementById('goStudioBtn').addEventListener('click', () => { location.href = 'studio.html'; });
}

function showPanel(link) {
  document.querySelectorAll('.side-link[data-panel]').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach((panel) => panel.classList.remove('active'));
  link.classList.add('active');
  document.getElementById(link.dataset.panel).classList.add('active');
}

function setupLogout() {
  document.getElementById('logoutBtnAdmin').addEventListener('click', () => {
    clearSession();
    location.href = 'index.html';
  });
}

// ---------- Panel: Dashboard ----------

const STAT_ELEMENTS = {
  statPhotos: 'total_photos',
  statUsers: 'total_users',
  statPremium: 'premium_users',
  statFree: 'free_users',
  statFrames: 'total_frames',
  statActiveCodes: 'active_codes',
  statUsedCodes: 'used_codes',
  statActiveCodes2: 'active_codes',
  statUsedCodes2: 'used_codes',
};

async function loadStats() {
  try {
    const { stats } = await apiRequest('/dashboard?action=stats');
    Object.entries(STAT_ELEMENTS).forEach(([elementId, statKey]) => {
      document.getElementById(elementId).textContent = stats[statKey];
    });
  } catch (err) {
    showToast(err.message || 'Gagal memuat statistik.');
  }
}

// ---------- Panel: Bingkai (modal) ----------

const FRAME_IMAGE_MAX_SIDE = 1800;
const FRAME_IMAGE_MAX_CHARS = 3500000;
const FRAME_IMAGE_MIN_SCALE = 0.3;
const FRAME_SAVE_LABEL = 'Simpan';
const FRAME_SAVING_LABEL = 'Menyimpan...';
const FRAME_PROCESSING_LABEL = 'Memproses gambar...';
const CATEGORY_LABELS = { free: 'Gratis', premium: 'Premium', custom: 'Custom' };

let isSavingFrame = false;
let frameImageTask = Promise.resolve();

function setupFrameModal() {
  document.getElementById('addFrameBtn').addEventListener('click', () => openFrameModal());
  document.getElementById('frameForm').addEventListener('submit', handleFrameSubmit);
  document.getElementById('frameImageInput').addEventListener('change', handleFrameImageChange);
  document.getElementById('frameTypeInput').addEventListener('change', syncFrameOwnerField);
  document.querySelectorAll('[data-close-frame-modal]').forEach((button) => {
    button.addEventListener('click', handleFrameModalCancel);
  });
}

function handleFrameModalCancel() {
  if (isSavingFrame) return;
  closeModal('frameModal');
}

function setFrameSaveButton(label, isDisabled) {
  setButtonState('frameSaveBtn', label, isDisabled);
}

function showFramePreview(source) {
  const preview = document.getElementById('frameImagePreview');
  preview.src = source || '';
  preview.style.display = source ? 'block' : 'none';
}

function syncFrameOwnerField() {
  const isCustom = document.getElementById('frameTypeInput').value === 'custom';
  document.getElementById('frameOwnerField').style.display = isCustom ? 'block' : 'none';
}

function openFrameModal(frame = null) {
  const form = document.getElementById('frameForm');
  form.reset();
  form.dataset.editId = frame?.id || '';
  form.dataset.imageUrl = '';
  frameImageTask = Promise.resolve();

  document.getElementById('frameModalTitle').textContent = frame ? 'Edit Bingkai' : 'Tambah Bingkai';
  document.getElementById('frameNameInput').value = frame?.name || '';
  document.getElementById('frameSizeInput').value = frame?.size || '5x15';
  document.getElementById('frameTypeInput').value = frame?.category || 'free';
  document.getElementById('frameOwnerInput').value = frame?.owner_username || '';
  syncFrameOwnerField();
  showFramePreview(frame?.image_url);
  setFrameSaveButton(FRAME_SAVE_LABEL, false);
  openModal('frameModal');
}

// ---------- Panel: Bingkai (proses gambar, PNG dengan transparansi) ----------

function renderImageAsPng(image, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

// Keeps PNG transparency but shrinks the payload so the server accepts it.
async function convertImageToUploadDataUrl(file) {
  const image = await loadImageFromFile(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = Math.min(1, FRAME_IMAGE_MAX_SIDE / longestSide);
  let dataUrl = renderImageAsPng(image, scale);

  while (dataUrl.length > FRAME_IMAGE_MAX_CHARS && scale > FRAME_IMAGE_MIN_SCALE) {
    scale *= 0.8;
    dataUrl = renderImageAsPng(image, scale);
  }
  if (dataUrl.length > FRAME_IMAGE_MAX_CHARS) {
    throw new Error('Gambar terlalu besar. Gunakan gambar dengan ukuran lebih kecil.');
  }
  return dataUrl;
}

async function handleFrameImageChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  const form = document.getElementById('frameForm');
  setFrameSaveButton(FRAME_PROCESSING_LABEL, true);
  frameImageTask = convertImageToUploadDataUrl(file);

  try {
    const dataUrl = await frameImageTask;
    form.dataset.imageUrl = dataUrl;
    showFramePreview(dataUrl);
  } catch (err) {
    frameImageTask = Promise.resolve();
    event.target.value = '';
    showToast(err.message || 'Gagal memproses gambar.');
  } finally {
    setFrameSaveButton(FRAME_SAVE_LABEL, false);
  }
}



function buildFramePayload(form) {
  const category = document.getElementById('frameTypeInput').value;
  return {
    name: document.getElementById('frameNameInput').value.trim(),
    size: document.getElementById('frameSizeInput').value,
    category,
    owner_username: category === 'custom' ? document.getElementById('frameOwnerInput').value.trim() : undefined,
    image_url: form.dataset.imageUrl || undefined,
  };
}

function assertFramePayloadValid(payload, editId) {
  if (!payload.name) throw new Error('Nama bingkai wajib diisi.');
  if (!editId && !payload.image_url) throw new Error('Pilih gambar bingkai terlebih dahulu.');
}

// Returns { message, frame } so the caller can show the generated custom token.
async function submitFrame(editId, payload) {
  if (editId) {
    const { frame } = await apiRequest(`/frames?id=${editId}`, { method: 'PUT', body: payload });
    return { message: 'Bingkai diperbarui.', frame, isNew: false };
  }
  const { frame } = await apiRequest('/frames', { method: 'POST', body: payload });
  return { message: 'Bingkai ditambahkan.', frame, isNew: true };
}

async function reloadFramesView() {
  invalidateFramesCache();
  try {
    await loadAdminFrames();
    renderFramesGrid();
    await loadStats();
  } catch (err) {
    showToast('Gagal memuat ulang daftar bingkai. Muat ulang halaman.');
  }
}

async function handleFrameSubmit(event) {
  event.preventDefault();
  if (isSavingFrame) return;

  const form = event.currentTarget;
  isSavingFrame = true;
  setFrameSaveButton(FRAME_SAVING_LABEL, true);

  try {
    await frameImageTask;
    const payload = buildFramePayload(form);
    assertFramePayloadValid(payload, form.dataset.editId);
    const result = await submitFrame(form.dataset.editId, payload);
    closeModal('frameModal');
    showToast(result.message);
    await reloadFramesView();
    if (result.isNew && result.frame.access_token) showTokenModal(result.frame.access_token);
  } catch (err) {
    showToast(err.message || 'Gagal menyimpan bingkai.');
  } finally {
    isSavingFrame = false;
    setFrameSaveButton(FRAME_SAVE_LABEL, false);
  }
}

// ---------- Panel: Bingkai (token custom) ----------

function setupTokenModal() {
  document.getElementById('copyTokenBtn').addEventListener('click', () => {
    copyText(document.getElementById('tokenValue').textContent, 'Token disalin.');
  });
  document.getElementById('closeTokenBtn').addEventListener('click', () => closeModal('tokenModal'));
}

function showTokenModal(token) {
  document.getElementById('tokenValue').textContent = token;
  openModal('tokenModal');
}

// ---------- Panel: Bingkai (grid) ----------

function buildFrameCategoryHtml(frame) {
  const label = CATEGORY_LABELS[frame.category] || frame.category;
  return frame.category === 'premium' ? `${PREMIUM_ICON_HTML}${label}` : label;
}

function buildFrameTokenHtml(frame) {
  if (frame.category !== 'custom' || !frame.access_token) return '';
  const owner = frame.owner_username ? `<div class="afc-meta">Pemilik: ${escapeHtml(frame.owner_username)}</div>` : '';
  return `
    ${owner}
    <div class="code-chip">${frame.access_token}</div>
    <div class="afc-actions" style="margin-bottom:8px">
      <button class="btn btn-pink btn-sm" data-copy-token="${frame.access_token}">Copy Token</button>
    </div>`;
}

function buildFrameCardHtml(frame) {
  return `
    <div class="admin-frame-card">
      <img src="${frame.image_url}" alt="${escapeHtml(frame.name)}" loading="lazy" decoding="async">
      <div class="afc-name">${escapeHtml(frame.name)}</div>
      <div class="afc-meta">${frame.size} · ${buildFrameCategoryHtml(frame)}</div>
      ${buildFrameTokenHtml(frame)}
      <div class="afc-actions">
        <button class="btn btn-outline btn-sm" data-edit="${frame.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-delete="${frame.id}">Hapus</button>
      </div>
    </div>`;
}

function renderFramesGrid() {
  const grid = document.getElementById('adminFrameGrid');
  const frames = getAllFrames();
  grid.innerHTML = frames.map(buildFrameCardHtml).join('') || '<p style="opacity:.6">Belum ada bingkai.</p>';

  if (grid.dataset.bound) return;
  grid.dataset.bound = 'true';
  grid.addEventListener('click', handleFrameGridClick);
}

function handleFrameGridClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.edit) openFrameModal(getAllFrames().find((frame) => frame.id === Number(button.dataset.edit)));
  if (button.dataset.delete) handleFrameDelete(Number(button.dataset.delete));
  if (button.dataset.copyToken) copyText(button.dataset.copyToken, 'Token disalin.');
}

async function handleFrameDelete(id) {
  if (!confirm('Hapus bingkai ini?')) return;
  try {
    await apiRequest(`/frames?id=${id}`, { method: 'DELETE' });
    showToast('Bingkai dihapus.');
    await reloadFramesView();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus bingkai.');
  }
}

// ---------- Panel: Kode Premium ----------

function setupCodeModal() {
  document.getElementById('generateCodeBtn').addEventListener('click', () => {
    document.getElementById('codeForm').reset();
    document.getElementById('codeResultBox').style.display = 'none';
    openModal('codeModal');
  });
  document.getElementById('codeForm').addEventListener('submit', handleGenerateCodes);
  document.querySelectorAll('input[name="duration"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.getElementById('customDurationInput').disabled = radio.value !== 'custom' || !radio.checked;
    });
  });
  document.querySelectorAll('[data-close-code-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModal('codeModal'));
  });
  document.getElementById('copyAllCodesBtn').addEventListener('click', copyAllGeneratedCodes);
  document.getElementById('codesTableBody').addEventListener('click', handleCodesTableClick);
}

async function handleGenerateCodes(event) {
  event.preventDefault();
  const amount = Number(document.getElementById('codeAmountInput').value);
  const selectedDuration = document.querySelector('input[name="duration"]:checked').value;
  const durationDays = selectedDuration === 'custom'
    ? Number(document.getElementById('customDurationInput').value)
    : Number(selectedDuration);

  try {
    const { codes } = await apiRequest('/premium?action=codes', {
      method: 'POST',
      body: { amount, duration_days: durationDays },
    });
    showGeneratedCodes(codes);
    await loadCodes();
    await loadStats();
  } catch (err) {
    showToast(err.message || 'Gagal generate kode.');
  }
}

function showGeneratedCodes(codes) {
  const box = document.getElementById('codeResultBox');
  document.getElementById('codeResultList').innerHTML =
    codes.map((c) => `<div class="code-chip">${c.code}</div>`).join('');
  box.style.display = 'block';
  box.dataset.codes = codes.map((c) => c.code).join('\n');
}

function copyAllGeneratedCodes() {
  copyText(document.getElementById('codeResultBox').dataset.codes || '', 'Semua kode disalin.');
}

async function loadCodes() {
  try {
    const { codes } = await apiRequest('/premium?action=codes');
    renderCodesTable(codes);
  } catch (err) {
    showToast(err.message || 'Gagal memuat kode premium.');
  }
}

function statusLabel(status) {
  return { active: 'Active', used: 'Used', expired: 'Expired' }[status] || status;
}

function renderCodesTable(codes) {
  const activeCodes = codes.filter((c) => c.status === 'active');
  document.getElementById('codesTableBody').innerHTML = activeCodes.map((c) => `
    <tr>
      <td>${c.code}</td>
      <td>${c.duration_days} hari</td>
      <td><span class="status-tag status-${c.status}">${statusLabel(c.status)}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" data-copy-code="${c.code}">Copy</button>
        <button class="btn btn-danger btn-sm" data-delete-code="${c.id}">Hapus</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="opacity:.6">Belum ada kode aktif.</td></tr>';
}

function handleCodesTableClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.copyCode) copyText(button.dataset.copyCode, 'Kode disalin.');
  if (button.dataset.deleteCode) handleDeleteCode(Number(button.dataset.deleteCode));
}

async function handleDeleteCode(id) {
  if (!confirm('Hapus kode ini?')) return;
  try {
    await apiRequest(`/premium?action=codes&id=${id}`, { method: 'DELETE' });
    showToast('Kode dihapus.');
    await loadCodes();
    await loadStats();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus kode.');
  }
}

// ---------- Panel: History Kode ----------

async function loadHistory() {
  try {
    const { history } = await apiRequest('/premium?action=history');
    document.getElementById('historyTableBody').innerHTML = history.map((h) => `
      <tr>
        <td>${h.code}</td>
        <td>${escapeHtml(h.username)}</td>
        <td>${h.duration_days} hari</td>
        <td><span class="status-tag status-${h.status}">${statusLabel(h.status)}</span></td>
        <td>${formatIndonesianDate(h.expires_at)}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="opacity:.6">Belum ada history.</td></tr>';
  } catch (err) {
    showToast(err.message || 'Gagal memuat history kode.');
  }
}

// ---------- Panel: User ----------

let _usersCache = [];

async function loadUsers() {
  try {
    const { users } = await apiRequest('/dashboard?action=users');
    _usersCache = users;
    renderUsersTable(USER_FILTER_ALL);
  } catch (err) {
    showToast(err.message || 'Gagal memuat user.');
  }
}

function setupUserFilter() {
  document.querySelector('.filter-row').addEventListener('click', (event) => {
    const button = event.target.closest('[data-user-filter]');
    if (!button) return;
    document.querySelectorAll('[data-user-filter]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    renderUsersTable(button.dataset.userFilter);
  });
  document.getElementById('usersTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-user]');
    if (button) handleDeleteUser(Number(button.dataset.deleteUser));
  });
}

function isPremiumUser(user) {
  return user.premium_until && new Date(user.premium_until) > new Date();
}

function buildUserStatusHtml(user) {
  if (!isPremiumUser(user)) return '<span class="status-tag status-active">Gratis</span>';
  const daysLeft = Math.ceil((new Date(user.premium_until) - new Date()) / 86400000);
  return `<span class="status-tag status-used">${PREMIUM_ICON_HTML}Premium</span>
    <span style="opacity:.6;font-size:.78rem">${daysLeft} hari lagi</span>`;
}

function renderUsersTable(filter) {
  const filtered = _usersCache.filter((user) => {
    if (filter === 'premium') return isPremiumUser(user);
    if (filter === 'free') return !isPremiumUser(user);
    return true;
  });

  document.getElementById('userStatTotal').textContent = _usersCache.length;
  document.getElementById('userStatPremium').textContent = _usersCache.filter(isPremiumUser).length;
  document.getElementById('userStatFree').textContent = _usersCache.filter((user) => !isPremiumUser(user)).length;

  document.getElementById('usersTableBody').innerHTML = filtered.map((user) => `
    <tr>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${buildUserStatusHtml(user)}</td>
      <td><button class="btn btn-danger btn-sm" data-delete-user="${user.id}">Hapus</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="opacity:.6">Belum ada user.</td></tr>';
}

async function handleDeleteUser(id) {
  if (!confirm('Hapus user ini? Semua foto miliknya juga akan terhapus.')) return;
  try {
    await apiRequest(`/dashboard?action=users&id=${id}`, { method: 'DELETE' });
    showToast('User dihapus.');
    await loadUsers();
    await loadStats();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus user.');
  }
}

// ---------- Panel: Printer ----------

function setupPrinterPanel() {
  refreshPrinterStatus();
  document.getElementById('connectPrinterBtn').addEventListener('click', handleConnectPrinter);
  document.getElementById('testPrintBtn').addEventListener('click', handleTestPrint);
}

async function refreshPrinterStatus() {
  try {
    const { printer } = await apiRequest('/printer', { auth: false });
    document.getElementById('printerStatus').textContent = printer.connected
      ? `Terhubung: ${printer.printer_name}`
      : 'Belum terhubung';
  } catch (err) {
    showToast(err.message || 'Gagal memuat status printer.');
  }
}

async function handleConnectPrinter() {
  try {
    const device = await connectUsbPrinter();
    await apiRequest('/printer', {
      method: 'POST',
      body: { printer_name: device.productName || 'USB Printer', connected: true },
    });
    showToast('Printer terhubung.');
    await refreshPrinterStatus();
  } catch (err) {
    showToast(err.message || 'Gagal menghubungkan printer.');
  }
}

async function handleTestPrint() {
  const testImage = 'data:image/svg+xml;base64,' + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#FDF6E3"/><text x="20" y="100" font-size="20">Snapmomen Test Print</text></svg>',
  );
  await printPhoto(testImage);
}