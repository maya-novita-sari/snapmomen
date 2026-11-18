// Pengaturan perangkat (kamera dan printer) yang disimpan admin di database lewat /settings.
// Dipakai dashboard admin dan halaman studio. localStorage hanya cadangan kalau server tidak terjangkau.

const DEVICE_SETTINGS_CACHE_KEY = 'snapmomen_device_settings';

function readCachedDeviceSettings() {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_SETTINGS_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCachedDeviceSettings(settings) {
  try {
    localStorage.setItem(DEVICE_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage bisa diblokir, abaikan saja.
  }
}

function pickDeviceSettings(settings) {
  return {
    kamera_device_id: settings.kamera_device_id || '',
    kamera_label: settings.kamera_label || '',
    printer_name: settings.printer_name || '',
    printer_vendor_id: settings.printer_vendor_id || '',
    printer_product_id: settings.printer_product_id || '',
  };
}

async function loadDeviceSettings() {
  try {
    const { settings } = await apiRequest('/settings', { auth: false });
    const deviceSettings = pickDeviceSettings(settings);
    writeCachedDeviceSettings(deviceSettings);
    return deviceSettings;
  } catch {
    return pickDeviceSettings(readCachedDeviceSettings());
  }
}

async function saveDeviceSettings(partialSettings) {
  const { settings } = await apiRequest('/settings', { method: 'POST', body: partialSettings });
  const deviceSettings = pickDeviceSettings(settings);
  writeCachedDeviceSettings(deviceSettings);
  return deviceSettings;
}

// ---------- Kamera ----------

function buildVideoConstraints(deviceId) {
  if (!deviceId) return { facingMode: 'user' };
  return { deviceId: { ideal: deviceId } };
}

async function listVideoInputs() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

// deviceId bisa berubah antar browser atau setelah izin direset, jadi label dipakai sebagai cadangan.
async function resolveCameraDeviceId(settings) {
  const inputs = await listVideoInputs();
  if (inputs.some((input) => input.deviceId === settings.kamera_device_id)) return settings.kamera_device_id;
  const byLabel = inputs.find((input) => input.label && input.label === settings.kamera_label);
  return byLabel ? byLabel.deviceId : '';
}

// Membuka kamera default admin. Kalau kamera tersimpan tidak ada, otomatis pakai kamera bawaan browser.
async function openConfiguredCameraStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Browser tidak mendukung kamera. Pakai HTTPS atau localhost.');
  }
  const settings = await loadDeviceSettings();
  let deviceId = '';
  try {
    deviceId = settings.kamera_device_id ? await resolveCameraDeviceId(settings) : '';
  } catch {
    deviceId = '';
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: buildVideoConstraints(deviceId), audio: false });
  } catch (err) {
    if (!deviceId) throw err;
    return navigator.mediaDevices.getUserMedia({ video: buildVideoConstraints(''), audio: false });
  }
}
