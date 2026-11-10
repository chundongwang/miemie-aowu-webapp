import { copyFile, mkdir } from 'node:fs/promises';
const destination = new URL('../public/singing/worklets/', import.meta.url);
await mkdir(destination, {recursive:true});
await copyFile(new URL(import.meta.resolve('@soundtouchjs/audio-worklet/processor')), new URL('soundtouch-processor.js', destination));
await copyFile(new URL('LICENSE', import.meta.resolve('@soundtouchjs/audio-worklet/package.json')), new URL('soundtouch-LICENSE.txt', destination));
