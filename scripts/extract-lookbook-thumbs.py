#!/usr/bin/env python3
"""Extract Look Book page hero images and map catalog SKUs to thumbnails."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import pymupdf as fitz
except ImportError:
    import fitz  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "Olsen Look Book 8.25.2026 (ST Reviewed).pdf"
OUT_DIR = ROOT / "public" / "catalog" / "olsen" / "lookbook"
MAP_OUT = ROOT / "src" / "lib" / "catalog" / "lookbookThumbs.json"
SEED = ROOT / "src" / "lib" / "catalog" / "olsenCatalogSeed.json"

TAB_SECTION_HINTS = {
    "Countertops": ["countertop", "granite", "quartz", "counter top"],
    "Tile-Floor": ["floor tile", "porcelain", "plank", "flooring", "tile floor"],
    "Tile-Wall": ["wall tile", "shower wall", "tub wall"],
    "Tile - Backsplash": ["backsplash", "back splash"],
    "Tile - Pan": ["shower pan", "shower floor"],
    "Tile - Listel 4\"": ["listel", "bullnose", "trim tile"],
    "Interior Doors": ["interior door", "interior doors"],
    "Ext. Door Install": ["exterior door", "entry door", "front door"],
    "PGT Windows": ["window", "pgt"],
    "Plumbing": ["plumbing", "faucet", "shower", "tub", "toilet", "sink"],
    "Stone-Eldorado": ["eldorado", "stone"],
    "Stone": ["stone veneer", "natural stone"],
    "Trim Material": ["baseboard", "crown", "casing", "trim"],
    "Shaker Drs": ["cabinet door", "shaker", "cabinetry"],
    "Upgrade Shaker Drs": ["cabinet door", "shaker", "cabinetry"],
    "Summer Kitchen": ["outdoor kitchen", "summer kitchen"],
    "Pavers": ["paver", "hardscape"],
    "Tankless Heater": ["tankless", "water heater"],
    "Specialties": ["specialty", "feature"],
    "Railing - Shutters": ["railing", "shutter"],
    "Shelves - Mantles - Beams": ["mantle", "mantel", "beam", "shelf"],
}


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "page"


def page_title(text: str) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines[:6]:
        cleaned = re.sub(r"^\d+\s+", "", ln)
        if len(cleaned) > 3 and not cleaned.lower().startswith("platinum"):
            return cleaned
    return lines[0] if lines else ""


def extract_page_image(doc: fitz.Document, page_index: int, out_path: Path) -> bool:
    page = doc[page_index]
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(0.55, 0.55), alpha=False)
        if pix.width * pix.height < 40_000:
            return False
        out_path.parent.mkdir(parents=True, exist_ok=True)
        pix.save(str(out_path), jpg_quality=78)
        return True
    except Exception:
        return False


def score_page_for_tab(title: str, body: str, hints: list[str]) -> int:
    hay = f"{title} {body}".lower()
    score = 0
    for hint in hints:
        if hint in hay:
            score += 3
    return score


def main() -> int:
    if not PDF.exists():
        print(json.dumps({"ok": False, "error": f"Missing {PDF}"}))
        return 1
    if not SEED.exists():
        print(json.dumps({"ok": False, "error": f"Missing {SEED} — run build-olsen-catalog first"}))
        return 1

    doc = fitz.open(PDF)
    pages = []
    for i in range(doc.page_count):
        text = doc[i].get_text()
        title = page_title(text)
        rel = f"/catalog/olsen/lookbook/page-{i + 1:03d}.jpg"
        out = OUT_DIR / f"page-{i + 1:03d}.jpg"
        has_image = extract_page_image(doc, i, out)
        pages.append(
            {
                "page": i + 1,
                "title": title,
                "text": text[:4000].lower(),
                "thumbnailUrl": rel if has_image else None,
            }
        )

    tab_pages: dict[str, list[int]] = {}
    for tab, hints in TAB_SECTION_HINTS.items():
        ranked = sorted(
            ((score_page_for_tab(p["title"], p["text"], hints), p["page"]) for p in pages if p["thumbnailUrl"]),
            reverse=True,
        )
        tab_pages[tab] = [page for score, page in ranked if score > 0][:8]

    seed = json.loads(SEED.read_text())
    mapping: dict[str, str] = {}
    for item in seed:
        sku = item.get("sku")
        tab = item.get("sourceTab")
        if not sku or not tab:
            continue
        candidates = tab_pages.get(tab) or []
        if not candidates:
            continue
        # Spread picks across top pages using sku hash for variety.
        idx = sum(ord(c) for c in sku) % len(candidates)
        page_num = candidates[idx]
        thumb = next((p["thumbnailUrl"] for p in pages if p["page"] == page_num and p["thumbnailUrl"]), None)
        if thumb:
            mapping[sku] = thumb

    MAP_OUT.write_text(json.dumps({"generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z", "pageCount": doc.page_count, "mappedSkus": len(mapping), "skuToThumbnail": mapping}, indent=2) + "\n")
    print(json.dumps({"ok": True, "pages": doc.page_count, "images": sum(1 for p in pages if p["thumbnailUrl"]), "mappedSkus": len(mapping)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
