"""Export aligned animation strips from the archived generated drawings.

Run with the bundled Python runtime (Pillow). Each output cell is 256x256;
registration is baked into the pixels, so the renderer only crops columns.
"""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets' / 'animals-source'
OUTPUT = ROOT / 'public' / 'animals'
SIZE = 256
FRAME_COUNT = 64


def bounce(poses):
    return poses + poses[1:-1][::-1]


def export():
    registration = json.loads((SOURCE / 'registration.json').read_text())
    layouts = {
        'ratel': {'a': [0, 1], 'b': [2, 3], 'wave': [4, 5], 'sulk': [6, 7]},
        'renard': {'a': [0], 'b': [1], 'wave': [2], 'sulk': [3]},
        'firefox': {'a': [0, 1], 'b': [2, 3], 'wave': [4], 'sulk': [5, 6]},
        'capibara': {'a': [0, 3], 'b': [2, 1], 'wave': [4], 'sulk': [5, 6]},
    }
    count = 0
    for original, layout in layouts.items():
        animal = 'capybara' if original == 'capibara' else original
        images = {bank: Image.open(SOURCE / f'{original}-{suffix}.png').convert('RGBA')
                  for bank, suffix in [('base', 'animated'), ('extra', 'extras')]}
        cells = {}

        def rows(bank, indices, columns=range(8)):
            result = []
            for row in indices:
                for column in columns:
                    key = (bank, row, column)
                    if key not in cells:
                        p = registration[bank][original][row][column]
                        crop = images[bank].crop((p['sx'], p['sy'], p['sx'] + p['sw'], p['sy'] + p['sh']))
                        # Inverse affine mapping preserves fractional registration.
                        scale_x, scale_y = p['sw'] / p['dw'], p['sh'] / p['dh']
                        cells[key] = crop.transform((SIZE, SIZE), Image.Transform.AFFINE,
                            (scale_x, 0, -p['dx'] * scale_x, 0, scale_y, -p['dy'] * scale_y),
                            resample=Image.Resampling.BICUBIC)
                    result.append(cells[key])
            return result

        sulk = bounce(rows('extra', layout['sulk'], [0, 1, 5, 6, 7] if original == 'renard' else range(8)))
        coffee = bounce(rows('base', [4]))
        variants = {
            'activity/keyboard': rows('extra', layout['a']),
            'activity/stretch': rows('extra', layout['b']),
            'activity/classic': bounce(rows('base', [0])),
            'thinking/thought': bounce(rows('base', [1])),
            # end/intro and end/console come from build-console-animations.js.
            'waiting/wave': bounce(rows('extra', layout['wave'])),
            'waiting/wave-classic': bounce(rows('base', [3])),
            'common/sulk': sulk,
            'thinking/problem': bounce(rows('base', [6])),
            'common/coffee': coffee,
            'common/paw-movement': rows('extra', layout['b']),
            'activity/book': bounce(rows('base', [5])),
        }
        if animal in ('ratel', 'renard'):
            variants['common/head-scratch'] = bounce(rows('base', [6]))
        for variant, frames in variants.items():
            # One chronological gesture per strip, stretched to a shared duration.
            # Hold existing drawings evenly rather than repeat a short gesture.
            frames = [frames[index * len(frames) // FRAME_COUNT]
                      for index in range(FRAME_COUNT)]
            path = OUTPUT / animal / f'{variant}.png'
            path.parent.mkdir(parents=True, exist_ok=True)
            strip = Image.new('RGBA', (SIZE * len(frames), SIZE))
            for index, image in enumerate(frames):
                strip.paste(image, (index * SIZE, 0))
            strip.save(path, optimize=True)
            count += 1
        print(f'{animal}: {len(variants)} strips, {len(cells)} aligned source drawings')
    print(f'Exported {count} strips')


if __name__ == '__main__':
    export()
