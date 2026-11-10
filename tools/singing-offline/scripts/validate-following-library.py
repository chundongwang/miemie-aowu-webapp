#!/usr/bin/env python3
"""Validate published offline assets and provenance; this is not an accuracy benchmark."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT, sha256, validate_reference, parse_lyrics, atomic_write
from services.song_preparation.reference import REFERENCE_METHOD
from services.song_preparation.neural_beats import validate as validate_beats


def main():
    results = []
    for track in json.loads((ROOT / 'songs/library.json').read_text()):
        def asset(key):
            return ROOT / 'apps/web/public' / track[key].lstrip('/')
        manifest = json.loads((ROOT / 'songs' / track['id'] / 'preparation.json').read_text())
        assert manifest['pipelineVersion'] == 5, track['id']
        for path, digest in manifest['outputs'].items():
            assert sha256(ROOT / path) == digest, f'Output changed: {path}'
        digest = sha256(asset('audioUrl'))
        assert validate_reference(asset('referenceUrl'), digest), track['id']
        reference = json.loads(asset('referenceUrl').read_text())
        beats = json.loads(asset('beatsUrl').read_text())
        following = json.loads(asset('followingUrl').read_text())
        assert reference['algorithmVersion'] == REFERENCE_METHOD
        validate_beats(beats)
        assert following['sourceSha256'] == beats['sourceSha256'] == digest
        assert following['inputs']['referenceSha256'] == sha256(asset('referenceUrl'))
        assert following['inputs']['beatsSha256'] == sha256(asset('beatsUrl'))
        evidence = ROOT / 'private-audio/reference' / f'{digest}-pitch-evidence-v3.json'
        assert following['inputs']['evidenceSha256'] == sha256(evidence)
        assert following['quality']['pitchedFrames'] == len(reference['frames'])
        assert not following['quality']['automaticFollowingCertified']
        if track.get('performanceUrl'):
            performance = json.loads(asset('performanceUrl').read_text())
            report_path = ROOT/'apps/web/public/media'/f"{track['id']}-alignment-review.json"
            from services.song_preparation.performance import build_performance
            report = json.loads(report_path.read_text())
            rebuilt = build_performance(report, reference)
            assert performance['frames'] == rebuilt['frames'] and performance['characters'] == rebuilt['characters']
            assert performance['provenance']['audioSha256'] == digest
            assert performance['provenance']['lyricsSha256'] == sha256(asset('lyricsUrl'))
            assert performance['provenance']['referenceSha256'] == sha256(asset('referenceUrl'))
            assert performance['provenance']['alignmentSha256'] == sha256(report_path)
        duration = reference['durationSeconds']
        assert abs(duration - track['durationSeconds']) < .05
        previous_end = 0
        for note in following['notes']:
            assert previous_end <= note['start'] < note['end'] <= duration
            previous_end = note['end']
        onsets = following['onsets']
        assert all(0 <= t < duration and (not i or t > onsets[i-1]) for i, t in enumerate(onsets))
        lines = parse_lyrics(asset('lyricsUrl').read_text(), duration)
        if track.get('performanceUrl'):
            from services.song_preparation.lyric_alignment import lyric_characters
            for character in performance['characters']:
                text = lyric_characters(lines[character['lineIndex']]['text'])
                assert character['characterIndex'] < len(text), 'Character points to an empty/wrong LRC row'
                assert text[character['characterIndex']] == character['text'], 'Character/LRC row mismatch'
        for anchor in following['lyricAnchors']:
            original = lines[anchor['lineIndex']]
            assert (anchor['time'], anchor['text']) == (original['time'], original['text'])
            assert anchor['calibratedTime'] is None
        # This migration promises to preserve the already published audio and LRC.
        archives = sorted((ROOT / 'private-audio/upgrades').glob(f"*/{track['id']}/preparation.json"))
        if archives:
            original = json.loads(archives[0].read_text())
            for key in ('audioUrl', 'lyricsUrl'):
                path = asset(key)
                assert sha256(path) == original['outputs'][str(path.relative_to(ROOT))], f'Source changed: {path}'
        results.append({'id': track['id'], 'referenceFrames': len(reference['frames']),
                        'notes': len(following['notes']), 'beats': len(beats['beats']),
                        'downbeats': len(beats['downbeats']),
                        'energyConditionedCoverage': following['quality']['energyConditionedCoverage'],
                        'lyricLines': len(following['lyricAnchors']),
                        'reviewLines': following['quality']['lyricLinesNeedingReview']})
    report = {'valid': True, 'meaning': 'Asset integrity and consistency only; not musical accuracy.', 'songs': results}
    atomic_write(ROOT / 'test-results/following-validation.json', json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
