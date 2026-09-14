#!/usr/bin/env python3
"""Dependency-free extension packaging. Run from any working directory."""
import argparse
import datetime
import json
from pathlib import Path
import re
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['manifest.json', 'background.js', 'panel.html', 'panel.css', 'panel.mjs',
         'core.mjs', 'bridge.mjs', 'import.mjs',
         'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png']


def version(value):
    parts = value.split('.')
    if len(parts) != 3 or any(not re.fullmatch(r'0|[1-9][0-9]*', p) or int(p) > 65535 for p in parts) or not any(map(int, parts)):
        raise argparse.ArgumentTypeError('Use three numbers from 0 to 65535, e.g. 0.2.4; not all zero.')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--bump', choices=['patch', 'minor', 'major'])
    group.add_argument('--version', type=version, help='Set an explicit higher version')
    args = parser.parse_args()
    manifest_path = ROOT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    current = version(manifest['version'])
    target = current
    if args.bump:
        numbers = list(map(int, current.split('.')))
        i = {'major': 0, 'minor': 1, 'patch': 2}[args.bump]
        numbers[i] += 1
        for j in range(i + 1, 3):
            numbers[j] = 0
        target = version('.'.join(map(str, numbers)))
    elif args.version:
        target = args.version
    if target != current:
        if tuple(map(int, target.split('.'))) <= tuple(map(int, current.split('.'))):
            parser.error('Release versions must increase.')
        manifest['version'] = target
        manifest['version_name'] = f'{target} — {datetime.date.today().isoformat()}'
    # Ordinary rebuilds preserve the existing release version and date.
    for name in FILES:
        if not (ROOT / name).is_file():
            raise SystemExit(f'Missing extension file: {name}')
    references = [manifest['background']['service_worker'], manifest['side_panel']['default_path'],
                  *manifest['icons'].values(), *manifest['action']['default_icon'].values()]
    if any(ref not in FILES for ref in references):
        raise SystemExit('Manifest references a file not in the build allowlist.')
    for file in FILES:
        if file.endswith(('.js', '.mjs')):
            for dependency in re.findall(r"from\s+['\"]\./([^'\"]+)['\"]", (ROOT / file).read_text(encoding='utf-8')):
                if dependency not in FILES:
                    raise SystemExit(f'Unpackaged import in {file}: {dependency}')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dist) as tmp:
        staged = Path(tmp) / 'unpacked'
        staged.mkdir()
        for name in FILES:
            dest = staged / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, dest)
        manifest_text = json.dumps(manifest, indent=2, ensure_ascii=False) + '\n'
        (staged / 'manifest.json').write_text(manifest_text, encoding='utf-8')
        archive = Path(tmp) / f'bethlehem-tools-{target}.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
            for name in sorted(FILES):
                out.write(staged / name, name)  # manifest.json at ZIP root for the Web Store
        with zipfile.ZipFile(archive) as check:
            assert set(check.namelist()) == set(FILES)
            assert json.loads(check.read('manifest.json'))['version'] == target
        unpacked = dist / 'unpacked'
        if unpacked.exists():
            shutil.rmtree(unpacked)
        shutil.copytree(staged, unpacked)
        shutil.copyfile(archive, dist / archive.name)
        if target != current:
            manifest_path.write_text(manifest_text, encoding='utf-8')
    print(f'Built {manifest["version_name"]}')
    print(f'Load unpacked: {dist / "unpacked"}')
    print(f'Web Store ZIP: {dist / f"bethlehem-tools-{target}.zip"}')


if __name__ == '__main__':
    main()
