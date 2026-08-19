"""Identify Starmind page hero video + poster assets."""
from __future__ import annotations

import re
import urllib.request

UA = "Mozilla/5.0"
URL = "https://www.spacex.com/7083.2b7745f5bcfb7d6d.js"


def main() -> None:
    req = urllib.request.Request(
        URL,
        headers={"User-Agent": UA, "Referer": "https://www.spacex.com/spacexai/starmind"},
    )
    text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", errors="replace")

    for m in re.finditer(r"videoDesktop:", text):
        start = max(0, m.start() - 500)
        end = min(len(text), m.start() + 400)
        print(text[start:end].replace("\n", " "))
        print("=====")

    print("\nALL MEDIA URLS:")
    for m in re.findall(r"https://content\.spacex\.com/cms-assets/assets/[A-Za-z0-9_./%-]+", text):
        print(m)

    # position:0 or first section often hero
    for m in re.finditer(r"position:0,.{0,1500}", text):
        s = m.group(0)
        print("\nPOSITION0", s[:1500])


if __name__ == "__main__":
    main()
