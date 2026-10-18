const LONGEST_SIDE = 1600; // pixels

// Makes a photo smaller in the browser before it is uploaded, so the website loads fast.
// A 4000 pixel phone photo of 4 MB becomes a 1600 pixel picture of about 300 KB.
export async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file; // GIFs and anything else go up as they are
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // keeps phone photos the right way up
    const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // a PNG with a see-through background gets a white one
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || (scale === 1 && blob.size >= file.size)) return file; // already small, so keep the original
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // if the browser cannot read it, send the original
  }
}
