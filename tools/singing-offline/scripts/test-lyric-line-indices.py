"""Regression: blank LRC cues must not disable character karaoke on later lines."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.lyric_alignment import restore_lrc_indices
from services.song_preparation.recorded import strip_leading_credits


class LineIndicesTest(unittest.TestCase):
    def test_credit_block_ends_at_first_sung_line(self):
        lines = [{'time': 0, 'text': '想到我们 - 汪苏泷'},
                 {'time': 2, 'text': '词：万一（SBMS）'},
                 {'time': 25, 'text': '企划A&R：X.Faulkner'},
                 {'time': 34, 'text': '天外又发现 行星多一颗'},
                 {'time': 40, 'text': '出品：这是后续歌词不应被删'}]
        self.assertEqual(strip_leading_credits(lines, '想到我们'), lines[3:])

    def test_blank_intro_and_interlude(self):
        lines = [
            {'lineIndex': i, 'candidates': {'vocals': {'characters': [
                {'lineIndex': i, 'characterIndex': 0, 'text': text}
            ]}}}
            for i, text in enumerate(['唱', '歌'])
        ]
        windows = [{'core': [0, 1], 'context': [0, 1]}]
        mapped, mapped_windows = restore_lrc_indices(lines, windows, [1, 3])
        self.assertEqual([l['lineIndex'] for l in mapped], [1, 3])
        self.assertEqual([l['candidates']['vocals']['characters'][0]['lineIndex'] for l in mapped], [1, 3])
        self.assertEqual(mapped_windows[0]['context'], [1, 3])
        self.assertEqual(lines[0]['lineIndex'], 0)  # cached predictions unchanged
        self.assertEqual(windows[0]['core'], [0, 1])
        unchanged, _ = restore_lrc_indices(lines, windows, [0, 1])
        self.assertEqual(unchanged, lines)


if __name__ == '__main__':
    unittest.main()
