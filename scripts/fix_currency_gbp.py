"""Normalize currency to £ and repair encoding damage on content files."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "website" / "index.html",
    ROOT / "website" / "services.html",
    ROOT / "docs" / "business-plan.md",
    ROOT / "docs" / "products-and-services.md",
    ROOT / "docs" / "research" / "market-icp-positioning.md",
]


def repair_bytes(raw: bytes) -> str:
    # Lone latin-1 pound (0xA3) → UTF-8 pound; leave already-correct C2 A3 alone
    out = bytearray()
    i = 0
    while i < len(raw):
        if raw[i] == 0xA3 and (i == 0 or raw[i - 1] != 0xC2):
            out.extend(b"\xc2\xa3")
            i += 1
            continue
        out.append(raw[i])
        i += 1
    text = bytes(out).decode("utf-8", errors="replace")

    # Common UTF-8 / Windows-1252 mojibake repairs
    repairs = {
        "â€“": "\u2013",  # en dash
        "â€”": "\u2014",  # em dash
        "â€˜": "\u2018",
        "â€™": "\u2019",
        "â€œ": "\u201c",
        "â€": "\u201d",
        "Â·": "\u00b7",  # middle dot
        "Â ": " ",
        "\ufffd": "\u00a3",
        "Â£": "\u00a3",
    }
    for bad, good in repairs.items():
        text = text.replace(bad, good)

    # Dollar before digit → pound
    text = re.sub(r"\$(\d)", lambda m: "\u00a3" + m.group(1), text)
    return text


def main() -> None:
    for path in FILES:
        if not path.is_file():
            print("missing", path)
            continue
        text = repair_bytes(path.read_bytes())
        path.write_text(text, encoding="utf-8", newline="\n")
        pounds = text.count("\u00a3")
        leftover = len(re.findall(r"\$\d", text))
        print(f"{path.relative_to(ROOT)}: pounds={pounds} leftover_$digits={leftover}")
        for i, line in enumerate(text.splitlines(), 1):
            if "\u00a3" in line and re.search(r"\d", line):
                print(f"  L{i}: {line.strip()[:130]}")


if __name__ == "__main__":
    main()
