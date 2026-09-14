let welcomeStream = null;

async function startWelcomeCamera() {
    try {
        if (!welcomeStream) {
            welcomeStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' }, audio: false
            });
        }
        const v = document.getElementById('welcome-video');
        if (v) {
            v.srcObject = welcomeStream;
            await v.play();
        }
    } catch (e) {
        console.log('Welcome camera belum aktif.');
    }
}

let stream = null;
let photoData = [];
let photoTakenCount = 0;
let photoTargetCount = 0;
let livePreviewSlots = [];
let isCountingDown = false;
let currentFilter = 'normal';

function setFilter(type) {
    currentFilter = type;

    const video = document.getElementById('video');
    const btnNormal = document.getElementById('filter-normal');
    const btnBw = document.getElementById('filter-bw');

    if (type === 'bw') {
        if (video) video.classList.add('filter-bw');
        if (btnNormal) btnNormal.classList.remove('active');
        if (btnBw) btnBw.classList.add('active');
    } else {
        if (video) video.classList.remove('filter-bw');
        if (btnNormal) btnNormal.classList.add('active');
        if (btnBw) btnBw.classList.remove('active');
    }
}

async function startCameraSession() {
    photoData = [];
    photoTakenCount = 0;
    isCountingDown = false;
    photoTargetCount = FrameManager.getCaptureCount();
    livePreviewSlots = new Array(FrameManager.getSlotCount()).fill(null);

    const overlay = document.getElementById('live-frame-overlay');
    if (overlay) {
        overlay.src = FrameManager.getThemeImagePath(FrameManager.theme);
        overlay.style.display = 'block';
    }

    const nextBtn = document.getElementById('btn-next-frame');
    if (nextBtn) nextBtn.disabled = true;

    renderLivePreview();
    updateCameraCounter();

    try {
        if (!stream) {
            if (welcomeStream) {
                stream = welcomeStream;
            } else {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user' }, audio: false
                });
            }
        }
        const video = document.getElementById('video');
        video.srcObject = stream;
        await video.play();

        setFilter(currentFilter);
    } catch (err) {
        alert('Gagal mengakses kamera.');
        return;
    }
}

function updateCameraCounter() {
    const c = document.getElementById('camera-counter');
    if (c) c.textContent = `Foto ${photoTakenCount}/${photoTargetCount}`;
}

function renderLivePreview() {
    const c = document.getElementById('live-frame-slots');
    const retakeLayer = document.getElementById('retake-layer');
    if (!c) return;
    c.innerHTML = '';
    if (retakeLayer) retakeLayer.innerHTML = '';

    for (let i = 0; i < FrameManager.getSlotCount(); i++) {
        const div = document.createElement('div');
        div.className = 'live-slot';

        if (livePreviewSlots[i]) {
            const img = document.createElement('img');
            img.src = livePreviewSlots[i];
            div.appendChild(img);
        }
        c.appendChild(div);
    }

    if (retakeLayer) {
        const previewBox = document.getElementById('live-frame-preview').getBoundingClientRect();
        const slotEls = c.querySelectorAll('.live-slot');

        slotEls.forEach((slotEl, i) => {
            if (!livePreviewSlots[i]) return;

            const rect = slotEl.getBoundingClientRect();
            const btn = document.createElement('button');
            btn.className = 'retake-btn';
            btn.textContent = 'Retake';
            btn.style.top = (rect.top - previewBox.top + 10) + 'px';
            btn.style.left = (rect.left - previewBox.left + (rect.width / 2) - 50) + 'px';
            btn.onclick = (e) => {
                e.stopPropagation();
                retakeSlot(i);
            };
            retakeLayer.appendChild(btn);
        });
    }
}

function startCountdown() {
    if (isCountingDown) return;
    if (photoTakenCount >= photoTargetCount) return;

    isCountingDown = true;
    const overlay = document.getElementById('countdown-overlay');
    const text = document.getElementById('countdown-text');

    let count = 3;
    text.textContent = count;
    overlay.classList.add('active');

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            text.textContent = count;
        } else if (count === 0) {
            text.textContent = '';
            overlay.classList.remove('active');
            clearInterval(interval);
            isCountingDown = false;
            capturePhoto();
        }
    }, 1000);
}

function capturePhoto() {
    if (photoTakenCount >= photoTargetCount) return;

    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    if (currentFilter === 'bw') {
        ctx.filter = 'grayscale(1)';
    } else {
        ctx.filter = 'none';
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    const dataUrl = canvas.toDataURL('image/jpeg');
    photoData.push(dataUrl);
    photoTakenCount++;

    updateLivePreviewWithNewPhoto();

    const flash = document.getElementById('flash-effect');
    if (flash) {
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 150);
    }

    updateCameraCounter();

    if (photoTakenCount >= photoTargetCount) {
        const nextBtn = document.getElementById('btn-next-frame');
        if (nextBtn) nextBtn.disabled = false;
    }
}

function updateLivePreviewWithNewPhoto() {
    const latest = photoData[photoData.length - 1];

    if (FrameManager.selected === 'left') {
        let filled = 0;
        for (let i = 0; i < livePreviewSlots.length && filled < 2; i++) {
            if (!livePreviewSlots[i]) {
                livePreviewSlots[i] = latest;
                filled++;
            }
        }
    } else {
        const idx = livePreviewSlots.findIndex(s => !s);
        if (idx !== -1) livePreviewSlots[idx] = latest;
    }
    renderLivePreview();
}

function retakeSlot(slotIndex) {
    const photoToRemove = livePreviewSlots[slotIndex];
    if (!photoToRemove) return;

    livePreviewSlots[slotIndex] = null;

    if (FrameManager.selected === 'left') {
        for (let i = 0; i < livePreviewSlots.length; i++) {
            if (i !== slotIndex && livePreviewSlots[i] === photoToRemove) {
                livePreviewSlots[i] = null;
            }
        }
    }
    const idx = photoData.indexOf(photoToRemove);
    if (idx > -1) photoData.splice(idx, 1);
    photoTakenCount = photoData.length;

    if (photoTakenCount < photoTargetCount) {
        const nextBtn = document.getElementById('btn-next-frame');
        if (nextBtn) nextBtn.disabled = true;
    }

    updateCameraCounter();
    renderLivePreview();
}