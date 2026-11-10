"""Prepare a trusted, manually corrected SongPackage. Standard-library only.

python -m services.song_preparation.cli --chart songs/twinkle/chart.json \
  --output songs/twinkle --synthesize-guide --copy-guide-to apps/web/public/demo.wav

No automatic transcription or recording alignment is claimed. FFmpeg is optional
and required only when an original or karaoke recording is supplied.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import struct
import subprocess
import wave
from pathlib import Path


def number(value, label: str, lo: float, hi: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not lo <= value <= hi:
        raise ValueError(f"{label} must be finite and in [{lo}, {hi}]")
    return value


def validate_song(song: dict) -> dict:
    if not isinstance(song, dict):
        raise ValueError("chart must be a SongPackage object")
    for key in ("id", "title", "artist", "description", "key"):
        if not isinstance(song.get(key), str) or not song[key].strip():
            raise ValueError(f"missing or invalid {key}")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", song["id"]):
        raise ValueError("id must be a lowercase filename-safe slug")
    total = number(song.get("totalBeats"), "totalBeats", 1, 100000)
    number(song.get("tempoBpm"), "tempoBpm", 20, 400)
    signature = song.get("timeSignature")
    if not isinstance(signature, list) or len(signature) != 2 or any(type(n) is not int for n in signature) or not 1 <= signature[0] <= 16 or signature[1] not in (2, 4, 8, 16):
        raise ValueError("timeSignature must be [numerator, denominator]")
    instruments = song.get("instruments")
    if not isinstance(instruments, list) or not instruments or any(i not in ("piano", "guitar", "bass") for i in instruments):
        raise ValueError("instruments must contain supported acoustic instruments")
    for field in ("melody", "chords"):
        events = song.get(field)
        if not isinstance(events, list) or not events:
            raise ValueError(f"{field} cannot be empty")
        previous_end = 0
        for event in events:
            start = number(event.get("beat"), "beat", 0, total)
            duration = number(event.get("duration"), "duration", 0.001, total)
            if start < previous_end - 1e-6 or start + duration > total + 1e-6:
                raise ValueError(f"{field} must be sorted, nonoverlapping, and within totalBeats")
            previous_end = start + duration
            pitches = [event.get("midi")] if field == "melody" else event.get("midi")
            if not isinstance(pitches, list) or not pitches or any(type(p) is not int or not 0 <= p <= 127 for p in pitches):
                raise ValueError("MIDI notes must be integers from 0 to 127")
            if field == "chords" and not isinstance(event.get("symbol"), str):
                raise ValueError("chord symbol is required")
    for field, label in (("sections", "name"), ("phrases", "text")):
        events = song.get(field)
        if not isinstance(events, list) or not events:
            raise ValueError(f"{field} cannot be empty")
        previous_end = 0
        for event in events:
            start = number(event.get("startBeat"), "startBeat", 0, total)
            end = number(event.get("endBeat"), "endBeat", 0, total)
            if start < previous_end or end <= start or not isinstance(event.get(label), str):
                raise ValueError(f"invalid {field} boundary or label")
            previous_end = end
    provenance = song.get("provenance", {})
    if not isinstance(provenance.get("source"), str) or not isinstance(provenance.get("license"), str) or type(provenance.get("manuallyCurated")) is not bool:
        raise ValueError("provenance requires source, license, and manuallyCurated")
    number(provenance.get("confidence"), "confidence", 0, 1)
    return song


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def variable_length(value: int) -> bytes:
    result = [value & 0x7f]
    value >>= 7
    while value:
        result.insert(0, (value & 0x7f) | 0x80)
        value >>= 7
    return bytes(result)


def write_midi(song: dict, path: Path) -> None:
    ppq = 480
    tempo = round(60_000_000 / song["tempoBpm"])
    events = [(0, 0, b"\xff\x51\x03" + tempo.to_bytes(3, "big")),
              (0, 0, b"\xff\x58\x04" + bytes([song["timeSignature"][0], int(math.log2(song["timeSignature"][1])), 24, 8]))]
    instruments = [("piano", 0, 0), ("guitar", 1, 24), ("bass", 2, 32)]
    for name, channel, program in instruments:
        if name not in song["instruments"]:
            continue
        events.append((0, 1, bytes([0xC0 | channel, program])))
        for chord in song["chords"]:
            pitches = [chord["midi"][0] - 24] if name == "bass" else chord["midi"]
            pitches = [max(0, min(127, p)) for p in pitches]
            for index, pitch in enumerate(pitches):
                offset = 0.025 * index if name == "guitar" else 0
                start = round((chord["beat"] + offset) * ppq)
                end = round((chord["beat"] + chord["duration"] - 0.05) * ppq)
                events.append((start, 3, bytes([0x90 | channel, pitch, 52 if name != "bass" else 64])))
                events.append((max(start + 1, end), 2, bytes([0x80 | channel, pitch, 0])))
    events.sort(key=lambda event: (event[0], event[1], event[2]))
    track, previous = bytearray(), 0
    for tick, _, message in events:
        track.extend(variable_length(tick - previous) + message)
        previous = tick
    end_tick = max(previous, round(song["totalBeats"] * ppq))
    track.extend(variable_length(end_tick - previous) + b"\xff\x2f\x00")
    path.write_bytes(b"MThd" + struct.pack(">IHHH", 6, 0, 1, ppq) + b"MTrk" + struct.pack(">I", len(track)) + track)


def synthesize_guide(song: dict, path: Path, sample_rate: int = 22050) -> None:
    """Deterministic harmonic oscillator, explicitly NOT a vocal recording."""
    seconds_per_beat = 60 / song["tempoBpm"]
    sample_count = round(song["totalBeats"] * seconds_per_beat * sample_rate)
    pcm = bytearray(sample_count * 2)
    for note in song["melody"]:
        start = round(note["beat"] * seconds_per_beat * sample_rate)
        duration = note["duration"] * seconds_per_beat
        sounding = max(0.02, duration - 0.08)
        frequency = 440 * 2 ** ((note["midi"] - 69) / 12)
        for i in range(round(sounding * sample_rate)):
            if start + i >= sample_count:
                break
            t = i / sample_rate
            envelope = min(1, t / 0.012, max(0, (sounding - t) / 0.035))
            phase = 2 * math.pi * frequency * t
            amplitude = (math.sin(phase) + 0.14 * math.sin(phase * 2) + 0.06 * math.sin(phase * 3)) * 0.22 * envelope
            struct.pack_into("<h", pcm, (start + i) * 2, round(amplitude * 32767))
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(pcm)


def normalize_audio(source: Path, destination: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ValueError("FFmpeg is required to import recordings. Install it, or omit --audio and use --synthesize-guide.")
    if not source.is_file():
        raise ValueError(f"Audio source does not exist: {source}")
    subprocess.run([
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-vn", "-ac", "1", "-ar", "22050", "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-c:a", "pcm_s16le", str(destination),
    ], check=True)


def prepare(chart: Path, output: Path, *, audio: Path | None = None, karaoke: Path | None = None,
            karaoke_offset_seconds: float | None = None, synthesize: bool = False) -> dict:
    song = validate_song(json.loads(chart.read_text()))
    if audio and synthesize:
        raise ValueError("Choose an original recording or a synthetic guide, not both")
    if karaoke and (not audio or karaoke_offset_seconds is None):
        raise ValueError("Karaoke import requires --audio and an explicitly measured --karaoke-offset-seconds")
    if karaoke_offset_seconds is not None:
        number(karaoke_offset_seconds, "karaoke_offset_seconds", -86400, 86400)
    # Validate import dependencies before mutating existing package files.
    for source in (audio, karaoke):
        if source and (not source.is_file() or not shutil.which("ffmpeg")):
            raise ValueError("Audio import requires an existing file and FFmpeg on PATH")
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "song.json", song)
    audio_info = {"kind": "none", "file": None}
    if synthesize:
        synthesize_guide(song, output / "reference-audio.wav")
        audio_info = {"kind": "synthetic-oscillator-guide", "file": "reference-audio.wav", "humanVocal": False, "sampleRate": 22050}
    if audio:
        normalize_audio(audio, output / "reference-audio.wav")
        audio_info = {"kind": "user-supplied-recording", "file": "reference-audio.wav", "sourceSha256": hashlib.sha256(audio.read_bytes()).hexdigest(), "sampleRate": 22050}
    if karaoke:
        normalize_audio(karaoke, output / "karaoke-audio.wav")
        audio_info["karaoke"] = {"file": "karaoke-audio.wav", "offsetSeconds": karaoke_offset_seconds, "alignment": "manually-measured-offset", "timeStretchVerified": False}
    metadata = {key: song[key] for key in ("id", "title", "artist", "description", "key", "tempoBpm", "timeSignature", "totalBeats", "instruments", "provenance")}
    metadata.update(formatVersion=1, audio=audio_info, timingUnit="quarter-note-beats")
    write_json(output / "metadata.json", metadata)
    write_json(output / "reference-melody.json", {"notes": song["melody"], "provenance": song["provenance"]})
    arrangement = {"instruments": song["instruments"], "patterns": ["sustain", "arpeggio", "strum"], "defaultPattern": "arpeggio", "bassPattern": "root-on-chord-change", "chords": song["chords"], "midi": "accompaniment.mid"}
    write_json(output / "arrangement.json", arrangement)
    write_json(output / "song-map.json", {
        "formatVersion": 1, "tempoMap": [{"beat": 0, "bpm": song["tempoBpm"]}],
        "beatGrid": [{"beat": beat, "seconds": round(beat * 60 / song["tempoBpm"], 8)} for beat in range(math.floor(song["totalBeats"]) + 1)],
        "timeSignature": song["timeSignature"], "melody": song["melody"], "chords": song["chords"],
        "sections": song["sections"], "phrases": song["phrases"],
        "alignmentAnchors": [{"beat": phrase["startBeat"], "kind": "phrase-start", "text": phrase["text"]} for phrase in song["phrases"]],
        "arrangement": arrangement, "provenance": song["provenance"],
    })
    write_midi(song, output / "accompaniment.mid")
    return song


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--chart", required=True, type=Path, help="Manually corrected SongPackage JSON")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audio", type=Path, help="Private MP3/WAV reference; needs FFmpeg")
    parser.add_argument("--karaoke", type=Path)
    parser.add_argument("--karaoke-offset-seconds", type=float, help="Measured reference time minus karaoke time at a shared event")
    parser.add_argument("--synthesize-guide", action="store_true", help="Generate a nonhuman oscillator guide for engineering replay")
    parser.add_argument("--copy-guide-to", type=Path, help="Copy synthesized guide to the frontend public directory")
    args = parser.parse_args()
    try:
        if args.copy_guide_to and not args.synthesize_guide:
            raise ValueError("--copy-guide-to only publishes an explicitly synthesized guide")
        song = prepare(args.chart, args.output, audio=args.audio, karaoke=args.karaoke,
                       karaoke_offset_seconds=args.karaoke_offset_seconds, synthesize=args.synthesize_guide)
        if args.copy_guide_to:
            args.copy_guide_to.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(args.output / "reference-audio.wav", args.copy_guide_to)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(2, f"Song preparation failed: {error}\n")
    print(f"Prepared {song['title']} ({len(song['melody'])} notes, {song['totalBeats']} beats) in {args.output}")


if __name__ == "__main__":
    main()
