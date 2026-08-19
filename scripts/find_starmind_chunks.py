"""Locate and scan Angular lazy chunks for Starmind page video assets."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BASE = "https://www.spacex.com/"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Referer": "https://www.spacex.com/spacexai/starmind"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def main() -> None:
    main_js = fetch(BASE + "main.8cc27b3a18b8afe1.js").decode("utf-8", errors="replace")
    # webpack chunk map often like {7083:"hash",...}
    # search for chunk ids near starmind load: 9957, 7913, 7083, 8488
    for cid in ["9957", "7913", "7083", "8488", "6969"]:
        for m in re.finditer(rf".{{0,40}}{cid}.{{0,80}}", main_js):
            s = m.group(0)
            if any(c in s for c in (".js", "chunk", "hash", '"', "'")):
                print("MAP", cid, s[:150])

    # Common angular pattern: number: "hash" in main
    chunk_map = dict(re.findall(r'(\d{3,5}):\s*"([a-f0-9]{8,})"', main_js))
    print("chunk map size", len(chunk_map))
    for cid in ["9957", "7913", "7083", "8488"]:
        print(cid, "->", chunk_map.get(cid))

    # Also try loadChildren patterns for filenames
    for m in re.findall(r'src="([^"]+\.js)"', main_js):
        print("SRC", m)

    # Try discover from runtime
    runtime = fetch(BASE + "runtime.10273a28d9b0cda1.js").decode("utf-8", errors="replace")
    print("runtime len", len(runtime))
    chunk_map2 = dict(re.findall(r'(\d{3,5}):\s*"([a-f0-9]{8,})"', runtime))
    print("runtime map", len(chunk_map2))
    for cid in ["9957", "7913", "7083", "8488"]:
        h = chunk_map2.get(cid) or chunk_map.get(cid)
        print(cid, "hash", h)
        if not h:
            continue
        # try naming conventions
        candidates = [
            f"{cid}.{h}.js",
            f"{h}.js",
            f"chunk-{cid}.{h}.js",
        ]
        # angular sometimes uses only hash.js from map function
        # look for template in runtime: e=>e+"."+...
        for c in candidates:
            url = BASE + c
            try:
                data = fetch(url)
            except Exception as e:
                print("  miss", c, type(e).__name__)
                continue
            text = data.decode("utf-8", errors="replace")
            print("  HIT", c, "bytes", len(data))
            for mm in re.findall(r"https?://[^\"'\\s]+\.(?:mp4|webm|jpg|png|webp)[^\"'\\s]*", text, flags=re.I):
                print("   MEDIA", mm[:220])
            for mm in re.findall(r"[^\"']+\.(?:mp4|webm)[^\"']*", text, flags=re.I):
                if "vmhd" in mm or "box" in mm:
                    continue
                print("   REL", mm[:220])
            for mm in re.findall(r"sxcontent[^\"'\\s]+|cms-assets[^\"'\\s]+|storageBucket[^\"'\\s]+|azureedge[^\"'\\s]+", text, flags=re.I):
                print("   CDN", mm[:220])
            # posters
            for mm in re.finditer(r".{0,40}(?:poster|videoSrc|videoUrl|background|hero).{0,100}", text, flags=re.I):
                s = mm.group(0)
                if any(k in s.lower() for k in ("mp4", "jpg", "png", "webm", "http", "cms", "content")):
                    print("   CTX", s[:200])

    # Print runtime chunk loading function snippet
    for m in re.finditer(r".{0,30}chunk.{0,80}", runtime, flags=re.I):
        if "function" in m.group(0) or ".js" in m.group(0):
            print("RT", m.group(0)[:120])
            break
    # full map dump for starmind ids vicinity
    for m in re.finditer(r'(\d+):"([a-f0-9]+)"', runtime):
        if m.group(1) in {"9957", "7913", "7083", "8488", "995", "791", "708"}:
            print("RTMAP", m.group(0))


if __name__ == "__main__":
    main()
