// Card "Koneksi Printer" di dashboard admin (printer Epson lewat kabel extension USB).
// Metode: WebUSB untuk memilih, menyimpan dan memantau printer. Pencetakan sendiri lewat print.js
// (WebUSB lalu dialog cetak browser, yang memakai driver Epson di sistem operasi).

const PRINTER_CONNECT_ATTEMPTS = 3;
const PRINTER_RETRY_DELAY_MS = 800;
const PRINTER_STATUS_TEXT = { connected: 'Terhubung', disconnected: 'Terputus', idle: 'Belum terhubung' };

const PrinterPanelState = { devices: [], connectedKey: '' };

function getUsbDeviceKey(device) {
  return `${device.vendorId}:${device.productId}`;
}

function formatUsbDeviceName(device) {
  const hex = (value) => value.toString(16).padStart(4, '0');
  return `${device.productName || 'Printer USB'} (${hex(device.vendorId)}:${hex(device.productId)})`;
}

function waitMs(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function describePrinterError(err) {
  if (err && err.name === 'NotFoundError') return 'Tidak ada printer yang dipilih.';
  if (err && err.name === 'SecurityError') return 'Akses USB diblokir. Pakai HTTPS dan izinkan akses perangkat.';
  if (err && err.name === 'NetworkError') return 'Printer tidak merespons. Cek kabel extension, pastikan kabel data dan printer menyala.';
  if (err && err.name === 'InvalidStateError') return 'Printer sedang dipakai aplikasi lain. Tutup aplikasi cetak lain lalu coba lagi.';
  return (err && err.message) || 'Gagal menghubungkan printer.';
}

function renderPrinterStatus(state, detail) {
  const statusEl = document.getElementById('printerStatus');
  statusEl.textContent = detail ? `${PRINTER_STATUS_TEXT[state]}: ${detail}` : PRINTER_STATUS_TEXT[state];
  statusEl.dataset.state = state;
  document.getElementById('disconnectPrinterBtn').disabled = state === 'idle';
  document.getElementById('testPrintBtn').disabled = state === 'idle';
}

function renderPrinterError(message) {
  const errorEl = document.getElementById('printerError');
  errorEl.textContent = message || '';
  errorEl.hidden = !message;
}

function renderPrinterOptions(savedKey) {
  const select = document.getElementById('printerSelect');
  select.innerHTML = '';
  if (!PrinterPanelState.devices.length) {
    select.add(new Option('Tidak ada printer terdeteksi', ''));
    return;
  }
  PrinterPanelState.devices.forEach((device) => {
    select.add(new Option(formatUsbDeviceName(device), getUsbDeviceKey(device)));
  });
  if (savedKey) select.value = savedKey;
}

async function listPairedPrinters() {
  if (!navigator.usb) return [];
  return navigator.usb.getDevices();
}

// Membuka lalu menutup lagi perangkat untuk memastikan benar-benar bisa diakses. Diulang karena kabel extension sering putus-nyambung.
async function verifyUsbDevice(device) {
  let lastError = null;
  for (let attempt = 1; attempt <= PRINTER_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      if (!device.opened) await device.open();
      await device.close();
      return;
    } catch (err) {
      lastError = err;
      if (attempt < PRINTER_CONNECT_ATTEMPTS) await waitMs(PRINTER_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function savedKeyFromSettings(settings) {
  return settings.printer_vendor_id ? `${settings.printer_vendor_id}:${settings.printer_product_id}` : '';
}

async function persistPrinterChoice(device) {
  const name = device ? formatUsbDeviceName(device) : '';
  await saveDeviceSettings({
    printer_name: name,
    printer_vendor_id: device ? String(device.vendorId) : '',
    printer_product_id: device ? String(device.productId) : '',
  });
  await apiRequest('/printer', { method: 'POST', body: { printer_name: name || null, connected: Boolean(device) } });
}

async function refreshPrinterPanel() {
  const settings = await loadDeviceSettings();
  const savedKey = savedKeyFromSettings(settings);
  PrinterPanelState.devices = await listPairedPrinters();
  renderPrinterOptions(savedKey);

  if (!savedKey) return renderPrinterStatus('idle');
  const savedDevice = PrinterPanelState.devices.find((device) => getUsbDeviceKey(device) === savedKey);
  if (!savedDevice) return renderPrinterStatus('disconnected', settings.printer_name);
  PrinterPanelState.connectedKey = savedKey;
  return renderPrinterStatus('connected', settings.printer_name);
}

async function handleConnectPrinter() {
  renderPrinterError('');
  try {
    if (!navigator.usb) throw new Error('Browser ini tidak mendukung WebUSB. Pakai Chrome atau Edge di HTTPS.');
    const selectedKey = document.getElementById('printerSelect').value;
    let device = PrinterPanelState.devices.find((item) => getUsbDeviceKey(item) === selectedKey);
    if (!device) device = await connectUsbPrinter();
    await verifyUsbDevice(device);
    await persistPrinterChoice(device);
    showToast('Printer terhubung.');
  } catch (err) {
    renderPrinterError(describePrinterError(err));
  }
  await refreshPrinterPanel();
}

async function handleDisconnectPrinter() {
  renderPrinterError('');
  try {
    await persistPrinterChoice(null);
    showToast('Printer diputuskan.');
  } catch (err) {
    renderPrinterError(err.message || 'Gagal memutuskan printer.');
  }
  await refreshPrinterPanel();
}

async function handleTestPrint() {
  renderPrinterError('');
  const testImage = 'data:image/svg+xml;base64,' + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#FDF6E3"/><text x="20" y="100" font-size="20">Snapmomen Test Print</text></svg>',
  );
  await printPhoto(testImage);
}

// Kabel dicabut atau dicolok lagi: perbarui status. Printer tersimpan otomatis tersambung kembali tanpa klik.
async function handleUsbPlugChange() {
  await refreshPrinterPanel();
  const statusEl = document.getElementById('printerStatus');
  if (statusEl.dataset.state === 'disconnected') renderPrinterError('Printer terputus. Cek kabel extension, lalu colok ulang.');
  if (statusEl.dataset.state === 'connected') renderPrinterError('');
}

function setupPrinterPanel() {
  document.getElementById('connectPrinterBtn').addEventListener('click', handleConnectPrinter);
  document.getElementById('disconnectPrinterBtn').addEventListener('click', handleDisconnectPrinter);
  document.getElementById('testPrintBtn').addEventListener('click', handleTestPrint);
  if (navigator.usb) {
    navigator.usb.addEventListener('connect', handleUsbPlugChange);
    navigator.usb.addEventListener('disconnect', handleUsbPlugChange);
  }
  refreshPrinterPanel().catch((err) => renderPrinterError(describePrinterError(err)));
}
