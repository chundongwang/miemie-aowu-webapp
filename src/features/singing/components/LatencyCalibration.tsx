import { useEffect, useRef, useState } from 'react';
import { calibrateLatency } from '@/features/singing/audio/calibrate-latency';
import type { LatencyMeasurement } from '@/features/singing/audio/latency-measurement';

export function LatencyCalibration({ speed, pitch, mode, profile, latencyMs, result, onResult, onPrepare, onBusy, onClear }: {
  speed:number; pitch:number; mode:string; profile:string; latencyMs:number|null; result:LatencyMeasurement|null;
  onResult:(value:LatencyMeasurement)=>void; onPrepare:()=>Promise<void>; onBusy:(busy:boolean)=>void; onClear:()=>void;
}) {
  const running=useRef<AbortController|null>(null);
  const [active,setActive]=useState(false),[message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  useEffect(()=>()=>running.current?.abort(),[]);
  useEffect(()=>{running.current?.abort();setReady(false);setMessage('');},[profile]);
  const run=async()=>{
    const controller=new AbortController();running.current=controller;setActive(true);onBusy(true);setMessage('正在测量 · 约 9 秒，请保持安静');
    try {
      const measurement=await calibrateLatency(speed,pitch,mode,controller.signal,onPrepare);
      if(!controller.signal.aborted){onResult(measurement);setMessage('测量稳定，已应用到对照曲线与评分。');}
    } catch(error){setMessage(controller.signal.aborted?'校准已取消':error instanceof Error?error.message:'校准失败');}
    finally {running.current=null;setActive(false);onBusy(false);}
  };
  return <details className="latency-calibration"><summary>时间同步与设备校准 <span>{active?'正在测量…':latencyMs===null?'尚未校准':`${Math.round(latencyMs)} ms · 已校准`}</span></summary>
    <p>播放 5 次短测试声，麦克风回录测量。请保持安静，不要跟唱或拍手。练唱会暂停，已有记录保留。</p>
    <p>{mode==='headphones'?'将实际练唱耳机的出声口靠近当前麦克风；保持同一输入／输出设备。耳机佩戴中无法保证麦克风能收到测试声。':'保持练唱时的扬声器和麦克风位置。回声消除可能使测试声无法识别；失败时不会套用猜测值。'}</p>
    {mode==='headphones'&&<details>
      <summary>AirPods 怎么设置？Mac 与 iPhone 的区别</summary>
      <p><strong>Mac：AirPods 播放，Mac 内置麦克风收音。</strong>在「系统设置 → 声音」中，将输出设为 AirPods，输入设为 Mac 内置麦克风。本页不会替你切换系统设备；开启人声反馈后，再确认输入与输出没有改变。</p>
      <p>校准时，将一只 AirPod 的出声口靠近 Mac 麦克风。若摘下耳机后暂停或切换输出，先关闭 AirPods「自动人耳检测」。校准后戴回耳机，练唱仍使用 Mac 内置麦克风；改用 AirPods 麦克风后需重新校准。</p>
      <p><strong>iPhone／iPad 浏览器：暂不能保证 AirPods 输出＋手机内置麦克风输入。</strong>开启麦克风可能改变音频路由，选择的设备名称也不一定代表实际收音设备。需在具体设备与系统版本上验证；无法确认同一路径时，请保留「尚未校准」，不要套用 Mac 或其他设备的延迟。</p>
    </details>}
    <label><input type="checkbox" checked={ready} disabled={active} onChange={e=>setReady(e.target.checked)}/>已保持练唱设备路径，并让麦克风能听到测试声</label>
    <div className="calibration-actions"><button className="button secondary" disabled={active||!ready} onClick={()=>void run()}>播放测试声并校准</button>{active?<button className="text-button" onClick={()=>running.current?.abort()}>取消校准</button>:latencyMs!==null&&<button className="text-button" onClick={onClear}>清除校准</button>}</div>
    {message&&<p role="status">{message}</p>}
    {result&&<p>输出到输入总延迟 {Math.round(result.roundTripMs)} ms · 伴奏处理约 {Math.round(result.dspMs)} ms · {result.delaysMs.length}/5 次有效 · 波动 {Math.round(result.spreadMs)} ms</p>}
    <small>只补偿系统延迟，不抹去实际拖拍。变速、移调、听音方式或设备变化后需重测。测试声回录仅临时用于本机计算，不保存、不上传，不开启耳返。歌词同步使用输出时钟与已测伴奏处理延迟，输出端未单独实测。</small>
  </details>;
}
