// Jumlah cetak, harga, dan pembayaran QRIS dinamis (khusus akun admin).

const DEFAULT_SESSION_PRICE = 40000;
const DEFAULT_EXTRA_PRINT_PRICE = 20000;
const MIN_PRINT_COPIES = 1;
const MAX_PRINT_COPIES = 99;
const PAYMENT_POLL_INTERVAL_MS = 4000;
const PAYMENT_REF_STORAGE_KEY = 'snapmomen_payment_ref';
const PAYMENT_CREATE_TIMEOUT_MS = 30000;

const PricingState = {
  sessionPrice: DEFAULT_SESSION_PRICE,
  extraPrintPrice: DEFAULT_EXTRA_PRINT_PRICE,
  isPricingLoaded: false,
};

// order: { orderId, copies, amount, status, qrUrl, createdAt, isConsumed } atau null.
const PaymentState = {
  order: null,
  errorMessage: '',
  isCreating: false,
  isChecking: false,
  pollTimerId: null,
  requestId: 0,
  fallbackRef: '',
};

let printCopies = MIN_PRINT_COPIES;

// ---------- Format dan hitung harga ----------

function formatRupiah(amount) {
  return `Rp. ${Number(amount).toLocaleString('id-ID')}`;
}

function calculateTotalPrice(sessionPrice, extraPrintPrice, copies) {
  return sessionPrice + (copies - 1) * extraPrintPrice;
}

// Jumlah lembar yang sudah dibayar pada sesi ini, dipakai saat mencetak hasil.
function getPaidPrintCopies() {
  return printCopies;
}

function getEstimatedTotalPrice() {
  return calculateTotalPrice(PricingState.sessionPrice, PricingState.extraPrintPrice, printCopies);
}

async function loadPricingSettings() {
  if (PricingState.isPricingLoaded) return;
  try {
    const { settings } = await apiRequest('/settings', { auth: false });
    PricingState.sessionPrice = settings.harga_sesi;
    PricingState.extraPrintPrice = settings.harga_tambah_cetak;
    PricingState.isPricingLoaded = true;
  } catch (err) {
    showToast(err.message || 'Gagal memuat harga. Memakai harga bawaan.');
  }
}

// ---------- Halaman jumlah cetak ----------

function clampPrintCopies(rawValue) {
  const parsed = Math.floor(Number(rawValue));
  if (!Number.isFinite(parsed)) return MIN_PRINT_COPIES;
  return Math.min(MAX_PRINT_COPIES, Math.max(MIN_PRINT_COPIES, parsed));
}

function renderPrintCountControls() {
  const input = document.getElementById('print-count-input');
  if (Number(input.value) !== printCopies && document.activeElement !== input) input.value = printCopies;
  document.getElementById('btn-count-minus').disabled = printCopies <= MIN_PRINT_COPIES;
  document.getElementById('btn-count-plus').disabled = printCopies >= MAX_PRINT_COPIES;
}

function renderExtraPrintNote() {
  document.getElementById('print-price-note').textContent =
    'Setiap menambah satu lembar hasil cetak akan di kenai biaya tambahan per satu lembar '
    + formatRupiah(PricingState.extraPrintPrice);
}

function setPrintCopies(rawValue) {
  printCopies = clampPrintCopies(rawValue);
  renderPrintCountControls();
}

function resetPrintCopies() {
  printCopies = MIN_PRINT_COPIES;
  const input = document.getElementById('print-count-input');
  if (input) input.value = MIN_PRINT_COPIES;
  if (document.getElementById('btn-count-minus')) renderPrintCountControls();
}

async function preparePrintCountScreen() {
  renderPrintCountControls();
  renderExtraPrintNote();
  await loadPricingSettings();
  renderExtraPrintNote();
}

function setupPrintCountControls() {
  const input = document.getElementById('print-count-input');
  document.getElementById('btn-count-minus').addEventListener('click', () => setPrintCopies(printCopies - 1));
  document.getElementById('btn-count-plus').addEventListener('click', () => setPrintCopies(printCopies + 1));
  input.addEventListener('input', () => {
    if (input.value === '') return;
    setPrintCopies(input.value);
  });
  input.addEventListener('change', () => {
    setPrintCopies(input.value);
    input.value = printCopies;
  });
  renderPrintCountControls();
}

// ---------- Halaman pembayaran: tampilan ----------

function buildPaymentBreakdownText() {
  const extraCopies = printCopies - 1;
  const sessionText = `Sesi ${formatRupiah(PricingState.sessionPrice)}`;
  if (extraCopies === 0) return `${sessionText}, 1 lembar cetak`;
  return `${sessionText} + ${extraCopies} cetak tambahan x ${formatRupiah(PricingState.extraPrintPrice)}`;
}

function buildPaymentStatusText() {
  const order = PaymentState.order;
  if (PaymentState.errorMessage) return PaymentState.errorMessage;
  if (PaymentState.isCreating || !order) return 'Membuat QR pembayaran...';
  if (order.status === 'paid') {
    return order.amount === 0 ? 'Tidak ada biaya, silakan lanjut.' : 'Pembayaran diterima. Silakan lanjut.';
  }
  if (order.status === 'pending') return 'Menunggu pembayaran...';
  if (order.status === 'used') return 'Pembayaran ini sudah dipakai. Klik tombol di bawah untuk membuat QR baru.';
  return 'QR sudah tidak berlaku. Klik tombol di bawah untuk membuat QR baru.';
}

function renderPaymentQr() {
  const image = document.getElementById('payment-qr-image');
  const message = document.getElementById('payment-qr-message');
  const qrUrl = PaymentState.order?.qrUrl || '';
  const isActiveQr = Boolean(qrUrl) && PaymentState.order.status === 'pending';

  if (isActiveQr && image.getAttribute('src') !== qrUrl) image.src = qrUrl;
  if (!isActiveQr) image.removeAttribute('src');
  image.style.display = isActiveQr ? 'block' : 'none';
  message.style.display = isActiveQr ? 'none' : 'block';
  const isPaid = PaymentState.order?.status === 'paid';
  message.textContent = isPaid ? 'Pembayaran berhasil' : buildPaymentStatusText();
  message.classList.toggle('is-paid', isPaid);
  document.getElementById('payment-paid-icon').style.display = isPaid ? 'block' : 'none';
}

function renderPaymentSummary() {
  const order = PaymentState.order;
  document.getElementById('payment-total').textContent = formatRupiah(order ? order.amount : getEstimatedTotalPrice());
  document.getElementById('payment-breakdown').textContent = buildPaymentBreakdownText();

  const status = document.getElementById('payment-status');
  status.textContent = buildPaymentStatusText();
  status.classList.toggle('is-paid', order?.status === 'paid');

  document.getElementById('btn-payment-continue').disabled = PaymentState.isCreating || PaymentState.isChecking;
  // Setelah lunas, jumlah cetak tidak boleh diubah lagi supaya tidak perlu bayar ulang.
  document.getElementById('btn-payment-back').disabled = order?.status === 'paid';
}

function renderPaymentScreen() {
  renderPaymentSummary();
  renderPaymentQr();
}

// ---------- Halaman pembayaran: order dan polling ----------

// ID sesi studio. Server memakainya supaya satu sesi tidak pernah punya dua QR aktif, walau halaman di-reload
// atau tombol ditekan dua kali. Disimpan di sessionStorage supaya reload tetap mendapat QR yang sama.
function generatePaymentRef() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function getPaymentRef() {
  try {
    const stored = sessionStorage.getItem(PAYMENT_REF_STORAGE_KEY);
    if (stored) return stored;
    const created = generatePaymentRef();
    sessionStorage.setItem(PAYMENT_REF_STORAGE_KEY, created);
    return created;
  } catch {
    if (!PaymentState.fallbackRef) PaymentState.fallbackRef = generatePaymentRef();
    return PaymentState.fallbackRef;
  }
}

function renewPaymentRef() {
  PaymentState.fallbackRef = '';
  try {
    sessionStorage.removeItem(PAYMENT_REF_STORAGE_KEY);
  } catch {
    // sessionStorage tidak tersedia, ID berikutnya dibuat dari fallbackRef.
  }
}

// Satu pembayaran hanya untuk satu sesi. Setelah dipakai, admin tidak perlu dan tidak boleh membayar lagi di sesi yang sama.
function hasPaidSession() {
  return PaymentState.order?.isConsumed === true;
}

function isPaymentScreenActive() {
  return document.getElementById('screen-payment').classList.contains('active');
}

function shouldCreateNewOrder() {
  const order = PaymentState.order;
  if (!order) return true;
  if (order.copies !== printCopies) return true;
  return order.status !== 'pending' && order.status !== 'paid';
}

// QR yang ditinggalkan dibatalkan di server supaya tidak bisa dibayar lagi (anti bayar dobel).
function cancelPaymentOrder(order) {
  if (!order || order.status !== 'pending') return;
  apiRequest('/payment/cancel', { method: 'POST', body: { order_id: order.orderId } })
    .catch((err) => console.warn('Gagal membatalkan QR lama:', err));
}

async function createPaymentOrder() {
  const requestId = ++PaymentState.requestId;
  stopPaymentPolling();
  cancelPaymentOrder(PaymentState.order);
  PaymentState.order = null;
  PaymentState.errorMessage = '';
  PaymentState.isCreating = true;
  renderPaymentScreen();

  try {
    const data = await apiRequest('/payment/create', {
      method: 'POST',
      body: { print_copies: printCopies, client_ref: getPaymentRef() },
      timeoutMs: PAYMENT_CREATE_TIMEOUT_MS,
    });
    if (requestId !== PaymentState.requestId) return;
    PaymentState.order = {
      orderId: data.order_id,
      copies: printCopies,
      amount: data.amount,
      status: data.status,
      qrUrl: data.qr_url,
      createdAt: Date.now(),
    };
  } catch (err) {
    if (requestId !== PaymentState.requestId) return;
    PaymentState.errorMessage = err.message || 'Gagal membuat QR pembayaran.';
  } finally {
    if (requestId === PaymentState.requestId) {
      PaymentState.isCreating = false;
      renderPaymentScreen();
      if (isPaymentScreenActive()) startPaymentPolling();
    }
  }
}

async function refreshPaymentStatus() {
  const order = PaymentState.order;
  if (!order || order.status === 'paid') return;
  try {
    const data = await apiRequest(`/payment/status?order_id=${encodeURIComponent(order.orderId)}`);
    if (PaymentState.order !== order) return;
    order.status = data.status;
    PaymentState.errorMessage = '';
  } catch (err) {
    console.warn('Cek status pembayaran gagal:', err);
  }
  renderPaymentScreen();
}

function startPaymentPolling() {
  stopPaymentPolling();
  const order = PaymentState.order;
  if (!order || order.status !== 'pending') return;
  PaymentState.pollTimerId = setInterval(async () => {
    await refreshPaymentStatus();
    if (PaymentState.order?.status !== 'pending') stopPaymentPolling();
  }, PAYMENT_POLL_INTERVAL_MS);
}

function stopPaymentPolling() {
  clearInterval(PaymentState.pollTimerId);
  PaymentState.pollTimerId = null;
}

function resetPaymentOrder() {
  PaymentState.requestId += 1;
  stopPaymentPolling();
  cancelPaymentOrder(PaymentState.order);
  renewPaymentRef();
  PaymentState.order = null;
  PaymentState.errorMessage = '';
  PaymentState.isCreating = false;
  PaymentState.isChecking = false;
}

async function preparePaymentScreen() {
  renderPaymentScreen();
  await loadPricingSettings();
  if (shouldCreateNewOrder()) {
    await createPaymentOrder();
  } else {
    renderPaymentScreen();
    startPaymentPolling();
  }
}

// Satu pembayaran hanya boleh membuka satu sesi. Server menolak kalau order ini sudah pernah dipakai.
async function consumePaidOrder(order) {
  if (order.isConsumed) return true;
  try {
    await apiRequest('/payment/consume', { method: 'POST', body: { order_id: order.orderId } });
    order.isConsumed = true;
    return true;
  } catch (err) {
    order.status = 'used';
    showToast(err.message || 'Pembayaran ini sudah dipakai.');
    return false;
  }
}

// Tombol "Sudah Bayar, Lanjut": hanya lanjut kalau server sudah mengonfirmasi pembayaran dan belum pernah dipakai.
async function handlePaymentContinue() {
  if (PaymentState.isCreating || PaymentState.isChecking) return;

  if (shouldCreateNewOrder()) {
    await createPaymentOrder();
    if (PaymentState.order?.status !== 'paid') {
      if (PaymentState.order) showToast('QR baru sudah dibuat. Silakan scan dan bayar.');
      return;
    }
  }

  PaymentState.isChecking = true;
  renderPaymentSummary();
  let canContinue = false;
  try {
    await refreshPaymentStatus();
    const order = PaymentState.order;
    canContinue = order?.status === 'paid' && await consumePaidOrder(order);
  } finally {
    PaymentState.isChecking = false;
    renderPaymentScreen();
  }

  if (canContinue) {
    stopPaymentPolling();
    goToScreen('screen-theme');
    return;
  }
  if (PaymentState.order?.status === 'pending') {
    showToast('Pembayaran belum diterima. Scan QR, bayar, lalu coba lagi.');
  }
}

function setupPaymentScreen() {
  document.getElementById('btn-payment-continue').addEventListener('click', handlePaymentContinue);
  document.getElementById('payment-qr-image').addEventListener('error', () => {
    document.getElementById('payment-qr-image').style.display = 'none';
    const message = document.getElementById('payment-qr-message');
    message.style.display = 'block';
    message.textContent = 'QR gagal dimuat. Kembali lalu buka halaman ini lagi.';
  });
}
