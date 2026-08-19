"""Generate Built With Grok brand mark, lockups, and platform icons."""
from __future__ import annotations

from math import cos, pi, sin
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "website" / "assets" / "brand"


def circle_pts(cx: float, cy: float, r: float, n: int = 72, a0: float = 0, a1: float = 2 * pi):
    pts = []
    for i in range(n + 1):
        t = a0 + (a1 - a0) * i / n
        pts.append((cx + r * cos(t), cy + r * sin(t)))
    return pts


def poly_d(pts, close: bool = True) -> str:
    if not pts:
        return ""
    parts = [f"M{pts[0][0]:.3f} {pts[0][1]:.3f}"]
    for x, y in pts[1:]:
        parts.append(f"L{x:.3f} {y:.3f}")
    if close:
        parts.append("Z")
    return " ".join(parts)


def build_geometry():
    """Orbital Construct mark: open ring + structural bar + terminal + spark."""
    cx, cy = 32.0, 32.0
    ro, ri = 28.0, 17.5
    gap = 42 * pi / 180
    a_start = gap
    a_end = 2 * pi - gap
    outer = circle_pts(cx, cy, ro, n=72, a0=a_start, a1=a_end)
    inner = circle_pts(cx, cy, ri, n=72, a0=a_end, a1=a_start)
    ring_pts = outer + inner
    ring_d = poly_d(ring_pts, close=True)
    bar = "M26 28 H54 V36 H26 Z"
    term = "M50 25 H58 V39 H50 Z"
    diamond = "M22 32 L28 26 L34 32 L28 38 Z"
    return ring_d, bar, term, diamond, ring_pts


def write_mark(path: Path, fill: str, current: bool = False) -> None:
    ring_d, bar, term, diamond, _ = build_geometry()
    f = "currentColor" if current else fill
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Built With Grok">
  <title>Built With Grok</title>
  <!-- Orbital Construct mark — monochrome aerospace / AI language -->
  <g fill="{f}">
    <path d="{ring_d}"/>
    <path d="{bar}"/>
    <path d="{term}"/>
    <path d="{diamond}"/>
  </g>
</svg>
"""
    path.write_text(svg, encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


def write_lockup(path: Path, mark_fill: str, text_fill: str) -> None:
    ring_d, bar, term, diamond, _ = build_geometry()
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 64" role="img" aria-label="Built With Grok">
  <title>Built With Grok</title>
  <g fill="{mark_fill}">
    <path d="{ring_d}"/>
    <path d="{bar}"/>
    <path d="{term}"/>
    <path d="{diamond}"/>
  </g>
  <g fill="{text_fill}" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-weight="600" letter-spacing="-0.03em">
    <text x="78" y="40" font-size="28">Built With Grok</text>
  </g>
</svg>
"""
    path.write_text(svg, encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


def write_icon_svg(path: Path, bg: str, fg: str) -> None:
    ring_d, bar, term, diamond, _ = build_geometry()
    scale = 0.62
    tx = (64 - 64 * scale) / 2
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Built With Grok">
  <title>Built With Grok</title>
  <rect width="64" height="64" rx="14" fill="{bg}"/>
  <g fill="{fg}" transform="translate({tx:.3f},{tx:.3f}) scale({scale})">
    <path d="{ring_d}"/>
    <path d="{bar}"/>
    <path d="{term}"/>
    <path d="{diamond}"/>
  </g>
</svg>
"""
    path.write_text(svg, encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


def draw_mark_pil(draw: ImageDraw.ImageDraw, ox: float, oy: float, s: float, fill) -> None:
    _, _, _, _, ring_pts = build_geometry()

    def T(x: float, y: float):
        return (ox + x / 64 * s, oy + y / 64 * s)

    draw.polygon([T(x, y) for x, y in ring_pts], fill=fill)
    r = max(1, int(s // 64))
    draw.rounded_rectangle([T(26, 28), T(54, 36)], radius=r, fill=fill)
    draw.rounded_rectangle([T(50, 25), T(58, 39)], radius=r, fill=fill)
    draw.polygon([T(22, 32), T(28, 26), T(34, 32), T(28, 38)], fill=fill)


def write_pngs() -> None:
    for size in (1024, 512, 256, 128):
        pad = int(size * 0.19)
        rad = int(size * 0.18)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=rad, fill=255)

        im = Image.new("RGBA", (size, size), (10, 10, 10, 255))
        draw_mark_pil(ImageDraw.Draw(im), pad, pad, size - 2 * pad, (255, 255, 255, 255))
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(im, mask=mask)
        p = BRAND / f"logo-icon-{size}.png"
        out.save(p)
        print("wrote", p.relative_to(ROOT))

        im2 = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        draw_mark_pil(ImageDraw.Draw(im2), pad, pad, size - 2 * pad, (10, 10, 10, 255))
        out2 = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out2.paste(im2, mask=mask)
        p2 = BRAND / f"logo-icon-light-{size}.png"
        out2.save(p2)
        print("wrote", p2.relative_to(ROOT))

    for size in (1024, 512):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw_mark_pil(ImageDraw.Draw(im), 0, 0, size, (10, 10, 10, 255))
        p = BRAND / f"logo-mark-{size}.png"
        im.save(p)
        print("wrote", p.relative_to(ROOT))
        imw = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw_mark_pil(ImageDraw.Draw(imw), 0, 0, size, (255, 255, 255, 255))
        pw = BRAND / f"logo-mark-light-{size}.png"
        imw.save(pw)
        print("wrote", pw.relative_to(ROOT))


def validate_svgs() -> None:
    for f in sorted(BRAND.glob("*.svg")):
        ET.parse(f)
        text = f.read_text(encoding="utf-8")
        assert "<path" in text or "<rect" in text
        assert "Built With Grok" in text or "aria-label" in text
        print("valid", f.name, "bytes", len(text.encode("utf-8")))


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    write_mark(BRAND / "logo-mark.svg", "#0A0A0A")
    write_mark(BRAND / "logo-mark-light.svg", "#FFFFFF")
    write_mark(BRAND / "logo-mark-mono.svg", "#000000", current=True)
    write_lockup(BRAND / "logo-lockup.svg", "#0A0A0A", "#0A0A0A")
    write_lockup(BRAND / "logo-lockup-light.svg", "#FFFFFF", "#FFFFFF")
    write_icon_svg(BRAND / "logo-icon.svg", "#0A0A0A", "#FFFFFF")
    write_icon_svg(BRAND / "logo-icon-light.svg", "#FFFFFF", "#0A0A0A")
    write_pngs()
    validate_svgs()
    print("DONE")


if __name__ == "__main__":
    main()
