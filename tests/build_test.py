"""Exercise packaging and version changes in disposable repository copies."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / 'repo'
        shutil.copytree(Path(__file__).resolve().parents[1], self.root,
                        ignore=shutil.ignore_patterns('.git', 'dist', 'node_modules', '__pycache__'))
        self.manifest = self.root / 'manifest.json'

    def build(self, *arguments):
        return subprocess.run([sys.executable, str(self.root / 'scripts' / 'build.py'), *arguments],
                              capture_output=True, text=True)

    def test_plain_build_preserves_manifest_and_packages_runtime_only(self):
        original = self.manifest.read_bytes()
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.manifest.read_bytes(), original)
        manifest = json.loads(original)
        archive = self.root / 'dist' / f'bethlehem-tools-{manifest["version"]}.zip'
        with zipfile.ZipFile(archive) as package:
            names = set(package.namelist())
            self.assertIn('manifest.json', names)
            self.assertFalse(any(name.startswith(('tests/', 'scripts/')) for name in names))
            self.assertNotIn('README.md', names)
            self.assertEqual(json.loads(package.read('manifest.json')), manifest)
            for name in names:
                self.assertEqual(package.read(name), (self.root / 'dist' / 'unpacked' / name).read_bytes())

    def test_patch_bump_updates_manifest_and_archive(self):
        current = json.loads(self.manifest.read_text(encoding='utf-8'))['version']
        major, minor, patch = map(int, current.split('.'))
        expected = f'{major}.{minor}.{patch + 1}'
        result = self.build('--bump', 'patch')
        self.assertEqual(result.returncode, 0, result.stderr)
        updated = json.loads(self.manifest.read_text(encoding='utf-8'))
        self.assertEqual(updated['version'], expected)
        self.assertTrue(updated['version_name'].startswith(expected + ' — '))
        self.assertTrue((self.root / 'dist' / f'bethlehem-tools-{expected}.zip').is_file())

    def test_missing_runtime_file_does_not_bump_manifest(self):
        original = self.manifest.read_bytes()
        (self.root / 'panel.mjs').unlink()
        result = self.build('--bump', 'patch')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Missing extension file', result.stderr)
        self.assertEqual(self.manifest.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
