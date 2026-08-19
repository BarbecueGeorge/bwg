"""Tests for Built With Grok brand logo generator and shipped assets."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "website" / "assets" / "brand"

# Import the real generator module under test
import sys

sys.path.insert(0, str(ROOT / "scripts"))
import generate_brand_logo as logo  # noqa: E402


class BrandLogoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Drive the real entry point — regenerate assets
        logo.main()

    def test_required_svgs_exist_and_parse(self):
        required = [
            "logo-mark.svg",
            "logo-mark-light.svg",
            "logo-mark-mono.svg",
            "logo-lockup.svg",
            "logo-lockup-light.svg",
            "logo-icon.svg",
            "logo-icon-light.svg",
        ]
        for name in required:
            path = BRAND / name
            self.assertTrue(path.is_file(), f"missing {name}")
            tree = ET.parse(path)
            root = tree.getroot()
            self.assertTrue(root.tag.endswith("svg"), f"{name} root is not svg")
            text = path.read_text(encoding="utf-8")
            self.assertIn("<path", text, f"{name} has no path geometry")
            # mark + lockup must not be empty pixel placeholders
            self.assertGreater(len(text), 200, f"{name} too small to be a real logo")

    def test_mark_geometry_from_generator(self):
        ring_d, bar, term, diamond, ring_pts = logo.build_geometry()
        self.assertTrue(ring_d.startswith("M"), "ring path must start with M")
        self.assertIn("Z", ring_d)
        self.assertGreater(len(ring_pts), 20)
        self.assertIn("H54", bar)
        self.assertIn("H58", term)
        self.assertIn("L28 26", diamond)

    def test_light_and_dark_variants(self):
        dark = (BRAND / "logo-mark.svg").read_text(encoding="utf-8")
        light = (BRAND / "logo-mark-light.svg").read_text(encoding="utf-8")
        self.assertIn("#0A0A0A", dark)
        self.assertIn("#FFFFFF", light)
        mono = (BRAND / "logo-mark-mono.svg").read_text(encoding="utf-8")
        self.assertIn("currentColor", mono)

    def test_square_icon_assets(self):
        self.assertTrue((BRAND / "logo-icon.svg").is_file())
        self.assertTrue((BRAND / "logo-icon-1024.png").is_file())
        # PNG must be non-trivial
        size = (BRAND / "logo-icon-1024.png").stat().st_size
        self.assertGreater(size, 5000, "icon PNG too small")

    def test_lockup_contains_wordmark(self):
        lock = (BRAND / "logo-lockup.svg").read_text(encoding="utf-8")
        self.assertIn("Built With Grok", lock)
        self.assertIn("<text", lock)

    def test_site_references_logo_not_bg_pill(self):
        site = ROOT / "website"
        html_files = list(site.glob("*.html"))
        self.assertGreaterEqual(len(html_files), 4)
        for page in html_files:
            text = page.read_text(encoding="utf-8")
            # Primary brand mark should be asset-based
            self.assertIn("assets/brand/logo-", text, f"{page.name} missing brand logo asset")
            # CSS text pill "BG" as primary mark should be gone from logo markup
            self.assertNotIn('class="logo-mark">BG</span>', text, f"{page.name} still uses BG pill")


if __name__ == "__main__":
    unittest.main()
