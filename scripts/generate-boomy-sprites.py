"""
Boomy-Sprite-Generator — 4 Pixel-Wolf-Frames fuer die Mascot-Animation.

Generiert 4 leicht variierte Sprites (Idle / Beat-Up / Idle-2 / Beat-Down) als
quadratisches PNG mit Boomy-Lila-Background. Wolf-Pose passt zu 140 BPM
Headbang — Frame-Wechsel pro Beat (~428ms), voller Loop = 1714ms.

Sprite-Sheet-Output: public/images/boomy-sprites.png (4 Frames horizontal
nebeneinander, jeder 96x96, total 384x96).

Plus 4 Einzel-Frames fuer Debug + alternative Nutzung.

Konvention: 16x16 Pixel-Grid x 6 Scale = 96x96 final pro Frame. Boomy-Purple
#8B5CF6 als Karten-Hintergrund mit Vulkanglas-Hauch (subtiler Verlauf).
Wolf in dark-purple Fell, Augen leuchten heller-purple — passt zum
AI-Tag-Pill-Stil.

Usage:
    python scripts/generate-boomy-sprites.py
"""
import os
from PIL import Image, ImageDraw

OUT_DIR = "public/images"
SHEET_NAME = "boomy-sprites.png"
GRID = 16          # Pixel-Aufloesung pro Frame
SCALE = 6          # Skalierungsfaktor (16 -> 96px)
FRAME_PX = GRID * SCALE  # 96
NUM_FRAMES = 4
SHEET_W = FRAME_PX * NUM_FRAMES
SHEET_H = FRAME_PX

# Boomy-Farbpalette
BG_PURPLE_TOP = (149, 102, 255, 255)     # heller Lila oben (Card-BG)
BG_PURPLE_BOT = (94, 50, 196, 255)       # dunkler Lila unten (Card-BG)
BG_BORDER = (210, 180, 255, 255)         # heller Border um Card
FUR_DARK = (32, 14, 60, 255)             # Wolf-Outline / Schatten
FUR_MID = (66, 38, 116, 255)             # Wolf-Fell Hauptfarbe
FUR_LIGHT = (108, 78, 168, 255)          # Schnauzen-Highlight (heller Lila)
NOSE = (12, 6, 22, 255)                  # Nase fast schwarz
TOOTH = (240, 232, 248, 255)             # Reisszahn knochen-weiss
ACCENT_CYAN = (90, 230, 230, 255)        # Cyan-Akzent (Ohren-Innen + Halsband)
ACCENT_CYAN_DIM = (60, 160, 170, 255)    # gedimmtes Cyan (Beat-Down)
EYE_DIM = (180, 140, 255, 255)           # Augen normal
EYE_BRIGHT = (240, 235, 255, 255)        # Augen leuchten (Beat-Up)
EYE_OFF = (130, 95, 200, 255)            # Augen gedimmt (Blink)

# Wolf-Sprite als String-Grid (16x16). Codes:
#   '.' = transparent (BG zeigt durch)
#   'D' = FUR_DARK (Outline / Schattenkonturen)
#   'M' = FUR_MID (Fell-Hauptfarbe)
#   'L' = FUR_LIGHT (Schnauzen-Highlight)
#   'E' = eye (Farbe je nach Frame: dim/bright/off)
#   'B' = blink (Augenlid: gleiche Farbe wie FUR_DARK)
#   'N' = NOSE (fast schwarz)
#   'T' = TOOTH (Reisszahn beim offenen Maul)
#   'C' = ACCENT_CYAN (Ohren-Innen "Headphone-Cup", Halsband)
#   'c' = ACCENT_CYAN_DIM (gedimmtes Cyan)
#
# v2.25.3 — Komplettes Redesign (Flow-Pushback "zu laecherlich, kein Wolf").
# Aenderungen:
#  - Wolf hat jetzt erkennbare Schnauze mit Nase, Maul-Andeutung und
#    Light-Fur-Highlights (3-Ton-Fell statt nur 2-Ton).
#  - Augen sind 2 Pixel breit / 1 Pixel hoch (schmal-Wolf-Style statt
#    Cartoon-2x2-Block).
#  - Cyan-Akzent als zweite Farbe: Ohren-Innen wie Headphone-Cups +
#    Halsband mit Cyan-Spike (DJ-Vibe, passt zur AI-Resident-Persona).
#  - Beat-Up: Maul offen mit zwei Reisszaehnen (Tooth-Pixel) — stylisch
#    statt gruselig.
#  - Frame 4: KEINE Vertikal-Verschiebung mehr (Kinn schnitt sonst am
#    unteren Rand ab). Stattdessen Augenlid-Blink + Cyan dimmt.

# Frame 1 — Idle: Wolf zentral, Augen offen, Maul zu, Cyan voll
IDLE = [
    '................',
    '....D......D....',
    '...DMD....DMD...',
    '..DMMD....DMMD..',
    '..DMCD....DCMD..',
    '..DMMDDDDDDMMD..',
    '.DMMMMMMMMMMMMD.',
    '.DMMEEMMMMEEMMD.',
    '.DMMMMMMMMMMMMD.',
    '..DDMMMNNMMMDD..',
    '...DDMLNNLMDD...',
    '....DDLLLLDD....',
    '.....DLLLLDD....',
    '.....DDLLDD.....',
    '.....DCCCCD.....',
    '......DCCD......',
]

# Frame 2 — Beat-Up: Maul offen mit Reisszaehnen, Augen leuchten,
# Halsband-Cyan pulst
BEAT_UP = [
    '................',
    '....D......D....',
    '...DMD....DMD...',
    '..DMMD....DMMD..',
    '..DMCD....DCMD..',
    '..DMMDDDDDDMMD..',
    '.DMMMMMMMMMMMMD.',
    '.DMMEEMMMMEEMMD.',
    '.DMMMMMMMMMMMMD.',
    '..DDMMMNNMMMDD..',
    '...DDMLNNLMDD...',
    '....DDTTTTDD....',
    '....DLLTTLLDD...',
    '.....DLLLLDD....',
    '.....DCCCCD.....',
    '......DCCD......',
]

# Frame 3 — Idle-2: Augen offen aber leicht enger Mund-Tweak,
# Cyan-Halsband-Spike pulsiert leicht
IDLE2 = [
    '................',
    '....D......D....',
    '...DMD....DMD...',
    '..DMMD....DMMD..',
    '..DMCD....DCMD..',
    '..DMMDDDDDDMMD..',
    '.DMMMMMMMMMMMMD.',
    '.DMMEEMMMMEEMMD.',
    '.DMMMMMMMMMMMMD.',
    '..DDMMMNNMMMDD..',
    '...DDMLNNLMDD...',
    '....DDLLLLDD....',
    '.....DLDDLDD....',
    '.....DDLLDD.....',
    '.....DCCCCD.....',
    '......DCCD......',
]

# Frame 4 — Blink: Augen geschlossen (Augenlid = FUR_DARK), Cyan dimt
BEAT_DOWN = [
    '................',
    '....D......D....',
    '...DMD....DMD...',
    '..DMMD....DMMD..',
    '..DMcD....DcMD..',
    '..DMMDDDDDDMMD..',
    '.DMMMMMMMMMMMMD.',
    '.DMMBBMMMMBBMMD.',
    '.DMMMMMMMMMMMMD.',
    '..DDMMMNNMMMDD..',
    '...DDMLNNLMDD...',
    '....DDLLLLDD....',
    '.....DLLLLDD....',
    '.....DDLLDD.....',
    '.....DccccD.....',
    '......DccD......',
]

FRAMES = [
    ('idle', IDLE, EYE_DIM),
    ('beat-up', BEAT_UP, EYE_BRIGHT),
    ('idle-2', IDLE2, EYE_DIM),
    ('blink', BEAT_DOWN, EYE_OFF),
]


def make_background(width: int, height: int) -> Image.Image:
    """Lila-Verlauf-Hintergrund als Vulkanglas-Imitat — von oben hell zu unten
    dunkel, plus leichte diagonale Schliff-Linie."""
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    px = img.load()
    assert px is not None
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(BG_PURPLE_TOP[0] * (1 - t) + BG_PURPLE_BOT[0] * t)
        g = int(BG_PURPLE_TOP[1] * (1 - t) + BG_PURPLE_BOT[1] * t)
        b = int(BG_PURPLE_TOP[2] * (1 - t) + BG_PURPLE_BOT[2] * t)
        for x in range(width):
            px[x, y] = (r, g, b, 255)

    draw = ImageDraw.Draw(img, 'RGBA')
    # Diagonale Schliff-Linie als Highlight
    for offset in range(-8, 9, 4):
        draw.line(
            [(width * 0.15 + offset, 0), (width * 0.85 + offset, height)],
            fill=(255, 255, 255, 18),
            width=1,
        )
    # Border (thin) — passt zum Obsidian-framed-Stil
    draw.rectangle([0, 0, width - 1, height - 1], outline=BG_BORDER, width=2)
    return img


def render_frame(grid: list[str], eye_color: tuple) -> Image.Image:
    """Rendert einen einzelnen Frame: Lila-Card + Wolf-Pixels."""
    img = make_background(FRAME_PX, FRAME_PX)
    draw = ImageDraw.Draw(img, 'RGBA')

    for gy, row in enumerate(grid):
        for gx, ch in enumerate(row):
            if ch == '.':
                continue
            if ch == 'D':
                color = FUR_DARK
            elif ch == 'M':
                color = FUR_MID
            elif ch == 'L':
                color = FUR_LIGHT
            elif ch == 'E':
                color = eye_color
            elif ch == 'B':
                # Blink: Augenlid in der Outline-Farbe
                color = FUR_DARK
            elif ch == 'N':
                color = NOSE
            elif ch == 'T':
                color = TOOTH
            elif ch == 'C':
                color = ACCENT_CYAN
            elif ch == 'c':
                color = ACCENT_CYAN_DIM
            else:
                continue
            x0 = gx * SCALE
            y0 = gy * SCALE
            draw.rectangle(
                [x0, y0, x0 + SCALE - 1, y0 + SCALE - 1],
                fill=color,
            )
    return img


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    # Sprite-Sheet (4 Frames horizontal)
    sheet = Image.new('RGBA', (SHEET_W, SHEET_H), (0, 0, 0, 0))
    for idx, (name, grid, eye_color) in enumerate(FRAMES):
        frame = render_frame(grid, eye_color)
        # In Sprite-Sheet einkleben
        sheet.paste(frame, (idx * FRAME_PX, 0), frame)
        # Plus einzeln speichern (Debug)
        single_path = os.path.join(OUT_DIR, f'boomy-sprite-{idx + 1}.png')
        frame.save(single_path, 'PNG', optimize=True)
        print(f'OK boomy-sprite-{idx + 1}.png  ({name})')

    sheet_path = os.path.join(OUT_DIR, SHEET_NAME)
    sheet.save(sheet_path, 'PNG', optimize=True)
    print(f'OK {SHEET_NAME}  ({SHEET_W}x{SHEET_H})')


if __name__ == '__main__':
    main()
