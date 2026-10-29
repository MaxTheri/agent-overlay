"""Découpe les poses imagegen et assemble une animation à 10 images/s.

Aucun dessin ni aucune interpolation de mouvement : chaque pose provient
d'une planche imagegen. Seuls le découpage, le calage vertical des bottes,
l'agrandissement au plus proche voisin et l'encodage sont effectués ici.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
ORIGINAL = Image.open(ROOT / "planche-correction-personnage.png").convert("RGB")
CORRECTED = Image.open(ROOT / "planche-correction-epee.png").convert("RGB")
SIZE = 198
SCALE = 3
BASELINE = 174
frames = []
registration = []
(ROOT / "images").mkdir(exist_ok=True)

for index in range(40):
    row, column = divmod(index, 8)
    # Garder les attaques et gardes originales ; utiliser les corrections
    # imagegen uniquement pour la charge et le lancer (images 23 à 37).
    source = CORRECTED if 22 <= index <= 36 else ORIGINAL
    width, height = source.size
    left = round(column * width / 8)
    top = round(row * height / 5)
    cell = np.asarray(source.crop((left, top, left + SIZE, top + SIZE)))
    dark = np.all(cell < 62, axis=2)
    bootline = int(dark.sum(axis=1)[165:181].argmax()) + 165
    offset = bootline - BASELINE
    # Le calage ne déforme aucun pixel : translation du rectangle découpé.
    ys = np.clip(np.arange(SIZE) + offset, 0, SIZE - 1)
    frame = Image.fromarray(cell[ys])
    frame.save(ROOT / "images" / f"mage-{index + 1:02d}.png")
    frames.append(frame)
    registration.append({"frame": index + 1, "baseline_source": bootline,
                         "vertical_crop_offset": offset,
                         "source": "correction-epee" if 22 <= index <= 36 else "correction-personnage"})

# Une palette commune évite les changements de couleurs à chaque image.
sheet = Image.new("RGB", (SIZE * 8, SIZE * 5))
for index, frame in enumerate(frames):
    sheet.paste(frame, ((index % 8) * SIZE, (index // 8) * SIZE))
sheet.save(ROOT / "mage-bataille-planche.png")
palette = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
encoded = [f.quantize(palette=palette, dither=Image.Dither.NONE)
           .resize((SIZE * SCALE, SIZE * SCALE), Image.Resampling.NEAREST)
           for f in frames]
encoded[0].save(ROOT / "mage-bataille.gif", save_all=True,
                append_images=encoded[1:], duration=100, loop=0,
                optimize=False, disposal=2)

gif = Image.open(ROOT / "mage-bataille.gif")
durations = []
for i in range(gif.n_frames):
    gif.seek(i)
    durations.append(gif.info["duration"])
assert gif.n_frames == 40, f"Nombre inattendu : {gif.n_frames}"
assert durations == [100] * 40, durations
report = {"frames": gif.n_frames, "size": list(gif.size), "fps": 10,
          "duration_ms": sum(durations), "loop": gif.info.get("loop"),
          "baseline_native_px": BASELINE, "registration": registration}
(ROOT / "verification.json").write_text(json.dumps(report, indent=2))
print(json.dumps({k: v for k, v in report.items() if k != "registration"}))
