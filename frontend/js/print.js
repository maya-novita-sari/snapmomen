const PRINT_FRAME_CLEANUP_MS = 60000;
const PRINT_PAPER_WIDTH_MM = 100;
const PRINT_PAPER_HEIGHT_MM = 150;

// Layer 1: WebUSB (works only if a compatible printer was already paired via
// "Hubungkan Printer" and the browser/OS driver accepts raw JPEG bytes).
async function tryWebUsbPrint(dataUrl) {
  if (!navigator.usb) return false;
  try {
    const devices = await navigator.usb.getDevices();
    if (!devices.length) return false;

    const device = devices[0];
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    await device.claimInterface(0);

    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    await device.transferOut(1, bytes);
    await device.close();
    return true;
  } catch (err) {
    console.warn('WebUSB print gagal, lanjut ke fallback:', err);
    return false;
  }
}

// Layer 2: dialog cetak browser lewat iframe tersembunyi. Tidak kena popup blocker,
// dan dialognya otomatis menampilkan semua printer yang tersedia di perangkat.
function tryBrowserPrintDialog(dataUrl) {
  const printFrame = document.createElement('iframe');
  printFrame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(printFrame);

  const frameDocument = printFrame.contentDocument;
  frameDocument.open();
  frameDocument.write(`
    <html>
      <head>
        <title>Cetak Foto</title>
        <style>
          @page { size: ${PRINT_PAPER_WIDTH_MM}mm ${PRINT_PAPER_HEIGHT_MM}mm; margin: 0; }
          html, body { margin: 0; padding: 0; width: ${PRINT_PAPER_WIDTH_MM}mm; height: ${PRINT_PAPER_HEIGHT_MM}mm; }
          img { display: block; width: 100%; height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <img id="print-image" src="${dataUrl}">
      </body>
    </html>
  `);
  frameDocument.close();

  const image = frameDocument.getElementById('print-image');
  image.onload = () => {
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();
    setTimeout(() => printFrame.remove(), PRINT_FRAME_CLEANUP_MS);
  };
  return true;
}

async function hasPairedUsbPrinter() {
  if (!navigator.usb) return false;
  const pairedDevices = await navigator.usb.getDevices();
  return pairedDevices.length > 0;
}

async function registerPrinterOnServer(device) {
  try {
    await apiRequest('/printer', {
      method: 'POST',
      body: { printer_name: device.productName || 'USB Printer', connected: true },
    });
  } catch (err) {
    console.warn('Gagal mencatat printer ke server:', err);
  }
}

// Dipanggil langsung saat tombol Simpan diklik (butuh user gesture).
// Kalau belum ada printer terhubung, browser otomatis mencari printer USB.
// Jika dibatalkan atau tidak ada, alur lanjut ke dialog cetak browser.
async function ensurePrinterConnected() {
  if (!navigator.usb) return false;
  try {
    if (await hasPairedUsbPrinter()) return true;
    const device = await connectUsbPrinter();
    await registerPrinterOnServer(device);
    showToast('Printer terhubung.');
    return true;
  } catch (err) {
    console.warn('Pencarian printer USB dibatalkan atau gagal:', err);
    return false;
  }
}

// Orchestrates the fallback. Layer 3 (manual) just tells the user to print by hand.
async function printPhoto(dataUrl) {
  const printedViaUsb = await tryWebUsbPrint(dataUrl);
  if (printedViaUsb) {
    showToast('Foto dikirim ke printer.');
    return;
  }

  const openedDialog = tryBrowserPrintDialog(dataUrl);
  if (openedDialog) {
    showToast('Membuka dialog cetak...');
    return;
  }

  showToast('Tidak bisa membuka dialog cetak. Cetak manual dari dashboard admin.');
}

// Used by the admin dashboard's "Hubungkan Printer" button.
async function connectUsbPrinter() {
  if (!navigator.usb) throw new Error('Browser ini tidak mendukung WebUSB.');
  const device = await navigator.usb.requestDevice({ filters: [] });
  return device;
}