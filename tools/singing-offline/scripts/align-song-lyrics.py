#!/usr/bin/env python3
"""Local SOFA experiment; publish review candidates without changing playable LRC."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT, sha256, parse_lyrics, atomic_write
from services.song_preparation.lyric_alignment import METHOD, lyric_characters, plan_windows, summarize_lines, comparison_summary, restore_lrc_indices


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('song_id')
    parser.add_argument('--limit-windows',type=int,help='Development smoke test; never publishes a complete-song report')
    args=parser.parse_args()
    track=next((t for t in json.loads((ROOT/'songs/library.json').read_text()) if t['id']==args.song_id),None)
    if track is None: parser.error('Unknown song id')
    tool=ROOT/'private-audio/tools/SOFA'
    ckpt=ROOT/'private-audio/models/sofa-mandarin/pretrained_mandarin_singing/v1.0.0_mandarin_singing.ckpt'
    dictionary=tool/'dictionary/opencpop-extension.txt'
    if not ckpt.exists() or not dictionary.exists(): parser.error('Run npm run prepare:alignment-setup first')
    audio=ROOT/'apps/web/public'/track['audioUrl'].lstrip('/')
    lrc=ROOT/'apps/web/public'/track['lyricsUrl'].lstrip('/')
    digest=sha256(audio)
    vocals=ROOT/'private-audio/reference'/f'{digest[:12]}-vocals.wav'
    if not vocals.exists(): parser.error('Run normal song preparation first to create separated vocals')
    revision=subprocess.check_output(['git','-C',str(tool),'rev-parse','HEAD'],text=True).strip()
    inputs={'audioSha256':digest,'lyricsSha256':sha256(lrc),'vocalsSha256':sha256(vocals),
            'checkpointSha256':sha256(ckpt),'dictionarySha256':sha256(dictionary),
            'codeRevision':revision,'method':METHOD,'coreLines':4,'contextLines':1,'paddingSeconds':3,
            'g2p':'pypinyin 0.55.0 toneless, phrase context','mode':'force','device':'cpu'}
    cache_key=hashlib.sha256(json.dumps(inputs,sort_keys=True).encode()).hexdigest()
    cache=ROOT/'private-audio/alignment'/args.song_id/cache_key
    cache.mkdir(parents=True,exist_ok=True)
    os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'private-audio/alignment/matplotlib'))
    os.environ.setdefault('NUMBA_CACHE_DIR',str(ROOT/'private-audio/alignment/numba'))
    import numpy as np
    import soundfile as sf
    import torch
    import imageio_ffmpeg
    from pypinyin import lazy_pinyin, Style
    sys.path.insert(0,str(tool))
    from modules.g2p.dictionary_g2p import DictionaryG2P
    from modules.task.forced_alignment import LitForcedAlignmentTask
    torch.set_num_threads(4)
    torch.set_grad_enabled(False)
    g2p=DictionaryG2P(dictionary=str(dictionary))
    source_lines=parse_lyrics(lrc.read_text(),track['durationSeconds'])
    source_indices=[i for i,l in enumerate(source_lines) if l['text'].strip()]
    lines=[source_lines[i] for i in source_indices]
    tokens=[]
    excluded=[]
    for i,line in enumerate(lines):
        chars=lyric_characters(line['text'])
        remaining=''.join(c for c in line['text'] if c.isalnum() and c not in chars)
        if remaining and remaining.isascii() and remaining.isalpha():
            print(f'Line {i+1}: non-Mandarin lyrics retained with LRC timing; no character alignment.', flush=True)
            excluded.append(i)
            tokens.append([])
            continue
        if remaining: raise ValueError(f'Unsupported lyric characters in line {i+1}: {remaining}')
        syllables=lazy_pinyin(''.join(chars),style=Style.NORMAL,neutral_tone_with_five=False)
        if len(syllables)!=len(chars) or any(s not in g2p.dictionary for s in syllables):
            raise ValueError(f'Unsupported pronunciation in line {i+1}: {syllables}')
        tokens.append([{'text':c,'pinyin':s,'lineIndex':i,'characterIndex':j} for j,(c,s) in enumerate(zip(chars,syllables))])
    if excluded:
        inputs['unsupportedLanguagePolicy'] = 'lrc-fallback-barrier-v1'
        inputs['excludedLineIndices'] = excluded
        cache_key=hashlib.sha256(json.dumps(inputs,sort_keys=True).encode()).hexdigest()
        cache=ROOT/'private-audio/alignment'/args.song_id/cache_key
        cache.mkdir(parents=True,exist_ok=True)
    windows=plan_windows(lines,track['durationSeconds'],excluded=excluded)
    selected=windows[:args.limit_windows] if args.limit_windows else windows
    predictions={}
    model=None
    decoded=cache/'original-mono.wav'
    if not decoded.exists():
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-v','error','-i',str(audio),'-ac','1','-ar','44100',str(decoded)],check=True)
    for window in selected:
        expected=[t for index in window['context'] for t in tokens[index]]
        phones,words,word_map=g2p(' '.join(t['pinyin'] for t in expected))
        assert list(words)==[t['pinyin'] for t in expected], 'G2P must not silently discard lyrics'
        for source,path in [('vocals',vocals),('mix',decoded)]:
            result_path=cache/f"{window['id']:03}-{source}.json"
            key=f"{window['id']}:{source}"
            if result_path.exists():
                predictions[key]=json.loads(result_path.read_text());continue
            if model is None:
                checkpoint=torch.load(ckpt,map_location='cpu',weights_only=True)
                model=LitForcedAlignmentTask(**checkpoint['hyper_parameters'])
                model.load_state_dict(checkpoint['state_dict']);model.eval();model.set_inference_mode('force');model.on_predict_start()
            print(f"Aligning {args.song_id} {window['id']+1}/{len(windows)} {source} [{window['start']:.1f}–{window['end']:.1f}s]",flush=True)
            sr=sf.info(path).samplerate
            y,_=sf.read(path,start=round(window['start']*sr),stop=round(window['end']*sr),dtype='float32',always_2d=True)
            clip=cache/f"{window['id']:03}-{source}.wav"
            sf.write(clip,y.mean(axis=1),sr,subtype='FLOAT')
            with torch.inference_mode():
                prediction=model.predict_step((clip,phones,words,word_map),window['id'])
            _,length,score,ph,ph_times,word_seq,word_times=prediction
            if list(word_seq)!=list(words):
                result={'error':'Aligned token sequence differs from supplied lyrics','characters':[],'score':float(score)}
            else:
                chars=[{**token,'start':round(window['start']+float(bounds[0]),4),
                         'end':round(window['start']+float(bounds[1]),4)} for token,bounds in zip(expected,word_times)]
                result={'characters':chars,'score':float(score),'scoreScope':'whole context window, not each character',
                        'phones':[{'phone':str(p),'start':round(window['start']+float(t[0]),4),'end':round(window['start']+float(t[1]),4)} for p,t in zip(ph,ph_times)],
                        'window':window,'source':source}
            atomic_write(result_path,json.dumps(result,ensure_ascii=False,allow_nan=False)+'\n')
            predictions[key]=result
            clip.unlink()
    if args.limit_windows:
        print(json.dumps({'smoke':True,'windows':len(selected),'scores':{k:v.get('score') for k,v in predictions.items()}},indent=2));return
    aligned=summarize_lines(lines,windows,predictions)
    aligned,windows=restore_lrc_indices(aligned,windows,source_indices)
    inputs['publishedLineIndices']='original-lrc-including-empty-cues'
    if excluded: inputs['excludedLineIndices']=[source_indices[i] for i in excluded]
    report={'version':1,'method':METHOD,'songId':args.song_id,'inputs':inputs,'summary':comparison_summary(aligned),
            'verified':False,'publishedToPlayback':False,'windows':windows,'lines':aligned,
            'limitations':['Known-text forced alignment is not independent transcription.',
                          'Non-lyrical vocalizations/instrument leakage are not classified by this experiment.',
                          'Both sources use the same model; agreement is supporting evidence, not ground truth.',
                          'Pinyin polyphones and original lyric transcription may need manual correction.']}
    output=ROOT/'apps/web/public/media'/f'{args.song_id}-alignment-review.json'
    atomic_write(output,json.dumps(report,ensure_ascii=False,allow_nan=False)+'\n')
    assert sha256(lrc)==inputs['lyricsSha256'], 'Original LRC changed'
    print(json.dumps(report['summary'],ensure_ascii=False,indent=2))
    print(output)


if __name__=='__main__': main()
