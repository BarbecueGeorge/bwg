"""Deeper scan of SpaceX main bundle for Starmind media."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BASE = "https://www.spacex.com/"


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Referer": "https://www.spacex.com/spacexai/starmind"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main() -> None:
    for name in ["main.8cc27b3a18b8afe1.js", "environment.js", "scripts.01b0f11147816cbb.js"]:
        text = fetch(BASE + name)
        print("===", name, len(text))
        # dump environment
        if name.startswith("environment"):
            print(text)
        # all mp4-ish
        for m in re.findall(r"[^\"']+\.mp4[^\"']*", text, flags=re.I):
            print("MP4", m[:250])
        for m in re.findall(r"[^\"']+\.webm[^\"']*", text, flags=re.I):
            print("WEBM", m[:250])
        for m in re.findall(r"https?://[^\"'\\s]{10,200}", text):
            if any(k in m.lower() for k in ("video", "mp4", "media", "cms", "azure", "sxcontent", "starmind", "hero")):
                print("URL", m[:250])
        # keys near starmind
        idx = 0
        low = text.lower()
        while True:
            i = low.find("starmind", idx)
            if i < 0:
                break
            print("AROUND", text[max(0, i - 200) : i + 300].replace("\n", " "))
            print("---")
            idx = i + 8
        # video component patterns
        for pat in [
            r"videoSrc[^,]{0,200}",
            r"posterSrc[^,]{0,200}",
            r"backgroundVideo[^,]{0,200}",
            r"heroVideo[^,]{0,200}",
            r"\.mp4",
            r"space-x-web",
            r"StarMind",
            r"star-mind",
            r"AI Satellite",
        ]:
            found = re.findall(pat, text, flags=re.I)
            if found and pat not in (r"\.mp4",):
                print("PAT", pat, "count", len(found), "sample", found[:3])


if __name__ == "__main__":
    main()
