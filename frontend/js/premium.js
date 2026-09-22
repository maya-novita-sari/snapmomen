const ADMIN_WHATSAPP_NUMBER = '6281234567890'; // ganti dengan nomor WA admin

document.addEventListener('DOMContentLoaded', async () => {
  requireLoggedIn('premium.html');
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

  if (data.is_admin) {
    document.getElementById('premiumCountdown').textContent = 'Akses penuh (admin)';
    document.getElementById('premiumExpiry').textContent = '-';
    return;
  }

  const { days, hours } = getRemainingDaysHours(data.premium_until);
  document.getElementById('premiumCountdown').textContent = `${days} hari ${hours} jam lagi`;
  document.getElementById('premiumExpiry').textContent = formatIndonesianDate(data.premium_until);
}

function getRemainingDaysHours(untilIso) {
  const diffMs = new Date(untilIso).getTime() - Date.now();
  const totalHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
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
