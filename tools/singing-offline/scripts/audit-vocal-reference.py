#!/usr/bin/env python3
"""Audit prepared reference gaps using the runtime's nearest-frame tolerance.

Coverage measures available comparison times, NOT vocal detection accuracy.
LRC intervals include rests; no interval is labelled as definitely sung.
"""
import argparse
import bisect
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def audit(song_id):
    track = json.loads((ROOT / 'songs' / song_id / 'track.json').read_text())
    media = ROOT / 'apps/web/public'
    reference = json.loads((media / track['referenceUrl'].lstrip('/')).read_text())
    times = [f[0] for f in reference['frames'] if f[2] >= .55]
    tolerance = max(.035, reference['hopSeconds'] * 1.6)
    intervals = []
    for time in times:
        start, end = max(0, time - tolerance), min(reference['durationSeconds'], time + tolerance)
        if intervals and start <= intervals[-1][1]:
            intervals[-1][1] = max(intervals[-1][1], end)
        else:
            intervals.append([start, end])
    starts = [x[0] for x in intervals]

    def covered(start, end):
        if end <= start:
            return 0
        total = 0
        index = max(0, bisect.bisect_right(starts, start) - 1)
        for left, right in intervals[index:]:
            if left >= end:
                break
            total += max(0, min(end, right) - max(start, left))
        return total / (end - start)

    lines = []
    for line in (media / track['lyricsUrl'].lstrip('/')).read_text().splitlines():
        match = re.match(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)', line)
        if match:
            lines.append((int(match[1]) * 60 + float(match[2]), match[3]))
    lyric_intervals = []
    for index, (start, text) in enumerate(lines):
        end = min(start + 8, lines[index + 1][0] if index + 1 < len(lines) else reference['durationSeconds'])
        lyric_intervals.append(dict(line=index + 1, start=start, end=end, text=text, coverage=round(covered(start, end), 4)))
    gaps = []
    previous = 0
    for start, end in intervals + [[reference['durationSeconds'], reference['durationSeconds']]]:
        if start - previous >= .5:
            # Exclude intro/outro when ranking gaps, retain all in the detailed report.
            near_lyrics = any(a['start'] < start and a['end'] > previous for a in lyric_intervals)
            gaps.append(dict(start=round(previous, 3), end=round(start, 3), seconds=round(start - previous, 3), overlapsLyricInterval=near_lyrics))
        previous = end
    windows = []
    for i in range(round(lines[0][0]), int(lines[-1][0] + 8)):
        coverage = max(covered(max(0, i - 4 - delay * .05), i - delay * .05) for delay in range(14))
        windows.append(dict(end=i, bestCoverage=round(coverage, 4), passesCoverageGate=coverage >= .4))
    return dict(song=song_id, title=track['title'], duration=reference['durationSeconds'], frames=len(times),
                toleranceSeconds=tolerance, sourceSha256=reference.get('sourceSha256'),
                caveat='Reference-time availability, not pitch correctness or actual sung-voice recall. LRC intervals include silence; the runtime denominator is only accepted microphone frames.',
                wholeTrackCoverage=round(covered(0, reference['durationSeconds']), 4),
                lyricIntervals=lyric_intervals, gaps=gaps, fourSecondWindows=windows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('song_id')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = audit(args.song_id)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['song', 'duration', 'frames', 'toleranceSeconds', 'wholeTrackCoverage']}, ensure_ascii=False, indent=2))
    print('First 16 lyric intervals:')
    print(json.dumps(report['lyricIntervals'][:16], ensure_ascii=False, indent=2))
    print('Longest gaps overlapping lyric intervals (can include rests):')
    print(json.dumps(sorted([g for g in report['gaps'] if g['overlapsLyricInterval']], key=lambda g: -g['seconds'])[:10], indent=2))
