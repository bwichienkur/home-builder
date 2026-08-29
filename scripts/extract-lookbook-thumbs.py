#!/usr/bin/env python3
"""Extract Look Book page + embedded product images; map catalog SKUs to thumbnails.

Prefers individual embedded product photos (matched via nearby labels / name tokens)
over full-page renders. Page images remain as fallback when no product photo matches.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
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

# Max edge length for saved product thumbs (keeps public/ small).
ITEM_MAX_SIDE = 480
PAGE_SCALE = 0.55

STOP_WORDS = {
    "the", "and", "for", "with", "level", "tile", "floor", "wall", "each", "per", "from",
    "olsen", "included", "option", "select", "selection", "package", "standard", "platinum",
}

# Extra noise stripped only when claiming an embedded product photo.
ITEM_STOP_WORDS = STOP_WORDS | {
    "stack", "bond", "offset", "straight", "matte", "polished", "inside", "blend", "range",
    "hues", "of", "cm", "add", "extra", "upgrade", "labor", "including", "sheet", "random",
    "linear", "glass", "mosaic", "size", "inch", "inches",
}


# Too common in Look Book finish copy — never enough alone to claim a product photo.
GENERIC_TOKENS = {
    "black", "white", "gray", "grey", "brown", "bronze", "nickel", "chrome", "satin",
    "brushed", "oil", "rubbed", "pewter", "gold", "silver", "clear", "frosted",
    "door", "doors", "trim", "panel", "finish", "exterior", "interior", "garage",
    "shower", "tub", "sink", "faucet", "hardware", "knob", "pull", "hinge",
    "stone", "brick", "veneer", "corner", "flat", "coarse", "cut",
    "polished", "matte", "leathered", "honed",
}

# Leading style words — keep scanning for the real product series name.
STYLE_QUALIFIERS = {
    "frameless", "tumbled", "ceramic", "porcelain", "solid", "extra", "additional",
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
    "Stone-Eldorado": ["eldorado", "stone", "bel air", "capistrano", "cypress"],
    "Stone": ["stone veneer", "natural stone"],
    "Trim Material": ["baseboard", "crown", "casing", "trim"],
    "Shaker Drs": ["cabinet door", "shaker", "cabinetry", "maple"],
    "Upgrade Shaker Drs": ["cabinet door", "shaker", "cabinetry"],
    "Summer Kitchen": ["outdoor kitchen", "summer kitchen"],
    "Pavers": ["paver", "hardscape", "olde towne", "flagler", "volusia"],
    "Tankless Heater": ["tankless", "water heater"],
    "Specialties": ["specialty", "feature", "barn door", "bypass", "frameless", "mirror"],
    "Railing - Shutters": ["railing", "shutter"],
    "Shelves - Mantles - Beams": ["mantle", "mantel", "beam", "shelf"],
}


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "page"


def base_item_name(name: str) -> str:
    return re.sub(r"\s·\sLevel\s*\d+.*$", "", name, flags=re.I).strip()


def tokenize(text: str, stop: set[str] | None = None) -> list[str]:
    stops = stop if stop is not None else STOP_WORDS
    raw = re.findall(r"[a-z0-9]{3,}", text.lower())
    return [t for t in raw if t not in stops]


def distinctive_tokens(tokens: list[str]) -> list[str]:
    return [t for t in tokens if t not in GENERIC_TOKENS and len(t) >= 4]


def page_title(text: str) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines[:8]:
        cleaned = re.sub(r"^\d+\s+", "", ln)
        cleaned = re.sub(r"_+", " ", cleaned).strip(" :")
        if len(cleaned) > 3 and not cleaned.lower().startswith("platinum"):
            return cleaned
    return lines[0] if lines else ""


def clean_label(text: str) -> str:
    t = " ".join(str(text).split()).strip()
    t = re.sub(r"_+", " ", t).strip(" :")
    return t


def is_product_placement(width: int, height: int, bbox: fitz.Rect) -> bool:
    """Filter out page banners, logos, and tiny icons."""
    if width < 160 or height < 160:
        return False
    if width >= 1400:  # Look Book footer/header banners
        return False
    aspect = width / max(height, 1)
    if aspect < 0.35 or aspect > 3.0:
        return False
    if bbox.width * bbox.height < 2500:
        return False
    return True


def extract_page_image(doc: fitz.Document, page_index: int, out_path: Path) -> bool:
    page = doc[page_index]
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(PAGE_SCALE, PAGE_SCALE), alpha=False)
        if pix.width * pix.height < 40_000:
            return False
        out_path.parent.mkdir(parents=True, exist_ok=True)
        pix.save(str(out_path), jpg_quality=78)
        return True
    except Exception:
        return False


def extract_embedded_image(doc: fitz.Document, xref: int, out_path: Path) -> bool:
    """Save a single PDF image XObject as a catalog thumbnail."""
    try:
        pix = fitz.Pixmap(doc, xref)
        if pix.n - pix.alpha >= 4:  # CMYK / other
            pix = fitz.Pixmap(fitz.csRGB, pix)
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)
        if pix.width * pix.height < 5_000:
            return False

        out_path.parent.mkdir(parents=True, exist_ok=True)
        max_side = max(pix.width, pix.height)
        if max_side > ITEM_MAX_SIDE and hasattr(pix, "pil_save"):
            # Pillow path: precise downscale for catalog cards.
            from PIL import Image

            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            img.thumbnail((ITEM_MAX_SIDE, ITEM_MAX_SIDE), Image.Resampling.LANCZOS)
            img.save(str(out_path), "JPEG", quality=82, optimize=True)
            return True

        # Power-of-two shrink if Pillow unavailable / image already small enough.
        while max(pix.width, pix.height) > ITEM_MAX_SIDE * 2 and hasattr(pix, "shrink"):
            pix.shrink(1)
        pix.save(str(out_path), jpg_quality=82)
        return True
    except Exception:
        return False

def nearest_label(bbox: fitz.Rect, labels: list[tuple[fitz.Rect, str]]) -> str:
    cx = (bbox.x0 + bbox.x1) / 2
    best: tuple[float, str] | None = None
    col_tol = max(70.0, bbox.width * 0.55)
    for lr, lt in labels:
        lcx = (lr.x0 + lr.x1) / 2
        dx = abs(lcx - cx)
        if dx > col_tol:
            continue
        # Prefer labels directly under the image (product name / finish).
        dy_below = lr.y0 - bbox.y1
        if -30 <= dy_below <= 110:
            score = dy_below + dx * 0.4
            if best is None or score < best[0]:
                best = (score, lt)
        # Titles sitting just above the image.
        dy_above = bbox.y0 - lr.y1
        if 0 <= dy_above <= 60:
            score = dy_above + 15 + dx * 0.4
            if best is None or score < best[0]:
                best = (score, lt)
        if bbox.intersects(lr) and len(lt) < 48:
            score = 5 + dx * 0.2
            if best is None or score < best[0]:
                best = (score, lt)
    return best[1] if best else ""


def nearby_label_text(bbox: fitz.Rect, labels: list[tuple[fitz.Rect, str]]) -> str:
    expand = fitz.Rect(bbox.x0 - 24, bbox.y0 - 48, bbox.x1 + 24, bbox.y1 + 100)
    bits = [lt for lr, lt in labels if expand.intersects(lr)]
    return " ".join(bits)[:240]


def score_page_for_tab(title: str, body: str, hints: list[str]) -> int:
    hay = f"{title} {body}".lower()
    return sum(3 for hint in hints if hint in hay)


def score_hay_for_item(hay: str, tokens: list[str], hints: list[str], brand: str) -> int:
    """Page-level score used for full-page thumbnails / tab ranking."""
    hay_l = hay.lower()
    score = sum(3 for hint in hints if hint in hay_l)
    for token in tokens:
        if token in hay_l:
            score += 6
        elif len(token) >= 5 and any(token in word or word in token for word in re.findall(r"[a-z0-9]+", hay_l)):
            score += 2
    brand_slug = slug(brand)
    if brand_slug and brand_slug.replace("-", " ") in hay_l:
        score += 5
    if brand and brand.lower() in hay_l:
        score += 4
    return score


def score_product_label(label: str, near: str, tokens: list[str]) -> tuple[int, set[str]]:
    """Score image label text. Returns (score, matched_tokens). Whole-word only."""
    hay = f"{label} {near}".lower()
    if not hay.strip() or not tokens:
        return 0, set()
    words = set(re.findall(r"[a-z0-9]{3,}", hay))
    score = 0
    matched: set[str] = set()
    for token in tokens:
        if token in words:
            score += 14
            matched.add(token)
            continue
        if len(token) >= 6 and any(
            w.startswith(token) or token.startswith(w) for w in words if len(w) >= 6
        ):
            score += 8
            matched.add(token)
    return score, matched


def collect_page_labels(page: fitz.Page) -> list[tuple[fitz.Rect, str]]:
    labels: list[tuple[fitz.Rect, str]] = []
    for block in page.get_text("blocks"):
        text = clean_label(block[4])
        if len(text) < 2 or len(text) > 110:
            continue
        if text.isdigit():
            continue
        labels.append((fitz.Rect(block[:4]), text))
    return labels


def main() -> int:
    if not PDF.exists():
        print(json.dumps({"ok": False, "error": f"Missing {PDF}"}))
        return 1
    if not SEED.exists():
        print(json.dumps({"ok": False, "error": f"Missing {SEED} — run build-olsen-catalog first"}))
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)

    pages: list[dict] = []
    products: list[dict] = []
    extracted_xrefs: set[int] = set()
    item_files_written = 0

    for i in range(doc.page_count):
        page = doc[i]
        text = page.get_text()
        title = page_title(text)
        rel = f"/catalog/olsen/lookbook/page-{i + 1:03d}.jpg"
        out = OUT_DIR / f"page-{i + 1:03d}.jpg"
        has_image = extract_page_image(doc, i, out)
        page_rec = {
            "page": i + 1,
            "title": title,
            "text": text[:6000].lower(),
            "thumbnailUrl": rel if has_image else None,
        }
        pages.append(page_rec)

        labels = collect_page_labels(page)
        try:
            infos = page.get_image_info(xrefs=True)
        except Exception:
            infos = []

        for im in infos:
            xref = int(im.get("xref") or 0)
            if not xref:
                continue
            width = int(im.get("width") or 0)
            height = int(im.get("height") or 0)
            bbox = fitz.Rect(im.get("bbox"))
            if not is_product_placement(width, height, bbox):
                continue

            label = nearest_label(bbox, labels)
            near = nearby_label_text(bbox, labels)
            item_rel = f"/catalog/olsen/lookbook/item-{xref}.jpg"
            item_out = OUT_DIR / f"item-{xref}.jpg"

            saved = item_out.exists()
            if xref not in extracted_xrefs:
                saved = extract_embedded_image(doc, xref, item_out)
                extracted_xrefs.add(xref)
                if saved:
                    item_files_written += 1

            if not saved and not item_out.exists():
                continue

            products.append(
                {
                    "page": i + 1,
                    "xref": xref,
                    "label": label,
                    "near": near,
                    "hay": f"{label} {near} {text[:4000]}".lower(),
                    "thumbnailUrl": item_rel,
                    "area": float(bbox.width * bbox.height),
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
    item_matches = 0
    label_matches = 0
    hero_matches = 0
    page_matches = 0
    tab_fallback = 0

    for item in seed:
        sku = item.get("sku")
        tab = item.get("sourceTab")
        name = item.get("name") or ""
        brand = item.get("brand") or ""
        if not sku or not tab:
            continue

        hints = TAB_SECTION_HINTS.get(tab, [])
        page_tokens = tokenize(base_item_name(name), STOP_WORDS)
        label_tokens = distinctive_tokens(tokenize(base_item_name(name), ITEM_STOP_WORDS))
        # Style qualifiers alone never claim a photo (frameless→shower door, etc.).
        label_tokens = [t for t in label_tokens if t not in STYLE_QUALIFIERS]

        # Page-level ranking first — section context before picking an embedded image.
        ranked_pages = sorted(
            (
                (
                    score_hay_for_item(f"{p['title']} {p['text']}", page_tokens, hints, brand)
                    + sum(10 for t in label_tokens[:2] if t in p["text"]),
                    p["page"],
                    p["thumbnailUrl"],
                )
                for p in pages
                if p["thumbnailUrl"]
            ),
            reverse=True,
        )
        best_score, best_page, best_thumb = ranked_pages[0] if ranked_pages else (0, None, None)

        if best_score >= 6 and best_thumb and best_page is not None:
            page_rec = next(p for p in pages if p["page"] == best_page)
            tab_boost = score_page_for_tab(page_rec["title"], page_rec["text"], hints)
            section_ok = tab_boost >= 3 or best_score >= 18

            if not section_ok:
                # Name hit without section evidence: keep full-page thumb only
                # (never an embedded product photo — avoids countertop→hardware).
                mapping[sku] = best_thumb
                page_matches += 1
                continue

            page_prods = [p for p in products if p["page"] == best_page]
            labeled_prods = [p for p in page_prods if p.get("label")]
            local_best = None
            local_score = -1
            if label_tokens:
                must = set(label_tokens[:2] if len(label_tokens) >= 2 else label_tokens[:1])
                for prod in labeled_prods:
                    words = set(re.findall(r"[a-z0-9]{3,}", (prod.get("label") or "").lower()))
                    if not must.issubset(words):
                        continue
                    sc, matched = score_product_label(prod["label"], "", label_tokens)
                    if not matched:
                        continue
                    rank = sc + 3 * len(matched) + max(len(t) for t in matched)
                    if rank > local_score:
                        local_score = rank
                        local_best = prod
            if local_best is not None and local_score >= 14:
                mapping[sku] = local_best["thumbnailUrl"]
                item_matches += 1
                label_matches += 1
                continue
            # Section-aligned page with embedded photos → largest product image.
            if page_prods and tab_boost >= 3:
                hero = max(page_prods, key=lambda p: p["area"])
                mapping[sku] = hero["thumbnailUrl"]
                item_matches += 1
                hero_matches += 1
                continue
            mapping[sku] = best_thumb
            page_matches += 1
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

    # Labeled Look Book product index (for future alias mapping / Look Book UI).
    items_index = []
    seen_index: set[int] = set()
    labeled_xrefs: set[int] = set()
    for prod in products:
        xref = prod["xref"]
        if prod.get("label"):
            labeled_xrefs.add(xref)
        if xref in seen_index:
            continue
        seen_index.add(xref)
        if not prod.get("label"):
            continue
        items_index.append(
            {
                "xref": xref,
                "page": prod["page"],
                "label": prod["label"],
                "thumbnailUrl": prod["thumbnailUrl"],
            }
        )
    items_index_path = ROOT / "src" / "lib" / "catalog" / "lookbookItems.json"
    items_index_path.write_text(
        json.dumps(
            {
                "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "count": len(items_index),
                "items": items_index,
            },
            indent=2,
        )
        + "\n"
    )

    # Remove stale crude sku-*.jpg crops from the previous pipeline.
    removed_sku_crops = 0
    for path in OUT_DIR.glob("sku-*.jpg"):
        path.unlink(missing_ok=True)
        removed_sku_crops += 1

    # Keep embedded images mapped to SKUs or present in the labeled item index.
    used_items = {Path(url).name for url in mapping.values() if "/item-" in url}
    used_items |= {f"item-{xref}.jpg" for xref in labeled_xrefs}
    removed_unused_items = 0
    for path in OUT_DIR.glob("item-*.jpg"):
        if path.name not in used_items:
            path.unlink(missing_ok=True)
            removed_unused_items += 1

    MAP_OUT.write_text(
        json.dumps(
            {
                "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "pageCount": doc.page_count,
                "embeddedProductImages": len(used_items),
                "productPlacements": len(products),
                "labeledProducts": len(items_index),
                "mappedSkus": len(mapping),
                "itemImageMatches": item_matches,
                "labelMatches": label_matches,
                "heroMatches": hero_matches,
                "pageMatches": page_matches,
                "tabFallbacks": tab_fallback,
                "removedSkuCrops": removed_sku_crops,
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
                "pageImages": sum(1 for p in pages if p["thumbnailUrl"]),
                "embeddedProductImagesExtracted": item_files_written,
                "embeddedProductImagesKept": len(used_items),
                "labeledProducts": len(items_index),
                "productPlacements": len(products),
                "mappedSkus": len(mapping),
                "itemImageMatches": item_matches,
                "labelMatches": label_matches,
                "heroMatches": hero_matches,
                "pageMatches": page_matches,
                "tabFallbacks": tab_fallback,
                "removedSkuCrops": removed_sku_crops,
                "removedUnusedItems": removed_unused_items,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
