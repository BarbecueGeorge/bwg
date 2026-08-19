"""Repair UTF-8 mojibake in website HTML; prefer ASCII HTML entities."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"

# Known corrupt sequences currently on disk
EXACT = {
    "âš¡": "&#9889;",  # broken ⚡
    "â—ˆ": "&#9670;",  # broken diamond
    "â—‡": "&#9671;",  # broken white diamond
    "â˜°": "&#9776;",  # broken hamburger
    "Physical Ã— AI": "Physical &times; AI",
    "Ã—": "&times;",
}

# Valid Unicode specials -> HTML entities (ASCII-only source, no re-bake risk)
ENTITIES = [
    ("×", "&times;"),
    ("—", "&mdash;"),
    ("–", "&ndash;"),
    ("…", "&hellip;"),
    ("\u2018", "&lsquo;"),
    ("\u2019", "&rsquo;"),
    ("\u201c", "&ldquo;"),
    ("\u201d", "&rdquo;"),
    ("·", "&middot;"),
    ("©", "&copy;"),
    ("⚡", "&#9889;"),
    ("◈", "&#9670;"),
    ("◇", "&#9671;"),
    ("☰", "&#9776;"),
    ("✓", "&#10003;"),
]


def fix_text(text: str) -> str:
    for a, b in EXACT.items():
        text = text.replace(a, b)
    for a, b in ENTITIES:
        text = text.replace(a, b)
    text = text.replace("\ufffd", "")
    return text


def main() -> None:
    for path in sorted(WEBSITE.glob("*.html")):
        raw = path.read_bytes()
        text = raw.decode("utf-8", errors="replace")
        fixed = fix_text(text)
        path.write_text(fixed, encoding="utf-8", newline="\n")
        print(f"{'fixed' if fixed != text else 'ok':8} {path.name}")

    # Report remaining non-ASCII in HTML bodies (excluding SVG path data is hard; list lines)
    print("\nRemaining non-ASCII in text-ish lines:")
    for path in sorted(WEBSITE.glob("*.html")):
        text = path.read_text(encoding="utf-8")
        for i, line in enumerate(text.splitlines(), 1):
            if "path d=" in line or "viewBox" in line:
                continue
            non = [(c, hex(ord(c))) for c in line if ord(c) > 127]
            if non:
                print(f"  {path.name}:{i}: {line.strip()[:100]}")
                print(f"    {non[:12]}")


if __name__ == "__main__":
    main()
