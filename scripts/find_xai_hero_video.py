"""Search x.ai / grok CDN JS for hero video sources."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read()


def main() -> None:
    html = (ROOT / "website" / "_xai_sample.html").read_text(encoding="utf-8", errors="replace")
    chunks = re.findall(r'src="(/_next/static/chunks/[^"]+\.js[^"]*)"', html)
    base = "https://x.ai"
    print("chunks", len(chunks))
    mp4s: list[str] = []
    for rel in chunks[:25]:
        url = base + rel if rel.startswith("/") else rel
        try:
            data = fetch(url)
        except Exception as e:
            print("fail", url, e)
            continue
        text = data.decode("utf-8", errors="replace")
        found = re.findall(r"https?://[^\"'\\s]+\.(?:mp4|webm)(?:\?[^\"'\\s]*)?", text, flags=re.I)
        found += re.findall(r"https?://media\.x\.ai[^\"'\\s]+", text)
        found += re.findall(r"https?://[^\"'\\s]*sxcontent[^\"'\\s]+", text, flags=re.I)
        found += re.findall(r"https?://[^\"'\\s]*hero[^\"'\\s]*\.(?:mp4|webm|jpg|png)", text, flags=re.I)
        if found:
            print("from", rel[:60], "hits", len(found))
            for f in found[:20]:
                print(" ", f[:200])
                if f not in mp4s and (".mp4" in f or ".webm" in f):
                    mp4s.append(f)
    print("ALL MP4", len(mp4s))
    for m in mp4s:
        print(m)

    # also scan grok.com chunks for header/hero
    ghtml = (ROOT / "website" / "_grok_sample.html").read_text(encoding="utf-8", errors="replace")
    gchunks = re.findall(r"https://cdn\.grok\.com/_next/static/chunks/[^\"']+\.js", ghtml)
    print("grok chunks", len(gchunks))
    for url in gchunks[:20]:
        try:
            text = fetch(url).decode("utf-8", errors="replace")
        except Exception as e:
            print("fail", url, e)
            continue
        if re.search(r"hero|header.*video|background.*video|mp4", text, re.I):
            found = re.findall(r"https?://[^\"'\\s]+\.(?:mp4|webm)(?:\?[^\"'\\s]*)?", text, flags=re.I)
            if found:
                print("grok chunk", url[-40:], found[:10])


if __name__ == "__main__":
    main()
