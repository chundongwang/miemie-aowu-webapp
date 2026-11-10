"""Pure helpers for experimental, review-only Mandarin singing alignment."""
import math
import re
from statistics import median

METHOD = 'sofa-mandarin-context-v2'


def restore_lrc_indices(aligned, windows, source_indices):
    """Keep blank LRC cues in playback without shifting sung character indices.

    Acoustic windows use compact sung-line indices internally; only published
    reports use the original LRC row indices. Cached model predictions stay intact.
    """
    from copy import deepcopy
    aligned, windows = deepcopy(aligned), deepcopy(windows)
    for line in aligned:
        line['lineIndex'] = source_indices[line['lineIndex']]
        for candidate in line['candidates'].values():
            for character in candidate.get('characters', []):
                character['lineIndex'] = source_indices[character['lineIndex']]
    for window in windows:
        for key in ('core', 'context'):
            window[key] = [source_indices[i] for i in window[key]]
    return aligned, windows


def lyric_characters(text):
    # Preserve sung Han characters; punctuation/spacing does not consume acoustic tokens.
    return re.findall(r'[\u3400-\u9fff]', text)


def plan_windows(lines, duration, core_size=4, padding=3, excluded=()):
    # Unsupported-language lines retain LRC timing and form acoustic barriers.
    # Never force neighbouring Mandarin tokens through an English passage.
    if excluded:
        skipped = set(excluded)
        windows = []
        first = 0
        while first < len(lines):
            if first in skipped:
                first += 1
                continue
            end = first + 1
            while end < len(lines) and end not in skipped:
                end += 1
            for window in plan_windows(lines[first:end], duration, core_size, padding):
                window['id'] = len(windows)
                for key in ('core', 'context'):
                    window[key] = [i + first for i in window[key]]
                if first:
                    window['start'] = max(window['start'], lines[first]['time'])
                if end < len(lines):
                    window['end'] = min(window['end'], lines[end]['time'])
                windows.append(window)
            first = end
        return windows
    windows = []
    breaks=[0]+[i for i in range(1,len(lines)) if lines[i]['time']-lines[i-1]['time']>12]+[len(lines)]
    for section_start,section_end in zip(breaks,breaks[1:]):
        for first in range(section_start, section_end, core_size):
            last = min(first+core_size, section_end)
            lo, hi = max(section_start, first-1), min(section_end, last+1)
            start = max(0, lines[lo]['time']-padding)
            tail = min(duration, lines[hi]['time'] if hi<section_end else lines[hi-1]['time']+10)
            end = min(duration, tail+padding)
            if hi==section_end and section_end<len(lines):
                end=min(end,lines[section_end]['time']-padding)
            windows.append({'id': len(windows), 'start': start, 'end': end,
                            'core': list(range(first,last)), 'context': list(range(lo,hi)),
                            'sectionMeaning':'LRC gap heuristic, not verified musical structure'})
    return windows


def summarize_lines(lines, windows, predictions):
    output = []
    for index, line in enumerate(lines):
        window = next((w for w in windows if index in w['core']), None)
        if window is None:
            output.append({'lineIndex': index, 'text': line['text'], 'originalStart': line['time'],
                           'modelStart': None, 'modelEnd': None, 'sourceDisagreementSeconds': None,
                           'candidates': {}, 'flags': ['unsupported-language-lrc-fallback'],
                           'verified': False, 'status': 'needs-review'})
            continue
        candidates = {}
        flags = []
        for source in ('vocals','mix'):
            result = predictions.get(f"{window['id']}:{source}", {})
            words = [c for c in result.get('characters',[]) if c['lineIndex']==index]
            if len(words) != len(lyric_characters(line['text'])) or not words:
                flags.append(f'{source}-unmatched')
                continue
            start, end = words[0]['start'], words[-1]['end']
            if not all(math.isfinite(c['start']) and math.isfinite(c['end']) and
                       window['start'] <= c['start'] < c['end'] <= window['end']+.03 for c in words):
                flags.append(f'{source}-invalid-duration')
                continue
            if any(c['end']-c['start']<.04 for c in words): flags.append(f'{source}-compressed-character')
            if any(c['end']-c['start']>4 for c in words): flags.append(f'{source}-long-character')
            if any(b['start']-a['end']>2 for a,b in zip(words,words[1:])): flags.append(f'{source}-internal-long-gap')
            if start-window['start']<.15 or window['end']-end<.15: flags.append(f'{source}-window-edge')
            candidates[source] = {'start': start, 'end': end, 'offsetSeconds': round(start-line['time'],3),
                                  'windowScore': result.get('score'), 'characters': words}
        disagreement = None
        if len(candidates)==2:
            v,m=candidates['vocals'],candidates['mix']
            disagreement=round(abs(v['start']-m['start']),3)
            if disagreement>.25 or abs(v['end']-m['end'])>.35: flags.append('sources-disagree')
        preferred=candidates.get('vocals')
        if preferred and abs(preferred['offsetSeconds'])>.6: flags.append('large-lrc-offset')
        output.append({'lineIndex':index, 'text':line['text'], 'originalStart':line['time'],
                       'modelStart': preferred['start'] if preferred else None,
                       'modelEnd': preferred['end'] if preferred else None,
                       'sourceDisagreementSeconds': disagreement,
                       'candidates':candidates, 'flags':flags, 'verified':False,
                       'status':'needs-review' if flags else 'cross-source-consistent-unverified'})
    # Different context windows must not silently produce crossing lyric lines.
    for a,b in zip(output,output[1:]):
        if a['modelEnd'] is not None and b['modelStart'] is not None and a['modelEnd']>b['modelStart']+.03:
            a['flags'].append('adjacent-line-overlap'); b['flags'].append('adjacent-line-overlap')
            a['status']=b['status']='needs-review'
    return output


def comparison_summary(lines):
    offsets=[abs(l['modelStart']-l['originalStart']) for l in lines if l['modelStart'] is not None]
    comparable=[l for l in lines if l['sourceDisagreementSeconds'] is not None]
    return {'lines':len(lines), 'alignedLines':len(offsets),
            'medianAbsoluteLrcDisplacementSeconds':round(median(offsets),3) if offsets else None,
            'linesShiftedOver300ms':sum(d>.3 for d in offsets),
            'linesShiftedOver600ms':sum(d>.6 for d in offsets),
            'crossSourceConsistentLines':sum(l['status']=='cross-source-consistent-unverified' for l in lines),
            'sourceStartsWithin250ms':sum(l['sourceDisagreementSeconds']<=.25 for l in comparable),
            'humanVerifiedLines':0, 'accuracyAgainstGroundTruth':None,
            'note':'Displacement from LRC is not timing error. Model scores and source agreement are not correctness probabilities.'}
