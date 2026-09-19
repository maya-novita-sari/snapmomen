const FrameManager = {
  selected : null,
  theme    : null,
  allFrames: [],

  async loadAllFrames() {
    try {
      this.allFrames = await apiFetch('/api/frames');
    } catch (err) {
      console.error('Gagal load frames:', err);
      this.allFrames = [];
    }
  },

  getFramesBySize(size) {
    return this.allFrames.filter(f => f.size === size);
  },

  canUseFrame(frame) {
    if (frame.type === 'free') return true;
    return isPremium();
  },

  select(frame) {
    this.selected = frame;

    document.querySelectorAll('.frame-option').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('frame-' + frame + '-option');
    if (el) el.classList.add('selected');

    const nextBtn = document.getElementById('btn-next-frame-model');
    if (nextBtn) nextBtn.disabled = false;

    this.refreshThemeVisibility();
  },

  refreshThemeVisibility() {
    const container = document.querySelector('.theme-grid');
    if (!container) return;

    const size = this.selected === 'right' ? '10x15' : '5x15';
    const frames = this.getFramesBySize(size);

    container.innerHTML = '';

    frames.forEach(frame => {
      const canUse = this.canUseFrame(frame);
      const div = document.createElement('div');
      div.className = 'theme-option' + (canUse ? '' : ' locked');
      div.dataset.theme = frame.id;
      div.innerHTML = `
        <img src="${frame.image_url}" alt="${frame.name}">
        ${frame.type === 'premium' ? '<span class="badge-premium">👑</span>' : ''}
        ${!canUse ? '<div class="lock-overlay">🔒 Premium</div>' : ''}
      `;
      div.onclick = () => {
        if (!canUse) return showPremiumModal();
        this.selectThemeById(frame.id);
      };
      container.appendChild(div);
    });

    const firstUsable = frames.find(f => this.canUseFrame(f));
    if (firstUsable) this.selectThemeById(firstUsable.id);
  },

  selectThemeById(id) {
    const frame = this.allFrames.find(f => f.id === id);
    if (!frame || !this.canUseFrame(frame)) return;

    this.theme = id;

    document.querySelectorAll('.theme-option').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`.theme-option[data-theme="${id}"]`);
    if (el) el.classList.add('selected');

    const preview = document.getElementById('theme-preview');
    if (preview) preview.style.backgroundImage = `url('${frame.image_url}')`;

    const overlay = document.getElementById('live-frame-overlay');
    if (overlay) {
      overlay.src = frame.image_url;
      overlay.style.display = 'block';
    }
  },

  getThemeImagePath() {
    const frame = this.allFrames.find(f => f.id === this.theme);
    return frame ? frame.image_url : '';
  },

  getCaptureCount() {
    return this.selected === 'left' ? CONFIG.FRAME_LEFT_CAPTURES : CONFIG.FRAME_RIGHT_CAPTURES;
  },

  getSlotCount() {
    return this.selected === 'left' ? CONFIG.FRAME_LEFT_SLOTS : CONFIG.FRAME_RIGHT_SLOTS;
  }
};

function selectFrame(frame) {
  FrameManager.select(frame);
}

function selectThemeById(id) {
  FrameManager.selectThemeById(id);
}

function showPremiumModal() {
  const user = getCurrentUser();
  if (!user) {
    alert('Login dulu untuk akses premium');
    location.href = 'login.html';
    return;
  }
  location.href = 'premium.html';
}