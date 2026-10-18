// Soft gradient hearts. They show until real photos are uploaded.
export const heart = (i) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${(i * 47) % 360} 70% 72%)"/><stop offset="1" stop-color="hsl(${(i * 47 + 40) % 360} 60% 40%)"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#g)"/><path d="M50 70C20 50 25 28 40 30c6 1 10 6 10 6s4-5 10-6c15-2 20 20-10 40z" fill="#fff" fill-opacity=".6"/></svg>`
  );

// The pink heart sticker on the polaroids.
const STICKER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 90"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a97"/><stop offset="1" stop-color="#e0105f"/></linearGradient></defs>' +
  '<path d="M50 86C8 56 2 30 18 14c13-12 28-6 32 6 4-12 19-18 32-6 16 16 10 42-32 72z" fill="url(#g)"/><ellipse cx="30" cy="26" rx="11" ry="7" fill="#fff" fill-opacity=".4" transform="rotate(-30 30 26)"/></svg>';
export const stickerUrl = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(STICKER) + '")';
