"""
PWA-Icon-Generator fuer KaboomKartell.

Erzeugt aus public/images/logo-4flow.png (1080x1080 RGBA) alle Manifest-
und Apple-Touch-Icons + Splash-Screens. Einmalig laufen lassen, oder
wenn das Quell-Logo geupdatet wird.

Python statt Node-sharp gewaehlt: sharp waere nur als devDependency noetig
gewesen, das Tooling-Skript ist auch Python-konsistent (PIL/Pillow ist
Python-Standard fuer Image-Manipulation). Sharp bleibt transitiv via
next/image fuer Production-Bildoptimierung verfuegbar.

Usage:
    python scripts/generate-pwa-icons.py
"""
import os
from PIL import Image

SOURCE = "public/images/logo-4flow.png"
OUT_DIR = "public/icons"
KBK_BLACK = (10, 11, 12)  # #0A0B0C

STANDARD_SIZES = [48, 72, 96, 128, 144, 152, 192, 384, 512]
MASKABLE_SIZES = [192, 512]
APPLE_TOUCH = 180

SPLASH_SIZES = [
    (1290, 2796, "apple-splash-1290-2796.png"),
    (1179, 2556, "apple-splash-1179-2556.png"),
    (1170, 2532, "apple-splash-1170-2532.png"),
    (828,  1792, "apple-splash-828-1792.png"),
    (1125, 2436, "apple-splash-1125-2436.png"),
    (750,  1334, "apple-splash-750-1334.png"),
    (2048, 2732, "apple-splash-2048-2732.png"),
    (1668, 2388, "apple-splash-1668-2388.png"),
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    src = Image.open(SOURCE).convert("RGBA")

    # 1) Standard-Icons (purpose: 'any') — Wolf auf transparentem BG
    for size in STANDARD_SIZES:
        img = src.copy()
        img.thumbnail((size, size), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
        canvas.save(os.path.join(OUT_DIR, f"icon-{size}.png"), "PNG", optimize=True)
        print(f"OK icon-{size}.png")

    # 2) Maskable-Icons (Wolf auf 80% Safe-Zone, Rest = kbk-black)
    for size in MASKABLE_SIZES:
        inner = round(size * 0.80)
        img = src.copy()
        img.thumbnail((inner, inner), Image.LANCZOS)
        canvas = Image.new("RGB", (size, size), KBK_BLACK)
        canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2),
                     img if img.mode == "RGBA" else None)
        canvas.save(os.path.join(OUT_DIR, f"icon-maskable-{size}.png"), "PNG", optimize=True)
        print(f"OK icon-maskable-{size}.png")

    # 3) Apple-Touch-Icon (180x180, KEIN Transparenz — iOS rendert Schwarz wenn alpha)
    img = src.copy()
    img.thumbnail((APPLE_TOUCH, APPLE_TOUCH), Image.LANCZOS)
    canvas = Image.new("RGB", (APPLE_TOUCH, APPLE_TOUCH), KBK_BLACK)
    canvas.paste(img, ((APPLE_TOUCH - img.width) // 2, (APPLE_TOUCH - img.height) // 2),
                 img if img.mode == "RGBA" else None)
    canvas.save(os.path.join(OUT_DIR, "apple-touch-icon.png"), "PNG", optimize=True)
    print("OK apple-touch-icon.png")

    # 4) Shortcut-Icons (96x96, Phase-1: einfach Wolf wiederverwenden)
    for name in ["shortcut-schedule", "shortcut-library", "shortcut-artists"]:
        img = src.copy()
        img.thumbnail((96, 96), Image.LANCZOS)
        canvas = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        canvas.paste(img, ((96 - img.width) // 2, (96 - img.height) // 2), img)
        canvas.save(os.path.join(OUT_DIR, f"{name}.png"), "PNG", optimize=True)
        print(f"OK {name}.png")

    # 5) Apple-Splash-Screens — Wolf zentriert auf kbk-black, 40% der Kurzkante
    for w, h, name in SPLASH_SIZES:
        logo_size = round(min(w, h) * 0.40)
        img = src.copy()
        img.thumbnail((logo_size, logo_size), Image.LANCZOS)
        canvas = Image.new("RGB", (w, h), KBK_BLACK)
        canvas.paste(img, ((w - img.width) // 2, (h - img.height) // 2),
                     img if img.mode == "RGBA" else None)
        canvas.save(os.path.join(OUT_DIR, name), "PNG", optimize=True)
        print(f"OK {name}")

    print("Done.")


if __name__ == "__main__":
    main()
