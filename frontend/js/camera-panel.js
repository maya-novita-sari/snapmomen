// Card "Pengaturan Kamera" di dashboard admin: pilih kamera default (termasuk kamera lewat kabel extension),
// tes live preview, dan pantau cabut/colok lewat event devicechange.

const CAMERA_STATUS_TEXT = { connected: 'Terhubung', disconnected: 'Terputus', idle: 'Belum dipilih' };

const CameraPanelState = { settings: {}, inputs: [], selectedId: '', testStream: null };

function stopStream(stream) {
  if (stream) stream.getTracks().forEach((track) => track.stop());
}

function describeCameraError(err) {
  if (!window.isSecureContext) return 'Kamera hanya jalan di HTTPS atau localhost.';
  if (err && err.name === 'NotAllowedError') return 'Izin kamera ditolak. Izinkan kamera di pengaturan browser.';
  if (err && err.name === 'NotFoundError') return 'Kamera tidak ditemukan. Cek kabel extension (harus kabel data, bukan kabel charge saja).';
  if (err && err.name === 'NotReadableError') return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.';
  return (err && err.message) || 'Gagal membuka kamera.';
}

function renderCameraError(message) {
  ['cameraError', 'cameraModalError'].forEach((id) => {
    const errorEl = document.getElementById(id);
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  });
}

function renderCameraStatus(state, detail) {
  const statusEl = document.getElementById('cameraStatus');
  statusEl.textContent = detail ? `${CAMERA_STATUS_TEXT[state]}: ${detail}` : CAMERA_STATUS_TEXT[state];
  statusEl.dataset.state = state;
}

function setVideoStream(videoId, stream) {
  const video = document.getElementById(videoId);
  video.srcObject = stream;
  video.hidden = !stream;
  if (stream) video.play().catch(() => {});
}

function stopCameraPreview() {
  stopStream(CameraPanelState.testStream);
  CameraPanelState.testStream = null;
  setVideoStream('cameraPreview', null);
  setVideoStream('cameraModalPreview', null);
}

async function openCameraStream(deviceId) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Browser tidak mendukung kamera. Pakai HTTPS atau localhost.');
  }
  return navigator.mediaDevices.getUserMedia({ video: buildVideoConstraints(deviceId), audio: false });
}

function findSavedCamera() {
  const { kamera_device_id: id, kamera_label: label } = CameraPanelState.settings;
  return CameraPanelState.inputs.find((input) => id && input.deviceId === id)
    || CameraPanelState.inputs.find((input) => label && input.label === label);
}

async function refreshCameraInputs() {
  CameraPanelState.inputs = await listVideoInputs();
  const saved = findSavedCamera();
  const label = CameraPanelState.settings.kamera_label;
  if (!CameraPanelState.settings.kamera_device_id) return renderCameraStatus('idle');
  return renderCameraStatus(saved ? 'connected' : 'disconnected', label);
}

// Label perangkat kosong sebelum izin kamera diberikan, jadi minta izin sekali lalu langsung dilepas.
async function ensureCameraPermission() {
  const probe = await openCameraStream('');
  stopStream(probe);
}

function renderCameraDeviceList() {
  const list = document.getElementById('cameraDeviceList');
  list.innerHTML = '';
  if (!CameraPanelState.inputs.length) {
    list.innerHTML = '<p class="device-empty">Tidak ada kamera terdeteksi.</p>';
    return;
  }
  CameraPanelState.inputs.forEach((input, index) => list.appendChild(buildCameraDeviceItem(input, index)));
}

function buildCameraDeviceItem(input, index) {
  const item = document.createElement('label');
  item.className = 'device-item';
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'cameraDevice';
  radio.value = input.deviceId;
  radio.checked = input.deviceId === CameraPanelState.selectedId;
  radio.addEventListener('change', () => selectCameraDevice(input.deviceId));
  const text = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = input.label || `Kamera ${index + 1}`;
  const meta = document.createElement('small');
  meta.textContent = `${input.kind} | ${input.deviceId || 'id tersembunyi'}`;
  text.append(title, document.createElement('br'), meta);
  item.append(radio, text);
  return item;
}

async function selectCameraDevice(deviceId) {
  CameraPanelState.selectedId = deviceId;
  await runCameraTest();
}

async function runCameraTest() {
  renderCameraError('');
  stopStream(CameraPanelState.testStream);
  try {
    CameraPanelState.testStream = await openCameraStream(CameraPanelState.selectedId);
    setVideoStream('cameraModalPreview', CameraPanelState.testStream);
  } catch (err) {
    setVideoStream('cameraModalPreview', null);
    renderCameraError(describeCameraError(err));
  }
}

async function openCameraModal() {
  renderCameraError('');
  openModal('cameraModal');
  try {
    await ensureCameraPermission();
  } catch (err) {
    renderCameraError(describeCameraError(err));
  }
  CameraPanelState.inputs = await listVideoInputs();
  const saved = findSavedCamera();
  CameraPanelState.selectedId = saved ? saved.deviceId : '';
  renderCameraDeviceList();
}

function closeCameraModal() {
  stopStream(CameraPanelState.testStream);
  CameraPanelState.testStream = null;
  setVideoStream('cameraModalPreview', null);
  closeModal('cameraModal');
  startCardPreview();
}

async function handleSaveCamera() {
  const chosen = CameraPanelState.inputs.find((input) => input.deviceId === CameraPanelState.selectedId);
  if (!chosen) return renderCameraError('Pilih satu kamera dulu.');
  try {
    CameraPanelState.settings = await saveDeviceSettings({
      kamera_device_id: chosen.deviceId,
      kamera_label: chosen.label,
    });
    showToast('Kamera default disimpan.');
    closeCameraModal();
    await refreshCameraInputs();
  } catch (err) {
    renderCameraError(err.message || 'Gagal menyimpan kamera.');
  }
}

// Preview kecil di card hanya jalan kalau izin kamera sudah pernah diberikan, supaya halaman tidak memunculkan prompt sendiri.
async function startCardPreview() {
  const saved = findSavedCamera();
  if (!saved || !navigator.mediaDevices) return setVideoStream('cameraPreview', null);
  stopStream(CameraPanelState.testStream);
  try {
    CameraPanelState.testStream = await openCameraStream(saved.deviceId);
    setVideoStream('cameraPreview', CameraPanelState.testStream);
  } catch (err) {
    setVideoStream('cameraPreview', null);
    renderCameraError(describeCameraError(err));
  }
}

async function handleCameraDeviceChange() {
  await refreshCameraInputs();
  const statusEl = document.getElementById('cameraStatus');
  if (statusEl.dataset.state === 'disconnected') {
    stopCameraPreview();
    renderCameraError('Kamera terputus. Cek kabel extension, lalu colok ulang.');
    return;
  }
  renderCameraError('');
  if (document.getElementById('cameraModal').classList.contains('open')) {
    CameraPanelState.inputs = await listVideoInputs();
    renderCameraDeviceList();
  } else {
    await startCardPreview();
  }
}

async function setupCameraPanel() {
  document.getElementById('cameraDevicesBtn').addEventListener('click', openCameraModal);
  document.getElementById('cameraTestBtn').addEventListener('click', openCameraModal);
  document.getElementById('cameraRetestBtn').addEventListener('click', runCameraTest);
  document.getElementById('cameraSaveBtn').addEventListener('click', handleSaveCamera);
  document.getElementById('cameraCloseBtn').addEventListener('click', closeCameraModal);
  if (!navigator.mediaDevices) return renderCameraError('Kamera hanya jalan di HTTPS atau localhost.');
  navigator.mediaDevices.addEventListener('devicechange', handleCameraDeviceChange);
  CameraPanelState.settings = await loadDeviceSettings();
  await refreshCameraInputs();
  await startCardPreview();
}
