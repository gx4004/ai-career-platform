"""Rebuild the static CV fonts under ``app/assets/fonts`` from their upstream releases.

Run once when a family is added or updated; the output TTFs are committed. Variable fonts
are instanced to static files (a variable or unloaded weight would print as a Type 3 PDF
font), with the PostScript name set to ``<Family>-<Style>`` so the font check can match it.

    pip install fonttools
    python scripts/build_cv_fonts.py <download-dir> [family-id ...]

``<download-dir>`` holds the upstream files named as in ``VARIABLE`` / ``STATIC`` below,
fetched from https://github.com/google/fonts (ofl/, apache/, ufl/) at the main branch.
Every family keeps its licence notice next to the fonts.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTS = Path(__file__).resolve().parent.parent / "app" / "assets" / "fonts"

WEIGHT_NAMES = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}
# Static faces every instanced family gets: (weight, italic)
FACES = [(400, False), (500, False), (600, False), (700, False), (400, True), (700, True)]
FACES_MINOR = [(400, False), (500, False), (600, False), (700, False), (400, True)]

# id -> (directory, family name, PostScript family, upstream upright, upstream italic, extra axes, faces)
VARIABLE = {
    "inter": ("inter", "Inter", "Inter", "Inter.ttf", "Inter-Italic.ttf", {"opsz": 14}, FACES),
    "ibm-plex-sans": ("ibm-plex-sans", "IBM Plex Sans", "IBMPlexSans", "IBMPlexSans.ttf", "IBMPlexSans-Italic.ttf", {"wdth": 100}, FACES),
    "lora": ("lora", "Lora", "Lora", "Lora.ttf", "Lora-Italic.ttf", {}, FACES),
    "eb-garamond": ("eb-garamond", "EB Garamond", "EBGaramond", "EBGaramond.ttf", "EBGaramond-Italic.ttf", {}, FACES),
    "source-sans-3": ("source-sans-3", "Source Sans 3", "SourceSans3", "SourceSans3.ttf", "SourceSans3-Italic.ttf", {}, FACES),
    "source-serif-4": ("source-serif-4", "Source Serif 4", "SourceSerif4", "SourceSerif4.ttf", "SourceSerif4-Italic.ttf", {"opsz": 20}, FACES),
    "cormorant-garamond": ("cormorant-garamond", "Cormorant Garamond", "CormorantGaramond", "CormorantGaramond.ttf", "CormorantGaramond-Italic.ttf", {}, FACES_MINOR),
    "nunito": ("nunito", "Nunito", "Nunito", "Nunito.ttf", "Nunito-Italic.ttf", {}, FACES_MINOR),
    "raleway": ("raleway", "Raleway", "Raleway", "Raleway.ttf", "Raleway-Italic.ttf", {}, FACES_MINOR),
    "manrope": ("manrope", "Manrope", "Manrope", "Manrope.ttf", None, {}, [(400, False), (500, False), (600, False), (700, False)]),
    "roboto-slab": ("roboto-slab", "Roboto Slab", "RobotoSlab", "RobotoSlab.ttf", None, {}, [(400, False), (500, False), (600, False), (700, False)]),
}
# Already-static families: (directory, upstream file -> committed file)
STATIC = {
    "ibm-plex-serif": ("ibm-plex-serif", {f"IBMPlexSerif-{s}.ttf": f"IBMPlexSerif-{s}.ttf" for s in ("Regular", "Medium", "SemiBold", "Bold", "Italic", "BoldItalic")}),
    "ibm-plex-mono": ("ibm-plex-mono", {f"IBMPlexMono-{s}.ttf": f"IBMPlexMono-{s}.ttf" for s in ("Regular", "Medium", "SemiBold", "Bold", "Italic", "BoldItalic")}),
    "fira-sans": ("fira-sans", {f"FiraSans-{s}.ttf": f"FiraSans-{s}.ttf" for s in ("Regular", "Medium", "SemiBold", "Bold", "Italic", "BoldItalic")}),
    "ubuntu": ("ubuntu", {f"Ubuntu-{s}.ttf": f"Ubuntu-{s}.ttf" for s in ("Regular", "Medium", "Bold", "Italic", "BoldItalic")}),
}


def style_name(weight: int, italic: bool) -> str:
    base = WEIGHT_NAMES[weight]
    if not italic:
        return base
    return "Italic" if weight == 400 else f"{base}Italic"


def file_style(fid: str, weight: int, italic: bool) -> str:
    """Adobe's Source Sans/Serif files are named Semibold, It and BoldIt; keep those names."""
    if fid in ("source-sans-3", "source-serif-4"):
        return {"SemiBold": "Semibold", "Italic": "It", "BoldItalic": "BoldIt"}.get(
            style_name(weight, italic), style_name(weight, italic)
        )
    return style_name(weight, italic)


def set_names(font: TTFont, family: str, ps_family: str, weight: int, italic: bool) -> None:
    style = style_name(weight, italic)
    pretty = {"Italic": "Italic", "BoldItalic": "Bold Italic", "MediumItalic": "Medium Italic", "SemiBoldItalic": "SemiBold Italic", "SemiBold": "SemiBold"}.get(style, style)
    ribbi = weight in (400, 700)
    legacy_family = family if ribbi else f"{family} {WEIGHT_NAMES[weight]}"
    legacy_style = ("Bold " if weight == 700 else "") + ("Italic" if italic else "")
    legacy_style = legacy_style.strip() or "Regular"
    name = font["name"]
    for rec in list(name.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            name.removeNames(nameID=rec.nameID)
    full = f"{family} {pretty}" if pretty != "Regular" else family
    name.setName(legacy_family, 1, 3, 1, 0x409)
    name.setName(legacy_style, 2, 3, 1, 0x409)
    name.setName(f"{ps_family}-{style};static", 3, 3, 1, 0x409)
    name.setName(full, 4, 3, 1, 0x409)
    name.setName(f"{ps_family}-{style}", 6, 3, 1, 0x409)
    if not ribbi:
        name.setName(family, 16, 3, 1, 0x409)
        name.setName(pretty, 17, 3, 1, 0x409)
    os2, head = font["OS/2"], font["head"]
    sel = os2.fsSelection & ~(0x01 | 0x20 | 0x40)
    mac = 0
    if italic:
        sel |= 0x01
        mac |= 2
    if weight == 700:
        sel |= 0x20
        mac |= 1
    if not italic and weight != 700:
        sel |= 0x40
    os2.fsSelection, head.macStyle = sel, mac
    os2.usWeightClass = weight


def instance(source: Path, axes: dict, family: str, ps_family: str, weight: int, italic: bool, out: Path) -> None:
    font = TTFont(source)
    limits = {"wght": weight, **axes}
    limits = {tag: value for tag, value in limits.items() if any(a.axisTag == tag for a in font["fvar"].axes)}
    static = instancer.instantiateVariableFont(font, limits, inplace=False)
    for table in ("STAT", "avar", "gvar", "HVAR", "MVAR", "VVAR", "fvar", "cvar"):
        if table in static:
            del static[table]
    set_names(static, family, ps_family, weight, italic)
    static.save(out)


def main(download: Path, only: set[str]) -> None:
    for fid, (directory, family, ps_family, upright, italic_file, axes, faces) in VARIABLE.items():
        if only and fid not in only:
            continue
        target = FONTS / directory
        target.mkdir(parents=True, exist_ok=True)
        for weight, italic in faces:
            source = download / (italic_file if italic else upright)
            out = target / f"{ps_family}-{file_style(fid, weight, italic)}.ttf"
            if fid in ("source-sans-3", "source-serif-4") and out.exists():
                continue  # the Adobe releases already committed
            instance(source, axes, family, ps_family, weight, italic, out)
            print("wrote", out.relative_to(FONTS))
    for fid, (directory, files) in STATIC.items():
        if only and fid not in only:
            continue
        target = FONTS / directory
        target.mkdir(parents=True, exist_ok=True)
        for upstream, committed in files.items():
            shutil.copyfile(download / upstream, target / committed)
            print("copied", f"{directory}/{committed}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), set(sys.argv[2:]))
