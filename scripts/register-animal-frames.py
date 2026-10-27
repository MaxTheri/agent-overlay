"""Measure sprite registration without modifying the generated PNG drawings.

Every pose uses its feet as a stationary anchor. Renderer crop coordinates
compensate for the atlas' uneven spacing, not for any animated movement.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from animal_layout import row_ranges

directory = Path(__file__).resolve().parents[1] / 'assets' / 'animals-source'
registrations = {'base': {}, 'extra': {}}
for name in ('ratel', 'renard', 'firefox', 'capibara'):
    banks = {}
    for bank, suffix in (('base', 'animated'), ('extra', 'extras')):
        pixels = np.asarray(Image.open(directory / f'{name}-{suffix}.png').convert('RGBA'))
        height, width = pixels.shape[:2]
        unit = 256 / (width/8)
        lines = []
        for y0,y1 in row_ranges(pixels, bank == 'extra'):
            line = []
            for column in range(8):
                x0,x1 = round(column*width/8), round((column+1)*width/8)
                cell = pixels[y0:y1,x0:x1]
                yy,xx = np.where(cell[:,:,3] > 128)
                bottom = int(yy.max())
                foot = xx[yy >= bottom-14]
                line.append({'sx': x0, 'sy': y0, 'sw': x1-x0, 'sh': y1-y0, 'unit': unit,
                             'anchorX': float(foot.mean())*unit, 'anchorY': bottom*unit,
                             'left': float(xx.min())*unit, 'right': float(xx.max())*unit,
                             'top': float(yy.min())*unit})
            lines.append(line)
        banks[bank] = lines
    poses = [p for lines in banks.values() for line in lines for p in line]
    # Generated drawings have different intrinsic sizes between banks and
    # sometimes between cells. Normalize silhouette height before anchoring.
    target_height = 220.0
    for p in poses:
        p['scale'] = target_height/(p['anchorY']-p['top'])
    left = min((p['left']-p['anchorX'])*p['scale'] for p in poses)
    right = max((p['right']-p['anchorX'])*p['scale'] for p in poses)
    fit = min(1,246/(right-left))
    target_height *= fit
    target_x = 128-(left+right)/2*fit
    for p in poses:
        p['scale'] *= fit
    for bank,lines in banks.items():
        registrations[bank][name] = []
        for line in lines:
            registrations[bank][name].append([
                {**{k: p[k] for k in ('sx','sy','sw','sh','anchorX','anchorY')},
                 'dx': target_x-p['anchorX']*p['scale'],
                 'dy': 242-p['anchorY']*p['scale'],
                 'dw': p['sw']*p['unit']*p['scale'], 'dh': p['sh']*p['unit']*p['scale'],
                 'registrationScale': p['scale'], 'pixelScale': p['unit']*p['scale'],
                 'bodyTop': p['top'], 'renderedBodyHeight': target_height}
                for p in line])
    print(name, 'registered poses:', len(poses), 'uniform character height:', round(target_height,4))
(directory / 'registration.json').write_text(json.dumps(registrations, indent=2)+'\n')
