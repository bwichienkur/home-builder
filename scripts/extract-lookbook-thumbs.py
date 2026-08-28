#!/usr/bin/env python3
"""Extract Look Book page images and map catalog SKUs to thumbnails via name/token scoring."""
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

STOP_WORDS = {
    "the", "and", "for", "with", "level", "tile", "floor", "wall", "each", "per", "from",
    "olsen", "included", "option", "select", "selection", "package", "standard", "platinum",
}

TAB_SECTION_HINTS = {
    "Countertops": ["countertop", "granite", "quartz", "counter top", "marble"],
    "Tile-Floor": ["floor tile", "porcelain", "plank", "flooring", "tile floor"],
    "Tile-Wall": ["wall tile", "shower wall", "tub wall"],
    "Tile - Backsplash": ["backsplash", "back splash"],
    "Tile - Pan": ["shower pan", "shower floor"],
    "Tile - Listel 4\"": ["listel", "bullnose", "trim tile"],
    "Interior Doors": ["interior door", "interior doors"],
    "Ext. Door Install": ["exterior door", "entry door", "front door"],
    "PGT Windows": ["window", "pgt"],
    "Plumbing": ["plumbing", "faucet", "shower", "tub", "toilet", "sink", "kohler", "moen"],
    "Stone-Eldorado": ["eldorado", "stone"],
    "Stone": ["stone veneer", "natural stone"],
    "Trim Material": ["baseboard", "crown", "casing", "trim"],
    "Shaker Drs": ["cabinet door", "shaker", "cabinetry", "maple"],
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


def base_item_name(name: str) -> str:
    return re.sub(r"\s·\sLevel\s*\d+.*$", "", name, flags=re.I).strip()


def tokenize(text: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]{3,}", text.lower())
    return [t for t in raw if t not in STOP_WORDS]


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


def extract_sku_crop(doc: fitz.Document, page_index: int, out_path: Path) -> bool:
    """Crop upper-center product region for a tighter per-SKU thumbnail."""
    page = doc[page_index]
    try:
        rect = page.rect
        clip = fitz.Rect(
            rect.width * 0.12,
            rect.height * 0.08,
            rect.width * 0.88,
            rect.height * 0.62,
        )
        pix = page.get_pixmap(matrix=fitz.Matrix(0.65, 0.65), clip=clip, alpha=False)
        if pix.width * pix.height < 20_000:
            return False
        out_path.parent.mkdir(parents=True, exist_ok=True)
        pix.save(str(out_path), jpg_quality=80)
        return True
    except Exception:
        return False


def score_page_for_tab(title: str, body: str, hints: list[str]) -> int:
    hay = f"{title} {body}".lower()
    return sum(3 for hint in hints if hint in hay)


def score_page_for_item(title: str, body: str, tokens: list[str], hints: list[str], brand: str) -> int:
    hay = f"{title} {body}".lower()
    score = score_page_for_tab(title, body, hints)
    for token in tokens:
        if token in hay:
            score += 6
        elif len(token) >= 5 and any(token in word or word in token for word in re.findall(r"[a-z0-9]+", hay)):
            score += 2
    brand_slug = slug(brand)
    if brand_slug and brand_slug.replace("-", " ") in hay:
        score += 5
    if brand.lower() in hay:
        score += 4
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
                "text": text[:6000].lower(),
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
    crop_count = 0
    per_sku = 0
    tab_fallback = 0

    for item in seed:
        sku = item.get("sku")
        tab = item.get("sourceTab")
        name = item.get("name") or ""
        brand = item.get("brand") or ""
        if not sku or not tab:
            continue

        hints = TAB_SECTION_HINTS.get(tab, [])
        tokens = tokenize(base_item_name(name))
        ranked = sorted(
            (
                (
                    score_page_for_item(p["title"], p["text"], tokens, hints, brand),
                    p["page"],
                    p["thumbnailUrl"],
                )
                for p in pages
                if p["thumbnailUrl"]
            ),
            reverse=True,
        )
        best_score, best_page, best_thumb = ranked[0] if ranked else (0, None, None)

        # Strong per-SKU name match → dedicated crop thumbnail.
        if best_score >= 12 and best_page is not None:
            crop_rel = f"/catalog/olsen/lookbook/sku-{sku.lower()}.jpg"
            crop_out = OUT_DIR / f"sku-{sku.lower()}.jpg"
            if extract_sku_crop(doc, best_page - 1, crop_out):
                mapping[sku] = crop_rel
                crop_count += 1
                per_sku += 1
                continue
            if best_thumb:
                mapping[sku] = best_thumb
                per_sku += 1
                continue

        # Moderate token match → use full page image.
        if best_score >= 6 and best_thumb:
            mapping[sku] = best_thumb
            per_sku += 1
            continue

        # Tab-level fallback spread across top pages.
        candidates = tab_pages.get(tab) or []
        if not candidates:
            continue
        idx = sum(ord(c) for c in sku) % len(candidates)
        page_num = candidates[idx]
        thumb = next((p["thumbnailUrl"] for p in pages if p["page"] == page_num and p["thumbnailUrl"]), None)
        if thumb:
            mapping[sku] = thumb
            tab_fallback += 1

    MAP_OUT.write_text(
        json.dumps(
            {
                "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                "pageCount": doc.page_count,
                "mappedSkus": len(mapping),
                "perSkuMatches": per_sku,
                "skuCrops": crop_count,
                "tabFallbacks": tab_fallback,
                "skuToThumbnail": mapping,
            },
            indent=2,
        )
        + "\n"
    )
    print(
        json.dumps(
            {
                "ok": True,
                "pages": doc.page_count,
                "images": sum(1 for p in pages if p["thumbnailUrl"]),
                "mappedSkus": len(mapping),
                "perSkuMatches": per_sku,
                "skuCrops": crop_count,
                "tabFallbacks": tab_fallback,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
