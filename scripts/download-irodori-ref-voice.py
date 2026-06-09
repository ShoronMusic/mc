"""
SynDataLab/irodori-refs-10k から speaker_id または行番号で参照音声を1本 WAV 保存する。

例:
  cd E:\\mc
  C:\\Users\\maeha\\AppData\\Local\\Python\\bin\\python.exe scripts/download-irodori-ref-voice.py --speaker speaker_00012

出力: E:\\Irodori-TTS-Server\\voices\\agent_female.wav
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path


def parquet_audio_to_wav(audio_cell: object, out_path: Path) -> int:
    import numpy as np
    import soundfile as sf

    if isinstance(audio_cell, dict):
        if "array" in audio_cell and audio_cell["array"] is not None:
            arr = np.asarray(audio_cell["array"], dtype=np.float32)
            sr = int(audio_cell.get("sampling_rate") or 48000)
            sf.write(str(out_path), arr, sr)
            return sr
        if audio_cell.get("bytes"):
            data = audio_cell["bytes"]
            if isinstance(data, memoryview):
                data = bytes(data)
            with io.BytesIO(data) as bio:
                arr, sr = sf.read(bio)
            sf.write(str(out_path), arr, sr)
            return int(sr)
        path = audio_cell.get("path")
        if path and Path(path).is_file():
            arr, sr = sf.read(path)
            sf.write(str(out_path), arr, sr)
            return int(sr)

    raise ValueError(f"Unsupported audio cell type: {type(audio_cell)!r}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speaker", type=str, help="e.g. speaker_00012")
    parser.add_argument("--index", type=int, help="0-based global row index")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(r"E:\Irodori-TTS-Server\voices\agent_female.wav"),
    )
    parser.add_argument("--dataset", default="SynDataLab/irodori-refs-10k")
    args = parser.parse_args()
    if not args.speaker and args.index is None:
        parser.error("Specify --speaker or --index")

    try:
        import pyarrow.parquet as pq
        from huggingface_hub import hf_hub_download, list_repo_files
    except ImportError:
        print("pip install pyarrow soundfile huggingface_hub", file=sys.stderr)
        return 1

    parquet_files = sorted(
        f for f in list_repo_files(args.dataset, repo_type="dataset") if f.endswith(".parquet")
    )
    if not parquet_files:
        print("No parquet files in dataset", file=sys.stderr)
        return 1

    rows_per_shard = 10000 // len(parquet_files) if len(parquet_files) else 100
    start_shard = 0
    if args.index is not None:
        start_shard = max(0, args.index // rows_per_shard)

    target_speaker = args.speaker
    target_index = args.index

    for shard_name in parquet_files[start_shard:]:
        print(f"Downloading {shard_name} (~80MB, one-time)...")
        local = hf_hub_download(args.dataset, shard_name, repo_type="dataset")
        table = pq.read_table(local)
        speakers = table.column("speaker_id").to_pylist()
        texts = table.column("text").to_pylist()
        audios = table.column("audio").to_pylist()

        for i, sid in enumerate(speakers):
            global_i = parquet_files.index(shard_name) * rows_per_shard + i
            if target_speaker is not None:
                if sid != target_speaker:
                    continue
            elif global_i != target_index:
                continue

            args.out.parent.mkdir(parents=True, exist_ok=True)
            sr = parquet_audio_to_wav(audios[i], args.out)
            text = texts[i] if i < len(texts) else ""
            print(f"Saved: {args.out}")
            print(f"speaker_id: {sid}")
            safe_text = text[:100].encode("cp932", errors="replace").decode("cp932")
            print(f"text: {safe_text}")
            print(f"sampling_rate: {sr}")
            print("")
            print("Next: .env.local -> IRODORI_TTS_VOICE=agent_female")
            print("      Restart Irodori-TTS-Server")
            return 0

    print("Speaker/row not found", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
