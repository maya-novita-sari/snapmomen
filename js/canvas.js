async function processResult() {
    const canvas = document.getElementById('result-canvas');
    const ctx = canvas.getContext('2d');
    const downloadBtn = document.getElementById('btn-download');

    if (downloadBtn) downloadBtn.disabled = true;

    const W = 600;
    const H = 900;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    let slots = [];
    if (FrameManager.selected === 'left') {
        slots = LAYOUTS.getLeftSlots(photoData);
    } else {
        slots = LAYOUTS.getRightSlots(photoData);
    }

    const topOffset = H * 0.07;
    const sideOffset = W * 0.03;
    const gridW = W - (sideOffset * 2);
    const gridH = H * 0.68;
    const gapX = gridW * 0.06;
    const gapY = gridH * 0.035;

    const slotW = (gridW - gapX) / 2;
    const slotH = (gridH - (gapY * 2)) / 3;
    const slotRadius = 6;

    for (let i = 0; i < slots.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);

        const x = sideOffset + col * (slotW + gapX);
        const y = topOffset + row * (slotH + gapY);

        ctx.save();
        roundedRectPath(ctx, x, y, slotW, slotH, slotRadius);
        ctx.clip();

        if (slots[i]) {
            const img = await loadImage(slots[i]);
            drawImageCover(ctx, img, x, y, slotW, slotH);
        } else {
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(x, y, slotW, slotH);
        }
        ctx.restore();
    }

    const themePath = FrameManager.getThemeImagePath(FrameManager.theme);

    try {
        const themeImg = await loadImageStrict(themePath);
        if (themeImg.naturalWidth > 0) {
            ctx.drawImage(themeImg, 0, 0, W, H);
        }
    } catch (err) {
    }

    localStorage.setItem('photobooth-result', canvas.toDataURL('image/jpeg'));

    if (downloadBtn) downloadBtn.disabled = false;
}

function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
            const dummy = new Image();
            dummy.width = 1; dummy.height = 1;
            resolve(dummy);
        };
        img.src = src;
    });
}

function loadImageStrict(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject('File tidak ditemukan: ' + src);
        img.src = src;
    });
}

function drawImageCover(ctx, img, x, y, w, h) {
    if (!img || !img.width || !img.height) return;

    const imgRatio = img.width / img.height;
    const boxRatio = w / h;

    let sx, sy, sw, sh;

    if (imgRatio > boxRatio) {
        sh = img.height;
        sw = img.height * boxRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        sw = img.width;
        sh = img.width / boxRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function resetApp() {
    photoData = [];
    photoTakenCount = 0;
    goToScreen('screen-welcome');
}