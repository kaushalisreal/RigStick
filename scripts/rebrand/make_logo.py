"""Build the fork's logo set from the master badge (brand.json logo.source).

The master is a full-colour app badge on a 512 canvas (squircle at 24..488).
  app-icon-*       the badge as drawn (the icon pipeline rasterises these)
  symbol-blue      the badge cropped to its squircle: the in-app mark
  symbol-black/-white  the stickman and sword flattened to one colour, no badge
  horizontal-* / stacked-*  badge (or flat figure) plus the outlined wordmark
The wordmark is the brand name outlined from the bundled Inter Tight, so no
SVG depends on system fonts. File names stay those the icon scripts expect.
"""
import json, re
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
brand = json.loads((HERE / "brand.json").read_text("utf8"))
NAME, SLUG = brand["current"]["name"], brand["current"]["slug"]
INK, WHITE = brand["logo"]["text_color"], "#FFFFFF"
MASTER = (ROOT / brand["logo"]["source"]).read_text("utf8")
OUT = ROOT / "assets/brand/svg"


def inner(svg_text):
    return svg_text[svg_text.index(">", svg_text.index("<svg")) + 1:svg_text.rindex("</svg>")].strip()


BADGE = inner(MASTER)


def badge(x, y, size, uid):
    """The master badge placed at (x, y), size px square; ids suffixed so lockups stay valid."""
    body = re.sub(r'id="([\w-]+)"', lambda m: f'id="{m.group(1)}-{uid}"', BADGE)
    body = re.sub(r'url\(#([\w-]+)\)', lambda m: f'url(#{m.group(1)}-{uid})', body)
    return f'<svg x="{x:g}" y="{y:g}" width="{size:g}" height="{size:g}" viewBox="24 24 464 464">{body}</svg>'


def flat_figure(color):
    """The running stickman and sword in one colour: the master's main figure group only."""
    start = BADGE.index('<g filter="url(#softShadow)">')
    depth, i = 0, start
    while True:   # find the group's matching </g>
        nxt_open, nxt_close = BADGE.find("<g", i + 1), BADGE.find("</g>", i + 1)
        if nxt_open != -1 and nxt_open < nxt_close:
            depth, i = depth + 1, nxt_open
        elif depth:
            depth, i = depth - 1, nxt_close
        else:
            end = nxt_close + 4
            break
    group = BADGE[start:end].replace(' filter="url(#softShadow)"', "")
    group = re.sub(r'(stroke|fill)="(?!none)[^"]*"', lambda m: f'{m.group(1)}="{color}"', group)
    group = re.sub(r'\s(opacity|stroke-opacity|fill-opacity)="[^"]*"', "", group)
    return group


def wordmark():
    font = TTFont(ROOT / "assets/fonts/inter-tight-latin-wght-normal.woff2")
    font = instantiateVariableFont(font, {"wght": brand["logo"]["wordmark_weight"]})
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    upm, x, pen = font["head"].unitsPerEm, 0, SVGPathPen(glyphs)
    for ch in NAME:
        name = cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        x += hmtx[name][0] - 0.02 * upm   # slight tightening, as display type
    return pen.getCommands(), x, font["OS/2"].sCapHeight


def svg(w, h, body, view=None):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}" height="{h:g}" viewBox="{view or f"0 0 {w:g} {h:g}"}" '
            f'role="img" aria-label="{NAME}"><title>{NAME}</title>{body}</svg>\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    d, width, cap = wordmark()
    s = 120 / cap                      # cap height of the name = 120px beside a 272px mark
    tw = width * s
    files = {}
    for variant in ("blue", "black", "light"):
        files[f"app-icon-{variant}"] = svg(512, 512, BADGE)
    files["symbol-blue"] = svg(464, 464, BADGE, "24 24 464 464")
    for variant, color in (("black", INK), ("white", WHITE)):
        files[f"symbol-{variant}"] = svg(400, 400, flat_figure(color), "70 50 400 400")
    for variant, text in (("primary", INK), ("black", INK), ("white", WHITE)):
        mark = badge(0, 0, 272, variant) if variant != "black" else \
            f'<svg x="0" y="0" width="272" height="272" viewBox="70 50 400 400">{flat_figure(INK)}</svg>'
        files[f"horizontal-{variant}"] = svg(272 + 36 + tw, 272,
            f'{mark}<g fill="{text}" transform="translate(308 196) scale({s:.6f})"><path d="{d}"/></g>')
        sw = max(tw, 560) + 80
        stacked_mark = mark.replace('x="0" y="0" width="272" height="272"',
                                    f'x="{(sw - 560) / 2:.2f}" y="18" width="560" height="560"')
        files[f"stacked-{variant}"] = svg(sw, 860,
            f'{stacked_mark}<g fill="{text}" transform="translate({(sw - tw) / 2:.2f} 800) scale({s:.6f})"><path d="{d}"/></g>')
    for old in OUT.glob("*.svg"):
        if not old.name.startswith(SLUG + "-"):
            old.unlink()
    for key, content in files.items():
        (OUT / f"{SLUG}-{key}.svg").write_text(content, "utf8")
    print(f"wrote {len(files)} logo files for {NAME}")


if __name__ == "__main__":
    main()
