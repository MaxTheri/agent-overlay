"""Register the eight imagegen gait cells without resizing each pose separately.

Usage: python scripts/pack-walk-atlases.py assets/scenes-source/walk-manifest.json
"""
import json
import statistics
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def cuts(ink, count):
    step = len(ink) / count
    result = [0]
    for i in range(1, count):
        expected = i * step
        start, end = round(expected - step * .18), round(expected + step * .18)
        result.append(min(range(start, end + 1), key=lambda p: float(ink[max(0, p-1):p+2].sum()) + abs(p-expected) * .02))
    return result + [len(ink)]


def character(cell):
    """Discard disconnected extraction specks and pieces of neighbouring cells."""
    pixels = np.array(cell)
    mask = pixels[:, :, 3] > 32
    seen = np.zeros(mask.shape, dtype=bool)
    largest = []
    height, width = mask.shape
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        stack = [(int(x), int(y))]
        seen[y, x] = True
        component = []
        while stack:
            px, py = stack.pop()
            component.append((px, py))
            for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((nx, ny))
        if len(component) > len(largest):
            largest = component
    keep = np.zeros(mask.shape, dtype=bool)
    for x, y in largest:
        keep[y, x] = True
    # Retain the antialiasing fringe immediately around the connected drawing.
    fringe = keep.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            fringe |= np.roll(np.roll(keep, dy, axis=0), dx, axis=1)
    pixels[~fringe] = 0
    clean = Image.fromarray(pixels)
    bbox = Image.fromarray((keep * 255).astype('uint8')).getbbox()
    if not bbox or bbox[3] - bbox[1] < height * .4:
        raise ValueError('Missing walking character')
    return clean, bbox


for job in json.loads(Path(sys.argv[1]).read_text()):
    source = Image.open(job['source']).convert('RGBA')
    alpha = np.array(source.getchannel('A')) > 128
    rows = cuts(alpha.sum(axis=1), 2)
    poses = []
    for row in range(2):
        columns = cuts(alpha[rows[row]:rows[row+1]].sum(axis=0), 4)
        for col in range(4):
            cell, bounds = character(source.crop((columns[col], rows[row], columns[col+1], rows[row+1])))
            left, top, right, bottom = bounds
            # Register the head rather than the feet: alternating leg positions
            # must not drag the upper body left and right inside its own cell.
            head = np.array(cell.getchannel('A'))[top:top+round((bottom-top)*.36)] > 128
            hx = np.where(head)[1]
            anchor = (int(hx.min()) + int(hx.max())) / 2
            poses.append((cell, bounds, anchor))
    scale = 218 / statistics.median(b[3]-b[1] for _, b, _ in poses)
    left = min((b[0]-anchor)*scale for _, b, anchor in poses)
    right = max((b[2]-anchor)*scale for _, b, anchor in poses)
    scale *= min(1, 240 / (right-left))
    left = min((b[0]-anchor)*scale for _, b, anchor in poses)
    right = max((b[2]-anchor)*scale for _, b, anchor in poses)
    root = 128 - (left+right) / 2
    strip = Image.new('RGBA', (2048, 256))
    preview = Image.new('RGBA', (1024, 512))
    for index, (cell, bounds, anchor) in enumerate(poses):
        resized = cell.resize((round(cell.width*scale), round(cell.height*scale)), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (256, 256))
        frame.alpha_composite(resized, (round(root-anchor*scale), round(242-bounds[3]*scale)))
        strip.alpha_composite(frame, (index*256, 0))
        preview.alpha_composite(frame, (index % 4*256, index // 4*256))
    for key, image in [('output', strip), ('preview', preview)]:
        Path(job[key]).parent.mkdir(parents=True, exist_ok=True)
        image.save(job[key])
    print(json.dumps({'animal': job['animal'], 'frames': 8, 'output': job['output'], 'scale': scale}))
