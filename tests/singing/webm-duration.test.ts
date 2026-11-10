import { describe, expect, it } from 'vitest';
import { withWebmDuration } from '../../src/features/singing/audio/webm-duration';

function fixture(info: number[], beforeInfo: number[] = []) {
  const bytes = new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x80, // Minimal EBML header.
    0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ...beforeInfo,
    0x15, 0x49, 0xa9, 0x66, 0x80 | info.length, ...info,
    0x16, 0x54, 0xae, 0x6b, 0x80, // Tracks.
    0x1f, 0x43, 0xb6, 0x75, 0xff, 0xa3, 0x83, 0x01, 0x02, 0x03, // Cluster.
  ]);
  return new Blob([bytes], { type: 'audio/webm;codecs=opus' });
}

const scale = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40];

describe('streaming WebM duration finalization', () => {
  it('adds finite duration and preserves the encoded tracks and cluster bytes', async () => {
    const original = fixture(scale);
    const fixed = await withWebmDuration(original, 3456.75);
    const bytes = new Uint8Array(await fixed.arrayBuffer());
    expect(fixed.size).toBe(original.size + 11);
    expect(fixed.type).toBe(original.type);
    expect(bytes[21]).toBe(0x80 | (scale.length + 11));
    expect([...bytes.slice(29, 32)]).toEqual([0x44, 0x89, 0x88]);
    expect(new DataView(bytes.buffer).getFloat64(32)).toBe(3456.75);
    expect([...bytes.slice(40)]).toEqual([...new Uint8Array(await original.arrayBuffer()).slice(29)]);
  });

  it('grows the Info size variable integer without altering its payload', async () => {
    const info = [...scale, 0xec, 0x80 | 113, ...Array(113).fill(0)];
    const original = fixture(info);
    const bytes = new Uint8Array(await (await withWebmDuration(original, 1200)).arrayBuffer());
    expect(bytes[21]).toBe(0x40);
    expect(bytes[22]).toBe(info.length + 11);
    expect([...bytes.slice(23, 23 + info.length)]).toEqual(info);
  });

  it('respects TimestampScale and repairs an empty existing duration in place', async () => {
    const original = fixture([0x2a, 0xd7, 0xb1, 0x83, 0x1e, 0x84, 0x80, 0x44, 0x89, 0x88, ...Array(8).fill(0)]);
    const fixed = await withWebmDuration(original, 4000);
    expect(fixed.size).toBe(original.size);
    const bytes = new Uint8Array(await fixed.arrayBuffer());
    expect(new DataView(bytes.buffer).getFloat64(32)).toBe(2000);
  });

  it('preserves existing finite duration and refuses containers whose seek offsets would shift', async () => {
    const original = fixture(scale);
    const once = await withWebmDuration(original, 2500);
    expect(await withWebmDuration(once, 9000)).toBe(once);
    const indexed = fixture(scale, [0x11, 0x4d, 0x9b, 0x74, 0x80]);
    expect(await withWebmDuration(indexed, 2500)).toBe(indexed);
    const invalid = new Blob(['invalid'], { type: 'audio/webm' });
    expect(await withWebmDuration(invalid, 2500)).toBe(invalid);
    const mp4 = new Blob(['mp4'], { type: 'audio/mp4' });
    expect(await withWebmDuration(mp4, 2500)).toBe(mp4);
  });
});
