# -*- coding: utf-8 -*-
"""
Multiversum-Rigs — 21 komplett eigenstaendige Silhouetten (KEINE Recolors).

Inspiration: KBK-Multiversum-Kanon (Kabel-Krake, Upload-Moench, Oedland-
Ritter, Ameisling, Entropie-Schleier) + klassische Arcade-/JRPG-Mob-
Archetypen (Slime, Pilz, TV-Kopf, Boombox, Qualle, Krabbe, Motte, Imp,
Katze, Welpe, Raupe, Kaktus, Yeti, Spinne, Orb, Kristall).

df(base, rN=...) leitet Frames ab: nur die geaenderten Zeilen angeben.
Alle Grids 16x16; Konsument: scripts/generate-dance-sprites.py.
"""


def df(base, **rows):
    """Frame-Ableitung: Kopie von base, einzelne Zeilen ersetzt (r0..r15)."""
    g = list(base)
    for k, v in rows.items():
        g[int(k[1:])] = v
    return g


E = "................"

# --- 1. WISP — Entropie-Schleier (schwebendes Tuch, hohle Augen) ---
WISP_PAL = {
    "O": (26, 30, 44, 255), "W": (196, 210, 235, 255), "w": (140, 155, 190, 255),
    "E": (40, 46, 70, 255), "G": (90, 230, 230, 255),
}
_WISP1 = [
    E, E,
    "....OOOOOO......",
    "...OWWWWWWO.....",
    "..OWWEWWEWWO....",
    "..OWWWWWWWWO....",
    "..OWWWEEWWWO....",
    "..OWWWWWWWWO....",
    "..OWwWWwWWwO....",
    "..OWwWWwWWwO....",
    "..OW.WW.WW.O....",
    "...W..W..W......",
    E, E, E, E,
]
WISP_FRAMES = [
    _WISP1,
    df(_WISP1, r1="....OOOOOO......", r2="...OWWWWWWO.....", r3="..OWWEWWEWWO....",
       r4="..OWWWWWWWWO....", r5="..OWWWEEWWWO....", r6="..OWWWWWWWWO....",
       r7="..OWwWWwWWwO....", r8="..OW.WW.WW.O....", r9="...W..W..W......",
       r10=E),
    df(_WISP1, r10="..O.WW.WW.WO....", r11="....W..W..W....."),
    df(_WISP1, r2=E, r3="....OOOOOO......", r4="...OWWWWWWO.....",
       r5="..OWWEWWEWWO....", r6="..OWWWWWWWWO....", r7="..OWWWEEWWWO....",
       r8="..OWwWWwWWwO....", r9="..OW.WW.WW.O....", r10="...W..W..W......",
       r11=E),
]

# --- 2. SLIME — Blob (Squash-and-Stretch, Augen im Glibber) ---
SLIME_PAL = {
    "O": (16, 44, 30, 255), "S": (90, 225, 130, 255), "s": (50, 150, 85, 255),
    "E": (14, 30, 20, 255), "H": (200, 255, 215, 255),
}
_SLIME1 = [
    E, E, E, E, E, E, E,
    "......OOOO......",
    "....OOSSSSOO....",
    "...OSSHSSSSSO...",
    "..OSSEssESSSSO..",
    "..OSSSSSSSSSSO..",
    ".OSSSSssSSSSSSO.",
    ".OSSSSSSSSSSSSO.",
    "..OOOOOOOOOOOO..",
    E,
]
SLIME_FRAMES = [
    _SLIME1,
    df(_SLIME1, r4="......OOOO......", r5=".....OSSSSO.....", r6="....OSHSSSSO....",
       r7="...OSSESSESSO...", r8="...OSSSSSSSSO...", r9="...OSSssSSSSO...",
       r10="...OSSSSSSSSO...", r11="....OSSSSSSO....", r12="....OOOOOOOO....",
       r13=E, r14=E),
    df(_SLIME1, r10="..OSSEssESSSSO.."),
    df(_SLIME1, r7=E, r8=E, r9="......OOOO......", r10="...OOOSSSSOOO...",
       r11=".OOSSHSEssESSOO.", r12="OSSSSSSSSSSSSSSO", r13="OSSSSssSSssSSSSO",
       r14=".OOOOOOOOOOOOOO."),
]

# --- 3. SHROOM — Pilz-Kerl (Kappe wippt) ---
SHROOM_PAL = {
    "O": (44, 20, 30, 255), "C": (235, 90, 110, 255), "c": (170, 55, 75, 255),
    "D": (255, 230, 235, 255), "K": (240, 215, 180, 255), "k": (190, 160, 125, 255),
    "E": (60, 35, 25, 255),
}
_SHROOM1 = [
    E, E,
    ".....OOOOOO.....",
    "...OOCCCCCCOO...",
    "..OCCDCCCCDCCO..",
    "..OCCCCDDCCCCO..",
    "..OOOOOOOOOOOO..",
    "....OKKKKKKO....",
    "....OKEKKEKO....",
    "....OKKKKKKO....",
    ".....OKkkKO.....",
    ".....OKKKKO.....",
    "....OKO..OKO....",
    "....OKO..OKO....",
    "...OOO....OOO...",
    E,
]
SHROOM_FRAMES = [
    _SHROOM1,
    df(_SHROOM1, r1=".....OOOOOO.....", r2="...OOCCCCCCOO...", r3="..OCCDCCCCDCCO..",
       r4="..OCCCCDDCCCCO..", r5="..OOOOOOOOOOOO..", r6="....OKKKKKKO....",
       r7="....OKEKKEKO....", r8="....OKKKKKKO....", r9=".....OKkkKO.....",
       r10="....OKO..OKO....", r11="...OKO....OKO...", r12="...OOO....OOO...",
       r13=E, r14=E),
    df(_SHROOM1, r2="....OOOOOO......", r3="..OOCCCCCCOO....", r4=".OCCDCCCCDCCO...",
       r5=".OCCCCDDCCCCO...", r6=".OOOOOOOOOOOO..."),
    df(_SHROOM1, r2="......OOOOOO....", r3="....OOCCCCCCOO..", r4="...OCCDCCCCDCCO.",
       r5="...OCCCCDDCCCCO.", r6="...OOOOOOOOOOOO."),
]

# --- 4. TVHEAD — TV-Kopf-Typ (Static flackert) ---
TVHEAD_PAL = {
    "O": (20, 22, 34, 255), "T": (90, 100, 130, 255), "t": (55, 62, 85, 255),
    "S": (90, 230, 230, 255), "s": (255, 80, 180, 255), "N": (230, 240, 255, 255),
    "K": (150, 160, 190, 255),
}
_TVHEAD1 = [
    "..O..........O..",
    "...O........O...",
    "..OOOOOOOOOOOO..",
    "..OTSNSsSNSsTO..",
    "..OTsSNSsSNSTO..",
    "..OTSsNSNsSNTO..",
    "..OOOOOOOOOOOO..",
    "......OKKO......",
    "..KO.OKKKKO.OK..",
    "..KO.OKttKO.OK..",
    ".....OKKKKO.....",
    ".....OKKKKO.....",
    ".....KK..KK.....",
    ".....KK..KK.....",
    "....OKO..OKO....",
    E,
]
TVHEAD_FRAMES = [
    _TVHEAD1,
    df(_TVHEAD1, r0=".KO..........OK.", r1="..O..........O..",
       r3="..OTNsSNSsSNTO..", r4="..OTSNsSNSsSTO..", r5="..OTsSNsSNSsTO..",
       r8=".KO..OKKKKO..OK.", r9="..O..OKttKO..O..",
       r12="....KK....KK....", r13="....KK....KK....", r14="...OKO....OKO..."),
    df(_TVHEAD1, r3="..OTsSNSNsSNTO..", r4="..OTNSsSNSNsTO..", r5="..OTSNSsSsNSTO.."),
    df(_TVHEAD1, r0=E, r1="..O..........O..", r2="...O........O...",
       r3="..OOOOOOOOOOOO..", r4="..OTttSttSttTO..",
       r5="..OTtSttStttTO..", r6="..OTtttSttStTO..",
       r7="..OOOOOOOOOOOO..", r8="......OKKO......", r9="..KO.OKKKKO.OK..",
       r10="..KO.OKttKO.OK..", r11=".....OKKKKO.....", r12=".....OKKKKO.....",
       r13="....KK....KK....", r14="....KK....KK....", r15="...OKO....OKO..."),
]

# --- 5. BOOMBOX — Boombox-Kopf (Speaker-Gesicht pumpt) ---
BOOMBOX_PAL = {
    "O": (26, 20, 14, 255), "B": (200, 150, 90, 255), "b": (140, 100, 55, 255),
    "S": (40, 30, 20, 255), "C": (90, 230, 230, 255), "M": (255, 80, 180, 255),
    "K": (120, 90, 60, 255),
}
_BOOMBOX1 = [
    E,
    ".O............O.",
    "..OOOOOOOOOOOO..",
    "..OBSSBBBBSSBO..",
    "..OBSCSBBSCSBO..",
    "..OBSSBBBBSSBO..",
    "..OBBBBMMBBBBO..",
    "..OOOOOOOOOOOO..",
    "......OKKO......",
    ".KO..OKKKKO..OK.",
    ".KO..OKKKKO..OK.",
    ".....OKKKKO.....",
    ".....KK..KK.....",
    ".....KK..KK.....",
    "....OKO..OKO....",
    E,
]
BOOMBOX_FRAMES = [
    _BOOMBOX1,
    df(_BOOMBOX1, r1=".OK..........KO.",
       r9=".O...OKKKKO...O.", r10=".....OKKKKO.....",
       r12="....KK....KK....", r13="....KK....KK....", r14="...OKO....OKO..."),
    df(_BOOMBOX1, r4="..OBSMSBBSMSBO..", r6="..OBBBBCCBBBBO.."),
    df(_BOOMBOX1, r1=E, r2=".O............O.", r3="..OOOOOOOOOOOO..",
       r4="..OBSSBBBBSSBO..", r5="..OBSсSBBSсSBO..".replace("с", "C"),
       r6="..OBSSBBBBSSBO..", r7="..OBBBBMMBBBBO..", r8="..OOOOOOOOOOOO..",
       r9="......OKKO......", r10=".KO.OKKKKO..OK..", r11=".....OKKKKO.....",
       r12=".....KK..KK.....", r13="....KK....KK....", r14="...OKO....OKO..."),
]

# --- 6. OCTO — Kabel-Krake (Dome + 4 Tentakel, Wire-Vibe) ---
OCTO_PAL = {
    "O": (30, 14, 36, 255), "D": (170, 90, 210, 255), "d": (115, 55, 150, 255),
    "E": (90, 230, 230, 255), "W": (230, 255, 255, 255), "T": (140, 70, 180, 255),
}
_OCTO1 = [
    E, E,
    "....OOOOOOOO....",
    "...ODDDDDDDDO...",
    "..ODDEDDDDEDDO..",
    "..ODDDDDDDDDDO..",
    "..ODdDDddDDdDO..",
    "..OODDDDDDDDOO..",
    "...OTOTOOTOTO...",
    "...OT.OT.TO.T...",
    "..OT..TO.OT..T..",
    "..T..OT...TO..T.",
    ".OT..T.....T..T.",
    E, E, E,
]
OCTO_FRAMES = [
    _OCTO1,
    df(_OCTO1, r1="....OOOOOOOO....", r2="...ODDDDDDDDO...", r3="..ODDWDDDDWDDO..",
       r4="..ODDDDDDDDDDO..", r5="..ODdDDddDDdDO..", r6="..OODDDDDDDDOO..",
       r7="...OTOTOOTOTO...", r8="..OT.OT..TO.TO..", r9=".OT..T....T..TO.",
       r10="OT...T.....T...T", r11=E, r12=E),
    df(_OCTO1, r8="...OT.OT.TO.T...", r9="..OT..TO.OT..T..", r10=".OT..T.....T..T.",
       r11="..T..OT...TO..T.", r12=".T....T.....T..."),
    df(_OCTO1, r2=E, r3="....OOOOOOOO....", r4="...ODDDDDDDDO...",
       r5="..ODDEDDDDEDDO..", r6="..ODDDDDDDDDDO..", r7="..OODddDDddDOO..",
       r8="...OTOTOOTOTO...", r9="..OTT.OTTO.TTO..", r10=".OT....TT....T..",
       r11=E, r12=E),
]

# --- 7. CRAB — Krabben-Mech (Scheren schnappen, Side-Step) ---
CRAB_PAL = {
    "O": (40, 16, 12, 255), "C": (235, 110, 70, 255), "c": (170, 70, 40, 255),
    "E": (255, 240, 200, 255), "P": (255, 176, 60, 255),
}
_CRAB1 = [
    E, E, E,
    "..OO........OO..",
    ".OCCO......OCCO.",
    ".OCCO..OO..OCCO.",
    "..OO..OEEO..OO..",
    "...O.OCCCCO.O...",
    "...OOCCCCCCOO...",
    "..OCCCcCCcCCCO..",
    "..OCCCCCCCCCCO..",
    "...OOCCCCCCOO...",
    "....OC.OO.CO....",
    "...OC..OO..CO...",
    "..OO...OO...OO..",
    E,
]
CRAB_FRAMES = [
    _CRAB1,
    df(_CRAB1, r2="..OO............", r3=".OCCO.......OO..", r4=".OCCO......OCCO.",
       r5="..OO...OO..OCCO.", r6="...O..OEEO...O.."),
    df(_CRAB1, r12="....OC.OO.CO....", r13="....C..OO..C....", r14="...OO..OO..OO..."),
    df(_CRAB1, r3="..OO.........OO.", r4=".OCCO.......OCCO", r5=".OCCO..OO...OCCO",
       r6="..OO..OEEO...OO."),
]

# --- 8. MOTH — Motten-Bot (Fluegel schlagen) ---
MOTH_PAL = {
    "O": (30, 26, 40, 255), "W": (220, 200, 160, 255), "w": (160, 140, 105, 255),
    "B": (100, 80, 120, 255), "E": (255, 176, 60, 255), "A": (200, 180, 255, 255),
}
_MOTH1 = [
    E,
    "...A........A...",
    "....A......A....",
    ".OWWO.OOOO.OWWO.",
    "OWWWWOBEEBOWWWWO",
    "OWWwWOBBBBOWwWWO",
    "OWwWWOBBBBOWWwWO",
    ".OWWO.OBBO.OWWO.",
    "..OO..OBBO..OO..",
    "......OBBO......",
    ".......OO.......",
    E, E, E, E, E,
]
MOTH_FRAMES = [
    _MOTH1,
    df(_MOTH1, r2="...A........A...", r3="....A......A....",
       r4=".OO...OOOO...OO.", r5="OWWOOOBEEBOOOWWO", r6="OWWWWOBBBBOWWWWO",
       r7=".OWwWOBBBBOWwWO.", r8="..OWO.OBBO.OWO..", r9="...O..OBBO..O...",
       r10="......OBBO......", r11=".......OO......."),
    df(_MOTH1, r5="OWwWWOBEEBOWWwWO", r6="OWWWWOBBBBOWWWWO"),
    df(_MOTH1, r1=E, r2="...A........A...", r3="....A......A....",
       r4="......OOOO......", r5=".OWWOOBEEBOOWWO.", r6="OWWWWOBBBBOWWWWO",
       r7="OWwWWOBBBBOWWwWO", r8=".OWWO.OBBO.OWWO.", r9="..OO..OBBO..OO..",
       r10="......OBBO......", r11=".......OO......."),
]

# --- 9. JELLY — Qualle (Glocke pulst, Fransen wehen) ---
JELLY_PAL = {
    "O": (16, 34, 44, 255), "J": (120, 220, 240, 255), "j": (70, 150, 175, 255),
    "E": (20, 50, 60, 255), "T": (90, 180, 200, 255),
}
_JELLY1 = [
    E, E,
    ".....OOOOOO.....",
    "...OOJJJJJJOO...",
    "..OJJJJJJJJJJO..",
    "..OJJEJJJJEJJO..",
    "..OJJJJjjJJJJO..",
    "...OOOOOOOOOO...",
    "...T.J.TT.J.T...",
    "...T.J.TT.J.T...",
    "....J.T..T.J....",
    "....J.T..T.J....",
    E, E, E, E,
]
JELLY_FRAMES = [
    _JELLY1,
    df(_JELLY1, r1=".....OOOOOO.....", r2="...OOJJJJJJOO...", r3="..OJJJJJJJJJJO..",
       r4="..OJJEJJJJEJJO..", r5="..OJJJJjjJJJJO..", r6="...OOOOOOOOOO...",
       r7="...T.J.TT.J.T...", r8="....J.T..T.J....", r9="....J.T..T.J....",
       r10=".....T.J..T.....", r11=E),
    df(_JELLY1, r8="...J.T.TT.T.J...", r9="...J.T.TT.T.J...", r10="....T.J..J.T....",
       r11="....T.J..J.T...."),
    df(_JELLY1, r2="....OOOOOOOO....", r3="..OOJJJJJJJJOO..", r4=".OJJJEJJJJEJJJO.",
       r5=".OJJJJJjjJJJJJO.", r6="..OOOOOOOOOOOO.."),
]

# --- 10. IMP — Hoernchen-Imp (Hops mit Schwanz) ---
IMP_PAL = {
    "O": (36, 12, 24, 255), "I": (220, 80, 120, 255), "i": (150, 45, 80, 255),
    "E": (255, 230, 120, 255), "H": (255, 150, 180, 255),
}
_IMP1 = [
    E, E, E,
    "...OH....HO.....",
    "....OOOOOO......",
    "...OIIIIIIO.....",
    "...OIEIIEIO.....",
    "...OIIiiIIO.....",
    "....OIIIIO......",
    "..O.OIIIIO......",
    "...O.OIIO.O.....",
    "....OII.IIO.....",
    "....OI...IO.....",
    "...OO.....OO....",
    E, E,
]
IMP_FRAMES = [
    _IMP1,
    df(_IMP1, r1="...OH....HO.....", r2="....OOOOOO......", r3="...OIIIIIIO.....",
       r4="...OIEIIEIO.....", r5="...OIIiiIIO.....", r6="....OIIIIO......",
       r7=".O..OIIIIO......", r8="..O..OIIO.......", r9="....OII.IIO.....",
       r10="...OI.....IO....", r11="..OO.......OO...", r12=E, r13=E),
    df(_IMP1, r9="..O..OIIO.O.....", r10="....OIIIIO......", r11="....OI.IO.......",
       r12="...OO...OO......", r13=E),
    df(_IMP1, r3=E, r4="...OH....HO.....", r5="....OOOOOO......", r6="...OIIIIIIO.....",
       r7="...OIEIIEIO.....", r8="...OIIiiIIO.....", r9="..O.OIIIIO......",
       r10="...OOIIIIOO.....", r11="....OI..IO......", r12="...OO....OO.....",
       r13=E),
]

# --- 11. KNIGHT — Oedland-Ritter (Helmbusch, Stampf-Tanz) ---
KNIGHT_PAL = {
    "O": (24, 24, 30, 255), "M": (150, 155, 170, 255), "m": (95, 100, 115, 255),
    "P": (220, 60, 70, 255), "E": (90, 230, 230, 255), "S": (110, 80, 50, 255),
}
_KNIGHT1 = [
    "......PP........",
    "......PP........",
    "....OOOOOOO.....",
    "....OMMMMMO.....",
    "....OEEMMMO.....",
    "....OMMMMMO.....",
    "....OOOOOOO.....",
    ".OO.OMMMMMO.OO..",
    ".OS.OMmMmMO.SO..",
    ".OS.OMMMMMO.SO..",
    ".OO..OOOOO..OO..",
    ".....OM.MO......",
    ".....OM.MO......",
    ".....OM.MO......",
    "....OOO.OOO.....",
    E,
]
KNIGHT_FRAMES = [
    _KNIGHT1,
    df(_KNIGHT1, r0="......PP........", r1="....OOOOOOO.....", r2="....OMMMMMO.....",
       r3="....OEEMMMO.....", r4="....OMMMMMO.....", r5="....OOOOOOO.....",
       r6=".OO.OMMMMMO.OO..", r7=".OS.OMmMmMO.SO..", r8=".OS.OMMMMMO.SO..",
       r9=".OO..OOOOO..OO..", r10=".....OM.MO......", r11="....OM...MO.....",
       r12="...OOO...OOO....", r13=E, r14=E),
    df(_KNIGHT1, r4="....OMMEEMO....."),
    df(_KNIGHT1, r11=".....OM..MO.....", r12=".....OM..MO.....", r13="....OM....MO....",
       r14="...OOO....OOO..."),
]

# --- 12. MONK — Upload-Moench (Kutte, schwebt beim Meditieren) ---
MONK_PAL = {
    "O": (20, 16, 30, 255), "R": (110, 90, 160, 255), "r": (70, 55, 110, 255),
    "E": (90, 230, 230, 255), "G": (170, 150, 230, 255),
}
_MONK1 = [
    E, E,
    ".....OOOOO......",
    "....ORRRRRO.....",
    "...ORRrrrRRO....",
    "...ORr.E.rRO....",
    "...ORr.E.rRO....",
    "...ORRrrrRRO....",
    "..ORRRRRRRRRO...",
    "..ORRGRRRGRRO...",
    ".ORRRGGGGGRRRO..",
    ".ORRRRRRRRRRRO..",
    ".ORrRRRRRRRrRO..",
    "..OOOOOOOOOOO...",
    E, E,
]
MONK_FRAMES = [
    _MONK1,
    df(_MONK1, r1=".....OOOOO......", r2="....ORRRRRO.....", r3="...ORRrrrRRO....",
       r4="...ORr.E.rRO....", r5="...ORr.E.rRO....", r6="...ORRrrrRRO....",
       r7="..ORRRRRRRRRO...", r8="..ORRGRRRGRRO...", r9=".ORRRGGGGGRRRO..",
       r10=".ORRRRRRRRRRRO..", r11=".ORrRRRRRRRrRO..", r12="..OOOOOOOOOOO...",
       r13=E),
    df(_MONK1, r5="...ORr.G.rRO....", r6="...ORr.G.rRO...."),
    df(_MONK1, r2=E, r3=".....OOOOO......", r4="....ORRRRRO.....", r5="...ORRrrrRRO....",
       r6="...ORr.E.rRO....", r7="...ORRrrrRRO....", r8="..ORRRRRRRRRO...",
       r9="..ORRGRRRGRRO...", r10=".ORRRGGGGGRRRO..", r11=".ORRRRRRRRRRRO..",
       r12="..OOOOOOOOOOO...", r13=E),
]

# --- 13. ANTLING — Ameisling (die "Ameisen" des Kanons, marschiert froh) ---
ANTLING_PAL = {
    "O": (30, 20, 12, 255), "A": (200, 120, 60, 255), "a": (140, 80, 40, 255),
    "E": (255, 255, 255, 255), "N": (90, 50, 25, 255),
}
_ANT1 = [
    E, E, E, E,
    "...N......N.....",
    "....N....N......",
    "....OOOOOO......",
    "...OAEAAEAO.....",
    "...OAAaaAAO.....",
    "....OOOOOO......",
    "..O.OAAAAO.O....",
    "...OOAAAAOO.....",
    "....OAaaAO......",
    "....OA..AO......",
    "...OO....OO.....",
    E,
]
ANTLING_FRAMES = [
    _ANT1,
    df(_ANT1, r3="...N......N.....", r4="....N....N......", r5="....OOOOOO......",
       r6="...OAEAAEAO.....", r7="...OAAaaAAO.....", r8="....OOOOOO......",
       r9=".O..OAAAAO..O...", r10="..OOAAAAAAOO....", r11="....OAaaAO......",
       r12="...OA....AO.....", r13="..OO......OO....", r14=E),
    df(_ANT1, r13="....OA.AO.......", r14="...OO...OO......"),
    df(_ANT1, r4="..N......N......", r5="...N....N.......",
       r10="..O.OAAAAO.O....", r11="...OOAAAAOO.....", r13="....OA..AO......",
       r14="....OO..OO......"),
]

# --- 14. CAT — Robo-Katze (Ohren + Schwanz-Swish) ---
CAT_PAL = {
    "O": (26, 22, 34, 255), "C": (180, 170, 200, 255), "c": (120, 110, 140, 255),
    "E": (90, 230, 230, 255), "P": (255, 80, 180, 255),
}
_CAT1 = [
    E, E, E,
    "...O....O.......",
    "...OO..OO.....O.",
    "...OCCCCO....O..",
    "...OCECEO...O...",
    "...OCCCCO..O....",
    "....OCPO..O.....",
    "...OCCCCCOO.....",
    "..OCCCCCCCO.....",
    "..OCcCCCcCO.....",
    "..OCCCCCCCO.....",
    "...OC.O.CO......",
    "...OC...CO......",
    "..OOO...OOO.....",
]
CAT_FRAMES = [
    _CAT1,
    df(_CAT1, r2="...O....O.......", r3="...OO..OO.......", r4="...OCCCCO.....O.",
       r5="...OCECEO....O..", r6="...OCCCCO...O...", r7="....OCPO...O....",
       r8="...OCCCCCOO.....", r9="..OCCCCCCCO.....", r10="..OCcCCCcCO.....",
       r11="..OCCCCCCCO.....", r12="...OC...CO......", r13="..OC.....CO.....",
       r14=".OOO.....OOO...."),
    df(_CAT1, r4="...OO..OO...O...", r5="...OCCCCO....O..", r6="...OCECEO.....O.",
       r7="...OCCCCO....O..", r8="....OCPO....O..."),
    df(_CAT1, r13="...OC..CO.......", r14="...OO...OO......", r15=E),
]

# --- 15. PUP — Robo-Welpe (Schlappohren, Schwanz wedelt) ---
PUP_PAL = {
    "O": (30, 24, 16, 255), "D": (210, 160, 100, 255), "d": (150, 110, 65, 255),
    "E": (40, 26, 16, 255), "N": (20, 14, 10, 255), "T": (90, 230, 230, 255),
}
_PUP1 = [
    E, E, E, E,
    "..OD....DO......",
    "..ODOOOODO...T..",
    "..ODDDDDDO..T...",
    "..ODEDDEDO.T....",
    "..ODDNNDDO......",
    "...ODDDDOOO.....",
    "..ODDDDDDDDO....",
    "..ODdDDDDdDO....",
    "..ODDDDDDDDO....",
    "...OD.OO.DO.....",
    "...OD....DO.....",
    "..OOO....OOO....",
]
PUP_FRAMES = [
    _PUP1,
    df(_PUP1, r3="..OD....DO......", r4="..ODOOOODO......", r5="..ODDDDDDO....T.",
       r6="..ODEDDEDO...T..", r7="..ODDNNDDO..T...", r8="...ODDDDOOO.....",
       r9="..ODDDDDDDDO....", r10="..ODdDDDDdDO....", r11="..ODDDDDDDDO....",
       r12="...OD....DO.....", r13="..OD......DO....", r14=".OOO......OOO...",
       r15=E),
    df(_PUP1, r5="..ODOOOODO.T....", r6="..ODDDDDDO..T...", r7="..ODEDDEDO...T..",
       r8="..ODDNNDDO..T..."),
    df(_PUP1, r13="...OD..DO.......", r14="...OO....OO.....", r15=E),
]

# --- 16. WORMY — Raupen-Wesen (Inchworm-Wiggle) ---
WORMY_PAL = {
    "O": (18, 36, 22, 255), "G": (140, 220, 110, 255), "g": (85, 155, 65, 255),
    "E": (30, 50, 26, 255), "H": (255, 176, 60, 255),
}
_WORMY1 = [
    E, E, E, E, E, E, E,
    "...H....H.......",
    "....OOOO........",
    "...OGEGEO.......",
    "...OGGGGOOOO....",
    "..OGGggGGGGGO...",
    "..OGGGGGgGGGGO..",
    "...OOOOOOOOOOO..",
    E, E,
]
WORMY_FRAMES = [
    _WORMY1,
    df(_WORMY1, r6="...H....H.......", r7="....OOOO........", r8="...OGEGEO.......",
       r9="...OGGGGO.......", r10="...OGGGGOOO.....", r11="..OGGggGGGGOO...",
       r12="...OGGGGGgGGGO..", r13="....OOOOOOOOO...", r14=E),
    df(_WORMY1, r10="...OGGGGOOOO....", r11="...OGggGGGGGGO..", r12="..OGGGGGgGGGGO..",
       r13="..OOOOOOOOOOOO.."),
    df(_WORMY1, r7=E, r8="...H....H.......", r9="....OOOO........", r10="...OGEGEO.......",
       r11="...OGGGGOOOOO...", r12="..OGGggGGgGGGO..", r13="..OOOOOOOOOOOO..",
       r14=E),
]

# --- 17. CACTUS — Kaktus-Raver (Topf-Hose, Stachel-Arme hoch) ---
CACTUS_PAL = {
    "O": (18, 34, 20, 255), "C": (100, 180, 90, 255), "c": (60, 120, 55, 255),
    "E": (30, 45, 25, 255), "F": (235, 120, 160, 255), "P": (190, 110, 70, 255),
    "p": (130, 70, 45, 255),
}
_CACTUS1 = [
    E,
    "......OFO.......",
    ".OC..OCCCO......",
    ".OC..OCCCO..OC..",
    "..OC.OCECO..CO..",
    "..OCOOCCCOOCO...",
    "...OCCCCCCCO....",
    "....OCcCcCO.....",
    "....OCCCCCO.....",
    "....OCcCcCO.....",
    "...OOOOOOOOO....",
    "...OPPPPPPPO....",
    "...OPpPPPpPO....",
    "....OPPPPPO.....",
    "....OOOOOOO.....",
    E,
]
CACTUS_FRAMES = [
    _CACTUS1,
    df(_CACTUS1, r1="......OFO.......", r2=".OC..OCCCO..OC..", r3="..OC.OCCCO..CO..",
       r4="..OCOOCECOOCO...", r5="...OCCCCCCCO....", r6="....OCcCcCO.....",
       r7="....OCCCCCO.....", r8="....OCcCcCO.....", r9="...OOOOOOOOO....",
       r10="...OPPPPPPPO....", r11="...OPpPPPpPO....", r12="....OPPPPPO.....",
       r13="....OOOOOOO.....", r14=E),
    df(_CACTUS1, r2=".OC..OCCCO..OC..", r3=".OC..OCECO..CO.."),
    df(_CACTUS1, r1=E, r2="......OFO.......", r3=".OC..OCCCO..OC..",
       r4=".OC..OCECO..CO..", r5="..OCOOCCCOOCO..."),
]

# --- 18. YETI — Flausch-Brocken (breite Schultern, Mini-Kopf) ---
YETI_PAL = {
    "O": (28, 32, 44, 255), "Y": (215, 225, 240, 255), "y": (150, 165, 195, 255),
    "E": (40, 50, 70, 255), "F": (90, 110, 145, 255),
}
_YETI1 = [
    E, E,
    "......OOOO......",
    ".....OYEEYO.....",
    "....OOYYYYOO....",
    "..OOYYYYYYYYOO..",
    ".OYYYYyYYyYYYYO.",
    ".OYYOYYYYYYOYYO.",
    ".OYYOYyYYyYOYYO.",
    ".OYYOYYYYYYOYYO.",
    "..OO.YYyyYY.OO..",
    ".....OYYYYO.....",
    "....OYYO.YYO....",
    "....OFF..FFO....",
    "...OOO....OOO...",
    E,
]
YETI_FRAMES = [
    _YETI1,
    df(_YETI1, r1="......OOOO......", r2=".....OYEEYO.....", r3="....OOYYYYOO....",
       r4=".OOYYYYYYYYYYOO.", r5="OYYYYYyYYyYYYYYO", r6="OYYOOYYYYYYOOYYO",
       r7="OYYO.YyYYyY.OYYO", r8="OYYO.YYYYYY.OYYO", r9=".OO..YYyyYY..OO.",
       r10=".....OYYYYO.....", r11="....OYY..YYO....", r12="....OFF..FFO....",
       r13="...OOO....OOO...", r14=E),
    df(_YETI1, r3=".....OYYYYO....."),
    df(_YETI1, r12="....OYYOYYO.....", r13="....OFF.FFO.....", r14="...OOO...OOO...."),
]

# --- 19. SPIDER — Spinnen-Bot (Kern + 6 Beine rippeln) ---
SPIDER_PAL = {
    "O": (20, 16, 26, 255), "S": (130, 110, 170, 255), "s": (85, 70, 115, 255),
    "E": (255, 80, 180, 255), "L": (95, 80, 125, 255),
}
_SPIDER1 = [
    E, E, E, E,
    "..L....OO....L..",
    "...L..OSSO..L...",
    ".L..OOSSSSOO..L.",
    "..LOSSESSESSOL..",
    "...OSSSSSSSSO...",
    ".LOOSsSSSSsSOOL.",
    "L..OSSSSSSSSO..L",
    "....OOOOOOOO....",
    "...L...LL...L...",
    "..L....LL....L..",
    E, E,
]
SPIDER_FRAMES = [
    _SPIDER1,
    df(_SPIDER1, r3="..L....OO....L..", r4="...L..OSSO..L...", r5=".L..OOSSSSOO..L.",
       r6="..LOSSESSESSOL..", r7="...OSSSSSSSSO...", r8=".LOOSsSSSSsSOOL.",
       r9="L..OSSSSSSSSO..L", r10="....OOOOOOOO....", r11="..L....LL....L..",
       r12=".L.....LL.....L.", r13=E),
    df(_SPIDER1, r4=".L.....OO.....L.", r5="..L...OSSO...L..", r6="...LOOSSSSOOL...",
       r9=".LOOSsSSSSsSOOL."),
    df(_SPIDER1, r12="...L...LL...L...", r13="....L..LL..L....", r14=E),
]

# --- 20. ORB — Orbit-Kern (Ring + Satellit kreist) ---
ORB_PAL = {
    "O": (24, 20, 38, 255), "K": (255, 176, 60, 255), "k": (190, 120, 40, 255),
    "R": (150, 140, 200, 255), "S": (90, 230, 230, 255), "E": (60, 40, 20, 255),
}
_ORB1 = [
    E, E, E, E,
    "......OOOO......",
    ".....OKKKKO.....",
    "....OKKEEKKO....",
    ".RRRRKKKKKKRRRR.",
    "....OKkKKkKO....",
    ".....OKKKKO.....",
    "......OOOO......",
    ".S..............",
    E, E, E, E,
]
ORB_FRAMES = [
    _ORB1,
    df(_ORB1, r3="......OOOO......", r4=".....OKKKKO.....", r5="....OKKEEKKO....",
       r6=".RRRRKKKKKKRRRR.", r7="....OKkKKkKO....", r8=".....OKKKKO.....",
       r9="......OOOO......", r10="..............S.", r11=E),
    df(_ORB1, r11="..............S."),
    df(_ORB1, r7=".RRRRKKKKKKRRRR.", r11=".......S........"),
]

# --- 21. SHARD — Kristall-Wesen (schwebender Splitter, Facetten blitzen) ---
SHARD_PAL = {
    "O": (20, 30, 40, 255), "C": (140, 230, 220, 255), "c": (80, 160, 155, 255),
    "W": (235, 255, 252, 255), "E": (30, 60, 60, 255),
}
_SHARD1 = [
    E, E,
    ".......OO.......",
    "......OCCO......",
    ".....OCWCCO.....",
    ".....OCCCCO.....",
    "....OCCECCCO....",
    "....OCCCECCO....",
    "....OcCCCCcO....",
    ".....OcCCcO.....",
    ".....OCCCCO.....",
    "......OCCO......",
    ".......OO.......",
    E, E, E,
]
SHARD_FRAMES = [
    _SHARD1,
    df(_SHARD1, r1=".......OO.......", r2="......OCCO......", r3=".....OCCWCO.....",
       r4=".....OCCCCO.....", r5="....OCCECCCO....", r6="....OCCCECCO....",
       r7="....OcCCCCcO....", r8=".....OcCCcO.....", r9=".....OCCCCO.....",
       r10="......OCCO......", r11=".......OO.......", r12=E),
    df(_SHARD1, r4=".....OCCCWO.....", r8="....OWCCCCcO...."),
    df(_SHARD1, r2=E, r3=".......OO.......", r4="......OCCO......", r5=".....OCWCCO.....",
       r6=".....OCCCCO.....", r7="....OCCECCCO....", r8="....OcCCECcO....",
       r9=".....OcCCcO.....", r10=".....OCCCCO.....", r11="......OCCO......",
       r12=".......OO......."),
]

# --- Zweit-Bewegung: SHROOM sitzt (Kappe + baumelnde Beine) ---
_SSIT1 = [
    E, E,
    ".....OOOOOO.....",
    "...OOCCCCCCOO...",
    "..OCCDCCCCDCCO..",
    "..OCCCCDDCCCCO..",
    "..OOOOOOOOOOOO..",
    "....OKKKKKKO....",
    "....OKEKKEKO....",
    "....OKKKKKKO....",
    "....OOOOOOOO....",
    "....OK....KO....",
    "....OK....KO....",
    "...OOO....OOO...",
    E, E,
]
SHROOM_SIT_FRAMES = [
    _SSIT1,
    df(_SSIT1, r11="...OK.....KO....", r12="...OK.....KO....", r13="..OOO.....OOO..."),
    df(_SSIT1, r2="....OOOOOO......", r3="..OOCCCCCCOO....", r4=".OCCDCCCCDCCO...",
       r5=".OCCCCDDCCCCO...", r6=".OOOOOOOOOOOO..."),
    df(_SSIT1, r11=".....OK..KO.....", r12=".....OK..KO.....", r13="....OOO..OOO...."),
]

EXTRA_MOVES = {
    "shroom": {"sit": (SHROOM_PAL, SHROOM_SIT_FRAMES)},
}

EXTRA_RIGS = {
    "wisp": (WISP_PAL, WISP_FRAMES),
    "slime": (SLIME_PAL, SLIME_FRAMES),
    "shroom": (SHROOM_PAL, SHROOM_FRAMES),
    "tvhead": (TVHEAD_PAL, TVHEAD_FRAMES),
    "boombox": (BOOMBOX_PAL, BOOMBOX_FRAMES),
    "octo": (OCTO_PAL, OCTO_FRAMES),
    "crab": (CRAB_PAL, CRAB_FRAMES),
    "moth": (MOTH_PAL, MOTH_FRAMES),
    "jelly": (JELLY_PAL, JELLY_FRAMES),
    "imp": (IMP_PAL, IMP_FRAMES),
    "knight": (KNIGHT_PAL, KNIGHT_FRAMES),
    "monk": (MONK_PAL, MONK_FRAMES),
    "antling": (ANTLING_PAL, ANTLING_FRAMES),
    "cat": (CAT_PAL, CAT_FRAMES),
    "pup": (PUP_PAL, PUP_FRAMES),
    "wormy": (WORMY_PAL, WORMY_FRAMES),
    "cactus": (CACTUS_PAL, CACTUS_FRAMES),
    "yeti": (YETI_PAL, YETI_FRAMES),
    "spider": (SPIDER_PAL, SPIDER_FRAMES),
    "orb": (ORB_PAL, ORB_FRAMES),
    "shard": (SHARD_PAL, SHARD_FRAMES),
}
