"""Accent colour maths for CV templates: tints and a readable text colour on a fill.

Templates consume three custom properties derived here from the chosen accent:
``--accent`` (rules, headings, fills), ``--accent-tint`` (the accent mixed 12% into white,
for light backgrounds behind ink text) and ``--on-accent`` (white or ink, whichever reads
better on the accent, by WCAG contrast).
"""

from __future__ import annotations

WHITE = "#FFFFFF"
INK = "#111827"
TINT_SHARE = 0.12
MIN_TEXT_CONTRAST = 4.5


def _channels(color: str) -> tuple[int, int, int]:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def relative_luminance(color: str) -> float:
    def linear(channel: int) -> float:
        value = channel / 255
        return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(c) for c in _channels(color))
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(first: str, second: str) -> float:
    light, dark = sorted((relative_luminance(first), relative_luminance(second)), reverse=True)
    return (light + 0.05) / (dark + 0.05)


def accent_tint(color: str, share: float = TINT_SHARE) -> str:
    """``color`` mixed into white: ``share`` of the accent, the rest white."""
    mixed = (round(255 - (255 - c) * share) for c in _channels(color))
    return "#{:02X}{:02X}{:02X}".format(*mixed)


def on_accent(color: str) -> str:
    """White or ink, whichever has the higher contrast on ``color``."""
    return WHITE if contrast_ratio(color, WHITE) >= contrast_ratio(color, INK) else INK


def accent_tokens(color: str) -> dict[str, str]:
    color = color.upper()
    return {"accent": color, "accent_tint": accent_tint(color), "on_accent": on_accent(color)}
