const FrameManager = {
    selected: null,
    theme: 'tema-5',

    themeFiles: {
        'tema-1': 'tema11.png',
        'tema-2': 'ToyStory-10x15.png',
        'tema-3': 'Bakery-10x15.png',
        'tema-4': 'Beach-10x15.png',
        'tema-5': 'ToyStory-5x15.png',
        'tema-6': 'Bakery-5x15.png',
        'tema-7': 'Beach-5x15.png'
    },

    getThemeImagePath(theme) {
        const filename = this.themeFiles[theme] || `${theme}.png`;
        return `assets/frame/${filename}`;
    },

    select(frame) {
        this.selected = frame;
        document.querySelectorAll('.frame-option').forEach(el => el.classList.remove('selected'));
        document.getElementById('frame-' + frame + '-option').classList.add('selected');

        const defaultTheme = frame === 'right' ? 'tema-2' : 'tema-5';
        this.theme = defaultTheme;

        const nextBtn = document.getElementById('btn-next-frame-model');
        if (nextBtn) nextBtn.disabled = false;

        this.refreshThemeVisibility();
    },

    refreshThemeVisibility() {
        const allThemes = document.querySelectorAll('.theme-option');
        let firstVisible = null;

        allThemes.forEach(el => {
            const model = el.dataset.model;
            if (model === this.selected) {
                el.style.display = 'block';
                if (!firstVisible) firstVisible = el;
            } else {
                el.style.display = 'none';
            }
        });

        const currentEl = document.querySelector(`.theme-option[data-theme="${this.theme}"]`);
        if (!currentEl || currentEl.style.display === 'none') {
            if (firstVisible) {
                this.selectTheme(firstVisible.dataset.theme);
            }
        } else {
            this.selectTheme(this.theme);
        }
    },

    selectTheme(theme) {
        this.theme = theme;
        document.querySelectorAll('.theme-option').forEach(el => el.classList.remove('selected'));
        const el = document.querySelector(`.theme-option[data-theme="${theme}"]`);
        if (el) el.classList.add('selected');

        const imagePath = this.getThemeImagePath(theme);

        const preview = document.getElementById('theme-preview');
        if (preview) {
            preview.style.backgroundImage = `url('${imagePath}')`;
        }

        const overlay = document.getElementById('live-frame-overlay');
        if (overlay) {
            overlay.src = imagePath;
            overlay.style.display = 'block';
        }
    },

    getCaptureCount() {
        return this.selected === 'left' ? CONFIG.FRAME_LEFT_CAPTURES : CONFIG.FRAME_RIGHT_CAPTURES;
    },
    getSlotCount() {
        return this.selected === 'left' ? CONFIG.FRAME_LEFT_SLOTS : CONFIG.FRAME_RIGHT_SLOTS;
    }
};

function selectFrame(frame) { FrameManager.select(frame); }
function selectTheme(theme) { FrameManager.selectTheme(theme); }