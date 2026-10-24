# Converts the Ninja VFX Pack PNGs to WebP for RigStick's preset library (alpha kept; long sides capped at 4096).
import sys, os, glob
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
total = 0
for path in sorted(glob.glob(os.path.join(src, '**', '*.png'), recursive=True)):
    rel = os.path.relpath(path, src)
    out = os.path.join(dst, os.path.splitext(rel)[0] + '.webp')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = Image.open(path)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    scale = min(1, 4096 / max(im.size))
    if scale < 1: im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(out, 'WEBP', quality=88, method=6)
    total += os.path.getsize(out)
print('total', total // 1024, 'KB')
