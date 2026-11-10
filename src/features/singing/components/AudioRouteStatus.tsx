import { useEffect, useState } from 'react';
import { nativeAudioAvailable, SingingAudio, type AudioRoute } from '../audio/native-session';

export function AudioRouteStatus() {
  const [route, setRoute] = useState<AudioRoute | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const update = (event: Event) => { setRoute((event as CustomEvent<AudioRoute>).detail); setFallback(false); };
    const fail = () => { setFallback(true); setRoute(null); };
    window.addEventListener('singing-audio-route', update);
    window.addEventListener('singing-audio-fallback', fail);
    const subscription = nativeAudioAvailable() ? SingingAudio.addListener('routeChanged', value => {
      setRoute(value); setFallback(false);
      window.dispatchEvent(new Event('singing-route-changed'));
    }).catch(() => null) : Promise.resolve(null);
    const interruption = nativeAudioAvailable() ? SingingAudio.addListener('interrupted', () => {
      window.dispatchEvent(new Event('singing-interrupted'));
    }).catch(() => null) : Promise.resolve(null);
    return () => {
      window.removeEventListener('singing-audio-route', update);
      window.removeEventListener('singing-audio-fallback', fail);
      void subscription.then(handle => handle?.remove());
      void interruption.then(handle => handle?.remove());
    };
  }, []);
  return <details className="singing-route-help"><summary>耳机与同步 <span>{fallback ? '兼容模式' : route ? `${route.inputs.map(p=>p.name).join('、') || '等待麦克风'} → ${route.outputs.map(p=>p.name).join('、')}` : '推荐耳机听伴奏'}</span></summary>
    <p>iOS App 会尝试使用手机麦克风收音，保留耳机播放；请先连接耳机。浏览器或旧版 App 使用兼容模式。</p>
    {route && <p>{route.builtInMic && route.bluetoothOutput ? '系统报告：内置麦克风＋蓝牙输出。' : '当前路径未确认为内置麦克风＋蓝牙输出，请确认实际收音与播放设备。'}系统估计输入 {Math.round(route.inputLatencyMs)} ms／输出 {Math.round(route.outputLatencyMs)} ms。此数值不是完整链路校准，不直接用于节奏评分。</p>}
    {fallback && <p>原生配置未成功，当前由系统管理音频设备；仍可播放和查看人声反馈。</p>}
    <p>如果收音受伴奏干扰，请使用耳机；如果曲线有固定错位，可展开下方设备校准。不开启人声耳返。</p>
  </details>;
}
