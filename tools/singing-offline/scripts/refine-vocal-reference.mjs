import { readFile, writeFile } from 'node:fs/promises';
import { PitchDetector } from 'pitchy';

// Emit measured candidates at two time scales. Fusion happens in reference.py;
// this stage no longer overwrites pYIN with a different detector's sparse frames.
const [rawPath, evidencePath, sampleRateString = '22050'] = process.argv.slice(2);
const sampleRate = Number(sampleRateString);
if (!(sampleRate > 0)) throw new Error('Invalid sample rate');
const raw = await readFile(rawPath);
const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const detectors = [1024, 2048].map(size => ({ size, window: new Float32Array(size), detector: PitchDetector.forFloat32Array(size) }));
for (const row of evidence.frames) {
  const centre = Math.round(row.time * sampleRate);
  row.periodic = detectors.map(({ size, window, detector }) => {
    window.fill(0);
    const first = Math.max(0, centre - size / 2), end = Math.min(samples.length, centre + size / 2);
    if (end <= first) return [null, 0];
    window.set(samples.subarray(first, end), Math.max(0, size / 2 - centre));
    const [hz, clarity] = detector.findPitch(window, sampleRate);
    return hz >= 65 && hz <= 1100 && Number.isFinite(clarity)
      ? [69 + 12 * Math.log2(hz / 440), clarity] : [null, 0];
  });
}
await writeFile(evidencePath, JSON.stringify(evidence));
console.log(`Measured dual-window periodicity for ${evidence.frames.length} frames`);
