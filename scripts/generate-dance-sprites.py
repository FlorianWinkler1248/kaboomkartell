# -*- coding: utf-8 -*-
"""
Dance-Sprite-Generator — tanzende Pixel-Roboter + AI-Androids fuer die Startseite.

Gleiche Stil-DNA wie generate-boomy-sprites.py: 16x16-Grid x 6 Scale = 96x96 pro
Frame, 4 Frames horizontal = 384x96 Sheet, Frame-Wechsel pro Beat bei 140 BPM
(CSS steps(4), Loop 1714ms — identisch zu BoomyMascot).

Output: public/images/dance/<slug>.png (transparenter Hintergrund).
Consumer: src/components/kbk/DanceSprite.tsx (+ DanceCrowd/EdgeDancers).

30 einzigartige Charaktere aus 9 Basis-Rigs + Varianten-System (VARIANTS):
Palette-Retheme + Zeilen-/Substring-Mutationen (Hoerner, Antennen, Streifen)
+ optionale Spiegelung. Kein Charakter erscheint doppelt auf der Seite —
Zuordnung siehe Workflow kbk-dance-sprites.

Neue Charaktere: Variante in VARIANTS ergaenzen (oder neues Rig zeichnen),
Skript laufen lassen, DanceSpriteName-Union in DanceSprite.tsx nachziehen.

Usage (Repo-Root):
    python scripts/generate-dance-sprites.py [--contact <pfad.png>]
"""
import os
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dance_rigs_extra import EXTRA_MOVES, EXTRA_RIGS, df  # noqa: E402

OUT_DIR = os.path.join("public", "images", "dance")

GRID = 16
SCALE = 6
FRAME_PX = GRID * SCALE
NUM_FRAMES = 4

# Boomy-Card-Hintergrund (identisch zum Boomy-Generator)
BG_PURPLE_TOP = (149, 102, 255, 255)
BG_PURPLE_BOT = (94, 50, 196, 255)
BG_BORDER = (210, 180, 255, 255)

# ---------------------------------------------------------------------------
# Charaktere: je ein Paletten-Dict (Zeichen -> RGBA) + 4 Frame-Grids (16x16).
# '.' = transparent. Frame-abhaengige Farben loesen wir ueber eigene Codes
# (z.B. V=Visor normal, W=Visor hell, v=Visor dim) direkt in den Grids.
# ---------------------------------------------------------------------------

CHROME_PAL = {
    "O": (24, 28, 44, 255),      # Outline / dunkles Stahlblau
    "S": (110, 122, 150, 255),   # Stahl
    "H": (170, 182, 208, 255),   # Stahl hell (Highlights)
    "V": (90, 230, 230, 255),    # Visor cyan
    "W": (215, 255, 255, 255),   # Visor hell (Beat)
    "v": (55, 140, 150, 255),    # Visor gedimmt
    "P": (139, 92, 246, 255),    # Brust-Core Boomy-Lila
    "p": (90, 60, 170, 255),     # Core gedimmt
}

CHROME_FRAMES = [
    # F1 — Idle: Arme unten, Visor an
    [
        "................",
        ".......P........",
        ".......O........",
        "....OOOOOOOO....",
        "....OSSSSSSO....",
        "....OVVVVVVO....",
        "....OSSHSSSO....",
        "....OOOOOOOO....",
        ".OO..OSPPSO..OO.",
        ".OS..OSPPSO..SO.",
        ".OS..OSSSSO..SO.",
        ".OO..OOOOOO..OO.",
        "......OS.SO.....",
        "......OS.SO.....",
        "......OS.SO.....",
        ".....OOO.OOO....",
    ],
    # F2 — Beat-Up: Arme hoch, Sprung, Visor hell
    [
        ".OO..........OO.",
        ".OS....P.....SO.",
        ".OS....O.....SO.",
        ".OO.OOOOOOOO.OO.",
        "....OSSSSSSO....",
        "....OWWWWWWO....",
        "....OSSHSSSO....",
        "....OOOOOOOO....",
        ".....OSPPSO.....",
        ".....OSPPSO.....",
        ".....OSSSSO.....",
        ".....OOOOOO.....",
        "......OO.OO.....",
        ".....OO...OO....",
        "....OOO...OOO...",
        "................",
    ],
    # F3 — Idle-2: wie F1, Gewicht auf dem anderen Bein, Visor-Scan
    [
        "................",
        ".......P........",
        ".......O........",
        "....OOOOOOOO....",
        "....OSSSSSSO....",
        "....OVVWVVVO....",
        "....OSSHSSSO....",
        "....OOOOOOOO....",
        ".OO..OSPPSO..OO.",
        ".OS..OSPPSO..SO.",
        ".OS..OSSSSO..SO.",
        ".OO..OOOOOO..OO.",
        "......OS.SO.....",
        "......OS.SO.....",
        "......OS..SO....",
        ".....OOO..OOO...",
    ],
    # F4 — Beat-Down: Crouch, alles 1 tiefer, Visor + Core gedimmt
    [
        "................",
        "................",
        ".......P........",
        ".......O........",
        "....OOOOOOOO....",
        "....OSSSSSSO....",
        "....OvvvvvvO....",
        "....OOOOOOOO....",
        ".OO..OSppSO..OO.",
        ".OS..OSppSO..SO.",
        ".OO..OSSSSO..OO.",
        ".....OOOOOO.....",
        ".....OO..OO.....",
        "....OO....OO....",
        "...OOO....OOO...",
        "................",
    ],
]

SERVO_PAL = {
    "O": (36, 24, 14, 255),      # Outline warmes Dunkelbraun
    "B": (255, 176, 60, 255),    # Body amber
    "b": (200, 128, 36, 255),    # Amber-Schatten / Grill
    "E": (90, 230, 230, 255),    # Auge cyan
    "W": (220, 255, 255, 255),   # Auge hell
    "A": (139, 92, 246, 255),    # Antennen-Spitze lila
    "L": (70, 52, 34, 255),      # Beine dunkel
}

SERVO_FRAMES = [
    # F1 — Step links: Koerper lehnt links, linker Fuss raus
    [
        "................",
        ".....A..........",
        "......O.........",
        "....OOOOOOO.....",
        "...OBBBBBBBO....",
        "..OBBEEBBBBBO...",
        "..OBBEEBBBBBO...",
        ".ObBBBBBBBBBbO..",
        "...OBBbbbBBO....",
        "....OBBBBBO.....",
        ".....OOOOO......",
        "....LL..LL......",
        "....LL..LL......",
        "...LLL..LL......",
        "..LLL...LL......",
        "................",
    ],
    # F2 — Bounce hoch: zentriert, Auge hell, Antenne gestreckt
    [
        ".......A........",
        ".......O........",
        "....OOOOOOO.....",
        "...OBBBBBBBO....",
        "..OBBWWBBBBBO...",
        "..OBBWWBBBBBO...",
        ".ObBBBBBBBBBbO..",
        "...OBBbbbBBO....",
        "....OBBBBBO.....",
        ".....OOOOO......",
        "....LL...LL.....",
        "...LL.....LL....",
        "................",
        "................",
        "................",
        "................",
    ],
    # F3 — Step rechts: gespiegelt zu F1
    [
        "................",
        "..........A.....",
        ".........O......",
        ".....OOOOOOO....",
        "....OBBBBBBBO...",
        "...OBBBBBEEBBO..",
        "...OBBBBBEEBBO..",
        "..ObBBBBBBBBBbO.",
        "....OBBbbbBBO...",
        ".....OBBBBBO....",
        "......OOOOO.....",
        "......LL..LL....",
        "......LL..LL....",
        "......LL..LLL...",
        "......LL...LLL..",
        "................",
    ],
    # F4 — Squash unten: Koerper gestaucht + breit, Auge blinzelt
    [
        "................",
        "................",
        "................",
        ".......A........",
        ".......O........",
        "...OOOOOOOOO....",
        "..OBBBBBBBBBO...",
        ".OBBOOBBBBBBBO..",
        ".OBBBBBbbbBBBO..",
        ".ObBBBBBBBBBbO..",
        "....OOOOOOO.....",
        "....LL...LL.....",
        "...LLL...LLL....",
        "................",
        "................",
        "................",
    ],
]

NOVA_PAL = {
    "O": (34, 18, 44, 255),      # Outline dunkel-lila
    "H": (255, 80, 180, 255),    # Haar magenta (Bob)
    "h": (190, 40, 130, 255),    # Haar-Schatten
    "K": (222, 202, 255, 255),   # Haut lavendel (Android)
    "k": (182, 158, 226, 255),   # Haut-Schatten
    "G": (90, 230, 230, 255),    # Shades cyan
    "W": (220, 255, 255, 255),   # Shades hell
    "T": (90, 50, 180, 255),     # Top dunkel-lila
    "S": (139, 92, 246, 255),    # Rock Boomy-Lila
    "B": (40, 26, 60, 255),      # Boots
}

NOVA_FRAMES = [
    # F1 — linker Arm hoch, rechter unten
    [
        "................",
        "....OOOOOO......",
        "...OHHHHHHO.....",
        "...OHHHHHHO.....",
        ".OK.OKGGGGKO....",
        ".OK.OKKKKKKO....",
        ".K..OhKKKKhO....",
        "..K..OKKKKO.....",
        "...OOOTTTTOO....",
        ".....OTTTTO.OO..",
        ".....OTTTTO.OK..",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        ".....KK..KK.....",
        ".....BB..BB.....",
        "....BBB..BBB....",
    ],
    # F2 — beide Arme hoch, Sprung, Shades hell
    [
        ".OK........KO...",
        ".OK.OOOOOO.KO...",
        ".O.OHHHHHHO.O...",
        "..OOHHHHHHOO....",
        "...OKWWWWKO.....",
        "...OKKKKKKO.....",
        "...OhKKKKhO.....",
        "....OKKKKO......",
        ".....OTTTTO.....",
        ".....OTTTTO.....",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        "....KK....KK....",
        "....BB....BB....",
        "...BBB....BBB...",
        "................",
    ],
    # F3 — rechter Arm hoch (Spiegel von F1)
    [
        "................",
        "......OOOOOO....",
        ".....OHHHHHHO...",
        ".....OHHHHHHO...",
        "....OKGGGGKO.KO.",
        "....OKKKKKKO.KO.",
        "....OhKKKKhO..K.",
        ".....OKKKKO..K..",
        "....OOTTTTOOO...",
        "..OO.OTTTTO.....",
        "..KO.OTTTTO.....",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        ".....KK..KK.....",
        ".....BB..BB.....",
        "....BBB..BBB....",
    ],
    # F4 — Crouch: Kopf tiefer, Arme angewinkelt, Knie gebeugt
    [
        "................",
        "................",
        "....OOOOOO......",
        "...OHHHHHHO.....",
        "...OHHHHHHO.....",
        "...OKGGGGKO.....",
        "...OKKKKKKO.....",
        "....OhKKhO......",
        "..OO.OTTTTO.OO..",
        "..KO.OTTTTO.OK..",
        "....OSSSSSSO....",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        "....KK....KK....",
        "....BB....BB....",
        "...BBB....BBB...",
    ],
]

PIXEL_PAL = {
    "O": (20, 34, 34, 255),      # Outline dunkel-teal
    "H": (60, 220, 190, 255),    # Haar teal (Ponytail)
    "h": (30, 150, 130, 255),    # Haar-Schatten
    "K": (222, 202, 255, 255),   # Haut lavendel (Android)
    "k": (182, 158, 226, 255),   # Haut-Schatten
    "E": (255, 80, 180, 255),    # Augen magenta (Glow)
    "T": (32, 40, 60, 255),      # Top dunkel
    "S": (255, 176, 60, 255),    # Shorts amber
    "B": (40, 26, 60, 255),      # Boots
}

PIXEL_FRAMES = [
    # F1 — Huefte links, Ponytail schwingt rechts, linker Arm zeigt hoch
    [
        "..OK............",
        "..OK.OOOOO......",
        "..O.OHHHHHO.....",
        "...OHHHHHHHOO...",
        "...OKEKKEKO.HO..",
        "...OKKKKKKO.HHO.",
        "....OkKKkO...HO.",
        "....OTTTTO......",
        "...OOTTTTOO.....",
        "...KO.OTTO.OK...",
        "....OSSSSSO.....",
        "....OSSSSSO.....",
        "....KK..KK......",
        "....KK...KK.....",
        "....BB...BB.....",
        "...BBB...BBB....",
    ],
    # F2 — Mitte hoch: Ponytail oben, beide Arme seitlich hoch
    [
        ".......OO.......",
        ".OK...OHHO..KO..",
        ".OK..OHHHHO.KO..",
        ".O..OHHHHHHO.O..",
        "..O.OKEKKEKO.O..",
        "....OKKKKKKO....",
        ".....OkKKkO.....",
        ".....OTTTTO.....",
        "....OOTTTTOO....",
        "....O.OTTO.O....",
        "....OSSSSSO.....",
        ".....KK..KK.....",
        "....KK....KK....",
        "....BB....BB....",
        "...BBB....BBB...",
        "................",
    ],
    # F3 — Huefte rechts, Ponytail schwingt links (Spiegel von F1)
    [
        "............KO..",
        "......OOOOO.KO..",
        ".....OHHHHHO.O..",
        "...OOHHHHHHHO...",
        "..OH.OKEKKEKO...",
        ".OHH.OKKKKKKO...",
        ".OH...OkKKkO....",
        "......OTTTTO....",
        ".....OOTTTTOO...",
        "...KO.OTTO.OK...",
        ".....OSSSSSO....",
        ".....OSSSSSO....",
        "......KK..KK....",
        ".....KK...KK....",
        ".....BB...BB....",
        "....BBB...BBB...",
    ],
    # F4 — Beat-Down: Knie gebeugt, Ponytail faellt, Arme unten
    [
        "................",
        "................",
        ".....OOOOO......",
        "....OHHHHHO.....",
        "...OHHHHHHHO....",
        "...OKEKKEKO.HO..",
        "...OKKKKKKO.HO..",
        "....OkKKkO..HO..",
        "....OTTTTO......",
        "...OOTTTTOO.....",
        "...KO.OTTO.OK...",
        "....OSSSSSO.....",
        "....KK...KK.....",
        "...KK.....KK....",
        "...BB.....BB....",
        "..BBB.....BBB...",
    ],
]

VOLT_PAL = {
    "O": (16, 30, 20, 255),      # Outline dunkelgruen
    "G": (130, 235, 110, 255),   # Body lime
    "g": (70, 150, 70, 255),     # Lime-Schatten / Grill
    "E": (255, 176, 60, 255),    # Auge amber
    "W": (255, 235, 180, 255),   # Auge hell
}

VOLT_FRAMES = [
    # F1 — Wave: linker Arm oben, rechter unten (diagonale Welle)
    [
        "................",
        "................",
        ".OO...OOOOOO....",
        ".OG...OGGGGO....",
        "..OG..OGEEGO....",
        "...OG.OGGGGO....",
        "....OOOOOOOO....",
        ".....OGGGGGGO...",
        ".....OGggggGO...",
        ".....OGGGGGGO.OG",
        ".....OOOOOO...OG",
        "......OG.GO.....",
        "......OG.GO.....",
        "......OG.GO.....",
        "......OG.GO.....",
        ".....OOO.OOO....",
    ],
    # F2 — Wave-Mitte: beide Arme horizontal, Auge hell
    [
        "................",
        "................",
        "......OOOOOO....",
        "......OGGGGO....",
        "......OGWWGO....",
        "......OGGGGO....",
        "....OOOOOOOO....",
        ".OG.OGGGGGGO.GO.",
        ".OG.OGggggGO.GO.",
        "....OGGGGGGO....",
        ".....OOOOOO.....",
        "......OG.GO.....",
        "......OG.GO.....",
        "......OG.GO.....",
        "......OG.GO.....",
        ".....OOO.OOO....",
    ],
    # F3 — Wave gespiegelt: rechter Arm oben, linker unten
    [
        "................",
        "................",
        "....OOOOOO...OO.",
        "....OGGGGO...GO.",
        "....OGEEGO..GO..",
        "....OGGGGO.GO...",
        "....OOOOOOOO....",
        "...OGGGGGGO.....",
        "...OGggggGO.....",
        "GO.OGGGGGGO.....",
        "GO...OOOOOO.....",
        ".....OG.GO......",
        ".....OG.GO......",
        ".....OG.GO......",
        ".....OG.GO......",
        "....OOO.OOO.....",
    ],
    # F4 — Crouch: Arme unten, Knie gebeugt, Auge gedimmt (g)
    [
        "................",
        "................",
        "................",
        "................",
        "......OOOOOO....",
        "......OGGGGO....",
        "......OggggO....",
        "......OGGGGO....",
        "....OOOOOOOO....",
        "..OG.OGGGGGGO...",
        "..OG.OGggggGO.OG",
        ".....OGGGGGGO.OG",
        ".....OOOOOO.....",
        "......OG..GO....",
        ".....OG....GO...",
        "....OOO....OOO..",
    ],
]

BASS_PAL = {
    "O": (18, 20, 40, 255),      # Outline navy
    "B": (80, 100, 190, 255),    # Body blau
    "b": (50, 64, 130, 255),     # Blau-Schatten
    "C": (90, 230, 230, 255),    # Membran-Ring cyan
    "c": (50, 120, 130, 255),    # Ring gedimmt
    "M": (255, 80, 180, 255),    # Membran-Kern magenta
    "W": (230, 250, 255, 255),   # Auge hell
    "E": (90, 230, 230, 255),    # Auge cyan
    "L": (32, 36, 66, 255),      # Beine dunkel
}

BASS_FRAMES = [
    # F1 — Idle: Membran normal
    [
        "................",
        "................",
        "................",
        "......OOOO......",
        ".....OBEEBO.....",
        "..OOOOBBBBOOOO..",
        ".OBBBBBBBBBBBBO.",
        ".OBBOCCCCCCOBBO.",
        ".OBBOCMMMMCOBBO.",
        ".OBBOCMMMMCOBBO.",
        ".OBBOCCCCCCOBBO.",
        ".OBBBBBBBBBBBBO.",
        "..OOOOOOOOOOOO..",
        "...LL......LL...",
        "...LL......LL...",
        "..LLL......LLL..",
    ],
    # F2 — Bounce hoch: Membran hell, Beine in der Luft
    [
        "................",
        "................",
        "......OOOO......",
        ".....OBWWBO.....",
        "..OOOOBBBBOOOO..",
        ".OBBBBBBBBBBBBO.",
        ".OBBOCCCCCCOBBO.",
        ".OBBOCWWWWCOBBO.",
        ".OBBOCWWWWCOBBO.",
        ".OBBOCCCCCCOBBO.",
        ".OBBBBBBBBBBBBO.",
        "..OOOOOOOOOOOO..",
        "...LL......LL...",
        "..LL........LL..",
        "................",
        "................",
    ],
    # F3 — Idle-2: Membran-Ringe getauscht (Puls nach aussen)
    [
        "................",
        "................",
        "................",
        "......OOOO......",
        ".....OBEEBO.....",
        "..OOOOBBBBOOOO..",
        ".OBBBBBBBBBBBBO.",
        ".OBBOMMMMMMOBBO.",
        ".OBBOMCCCCMOBBO.",
        ".OBBOMCCCCMOBBO.",
        ".OBBOMMMMMMOBBO.",
        ".OBBBBBBBBBBBBO.",
        "..OOOOOOOOOOOO..",
        "...LL......LL...",
        "...LL......LL...",
        "..LLL......LLL..",
    ],
    # F4 — Squash: gestaucht + breit, Membran gedimmt
    [
        "................",
        "................",
        "................",
        "................",
        "................",
        "......OOOO......",
        ".....ObEEbO.....",
        ".OOOOBBBBBBOOOO.",
        "OBBBBBBBBBBBBBBO",
        "OBBOccccccccOBBO",
        "OBBOccMMMMccOBBO",
        "OBBBBBBBBBBBBBBO",
        ".OOOOOOOOOOOOOO.",
        "..LL........LL..",
        ".LLL........LLL.",
        "................",
    ],
]

GLITCH_PAL = {
    "O": (40, 16, 20, 255),      # Outline dunkelrot
    "R": (255, 90, 80, 255),     # Haar rot (Pigtails)
    "r": (180, 50, 50, 255),     # Haar-Schatten
    "K": (222, 202, 255, 255),   # Haut lavendel (Android)
    "k": (182, 158, 226, 255),   # Haut-Schatten
    "E": (90, 230, 230, 255),    # Augen cyan (Glow)
    "T": (45, 24, 34, 255),      # Top dunkel
    "S": (200, 60, 60, 255),     # Rock rot
    "B": (40, 26, 60, 255),      # Boots
    "X": (90, 230, 230, 255),    # Glitch-Pixel cyan
    "Y": (255, 80, 180, 255),    # Glitch-Pixel magenta
}

GLITCH_FRAMES = [
    # F1 — Pigtails unten, Sway links
    [
        "................",
        "....OOOOOO......",
        "...ORRRRRRO.....",
        ".OR.ORRRRRRO.RO.",
        ".OR.OKEKKEKO.RO.",
        ".OO.OKKKKKKO.OO.",
        ".....OkKKkO.....",
        ".....OTTTTO.....",
        "....OOTTTTOO....",
        "...KO.OTTO.OK...",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        ".....KK..KK.....",
        ".....BB..BB.....",
        "....BBB..BBB....",
        "................",
    ],
    # F2 — Sprung: Pigtails fliegen hoch, Arme hoch
    [
        ".OR........RO...",
        ".OR.OOOOOO.RO...",
        ".OO.ORRRRRRO.OO.",
        ".KO.ORRRRRRO.OK.",
        "..O.OKEKKEKO.O..",
        "....OKKKKKKO....",
        ".....OkKKkO.....",
        ".....OTTTTO.....",
        "....OOTTTTOO....",
        "....O.OTTO.O....",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        "....KK....KK....",
        "....BB....BB....",
        "...BBB....BBB...",
        "................",
    ],
    # F3 — GLITCH: Kopf 1px versetzt, Scan-Artefakte, Augen weit
    [
        "................",
        ".....OOOOOO.....",
        "..X.ORRRRRRO....",
        "..OR.ORRRRRRO.RO",
        "..OR.OEEKEEKO.RO",
        "..OO.OKKKKKKO.Y.",
        "..X...OkKKkO....",
        ".....OTTTTO.....",
        "....OOTTTTOO....",
        "...KO.OTTO.OK...",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        ".....KK..KK.....",
        ".....BB..BB.....",
        "....BBB..BBB....",
        "................",
    ],
    # F4 — Crouch: Pigtails schwingen nach vorn, Knie gebeugt
    [
        "................",
        "................",
        "....OOOOOO......",
        "...ORRRRRRO.....",
        "..RO.KEKKEK.OR..",
        "..RO.KKKKKK.OR..",
        "..OO..kKKk..OO..",
        ".....OTTTTO.....",
        "...OOOTTTTOOO...",
        "...KO.OTTO.OK...",
        "....OSSSSSSO....",
        "....OSSSSSSO....",
        ".....KK..KK.....",
        "....KK....KK....",
        "....BB....BB....",
        "...BBB....BBB...",
    ],
]

TREAD_PAL = {
    "O": (24, 28, 16, 255),      # Outline oliv-dunkel
    "M": (140, 150, 90, 255),    # Metall oliv
    "m": (90, 100, 56, 255),     # Metall-Schatten
    "V": (255, 176, 60, 255),    # Visor amber
    "W": (255, 240, 190, 255),   # Visor hell
    "v": (150, 110, 45, 255),    # Visor gedimmt
    "P": (139, 92, 246, 255),    # Core lila
    "T": (50, 54, 36, 255),      # Kette dunkel
    "t": (170, 178, 130, 255),   # Kette hell (rollt per Frame-Versatz)
}

TREAD_FRAMES = [
    # F1 — Idle: Kette Muster A
    [
        "................",
        "................",
        "....OOOOOOOO....",
        "...OMMMMMMMMO...",
        "...OMVVVVVVMO...",
        "...OMMMMMMMMO...",
        "..OOOOOOOOOOOO..",
        "..OMMmPPPPmMMO..",
        "..OMMmPPPPmMMO..",
        "..OMMMMMMMMMMO..",
        "..OOOOOOOOOOOO..",
        ".OTtTtTtTtTtTtO.",
        ".OtTtTtTtTtTtTO.",
        ".OTtTtTtTtTtTtO.",
        "..OOOOOOOOOOOO..",
        "................",
    ],
    # F2 — Bounce hoch: Turm 1 hoch, Visor hell, Kette Muster B
    [
        "................",
        "....OOOOOOOO....",
        "...OMMMMMMMMO...",
        "...OMWWWWWWMO...",
        "...OMMMMMMMMO...",
        "..OOOOOOOOOOOO..",
        "..OMMmPPPPmMMO..",
        "..OMMmPPPPmMMO..",
        "..OMMMMMMMMMMO..",
        "..OOOOOOOOOOOO..",
        "................",
        ".OtTtTtTtTtTtTO.",
        ".OTtTtTtTtTtTtO.",
        ".OtTtTtTtTtTtTO.",
        "..OOOOOOOOOOOO..",
        "................",
    ],
    # F3 — Idle-2: Visor-Scan, Kette Muster B
    [
        "................",
        "................",
        "....OOOOOOOO....",
        "...OMMMMMMMMO...",
        "...OMVVWVVVMO...",
        "...OMMMMMMMMO...",
        "..OOOOOOOOOOOO..",
        "..OMMmPPPPmMMO..",
        "..OMMmPPPPmMMO..",
        "..OMMMMMMMMMMO..",
        "..OOOOOOOOOOOO..",
        ".OtTtTtTtTtTtTO.",
        ".OTtTtTtTtTtTtO.",
        ".OtTtTtTtTtTtTO.",
        "..OOOOOOOOOOOO..",
        "................",
    ],
    # F4 — Squash: Turm gestaucht, Visor gedimmt, Kette Muster A
    [
        "................",
        "................",
        "................",
        "....OOOOOOOO....",
        "...OMvvvvvvMO...",
        "..OOOOOOOOOOOO..",
        "..OMMmPPPPmMMO..",
        "..OMMMMMMMMMMO..",
        "..OOOOOOOOOOOO..",
        "................",
        "................",
        ".OTtTtTtTtTtTtO.",
        ".OtTtTtTtTtTtTO.",
        ".OTtTtTtTtTtTtO.",
        "..OOOOOOOOOOOO..",
        "................",
    ],
]

HOVER_PAL = {
    "O": (18, 26, 40, 255),      # Outline nachtblau
    "D": (120, 190, 255, 255),   # Body himmelblau
    "d": (70, 120, 190, 255),    # Body-Schatten
    "R": (210, 220, 235, 255),   # Rotor
    "E": (255, 80, 180, 255),    # Auge magenta
    "W": (255, 220, 250, 255),   # Auge hell
    "G": (90, 230, 230, 255),    # Thruster-Glow cyan
    "g": (50, 130, 140, 255),    # Glow gedimmt
}

HOVER_FRAMES = [
    # F1 — Schwebt: Rotor breit, Blick links
    [
        "................",
        "....RRRRRRRR....",
        ".......OO.......",
        "....OOOOOOOO....",
        "...ODDEEDDDDdO..",
        "...ODDDDDDDDdO..",
        "....OOOOOOOO....",
        "......GG.G......",
        ".......g........",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    # F2 — Steigt: Rotor-Blur schmal, 1 hoch, Thruster lang
    [
        "....RR.RR.RR....",
        ".......OO.......",
        "....OOOOOOOO....",
        "...ODDWWDDDDdO..",
        "...ODDDDDDDDdO..",
        "....OOOOOOOO....",
        "......G.GG......",
        ".......GG.......",
        "........g.......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    # F3 — Driftet: Blick rechts, Rotor breit
    [
        "................",
        "....RRRRRRRR....",
        ".......OO.......",
        "....OOOOOOOO....",
        "...OdDDDDEEDDO..",
        "...OdDDDDDDDDO..",
        "....OOOOOOOO....",
        "......G.GG......",
        ".......g........",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    # F4 — Sackt ab: 1 tiefer, Rotor breit, Glow klein
    [
        "................",
        "................",
        "....RRRRRRRR....",
        ".......OO.......",
        "....OOOOOOOO....",
        "...ODDEEDDDDdO..",
        "...ODDDDDDDDdO..",
        "....OOOOOOOO....",
        ".......gg.......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
]

RIGS = {
    "chrome": (CHROME_PAL, CHROME_FRAMES),
    "servo": (SERVO_PAL, SERVO_FRAMES),
    "nova": (NOVA_PAL, NOVA_FRAMES),
    "pixel": (PIXEL_PAL, PIXEL_FRAMES),
    "volt": (VOLT_PAL, VOLT_FRAMES),
    "bass": (BASS_PAL, BASS_FRAMES),
    "glitch": (GLITCH_PAL, GLITCH_FRAMES),
    "tread": (TREAD_PAL, TREAD_FRAMES),
    "hover": (HOVER_PAL, HOVER_FRAMES),
}
RIGS.update(EXTRA_RIGS)  # 21 Multiversum-Silhouetten (dance_rigs_extra.py)


# ---------------------------------------------------------------------------
# Varianten-Engine: Palette-Retheme + Zeilen-/Substring-Mutationen + Spiegelung.
# row_swaps treffen exakt gleiche Zeilen in ALLEN Frames (frame-unabhaengig,
# weil per String-Match statt Zeilen-Index); sub_swaps ersetzen Substrings.
# ---------------------------------------------------------------------------

def mirror_frames(frames):
    return [[row[::-1] for row in grid] for grid in frames]


def apply_swaps(frames, row_swaps=(), sub_swaps=()):
    hits = {old: 0 for old, _ in row_swaps}
    out = []
    for grid in frames:
        g = []
        for row in grid:
            for old, new in row_swaps:
                if row == old:
                    row = new
                    hits[old] += 1
            for old, new in sub_swaps:
                row = row.replace(old, new)
            assert len(row) == GRID, f"Swap-Ergebnis {row!r} hat {len(row)} Zeichen"
            g.append(row)
        out.append(g)
    for old, n in hits.items():
        assert n > 0, f"row_swap ohne Treffer: {old!r}"
    return out


def variant(base, palette_overrides=None, row_swaps=(), sub_swaps=(), mirrored=False):
    pal, frames = RIGS[base]
    pal = dict(pal)
    if palette_overrides:
        for k, v in palette_overrides.items():
            pal[k] = v + (255,) if len(v) == 3 else v
    if row_swaps or sub_swaps:
        frames = apply_swaps(frames, row_swaps, sub_swaps)
    if mirrored:
        frames = mirror_frames(frames)
    return pal, frames


E16 = "................"

# ---------------------------------------------------------------------------
# 30 einzigartige SILHOUETTEN — Recolor-Varianten sind raus (Flow 12.07.2026:
# "Formen komplett neu designen, richtig krasse Vielfalt — Multiversum!").
# variant()/apply_swaps bleiben fuer kuenftige Sonder-Editionen erhalten.
# ---------------------------------------------------------------------------
ROSTER = [
    ("robo-chrome", "CHROME — Headbang-Bot", "chrome", "Boxy Stahl-Bot, Visor pulst, Lila-Core."),
    ("robo-servo", "SERVO — Two-Step-Bot", "servo", "Runder Amber-Bot, Squash-and-Stretch."),
    ("robo-volt", "VOLT — Wave-Bot", "volt", "Schlanker Lime-Bot, Arm-Welle."),
    ("robo-bass", "BASS — Woofer-Bot", "bass", "Subwoofer-Bauch, Membran pulst."),
    ("robo-tread", "TREAD — Ketten-Bot", "tread", "Panzerkette rollt zum Beat."),
    ("robo-hover", "HOVER — Drohne", "hover", "Rotor-Drohne mit Thruster-Glow."),
    ("ai-girl-nova", "NOVA — Rave-Android", "nova", "Magenta-Bob, Cyan-Shades."),
    ("ai-girl-pixel", "PIXEL — Sway-Android", "pixel", "Teal-Ponytail gegen den Sway."),
    ("ai-girl-glitch", "GLITCH — Pigtail-Android", "glitch", "Pigtails + Glitch-Frame."),
    ("wisp", "WISP — Entropie-Schleier", "wisp", "Schwebendes Tuch-Wesen, hohle Augen (Kanon-Echo)."),
    ("slime", "SLIME — Glibber-Blob", "slime", "Squash-and-Stretch-Pfuetze mit Augen."),
    ("shroom", "SHROOM — Pilz-Kerl", "shroom", "Grosse Kappe wippt, Stummel-Beine."),
    ("tvhead", "TVHEAD — Static-Typ", "tvhead", "Fernseher-Kopf, Static flackert pro Frame."),
    ("boombox", "BOOMBOX — Speaker-Kopf", "boombox", "Boombox-Gesicht, Arme pumpen."),
    ("octo", "OCTO — Kabel-Krake", "octo", "Dome + Tentakel — Mother-of-the-Wire-Vibe."),
    ("crab", "CRAB — Scheren-Mech", "crab", "Breiter Side-Stepper, Scheren schnappen."),
    ("moth", "MOTH — Staub-Motte", "moth", "Fluegel schlagen zum Beat, Amber-Augen."),
    ("jelly", "JELLY — Neon-Qualle", "jelly", "Glocke pulst, Fransen wehen."),
    ("imp", "IMP — Hoernchen-Imp", "imp", "Kleiner Hopser mit Schwanz."),
    ("knight", "KNIGHT — Oedland-Ritter", "knight", "Helmbusch + Stampf-Tanz (Engine-Eulogy-Wasteland)."),
    ("monk", "MONK — Upload-Moench", "monk", "Kutte, schwebt beim Meditieren (Kanon: der Upload)."),
    ("antling", "ANTLING — Ameisling", "antling", "Die Ameisen des Kanons — marschiert froehlich."),
    ("cat", "CAT — Robo-Katze", "cat", "Ohren + Schwanz-Swish, Vierbeiner-Bounce."),
    ("pup", "PUP — Robo-Welpe", "pup", "Schlappohren, Schwanz wedelt."),
    ("wormy", "WORMY — Raupen-Wesen", "wormy", "Inchworm-Wiggle, Segment-Koerper."),
    ("cactus", "CACTUS — Kaktus-Raver", "cactus", "Topf-Hose, Stachel-Arme, Bluete."),
    ("yeti", "YETI — Flausch-Brocken", "yeti", "Breite Schultern, Mini-Kopf, Sway."),
    ("spider", "SPIDER — Spinnen-Bot", "spider", "Kern + sechs rippelnde Beine."),
    ("orb", "ORB — Orbit-Kern", "orb", "Schwebende Kugel, Satellit kreist."),
    ("shard", "SHARD — Kristall-Wesen", "shard", "Schwebender Splitter, Facetten blitzen."),
]

CHARACTERS = [(slug, title, *RIGS[rig], desc) for slug, title, rig, desc in ROSTER]


# ---------------------------------------------------------------------------
# Zweit-Animationen (MOVES) — gleiche Figur, andere Bewegung auf anderen Views
# (Flow 12.07.: "Grundmodell wiederholt, aber mit anderer Animation").
# Sheet-Name: <slug>--<move>.png. Konsument: DanceSprite `move`-Prop.
# ---------------------------------------------------------------------------

_NSIT1 = [
    E16,
    "....OOOOOO......",
    "...OHHHHHHO.....",
    "...OHHHHHHO.....",
    "...OKGGGGKO.....",
    "...OKKKKKKO.....",
    "....OhKKhO......",
    "....OTTTTO......",
    "...OOTTTTOO.....",
    "..OK.OTTO.KO....",
    "...OSSSSSSO.....",
    "....KK..KK......",
    "....KK..KK......",
    "....BB..BB......",
    E16, E16,
]
NOVA_SIT_FRAMES = [
    _NSIT1,
    df(_NSIT1, r11="....KK...KK.....", r12="...KK....KK.....", r13="...BB....BB....."),
    df(_NSIT1, r4="...OKWWWWKO....."),
    df(_NSIT1, r11=".....KK.KK......", r12=".....KK.KK......", r13=".....BB.BB......"),
]

_GSIT1 = [
    E16,
    "....OOOOOO......",
    "...ORRRRRRO.....",
    ".OR.ORRRRRRO.RO.",
    ".OR.OKEKKEKO.RO.",
    ".OO.OKKKKKKO.OO.",
    ".....OkKKkO.....",
    ".....OTTTTO.....",
    "....OOTTTTOO....",
    "...KO.OTTO.OK...",
    "....OSSSSSSO....",
    ".....KK..KK.....",
    ".....KK..KK.....",
    ".....BB..BB.....",
    E16, E16,
]
GLITCH_SIT_FRAMES = [
    _GSIT1,
    df(_GSIT1, r11=".....KK...KK....", r12="....KK....KK....", r13="....BB....BB...."),
    df(_GSIT1, r4=".OR.OEEKKEEO.RO.", r5=".OO.OKKKKKKO.Y.."),
    df(_GSIT1, r11="......KK.KK.....", r12="......KK.KK.....", r13="......BB.BB....."),
]

_VCLIMB1 = [
    "...OO...........",
    "...OG...........",
    "......OOOOOO....",
    "...OG.OggggO....",
    "....G.OggggO....",
    "......OOOOOO....",
    ".....OGGGGGGO...",
    ".....OGggggGO...",
    ".....OGGGGGGO.OG",
    ".....OOOOOO..OG.",
    "......OG.GO.....",
    "......OG..GO....",
    "......OG...GO...",
    ".....OOO...OO...",
    E16, E16,
]
_VCLIMB3 = df(
    _VCLIMB1,
    r10="......OG.GO.....",
    r11="....OG..GO......",
    r12="...OG...GO......",
    r13="...OO...OOO.....",
)
VOLT_CLIMB_FRAMES = [
    _VCLIMB1,
    [r[::-1] for r in _VCLIMB1],
    _VCLIMB3,
    [r[::-1] for r in _VCLIMB3],
]

MOVES = {
    "ai-girl-nova": {"sit": (NOVA_PAL, NOVA_SIT_FRAMES)},
    "ai-girl-glitch": {"sit": (GLITCH_PAL, GLITCH_SIT_FRAMES)},
    "robo-volt": {"climb": (VOLT_PAL, VOLT_CLIMB_FRAMES)},
}
MOVES.update(EXTRA_MOVES)


def validate(frames: list, name: str) -> None:
    for fi, grid in enumerate(frames):
        assert len(grid) == GRID, f"{name} F{fi+1}: {len(grid)} Zeilen statt {GRID}"
        for ri, row in enumerate(grid):
            assert len(row) == GRID, (
                f"{name} F{fi+1} Zeile {ri}: {len(row)} Zeichen statt {GRID}: {row!r}"
            )


def make_card_background(width: int, height: int) -> Image.Image:
    """Boomy-Card-Look: Lila-Verlauf + Schliff-Linien + Border."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    px = img.load()
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(BG_PURPLE_TOP[0] * (1 - t) + BG_PURPLE_BOT[0] * t)
        g = int(BG_PURPLE_TOP[1] * (1 - t) + BG_PURPLE_BOT[1] * t)
        b = int(BG_PURPLE_TOP[2] * (1 - t) + BG_PURPLE_BOT[2] * t)
        for x in range(width):
            px[x, y] = (r, g, b, 255)
    draw = ImageDraw.Draw(img, "RGBA")
    for offset in range(-8, 9, 4):
        draw.line(
            [(width * 0.15 + offset, 0), (width * 0.85 + offset, height)],
            fill=(255, 255, 255, 18), width=1,
        )
    draw.rectangle([0, 0, width - 1, height - 1], outline=BG_BORDER, width=2)
    return img


def render_frame(grid: list, pal: dict, card: bool) -> Image.Image:
    img = (make_card_background(FRAME_PX, FRAME_PX) if card
           else Image.new("RGBA", (FRAME_PX, FRAME_PX), (0, 0, 0, 0)))
    draw = ImageDraw.Draw(img, "RGBA")
    for gy, row in enumerate(grid):
        for gx, ch in enumerate(row):
            if ch == ".":
                continue
            color = pal.get(ch)
            if color is None:
                raise ValueError(f"Unbekannter Code {ch!r} in Zeile {gy}")
            x0, y0 = gx * SCALE, gy * SCALE
            draw.rectangle([x0, y0, x0 + SCALE - 1, y0 + SCALE - 1], fill=color)
    return img


def build_sheet(frames: list, pal: dict, card: bool) -> Image.Image:
    sheet = Image.new("RGBA", (FRAME_PX * NUM_FRAMES, FRAME_PX), (0, 0, 0, 0))
    for idx, grid in enumerate(frames):
        frame = render_frame(grid, pal, card)
        sheet.paste(frame, (idx * FRAME_PX, 0), frame)
    return sheet


def build_contact_sheet(path: str) -> None:
    """QA-Uebersicht: 2 Charaktere pro Zeile, alle 4 Frames, auf dunklem Grund."""
    pad = 10
    col_w = FRAME_PX * NUM_FRAMES + pad
    rows = (len(CHARACTERS) + 1) // 2
    img = Image.new(
        "RGBA", (col_w * 2 + pad, (FRAME_PX + pad) * rows + pad), (16, 12, 24, 255)
    )
    for i, (_slug, _t, pal, frames, _d) in enumerate(CHARACTERS):
        sheet = build_sheet(frames, pal, card=False)
        x = pad + (i % 2) * col_w
        y = pad + (i // 2) * (FRAME_PX + pad)
        img.paste(sheet, (x, y), sheet)
    img.save(path, "PNG", optimize=True)
    print(f"OK contact-sheet: {path} ({len(CHARACTERS)} Charaktere)")


def main() -> None:
    import sys

    if not os.path.isdir("public"):
        raise SystemExit("Bitte aus dem Repo-Root ausfuehren (public/ nicht gefunden).")
    os.makedirs(OUT_DIR, exist_ok=True)
    for slug, _title, pal, frames, _desc in CHARACTERS:
        validate(frames, slug)
        sheet = build_sheet(frames, pal, card=False)
        path = os.path.join(OUT_DIR, f"{slug}.png")
        sheet.save(path, "PNG", optimize=True)
        print(f"OK {path}")
    print(f"{len(CHARACTERS)} Charaktere gesamt")

    for slug, moves in MOVES.items():
        for move, (pal, frames) in moves.items():
            validate(frames, f"{slug}--{move}")
            sheet = build_sheet(frames, pal, card=False)
            path = os.path.join(OUT_DIR, f"{slug}--{move}.png")
            sheet.save(path, "PNG", optimize=True)
            print(f"OK {path} (move)")

    if "--contact" in sys.argv:
        build_contact_sheet(sys.argv[sys.argv.index("--contact") + 1])


if __name__ == "__main__":
    main()
