/** Files larger than this are compressed before upload. Must match server MAX_BYTES. */
export const UPLOAD_SIZE_LIMIT = 15 * 1024 * 1024; // 15 MB

/**
 * Compress and convert an image file to JPEG via createImageBitmap + canvas.
 * Throws if the platform cannot decode the format or the output looks blank.
 */
export async function compressToJpeg(
  file: File,
  maxSizePx = 2048,
  quality = 0.85
): Promise<File> {
  const bitmap = await createImageBitmap(file);

  if (bitmap.width === 0 || bitmap.height === 0) {
    bitmap.close();
    throw new Error("Image decoded with zero dimensions");
  }

  let { width, height } = bitmap;
  if (width > maxSizePx || height > maxSizePx) {
    const scale = Math.min(maxSizePx / width, maxSizePx / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("Canvas unavailable"); }

  // White background so transparent areas don't become black in JPEG output
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Conversion failed")); return; }

        // A blank/white canvas produces a tiny JPEG (just header + uniform blocks).
        // A real photo at 300px/50% quality is always several KB.
        // At 2048px/85% quality it's typically 100KB+.
        // Threshold: 6 KB for thumbnails, 50 KB for full-size.
        const minBytes = maxSizePx <= 300 ? 6 * 1024 : 50 * 1024;
        if (blob.size < minBytes) {
          reject(new Error(`Output too small (${blob.size} B) — canvas draw likely failed`));
          return;
        }

        const name = file.name.replace(/\.[^.]+$/, ".jpg");
        resolve(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      quality
    );
  });
}

