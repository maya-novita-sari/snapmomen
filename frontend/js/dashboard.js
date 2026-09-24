document.addEventListener('DOMContentLoaded', async () => {
  const user = requireLoggedIn('dashboard-admin.html');
  if (!user) return;
  if (user.role !== 'admin') {
    showToast('Halaman ini khusus admin.');
    location.href = 'studio.html';
    return;
  }

  renderNavActions('#navActions');
  document.getElementById('adminName').textContent = user.username;
  setupSidebarNavigation();
  setupLogout();
  setupFrameModal();
  setupCodeModal();
  setupPrinterPanel();
  setupUserFilter();

  await Promise.all([loadStats(), loadFrames(), loadCodes(), loadHistory(), loadUsers(), loadPhotos()]);
  renderFramesGrid();
});

// ---------- Sidebar ----------

function setupSidebarNavigation() {
  document.querySelectorAll('.side-link[data-panel]').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.side-link[data-panel]').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
      link.classList.add('active');
      document.getElementById(link.dataset.panel).classList.add('active');
    });
  });
  document.getElementById('goStudioBtn').addEventListener('click', () => { location.href = 'studio.html'; });
}

function setupLogout() {
  document.getElementById('logoutBtnAdmin').addEventListener('click', () => {
    clearSession();
    location.href = 'index.html';
  });
}

// ---------- Panel: Dashboard ----------

async function loadStats() {
  try {
    const { stats } = await apiRequest('/dashboard?action=stats');
    document.getElementById('statPhotos').textContent = stats.total_photos;
    document.getElementById('statUsers').textContent = stats.total_users;
    document.getElementById('statPremium').textContent = stats.premium_users;
    document.getElementById('statFree').textContent = stats.free_users;
    document.getElementById('statFrames').textContent = stats.total_frames;
    document.getElementById('statActiveCodes').textContent = stats.active_codes;
    document.getElementById('statUsedCodes').textContent = stats.used_codes;
    document.getElementById('statActiveCodes2').textContent = stats.active_codes;
    document.getElementById('statUsedCodes2').textContent = stats.used_codes;
  } catch (err) {
    showToast(err.message || 'Gagal memuat statistik.');
  }
}

// ---------- Panel: Bingkai ----------

function setupFrameModal() {
  document.getElementById('addFrameBtn').addEventListener('click', () => openFrameModal());
  document.getElementById('frameForm').addEventListener('submit', handleFrameSubmit);
  document.getElementById('frameImageInput').addEventListener('change', previewFrameImage);
  document.querySelectorAll('[data-close-frame-modal]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById('frameModal').classList.remove('open'));
  });
}

function openFrameModal(frame = null) {
  const form = document.getElementById('frameForm');
  form.reset();
  form.dataset.editId = frame?.id || '';
  document.getElementById('frameModalTitle').textContent = frame ? 'Edit Bingkai' : 'Tambah Bingkai';
  document.getElementById('frameNameInput').value = frame?.name || '';
  document.getElementById('frameSizeInput').value = frame?.size || '5x15';
  document.getElementById('frameTypeInput').value = frame?.type || 'free';
  document.getElementById('frameImagePreview').src = frame?.image_url || '';
  document.getElementById('frameImagePreview').style.display = frame ? 'block' : 'none';
  form.dataset.imageUrl = frame?.image_url || '';
  document.getElementById('frameModal').classList.add('open');
}

function previewFrameImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('frameImagePreview').src = reader.result;
    document.getElementById('frameImagePreview').style.display = 'block';
    document.getElementById('frameForm').dataset.imageUrl = reader.result;
  };
  reader.readAsDataURL(file);
}

async function handleFrameSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    name: document.getElementById('frameNameInput').value.trim(),
    size: document.getElementById('frameSizeInput').value,
    type: document.getElementById('frameTypeInput').value,
    image_url: form.dataset.imageUrl,
  };

  try {
    if (form.dataset.editId) {
      await apiRequest(`/frames?id=${form.dataset.editId}`, { method: 'PUT', body: payload });
      showToast('Bingkai diperbarui.');
    } else {
      await apiRequest('/frames', { method: 'POST', body: payload });
      showToast('Bingkai ditambahkan.');
    }
    document.getElementById('frameModal').classList.remove('open');
    await loadFrames();
    renderFramesGrid();
    await loadStats();
  } catch (err) {
    showToast(err.message || 'Gagal menyimpan bingkai.');
  }
}

function renderFramesGrid() {
  const grid = document.getElementById('adminFrameGrid');
  const frames = getAllFrames();

  grid.innerHTML = frames.map((frame) => `
    <div class="admin-frame-card">
      <img src="${frame.image_url}" alt="${escapeHtml(frame.name)}">
      <div class="afc-name">${escapeHtml(frame.name)}</div>
      <div class="afc-meta">${frame.size} · ${frame.type === 'free' ? 'Gratis' : '👑 Premium'}</div>
      <div class="afc-actions">
        <button class="btn btn-outline btn-sm" data-edit="${frame.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-delete="${frame.id}">Hapus</button>
      </div>
    </div>
  `).join('') || '<p style="opacity:.6">Belum ada bingkai.</p>';

  grid.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openFrameModal(frames.find((f) => f.id === Number(btn.dataset.edit))));
  });
  grid.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => handleFrameDelete(Number(btn.dataset.delete)));
  });
}

async function handleFrameDelete(id) {
  if (!confirm('Hapus bingkai ini?')) return;
  try {
    await apiRequest(`/frames?id=${id}`, { method: 'DELETE' });
    showToast('Bingkai dihapus.');
    await loadFrames();
    renderFramesGrid();
    await loadStats();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus bingkai.');
  }
}

// ---------- Panel: Kode Premium ----------

function setupCodeModal() {
  document.getElementById('generateCodeBtn').addEventListener('click', () => {
    document.getElementById('codeForm').reset();
    document.getElementById('codeResultBox').style.display = 'none';
    document.getElementById('codeModal').classList.add('open');
  });
  document.getElementById('codeForm').addEventListener('submit', handleGenerateCodes);
  document.querySelectorAll('input[name="duration"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.getElementById('customDurationInput').disabled = radio.value !== 'custom' || !radio.checked;
    });
  });
  document.querySelectorAll('[data-close-code-modal]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById('codeModal').classList.remove('open'));
  });
  document.getElementById('copyAllCodesBtn').addEventListener('click', copyAllGeneratedCodes);
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
  const list = document.getElementById('codeResultList');
  list.innerHTML = codes.map((c) => `<div class="code-chip">${c.code}</div>`).join('');
  box.style.display = 'block';
  box.dataset.codes = codes.map((c) => c.code).join('\n');
}

function copyAllGeneratedCodes() {
  const codes = document.getElementById('codeResultBox').dataset.codes || '';
  navigator.clipboard.writeText(codes);
  showToast('Semua kode disalin.');
}

async function loadCodes() {
  try {
    const { codes } = await apiRequest('/premium?action=codes');
    renderCodesTable(codes);
  } catch (err) {
    showToast(err.message || 'Gagal memuat kode premium.');
  }
}

function renderCodesTable(codes) {
  const tbody = document.getElementById('codesTableBody');
  const activeCodes = codes.filter((c) => c.status === 'active');
  tbody.innerHTML = activeCodes.map((c) => `
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

  tbody.querySelectorAll('[data-copy-code]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copyCode);
      showToast('Kode disalin.');
    });
  });
  tbody.querySelectorAll('[data-delete-code]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteCode(Number(btn.dataset.deleteCode)));
  });
}

function statusLabel(status) {
  return { active: 'Active', used: 'Used', expired: 'Expired' }[status] || status;
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
    renderUsersTable('all');
  } catch (err) {
    showToast(err.message || 'Gagal memuat user.');
  }
}

function setupUserFilter() {
  document.querySelectorAll('[data-user-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-user-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderUsersTable(btn.dataset.userFilter);
    });
  });
}

function renderUsersTable(filter) {
  const isPremium = (u) => u.premium_until && new Date(u.premium_until) > new Date();
  const filtered = _usersCache.filter((u) => {
    if (filter === 'premium') return isPremium(u);
    if (filter === 'free') return !isPremium(u);
    return true;
  });

  document.getElementById('userStatTotal').textContent = _usersCache.length;
  document.getElementById('userStatPremium').textContent = _usersCache.filter(isPremium).length;
  document.getElementById('userStatFree').textContent = _usersCache.filter((u) => !isPremium(u)).length;

  document.getElementById('usersTableBody').innerHTML = filtered.map((u) => {
    const premium = isPremium(u);
    const daysLeft = premium ? Math.ceil((new Date(u.premium_until) - new Date()) / 86400000) : null;
    const statusHtml = premium
      ? `<span class="status-tag status-used">👑 Premium</span> <span style="opacity:.6;font-size:.78rem">${daysLeft} hari lagi</span>`
      : '<span class="status-tag status-active">Gratis</span>';
    return `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${statusHtml}</td>
        <td><button class="btn btn-danger btn-sm" data-delete-user="${u.id}">Hapus</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4" style="opacity:.6">Belum ada user.</td></tr>';

  document.querySelectorAll('[data-delete-user]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteUser(Number(btn.dataset.deleteUser)));
  });
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

// ---------- Panel: Foto ----------

async function loadPhotos() {
  try {
    const { photos } = await apiRequest('/photos');
    document.getElementById('photosGrid').innerHTML = photos.map((p) => `
      <div class="photo-card">
        <img src="${p.image_data}" alt="Foto ${escapeHtml(p.username || '')}">
        <div class="pc-meta">${escapeHtml(p.username || 'Guest')}</div>
        <div class="pc-meta">Hapus otomatis: ${formatIndonesianDate(p.expires_at)}</div>
        <button class="btn ${p.featured ? 'btn-primary' : 'btn-outline'} btn-sm" data-toggle-featured="${p.id}" data-featured="${p.featured}">
          ${p.featured ? '★ Di Galeri' : '☆ Tampilkan di Galeri'}
        </button>
        <button class="btn btn-danger btn-sm" data-delete-photo="${p.id}">Hapus</button>
      </div>
    `).join('') || '<p style="opacity:.6">Belum ada foto.</p>';

    document.querySelectorAll('[data-delete-photo]').forEach((btn) => {
      btn.addEventListener('click', () => handleDeletePhoto(Number(btn.dataset.deletePhoto)));
    });
    document.querySelectorAll('[data-toggle-featured]').forEach((btn) => {
      btn.addEventListener('click', () => handleToggleFeatured(
        Number(btn.dataset.toggleFeatured), btn.dataset.featured !== 'true',
      ));
    });
  } catch (err) {
    showToast(err.message || 'Gagal memuat foto.');
  }
}

async function handleToggleFeatured(id, nextFeatured) {
  try {
    await apiRequest(`/photos?id=${id}`, { method: 'PUT', body: { featured: nextFeatured } });
    showToast(nextFeatured ? 'Foto ditambahkan ke galeri.' : 'Foto dihapus dari galeri.');
    await loadPhotos();
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui galeri.');
  }
}

async function handleDeletePhoto(id) {
  if (!confirm('Hapus foto ini?')) return;
  try {
    await apiRequest(`/photos?id=${id}`, { method: 'DELETE' });
    showToast('Foto dihapus.');
    await loadPhotos();
    await loadStats();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus foto.');
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