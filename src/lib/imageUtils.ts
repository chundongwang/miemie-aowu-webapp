/** Files larger than this are compressed before upload. Must match server MAX_BYTES. */
export const UPLOAD_SIZE_LIMIT = 15 * 1024 * 1024; // 15 MB

/**
 * Compress and convert an image file to JPEG via createImageBitmap + canvas.
 * createImageBitmap is more reliable than HTMLImageElement for HEIC/HEIF —
 * it bypasses the GPU compositing issue that causes black pixels when drawing
 * HEIC via ctx.drawImage(imgElement). It also correctly extracts the still
 * frame from Live Photos, dropping the video component.
 * Throws if the platform cannot decode the format.
 */
export async function compressToJpeg(
  file: File,
  maxSizePx = 2048,
  quality = 0.85
): Promise<File> {
  const bitmap = await createImageBitmap(file);

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
        const name = file.name.replace(/\.[^.]+$/, ".jpg");
        resolve(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      quality
    );
  });
}

/** Generate a small thumbnail — 300px max, 50% quality. */
export function generateThumbnail(file: File): Promise<File> {
  return compressToJpeg(file, 300, 0.5);
}
