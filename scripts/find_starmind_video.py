"""Find hero video URLs on SpaceX Starmind page assets."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
BASE = "https://www.spacex.com/"
OUT = Path(__file__).resolve().parents[1] / "website"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.spacex.com/spacexai/starmind"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def main() -> None:
    scripts = [
        "main.8cc27b3a18b8afe1.js",
        "scripts.01b0f11147816cbb.js",
        "vendor.982305ce2f8e1318.js",
        "environment.js",
    ]
    patterns = [
        r"https?://[^\"'\\s]+\.(?:mp4|webm|m3u8)(?:\?[^\"'\\s]*)?",
        r"//[^\"'\\s]+\.(?:mp4|webm|m3u8)(?:\?[^\"'\\s]*)?",
        r"[a-zA-Z0-9_./%-]*(?:starmind|hero|spacexai)[a-zA-Z0-9_./%-]*\.(?:mp4|webm|m3u8)",
        r"sxcontent[^\"'\\s]+",
        r"azureedge[^\"'\\s]+",
        r"cms-assets[^\"'\\s]+",
    ]
    for name in scripts:
        url = BASE + name
        try:
            data = fetch(url)
        except Exception as e:
            print("FAIL", name, e)
            continue
        text = data.decode("utf-8", errors="replace")
        print(f"=== {name} bytes={len(data)}")
        hits: list[str] = []
        for p in patterns:
            for m in re.findall(p, text, flags=re.I):
                if m not in hits:
                    hits.append(m)
        # also starmind context
        for m in re.finditer(r".{0,60}starmind.{0,120}", text, flags=re.I):
            s = m.group(0).replace("\n", " ")
            if any(k in s.lower() for k in ("mp4", "webm", "video", "poster", "src", "http", "cms")):
                print("CTX", s[:220])
        for h in hits[:50]:
            print("HIT", h[:220])
        if "starmind" in text.lower():
            print("contains starmind:", text.lower().count("starmind"))


if __name__ == "__main__":
    main()
