"""Draw the fork's Indian ornament set and write it into tokens.css.

Four colourless SVG motifs, used as CSS masks so every colour stays a token:
  jaali     a stone-screen lattice: diamonds with a four-point star in each
  mandala   a rosette: 16 outer petals, 8 inner petals, a ring of dots
  border    a block-print band: lotus buds between scallops over a dotted rule
  bandhani  tie-dye dots in a rhombic grid
Also writes the ornament palette (saffron, marigold, rani pink, peacock) and
the key-button lip/highlight tokens for both themes. Re-run after editing
brand.json; it replaces only the block between its markers.
"""
import json, math
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TOKENS = ROOT / "src/styles/tokens.css"
START, END = "  /* >>> rigstick ornaments (scripts/rebrand/make_patterns.py) */", "  /* <<< rigstick ornaments */"


def uri(svg):
    return 'url("data:image/svg+xml,' + quote(svg, safe=" =:/'(),.-#") .replace("#", "%23") + '")'


def svg(w, h, body):
    return f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}' viewBox='0 0 {w} {h}'>{body}</svg>"


def star(cx, cy, r, inner):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else inner
        pts.append(f"{cx + rr * math.cos(a):.2f} {cy + rr * math.sin(a):.2f}")
    return "M" + "L".join(pts) + "Z"


def jaali():
    lattice = "<path d='M12 0L24 12L12 24L0 12Z' fill='none' stroke='#000' stroke-width='1.3'/>"
    centre = f"<path d='{star(12, 12, 4.6, 1.7)}'/>"
    corners = "".join(f"<circle cx='{x}' cy='{y}' r='1.5'/>" for x, y in ((0, 0), (24, 0), (0, 24), (24, 24)))
    return svg(24, 24, lattice + centre + corners)


def petal(cx, cy, angle, length, width, r0):
    # A pointed almond: two quadratic arcs from the base at radius r0 to the tip.
    a = math.radians(angle)
    ux, uy, nx, ny = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
    bx, by = cx + ux * r0, cy + uy * r0
    tx, ty = cx + ux * (r0 + length), cy + uy * (r0 + length)
    mx, my = cx + ux * (r0 + length * 0.45), cy + uy * (r0 + length * 0.45)
    c1 = (mx + nx * width, my + ny * width)
    c2 = (mx - nx * width, my - ny * width)
    return f"M{bx:.1f} {by:.1f}Q{c1[0]:.1f} {c1[1]:.1f} {tx:.1f} {ty:.1f}Q{c2[0]:.1f} {c2[1]:.1f} {bx:.1f} {by:.1f}Z"


def mandala():
    c = 100
    outer = "".join(petal(c, c, i * 22.5, 34, 11, 58) for i in range(16))
    inner = "".join(petal(c, c, i * 45 + 22.5, 26, 10, 26) for i in range(8))
    dots = "".join(f"<circle cx='{c + 51 * math.cos(math.radians(i * 22.5 + 11.25)):.1f}' cy='{c + 51 * math.sin(math.radians(i * 22.5 + 11.25)):.1f}' r='3'/>" for i in range(16))
    rings = ("<circle cx='100' cy='100' r='96' fill='none' stroke='#000' stroke-width='2'/>"
             "<circle cx='100' cy='100' r='22' fill='none' stroke='#000' stroke-width='3'/>"
             "<circle cx='100' cy='100' r='9'/>")
    return svg(200, 200, f"<path d='{outer}{inner}'/>{dots}{rings}")


def border():
    # 32x12 tile: a lotus bud, scallops either side, a dotted base rule.
    bud = "M16 1Q20 5 16 9Q12 5 16 1Z M16 9Q22 7 24 3Q22 9 16 9Z M16 9Q10 7 8 3Q10 9 16 9Z"
    scallop = "<path d='M0 9Q4 4 8 9M24 9Q28 4 32 9' fill='none' stroke='#000' stroke-width='1.2'/>"
    rule = "<rect x='0' y='10.4' width='32' height='1.1'/>"
    dots = "<circle cx='4' cy='5.2' r='1'/><circle cx='28' cy='5.2' r='1'/>"
    return svg(32, 12, f"<path d='{bud}'/>{scallop}{rule}{dots}")


def bandhani():
    ring = lambda x, y: f"<circle cx='{x}' cy='{y}' r='2.2' fill='none' stroke='#000' stroke-width='1'/><circle cx='{x}' cy='{y}' r='0.7'/>"
    return svg(14, 14, ring(3.5, 3.5) + ring(10.5, 10.5))


def main():
    brand = json.loads((HERE / "brand.json").read_text("utf8"))
    orn = brand.get("ornament", {"marigold": "#f7b32b", "rani": "#e4007c", "peacock": "#0f6e73"})
    block = f"""{START}
  :root {{
    /* Ornament palette: saffron is the accent; marigold, rani pink and peacock frame it. */
    --marigold-400: {orn['marigold']};
    --rani-500: {orn['rani']};
    --peacock-600: {orn['peacock']};
    --ornament-band: linear-gradient(90deg, var(--rani-500), var(--accent) 35%, var(--marigold-400) 65%, var(--rani-500));
    --ornament-ink: color-mix(in srgb, var(--accent) 22%, transparent);
    --ornament-on-accent: rgba(255, 255, 255, 0.24);
    --pattern-jaali: {uri(jaali())};
    --pattern-jaali-on-accent: {uri(jaali().replace("<svg ", "<svg fill='#fff' fill-opacity='.26' stroke-opacity='.26' ").replace("stroke='#000'", "stroke='#fff'"))};
    --pattern-mandala: {uri(mandala())};
    --pattern-border: {uri(border())};
    --pattern-bandhani: {uri(bandhani())};
    /* Key buttons (features/rigstick.css) */
    --key-hi: rgba(255, 255, 255, 0.7);
    --key-lip: rgba(12, 13, 18, 0.16);
    --key-sheen: rgba(255, 255, 255, 0.55);
    --key-lift-shadow: 0 10px 18px -12px rgba(12, 13, 18, 0.45);
    --key-main-hi: rgba(255, 255, 255, 0.45);
    --key-main-lip: rgba(120, 40, 0, 0.35);
    --key-main-top: color-mix(in srgb, var(--accent) 82%, var(--paper));
  }}
  :root[data-theme="dark"] {{
    --key-hi: rgba(255, 255, 255, 0.08);
    --key-lip: rgba(0, 0, 0, 0.5);
    --key-lift-shadow: 0 12px 20px -12px rgba(0, 0, 0, 0.85);
    --ornament-ink: color-mix(in srgb, var(--accent) 16%, transparent);
  }}
{END}"""
    text = TOKENS.read_text("utf8")
    if START in text:
        text = text[:text.index(START)] + block + text[text.index(END) + len(END):]
    else:
        closing = text.rstrip().rfind("}")          # the tokens layer's closing brace
        text = text[:closing] + block + "\n" + text[closing:]
    TOKENS.write_text(text, "utf8")
    print("ornaments written to", TOKENS.relative_to(ROOT))


if __name__ == "__main__":
    main()
