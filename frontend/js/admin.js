let editingFrameId = null;
let framesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAdmin()) return;

  document.querySelectorAll('.side-link[data-panel]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.side-link').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.panel).classList.add('active');
      loadPanel(btn.dataset.panel);
    };
  });

  await loadDashboard();
  await loadFrames();
});

function loadPanel(panel) {
  const loaders = {
    panelUsers  : loadUsers,
    panelCodes  : loadCodes,
    panelHistory: loadHistory,
    panelPhotos : loadPhotos
  };
  if (loaders[panel]) loaders[panel]();
}

async function loadDashboard() {
  try {
    const stats = await apiFetch('/api/dashboard/stats');
    setText('statPhotos', stats.totalPhotos);
    setText('statUsers', stats.totalUsers);
    setText('statPremium', stats.premiumUsers);
    setText('statFree', stats.freeUsers);
    setText('statFrames', stats.totalFrames);
    setText('statCodesActive', stats.codesActive);
    setText('statCodesUsed', stats.codesUsed);
  } catch (e) {
    console.error(e);
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadFrames() {
  framesCache = await apiFetch('/api/frames');
  const grid = document.getElementById('frameGrid');
  grid.innerHTML = '';

  framesCache.forEach(f => {
    const card = document.createElement('div');
    card.className = 'admin-frame-card';
    card.innerHTML = `
      <img src="${f.image_url}" alt="${f.name}">
      <div><b>${f.name}</b></div>
      <div style="font-size:0.85rem;color:#666">${f.size} · ${f.type}</div>
      <div>
        <button class="btn-sm" onclick="editFrame(${f.id})">Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteFrame(${f.id})">Hapus</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function loadUsers(filter = '') {
  const data = await apiFetch(`/api/users${filter}`);
  const tbody = document.getElementById('userTable');
  tbody.innerHTML = '';

  data.users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.email}</td>
      <td>${u.isPremium ? `Premium (${u.daysLeft}hr)` : 'Free'}</td>
      <td><button class="btn-sm btn-danger" onclick="deleteUser(${u.id})">Hapus</button></td>
    `;
    tbody.appendChild(tr);
  });

  setText('userTotal', data.total);
  setText('userPremium', data.premium);
  setText('userFree', data.free);
}

async function loadCodes(filter = '') {
  const data = await apiFetch(`/api/premium/codes${filter}`);
  const tbody = document.getElementById('codeTable');
  tbody.innerHTML = '';

  data.codes.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${c.code}</code></td>
      <td>${c.duration_days} hari</td>
      <td>${c.status}</td>
      <td>
        ${c.status === 'active' ? `<button class="btn-sm" onclick="copyCode('${c.code}')">Copy</button>` : '-'}
        <button class="btn-sm btn-danger" onclick="deleteCode(${c.id})">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  setText('codeTotal', data.total);
  setText('codeActive', data.active);
  setText('codeUsed', data.used);
  setText('codeExpired', data.expired);
}

async function loadHistory() {
  const data = await apiFetch('/api/premium/codes-history');
  const tbody = document.getElementById('historyTable');
  tbody.innerHTML = '';

  data.history.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${h.code}</code></td>
      <td>${h.used_by_username || '-'}</td>
      <td>${h.duration_days} hari</td>
      <td>${h.expires_at ? new Date(h.expires_at).toLocaleDateString('id-ID') : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadPhotos() {
  const photos = await apiFetch('/api/photos');
  const grid = document.getElementById('photoGrid');
  grid.innerHTML = '';

  if (photos.length === 0) {
    grid.innerHTML = '<p style="color:#999">Belum ada foto.</p>';
    return;
  }

  photos.forEach(p => {
    const card = document.createElement('div');
    card.className = 'admin-photo-card';
    card.innerHTML = `
      <img src="${p.image_data || ''}" style="max-height:200px;object-fit:cover">
      <div style="font-size:0.8rem;color:#666">User: ${p.username || p.user_id}</div>
      <div style="font-size:0.8rem;color:#666">Expired: ${new Date(p.expires_at).toLocaleDateString('id-ID')}</div>
      <button class="btn-sm btn-danger" onclick="deletePhoto(${p.id})">Hapus</button>
    `;
    grid.appendChild(card);
  });
}

function openAddFrame() {
  editingFrameId = null;
  document.getElementById('modalTitle').textContent = 'Tambah Bingkai';
  document.getElementById('frameName').value = '';
  document.getElementById('frameSize').value = '5x15';
  document.getElementById('frameType').value = 'free';
  document.getElementById('frameFile').value = '';
  document.getElementById('framePreview').style.display = 'none';
  document.getElementById('modalFrame').classList.add('open');
}

function editFrame(id) {
  const f = framesCache.find(x => x.id === id);
  if (!f) return;

  editingFrameId = id;
  document.getElementById('modalTitle').textContent = 'Edit Bingkai';
  document.getElementById('frameName').value = f.name;
  document.getElementById('frameSize').value = f.size;
  document.getElementById('frameType').value = f.type;

  const preview = document.getElementById('framePreview');
  preview.src = f.image_url;
  preview.style.display = 'block';

  document.getElementById('modalFrame').classList.add('open');
}

async function saveFrame() {
  const name = document.getElementById('frameName').value.trim();
  const size = document.getElementById('frameSize').value;
  const type = document.getElementById('frameType').value;
  const file = document.getElementById('frameFile').files[0];

  if (!name) return alert('Nama wajib diisi');

  let image_url;
  if (file) image_url = await fileToDataURL(file);
  else if (editingFrameId) image_url = framesCache.find(x => x.id === editingFrameId).image_url;
  else return alert('Pilih gambar');

  if (editingFrameId) {
    await apiFetch(`/api/frames/${editingFrameId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, size, type })
    });
  } else {
    await apiFetch('/api/frames', {
      method: 'POST',
      body: JSON.stringify({ name, size, type, image_url })
    });
  }

  closeModal('modalFrame');
  await loadFrames();
  await loadDashboard();
}

async function deleteFrame(id) {
  if (!confirm('Hapus bingkai ini?')) return;
  await apiFetch(`/api/frames/${id}`, { method: 'DELETE' });
  await loadFrames();
  await loadDashboard();
}

async function deleteUser(id) {
  if (!confirm('Hapus user ini?')) return;
  await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
  await loadUsers();
}

async function deleteCode(id) {
  if (!confirm('Hapus kode ini?')) return;
  await apiFetch(`/api/premium/codes/${id}`, { method: 'DELETE' });
  await loadCodes();
}

async function deletePhoto(id) {
  if (!confirm('Hapus foto ini?')) return;
  await apiFetch(`/api/photos/${id}`, { method: 'DELETE' });
  await loadPhotos();
}

function openGenerateModal() {
  document.getElementById('genCount').value = 1;
  document.getElementById('genDuration').value = 30;
  document.getElementById('genCustom').value = '';
  document.getElementById('genCustom').disabled = true;
  document.getElementById('genResult').style.display = 'none';
  document.getElementById('modalGenerate').classList.add('open');
}

function toggleCustomDuration() {
  const selected = getSelectedDuration();
  const customInput = document.getElementById('genCustom');
  customInput.disabled = selected !== 'custom';
  if (selected === 'custom') customInput.focus();
}

function getSelectedDuration() {
  const radios = document.getElementsByName('duration');
  for (const r of radios) if (r.checked) return r.value;
  return '30';
}

async function doGenerate() {
  const count = parseInt(document.getElementById('genCount').value);
  let duration = getSelectedDuration();
  if (duration === 'custom') duration = parseInt(document.getElementById('genCustom').value);
  duration = parseInt(duration);

  if (!count || count < 1) return alert('Jumlah minimal 1');
  if (!duration || duration < 1) return alert('Durasi minimal 1 hari');

  try {
    const res = await apiFetch('/api/premium/codes', {
      method: 'POST',
      body: JSON.stringify({ count, duration_days: duration })
    });

    const resultBox = document.getElementById('genResult');
    resultBox.style.display = 'block';
    document.getElementById('genResultCodes').innerHTML = res.codes
      .map(c => `<div style="font-family:monospace;padding:4px;background:#f5f5f5;border-radius:4px;margin:4px 0">${c}</div>`)
      .join('');
    document.getElementById('genResultInfo').textContent = `${res.count} kode · ${res.duration_days} hari`;

    await loadCodes();
    await loadDashboard();
  } catch (e) {
    alert('Gagal generate: ' + e.message);
  }
}

function copyAllCodes() {
  const codes = document.querySelectorAll('#genResultCodes div');
  const text = Array.from(codes).map(c => c.textContent).join('\n');
  navigator.clipboard.writeText(text);
  alert('Semua kode dicopy!');
}

function copyCode(code) {
  navigator.clipboard.writeText(code);
  alert('Kode dicopy: ' + code);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function fileToDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}