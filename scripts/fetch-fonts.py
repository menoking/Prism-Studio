"""Fetch redistributable fonts from their official projects. Runtime never downloads fonts."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request
import subprocess
import sys
import shutil

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'fonts'
BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
FONTS = [
    ('Inter', 'inter/Inter[opsz,wght].ttf', 'inter', 'https://rsms.me/inter/'),
    ('Manrope', 'manrope/Manrope[wght].ttf', 'manrope', 'https://github.com/sharanda/manrope'),
    ('IBMPlexSans', 'ibmplexsans/IBMPlexSans[wdth,wght].ttf', 'ibmplexsans', 'https://github.com/IBM/plex'),
    ('NotoSansSC', 'notosanssc/NotoSansSC[wght].ttf', 'notosanssc', 'https://github.com/notofonts/noto-cjk'),
    ('NotoSerifSC', 'notoserifsc/NotoSerifSC[wght].ttf', 'notoserifsc', 'https://github.com/notofonts/noto-cjk'),
    ('Literata', 'literata/Literata[opsz,wght].ttf', 'literata', 'https://github.com/googlefonts/literata'),
    ('JetBrainsMono', 'jetbrainsmono/JetBrainsMono[wght].ttf', 'jetbrainsmono', 'https://www.jetbrains.com/lp/mono/'),
    ('WenKai', 'https://github.com/lxgw/LxgwWenkaiGB-Lite/releases/download/v1.522/LXGWWenKaiGBLite-Regular.ttf',
     'https://raw.githubusercontent.com/lxgw/LxgwWenKaiGB-Lite/main/OFL.txt', 'https://github.com/lxgw/LxgwWenKaiGB-Lite'),
]

def fetch(url):
    # Windows' curl uses the OS network stack; Python TLS may be blocked by a local proxy.
    return subprocess.run([shutil.which('curl.exe') or 'curl', '-sS', '-L', '--fail', '--retry', '2',
                           '--max-time', '90', url], check=True, capture_output=True).stdout

def download(font):
    name, source, directory, project = font
    url = source if source.startswith('https:') else BASE + urllib.parse.quote(source, safe='/,')
    data = fetch(url)
    if data[:4] != b'\x00\x01\x00\x00':
        raise ValueError(f'{name}: invalid TrueType font')
    (DEST / f'{name}.ttf').write_bytes(data)
    license_url = directory if directory.startswith('https:') else BASE + directory + '/OFL.txt'
    license_data = fetch(license_url)
    if b'SIL OPEN FONT LICENSE' not in license_data:
        raise ValueError(f'{name}: unexpected license')
    (DEST / f'LICENSE-{name}.txt').write_bytes(license_data)
    return {'family': name, 'file': f'{name}.ttf', 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(), 'download': url,
            'project': project, 'license': 'SIL Open Font License 1.1', 'licenseUrl': license_url}

if __name__ == '__main__':
    DEST.mkdir(exist_ok=True)
    if '--locked' in sys.argv:
        entries = json.loads((DEST / 'SOURCES.json').read_text(encoding='utf8'))
        def locked_download(entry):
            file = DEST / entry['file']
            data = file.read_bytes() if file.exists() else fetch(entry['download'])
            if hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError(f"{entry['file']}: source differs from the locked SHA256")
            if not file.exists():
                file.write_bytes(data)
            print(f"Verified {entry['file']}")
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(locked_download, entries))
        sys.exit(0)
    with ThreadPoolExecutor(max_workers=4) as pool:
        entries = list(pool.map(download, FONTS))
    (DEST / 'SOURCES.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    for entry in entries:
        print(f"{entry['file']}: {entry['bytes']} bytes")
