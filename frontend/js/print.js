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

// Layer 2: browser print dialog with the photo filling the page.
function tryBrowserPrintDialog(dataUrl) {
  const printWindow = window.open('', '_blank', 'width=500,height=700');
  if (!printWindow) return false;

  printWindow.document.write(`
    <html>
      <head><title>Cetak Foto</title></head>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh">
        <img src="${dataUrl}" style="max-width:100%;max-height:100%" onload="window.print()">
      </body>
    </html>
  `);
  printWindow.document.close();
  return true;
}

// Orchestrates the 3-layer fallback. Layer 3 (manual) is just informing the
// user the file has already been downloaded so they can print it themselves.
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

  showToast('Tidak bisa membuka dialog cetak. Foto sudah terdownload, cetak manual dari file tersebut.');
}

// Used by the admin dashboard's "Hubungkan Printer" button.
async function connectUsbPrinter() {
  if (!navigator.usb) throw new Error('Browser ini tidak mendukung WebUSB.');
  const device = await navigator.usb.requestDevice({ filters: [] });
  return device;
}
