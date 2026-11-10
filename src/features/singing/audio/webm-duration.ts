interface Element {
  id: number;
  start: number;
  sizeStart: number;
  dataStart: number;
  size: number | null;
  end: number;
}

function element(data: Uint8Array, start: number): Element | null {
  const read = (offset: number, id: boolean) => {
    if (offset >= data.length || !data[offset]) return null;
    let width = 1;
    let marker = 0x80;
    while (!(data[offset] & marker)) { marker >>= 1; width++; }
    if (width > (id ? 4 : 8) || offset + width > data.length) return null;
    let value = id ? data[offset] : data[offset] & (marker - 1);
    let unknown = !id && value === marker - 1;
    for (let i = 1; i < width; i++) {
      value = value * 256 + data[offset + i];
      unknown &&= data[offset + i] === 255;
    }
    return { width, value: unknown ? null : value };
  };
  const id = read(start, true);
  if (!id || id.value === null) return null;
  const sizeStart = start + id.width;
  const size = read(sizeStart, false);
  if (!size || (size.value !== null && !Number.isSafeInteger(size.value))) return null;
  const dataStart = sizeStart + size.width;
  return { id: id.value, start, sizeStart, dataStart, size: size.value, end: size.value === null ? data.length : dataStart + size.value };
}

function encodeSize(size: number) {
  let width = 1;
  while (size >= 2 ** (width * 7) - 1) width++;
  const bytes = new Uint8Array(width);
  for (let index = width - 1; index >= 0; index--) { bytes[index] = size % 256; size = Math.floor(size / 256); }
  bytes[0] |= 1 << (8 - width);
  return bytes;
}

/** Finalize Chrome-style streaming WebM metadata without decoding or copying its audio. */
export async function withWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  if (!blob.type.includes('webm') || !Number.isFinite(durationMs) || durationMs <= 0) return blob;
  try {
    // MediaRecorder writes EBML, then an unknown-size Segment with a small Info header.
    // Bound all parsing to the header, preserving the original on an unfamiliar container.
    const header = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
    let segment: Element | null = null;
    for (let offset = 0; offset < header.length;) {
      const item = element(header, offset);
      if (!item) return blob;
      if (item.id === 0x18538067) { segment = item; break; }
      if (item.size === null || item.end > header.length) return blob;
      offset = item.end;
    }
    // Finalized/seek-indexed files should already carry duration; never move their offsets.
    if (!segment || segment.size !== null) return blob;
    let info: Element | null = null;
    for (let offset = segment.dataStart; offset < header.length;) {
      const item = element(header, offset);
      if (!item) return blob;
      if (item.id === 0x114d9b74) return blob; // SeekHead offsets must not be shifted.
      if (item.id === 0x1f43b675) break; // Audio clusters need no inspection.
      if (item.size === null || item.end > header.length) return blob;
      if (item.id === 0x1549a966) info = item;
      offset = item.end;
    }
    if (!info || info.size === null) return blob;
    let scale = 1_000_000; // Matroska's default TimestampScale, in nanoseconds.
    let duration: Element | null = null;
    for (let offset = info.dataStart; offset < info.end;) {
      const item = element(header, offset);
      if (!item || item.size === null || item.end > info.end) return blob;
      if (item.id === 0xbf) return blob; // Leave checksum-protected Info untouched.
      if (item.id === 0x2ad7b1) {
        scale = 0;
        for (const byte of header.subarray(item.dataStart, item.end)) scale = scale * 256 + byte;
      }
      if (item.id === 0x4489) duration = item;
      offset = item.end;
    }
    if (!Number.isSafeInteger(scale) || scale <= 0) return blob;
    if (duration) {
      if (duration.size !== 4 && duration.size !== 8) return blob;
      const view = new DataView(header.buffer, duration.dataStart, duration.size);
      const value = duration.size === 4 ? view.getFloat32(0) : view.getFloat64(0);
      if (Number.isFinite(value) && value > 0) return blob;
      const replacement = new Uint8Array(duration.size);
      const replacementView = new DataView(replacement.buffer);
      if (duration.size === 4) replacementView.setFloat32(0, durationMs * 1_000_000 / scale);
      else replacementView.setFloat64(0, durationMs * 1_000_000 / scale);
      return new Blob([blob.slice(0, duration.dataStart), replacement, blob.slice(duration.end)], { type: blob.type });
    }
    const encodedDuration = new Uint8Array(11);
    encodedDuration.set([0x44, 0x89, 0x88]); // Duration ID + eight-byte float size.
    new DataView(encodedDuration.buffer).setFloat64(3, durationMs * 1_000_000 / scale);
    return new Blob([blob.slice(0, info.sizeStart), encodeSize(info.size + encodedDuration.length),
      blob.slice(info.dataStart, info.end), encodedDuration, blob.slice(info.end)], { type: blob.type });
  } catch { return blob; }
}
