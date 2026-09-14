function downloadResult() {
    const canvas = document.getElementById('result-canvas');
    if (!canvas) return;

    try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

        const a = document.createElement('a');
        a.download = `snapmomen-${Date.now()}.jpg`;
        a.href = dataUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        console.error('Download gagal:', err);

        canvas.toBlob((blob) => {
            if (!blob) {
                alert('Gagal download. Coba buka lewat localhost / server.');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.download = `snapmomen-${Date.now()}.jpg`;
            a.href = url;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/jpeg', 0.95);
    }
}