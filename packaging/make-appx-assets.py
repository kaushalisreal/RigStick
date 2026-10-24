"""Builds the Microsoft Store tile images in packaging/appx from the app icon."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICON = Image.open(ROOT / "desktop/assets/rigstick-1024.png").convert("RGBA")
OUT = ROOT / "packaging/appx"

# name: (width, height) at scale 100; the logo fills `fill` of the shorter side.
TILES = {
    "StoreLogo": (50, 50, 1.0),
    "Square44x44Logo": (44, 44, 1.0),
    "SmallTile": (71, 71, 0.8),
    "Square150x150Logo": (150, 150, 0.66),
    "LargeTile": (310, 310, 0.6),
    "Wide310x150Logo": (310, 150, 0.66),
}


def tile(width, height, fill):
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    side = round(min(width, height) * fill)
    logo = ICON.resize((side, side), Image.LANCZOS)
    canvas.alpha_composite(logo, ((width - side) // 2, (height - side) // 2))
    return canvas


OUT.mkdir(parents=True, exist_ok=True)
for name, (width, height, fill) in TILES.items():
    for scale in (100, 200, 400):
        tile(width * scale // 100, height * scale // 100, fill).save(OUT / f"{name}.scale-{scale}.png")
for size in (16, 24, 32, 48, 256):
    tile(size, size, 1.0).save(OUT / f"Square44x44Logo.targetsize-{size}.png")
    tile(size, size, 1.0).save(OUT / f"Square44x44Logo.targetsize-{size}_altform-unplated.png")
print(len(list(OUT.glob("*.png"))), "images")
