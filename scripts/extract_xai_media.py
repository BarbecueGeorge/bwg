"""Extract full media.x.ai video paths from x.ai JS."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = "Mozilla/5.0"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main() -> None:
    html = (ROOT / "website" / "_xai_sample.html").read_text(encoding="utf-8", errors="replace")
    chunks = re.findall(r'src="(/_next/static/chunks/[^"]+\.js[^"]*)"', html)
    for rel in chunks:
        url = "https://x.ai" + rel
        try:
            text = fetch(url)
        except Exception:
            continue
        if "media.x.ai" not in text and ".mp4" not in text:
            continue
        # longer URL patterns
        urls = set(re.findall(r"https://media\.x\.ai/[a-zA-Z0-9_./%-]+\.(?:mp4|webm|jpg|png|webp)", text))
        urls |= set(re.findall(r"https://[^\"'\\s]+\.mp4", text))
        # string fragments like media.x.ai/v1/website/...
        frags = set(re.findall(r"media\.x\.ai/[^\"'\\s)]{10,200}", text))
        if urls or (frags and any(x in text for x in (".mp4", "video", "hero", "web/"))):
            print("===", rel[:70])
            for u in sorted(urls)[:30]:
                print("URL", u)
            for f in sorted(frags)[:40]:
                if any(k in f for k in ("mp4", "video", "hero", "web/", "background", "home")):
                    print("FRAG", f[:200])
            # dump context around mp4
            for m in re.finditer(r".{0,40}mp4.{0,40}", text, flags=re.I):
                print("CTX", m.group(0).replace("\n", " ")[:160])


if __name__ == "__main__":
    main()
