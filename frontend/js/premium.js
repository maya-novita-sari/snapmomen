document.addEventListener('DOMContentLoaded', async () => {
  if (!requireLogin()) return;

  const user = getCurrentUser();
  if (user.role === 'admin') {
    location.href = 'dashboard-admin.html';
    return;
  }

  await loadStatus();
});

async function loadStatus() {
  try {
    const status = await apiFetch('/api/premium/status');
    const box = document.getElementById('statusBox');

    if (status.isPremium) {
      box.innerHTML = `
        <div class="premium-active">
          <h2>Premium Aktif</h2>
          <div class="countdown">
            <div class="countdown-num">${status.daysLeft}</div>
            <div class="countdown-label">hari</div>
            <div class="countdown-num">${status.hoursLeft}</div>
            <div class="countdown-label">jam</div>
          </div>
          <p style="color:#666">Expired: ${new Date(status.premium_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      `;
    } else {
      box.innerHTML = `
        <div class="premium-inactive">
          <h2>Belum Premium</h2>
          <p>Chat admin di WhatsApp untuk beli kode premium:</p>
          <a href="https://wa.me/${window.ADMIN_WA || '628123456789'}" class="btn btn-start" target="_blank">💬 Chat Admin</a>
          <p style="margin-top:20px">Sudah punya kode?</p>
          <div class="input-group">
            <input type="text" id="redeemCode" placeholder="SNAP-XXXXXX" maxlength="11">
            <button class="btn btn-start" onclick="redeemCode()">Redeem</button>
          </div>
          <div id="redeemMsg" class="error-text"></div>
        </div>
      `;
    }
  } catch (e) {
    console.error(e);
  }
}

async function redeemCode() {
  const code = document.getElementById('redeemCode').value.trim().toUpperCase();
  const msg = document.getElementById('redeemMsg');

  if (!code) {
    msg.textContent = 'Masukkan kode';
    return;
  }

  try {
    const res = await apiFetch('/api/premium/redeem', {
      method: 'POST',
      body: JSON.stringify({ code })
    });

    const user = getCurrentUser();
    user.premium_until = res.premium_until;
    localStorage.setItem('user', JSON.stringify(user));

    msg.style.color = 'green';
    msg.textContent = `Premium aktif ${res.daysLeft} hari!`;
    setTimeout(() => loadStatus(), 1500);
  } catch (e) {
    msg.style.color = '#C24040';
    msg.textContent = e.message;
  }
}