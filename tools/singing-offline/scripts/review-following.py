#!/usr/bin/env python3
"""Render a local listening/review page from the four prepared following packages."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT, atomic_write


def main():
    entries=[]
    for track in json.loads((ROOT/'songs/library.json').read_text()):
        if 'followingUrl' not in track:
            continue
        data=json.loads((ROOT/'apps/web/public'/track['followingUrl'].lstrip('/')).read_text())
        beats=json.loads((ROOT/'apps/web/public'/track['beatsUrl'].lstrip('/')).read_text())
        entries.append({'track':track,'following':data,'beats':len(beats['beats']), 'downbeats':len(beats['downbeats'])})
    encoded=json.dumps(entries,ensure_ascii=False).replace('<','\\u003c')
    html='''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cadence · 离线参考审阅</title><style>
body{margin:0;background:#f5f5ef;color:#354332;font:15px system-ui}main{max-width:1140px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{font-size:20px}p{line-height:1.7;color:#64735c}section{background:#fffefa;border:1px solid #dce1d2;border-radius:14px;padding:24px;margin:18px 0}select,button{font:inherit;padding:9px 14px;background:#f0f1e7;border:1px solid #dce1d2;border-radius:8px;color:inherit;cursor:pointer}audio{display:block;width:100%;margin:15px 0}.metrics{display:flex;gap:25px;flex-wrap:wrap}.metrics b{display:block;font-size:26px;color:#a86c3d}.band{display:flex;height:34px;margin:14px 0;gap:1px}.band button{flex:1;min-width:0;padding:0;border:0;border-radius:0;background:#9bb085}.band button[data-low=true]{background:#dacbb7}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e9ecdf}td:nth-child(2){min-width:180px}.hint{color:#a06d40;font-size:13px}.tablewrap{overflow:auto}small{color:#77846a}</style>
<main><small>CADENCE / OFFLINE REFERENCE V5</small><h1>歌曲离线参考审阅</h1>
<p>此页用于核对入句和参考缺口。音高与拍点均为自动估计，尚未经逐段人工校准；新增事件资料还没有接入快速在线跟随。点击条带或时间可听原唱核对。</p>
<p><a href="/media/lyric-alignment-review.html">歌词模型对齐实验：原 LRC / 声学起音 / 模型时间 / 人工听评 →</a></p><select id="songs" aria-label="选择歌曲"></select><section><h2 id="title"></h2><div class="metrics" id="metrics"></div><audio id="audio" controls preload="none"></audio><div class="band" id="band"></div><p>每格 2 秒：绿色越深表示音高覆盖越多；灰色表示无可用能量分母。覆盖率是检测到音高的比例，不是歌词时间准确率，也不是通过/失败标准。分母含漏入乐器、哼唱和混响。</p></section>
<section><h2>逐句入句候选与待核对项</h2><p>“原时间”保留 LRC；“候选”只是附近声学起音，不证明对应这个字。不会自动改词、改时间或将歌词吸附到拍点。</p><div class="tablewrap"><table><thead><tr><th>原时间</th><th>歌词</th><th>音高覆盖¹</th><th>附近起音</th><th>待核对</th></tr></thead><tbody id="lines"></tbody></table></div><p>¹ 每句开始后最多 8 秒、截止下一句的有能量帧覆盖率。重复歌词仅标记文字相同；主副歌边界、逐字时间和拍号仍未知。</p></section></main>
<script>const data=DATA;const $=id=>document.getElementById(id);const pct=n=>n==null?'—':(100*n).toFixed(1)+'%';const time=t=>Math.floor(t/60)+':'+(t%60).toFixed(2).padStart(5,'0');
const names={'sparse-pitch-reference':'参考稀疏','no-stem-energy':'无明显轨道能量','no-nearby-acoustic-onset':'附近无起音','ambiguous-entry-candidates':'多个入句候选'};
function jump(t){$('audio').currentTime=Math.max(0,t-1);$('audio').play().catch(()=>{});}
function cell(text){const td=document.createElement('td');td.textContent=text;return td;}
function button(text,t){const b=document.createElement('button');b.textContent=text;b.onclick=()=>jump(t);return b;}
data.forEach((d,i)=>{const o=document.createElement('option');o.value=i;o.textContent=d.track.title;$('songs').append(o)});
function render(){const d=data[+$('songs').value],f=d.following,q=f.quality;$('title').textContent=d.track.title;$('audio').src=d.track.audioUrl;$('metrics').replaceChildren();
for(const [label,value] of [['参考帧',q.pitchedFrames],['能量区间音高覆盖',pct(q.energyConditionedCoverage)],['音符事件',f.notes.length],['拍点 / 强拍',d.beats+' / '+d.downbeats],['含检测提示的行',q.lyricLinesNeedingReview]]){const e=document.createElement('div');e.textContent=label;const b=document.createElement('b');b.textContent=value;e.append(b);$('metrics').append(e)}
$('band').replaceChildren();q.windows.forEach(w=>{const b=button('',w.start);b.title=time(w.start)+' · '+pct(w.energyConditionedCoverage);b.setAttribute('aria-label',b.title);b.style.background=w.energyConditionedCoverage==null?'#deded5':`hsl(100 20% ${88-38*w.energyConditionedCoverage}%)`;$('band').append(b)});
$('lines').replaceChildren();f.lyricAnchors.forEach(l=>{const tr=document.createElement('tr'),t=cell('');t.append(button(time(l.time),l.time));tr.append(t,cell(l.text),cell(pct(l.quality.energyConditionedCoverage)));const c=cell('');l.entryCandidates.forEach(v=>c.append(button((v.offsetSeconds>=0?'+':'')+v.offsetSeconds.toFixed(2)+'s',v.time)));tr.append(c,cell(l.flags.map(v=>names[v]||v).join('、')||'仍需人工确认'));$('lines').append(tr)})};$('songs').onchange=render;render();</script></html>'''.replace('DATA',encoded)
    target=ROOT/'apps/web/public/media/following-review.html'
    atomic_write(target,html)
    print('Serve this staging workspace: python3 -m http.server 4300 --directory apps/web/public')
    print('http://localhost:4300/media/following-review.html')


if __name__=='__main__': main()
