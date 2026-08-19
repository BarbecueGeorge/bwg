"""Find hero video URLs from Grok / x.ai / related pages."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "website"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read()


def find_media(text: str) -> list[str]:
    pats = [
        r"https?://[^\s\"'<>]+\.(?:mp4|webm)(?:\?[^\s\"'<>]*)?",
        r"https?://[^\s\"'<>]+/cms-assets/[^\s\"'<>]+",
        r"https?://media\.[^\s\"'<>]+",
        r"https?://[^\s\"'<>]*video[^\s\"'<>]*",
    ]
    found: list[str] = []
    for p in pats:
        for m in re.findall(p, text, flags=re.I):
            if m not in found:
                found.append(m)
    return found


def scan_file(path: Path) -> None:
    if not path.is_file():
        print("missing", path)
        return
    text = path.read_text(encoding="utf-8", errors="replace")
    print("===", path.name, "len", len(text))
    media = find_media(text)
    print("media hits", len(media))
    for m in media[:40]:
        print(" ", m[:220])
    # JS chunk URLs that might hold video paths
    chunks = re.findall(r"(?:src|href)=[\"']([^\"']+\.js[^\"']*)[\"']", text)
    print("js refs", len(chunks))
    for c in chunks[:15]:
        print("  js", c[:180])


def main() -> None:
    for url, name in [
        ("https://grok.com", "_grok_sample.html"),
        ("https://x.ai", "_xai_sample.html"),
        ("https://grok.x.ai", "_grokxai_sample.html"),
    ]:
        path = OUT / name
        try:
            data = fetch(url)
            path.write_bytes(data)
            print("fetched", url, len(data))
        except Exception as e:
            print("fetch fail", url, e)
        scan_file(path)
        print()


if __name__ == "__main__":
    main()
