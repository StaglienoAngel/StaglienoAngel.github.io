/**
 * Simple QR Code generator using an external API
 * Fallback when QRCode library fails to load
 */

window.QRCodeSimple = {
    toCanvas: function(canvas, text, options, callback) {
        // Use qrserver.com API to generate QR code as image
        const size = options?.width || 250;
        const margin = options?.margin || 2;

        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = function() {
            const ctx = canvas.getContext('2d');
            canvas.width = size;
            canvas.height = size;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            if (callback) callback(null);
        };

        img.onerror = function() {
            console.error('QR image load failed');
            if (callback) callback(new Error('Failed to load QR image'));
        };

        // Generate QR code URL
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&data=${encodeURIComponent(text)}`;
        img.src = qrUrl;
    }
};

// Auto-detect if QRCode library failed to load and provide fallback
window.addEventListener('DOMContentLoaded', function() {
    if (typeof QRCode === 'undefined') {
        console.warn('QRCode library not available, using simple fallback');
        window.QRCode = window.QRCodeSimple;
    }
});
