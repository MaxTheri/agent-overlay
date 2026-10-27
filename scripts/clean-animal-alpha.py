"""Remove near-transparent matte residue without moving or redrawing sprites.

Authorized by the user after image_gen repeatedly retained colored fringes.
Pillow and NumPy are available in the bundled Codex Python runtime.
"""
from pathlib import Path
import json
from collections import deque
import numpy as np
from PIL import Image
import sys
from animal_layout import row_ranges

directory = Path(__file__).resolve().parents[1] / 'assets' / 'animals-source'
report = []
pattern = '*-extras.png' if '--extras' in sys.argv else '*-animated.png'
for path in sorted(directory.glob(pattern)):
    image = Image.open(path).convert('RGBA')
    pixels = np.array(image)
    alpha = pixels[:, :, 3]
    ranges = row_ranges(pixels, path.stem.endswith('-extras'))
    residue = alpha <= 16
    count = int(np.count_nonzero(residue & (alpha > 0)))
    # Tiny alpha values had saturated RGB (red/yellow/white) after extraction.
    # Clear RGB as well as alpha, so interpolation cannot pick up the matte.
    pixels[residue] = 0
    # A few tails from adjacent cells intruded at frame edges. Keep the main
    # connected cutout in each cell; all held props join the paws/arms.
    fragments = 0
    for y0, y1 in ranges:
        for column in range(8):
            x0, x1 = round(column * image.width / 8), round((column + 1) * image.width / 8)
            cell = pixels[y0:y1, x0:x1]
            mask = cell[:, :, 3] > 0
            labels = np.zeros(mask.shape, dtype=np.int32)
            sizes = [0]
            for y, x in zip(*np.where(mask)):
                if labels[y, x]:
                    continue
                label = len(sizes)
                queue = deque([(int(y), int(x))])
                labels[y, x] = label
                size = 0
                while queue:
                    cy, cx = queue.popleft()
                    size += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not labels[ny, nx]:
                                labels[ny, nx] = label
                                queue.append((ny, nx))
                sizes.append(size)
            largest = int(np.argmax(sizes))
            stray = mask & (labels != largest)
            fragments += int(np.count_nonzero(stray))
            cell[stray] = 0
    Image.fromarray(pixels).save(path, optimize=True)
    report.append({'file': path.name, 'width': image.width, 'height': image.height,
                   'rows': len(ranges), 'removedNearTransparentPixels': count, 'removedDisconnectedPixels': fragments, 'alphaThreshold': 16})
print(json.dumps(report, ensure_ascii=False))
