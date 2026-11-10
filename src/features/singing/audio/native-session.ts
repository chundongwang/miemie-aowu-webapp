import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type AudioRoute = {
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
  inputLatencyMs: number; outputLatencyMs: number; bufferMs: number; sampleRate: number;
  builtInMic: boolean; bluetoothOutput: boolean;
};
interface SingingAudioPlugin {
  configure(): Promise<AudioRoute>;
  status(): Promise<AudioRoute>;
  release(): Promise<void>;
  addListener(event: 'routeChanged', listener: (route: AudioRoute) => void): Promise<PluginListenerHandle>;
  addListener(event: 'interrupted', listener: () => void): Promise<PluginListenerHandle>;
}
export const SingingAudio = registerPlugin<SingingAudioPlugin>('SingingAudio');
export const nativeAudioAvailable = () => Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('SingingAudio');

// Route configuration only. Web Audio owns PCM, processing and its sample clock.
// OS latency estimates must NOT be added to the measured Web Audio round trip.
export async function prepareAudioSession() {
  if (!nativeAudioAvailable()) return;
  try {
    const route = await SingingAudio.configure();
    window.dispatchEvent(new CustomEvent('singing-audio-route', { detail: route }));
  } catch {
    window.dispatchEvent(new Event('singing-audio-fallback'));
  }
}
export async function verifyAudioSession() {
  if (!nativeAudioAvailable()) return;
  try {
    const route = await SingingAudio.status();
    window.dispatchEvent(new CustomEvent('singing-audio-route', { detail: route }));
  } catch { window.dispatchEvent(new Event('singing-audio-fallback')); }
}
export async function releaseAudioSession() {
  if (nativeAudioAvailable()) await SingingAudio.release().catch(() => {});
}
