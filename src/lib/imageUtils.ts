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

  // Detect blank output — HEIC on Chrome: createImageBitmap "succeeds" but
  // draws nothing, leaving the canvas as pure white fill.
  // Sample a 4×4 grid; if every point is still the fill colour, the draw failed.
  {
    const xs = [0.2, 0.4, 0.6, 0.8];
    const ys = [0.2, 0.4, 0.6, 0.8];
    let allBlank = true;
    outer: for (const xr of xs) {
      for (const yr of ys) {
        const px = ctx.getImageData(Math.floor(xr * width), Math.floor(yr * height), 1, 1).data;
        if (px[0] !== 255 || px[1] !== 255 || px[2] !== 255) { allBlank = false; break outer; }
      }
    }
    if (allBlank) throw new Error("HEIC canvas draw produced blank output — not supported in this browser");
  }

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
