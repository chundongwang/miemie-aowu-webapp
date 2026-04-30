/** Files larger than this are compressed before upload. Must match server MAX_BYTES. */
export const UPLOAD_SIZE_LIMIT = 15 * 1024 * 1024; // 15 MB

/** Generate a small thumbnail — 300px max, 50% quality. */
export function generateThumbnail(file: File): Promise<File> {
  return compressToJpeg(file, 300, 0.5);
}

/**
 * Compress and convert an image file to JPEG via canvas.
 * Works for JPEG, PNG, WebP, and HEIC/HEIF on platforms with OS-level
 * HEIC support (macOS, iOS). Caps the longer dimension at maxSizePx.
 * Throws if the browser cannot decode the file.
 */
export async function compressToJpeg(
  file: File,
  maxSizePx = 2048,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) { reject(new Error("Image decoded with no dimensions")); return; }
      let width = nw;
      let height = nh;
      if (width > maxSizePx || height > maxSizePx) {
        const scale = Math.min(maxSizePx / width, maxSizePx / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      // Fill white so transparent areas don't become black pixels in JPEG output
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Conversion failed")); return; }
          const name = file.name.replace(/\.[^.]+$/, ".jpg");
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image — try a JPEG or PNG instead"));
    };

    img.src = url;
  });
}
