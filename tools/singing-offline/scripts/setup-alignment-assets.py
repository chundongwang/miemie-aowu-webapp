"""Fetch pinned upstream code and Mandarin checkpoint; no user audio is transmitted."""
from pathlib import Path
import subprocess
import sys
from urllib.request import urlretrieve
from zipfile import ZipFile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT, sha256

REVISION='9549c6a86d16019c817eefe4bb8183405da524cc'
MODEL_URL='https://github.com/qiuqiao/SOFA/releases/download/v1.0.1/pretrained_mandarin_singing.zip'
ARCHIVE_SHA='63a8c6191fe6bdf29ac40af2955ef96816b8391596d94a4340e0f58dcf47f26e'
CHECKPOINT_SHA='612cb69ef3503befc43286f0d90893b4b3ad959df07ed08799dba2bea69d2b51'


def main():
    tools=ROOT/'private-audio/tools';tools.mkdir(parents=True,exist_ok=True)
    repo=tools/'SOFA'
    if not repo.exists():
        subprocess.run(['git','clone','https://github.com/qiuqiao/SOFA.git',str(repo)],check=True)
        subprocess.run(['git','-C',str(repo),'checkout','--detach',REVISION],check=True)
    revision=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
    if revision!=REVISION or subprocess.check_output(['git','-C',str(repo),'status','--porcelain'],text=True).strip():
        raise RuntimeError('SOFA checkout differs from tested revision; preserve it and review before upgrading.')
    archive=tools/'sofa-mandarin.zip'
    if not archive.exists():
        pending=archive.with_suffix('.download')
        urlretrieve(MODEL_URL,pending)
        if sha256(pending)!=ARCHIVE_SHA: raise ValueError('Model download hash differs from tested asset')
        pending.replace(archive)
    if sha256(archive)!=ARCHIVE_SHA: raise ValueError('Model archive changed')
    target=ROOT/'private-audio/models/sofa-mandarin'
    checkpoint=target/'pretrained_mandarin_singing/v1.0.0_mandarin_singing.ckpt'
    if not checkpoint.exists():
        with ZipFile(archive) as z:
            for name in z.namelist():
                if not (target/name).resolve().is_relative_to(target.resolve()): raise ValueError('Unsafe archive path')
            z.extractall(target)
    if sha256(checkpoint)!=CHECKPOINT_SHA: raise ValueError('Checkpoint changed')
    print('Pinned SOFA code and official Mandarin model are ready.')


if __name__=='__main__': main()
