const ADMIN_WHATSAPP_NUMBER = '6285830116178';

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireLoggedIn('premium.html');
  if (!user) return;
  if (user.role === 'admin') {
    location.replace('dashboard-admin.html');
    return;
  }
  renderNavActions('#navActions');

  document.getElementById('waBtn').href =
    `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent('Halo admin Snapmomen, saya mau upgrade ke premium.')}`;
  document.getElementById('redeemBtn').addEventListener('click', handleRedeem);

  await refreshPremiumView();
});

async function refreshPremiumView() {
  try {
    const data = await apiRequest('/premium?action=status');
    renderPremiumStatus(data);
  } catch (err) {
    showToast(err.message || 'Gagal memuat status premium.');
  }
}

function renderPremiumStatus(data) {
  const notPremiumBox = document.getElementById('notPremiumBox');
  const premiumBox = document.getElementById('premiumBox');

  if (!data.premium) {
    notPremiumBox.style.display = 'block';
    premiumBox.style.display = 'none';
    return;
  }

  notPremiumBox.style.display = 'none';
  premiumBox.style.display = 'block';

  const { days, hours } = getRemainingDaysHours(data.premium_until);
  document.getElementById('premiumCountdown').textContent = `${days} hari ${hours} jam lagi`;
  document.getElementById('premiumExpiry').textContent = formatIndonesianDate(data.premium_until);
}

async function handleRedeem() {
  const codeInput = document.getElementById('codeInput');
  const errText = document.getElementById('redeemError');
  const code = codeInput.value.trim();
  errText.textContent = '';

  if (!code) {
    errText.textContent = 'Masukkan kode premium terlebih dahulu.';
    return;
  }

  try {
    await apiRequest('/premium?action=redeem', { method: 'POST', body: { code } });
    showToast('Kode berhasil di-redeem! Premium aktif.');
    codeInput.value = '';
    await refreshPremiumView();
  } catch (err) {
    errText.textContent = err.message || 'Gagal redeem kode.';
  }
}