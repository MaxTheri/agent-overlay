"""Render the menu-bar fox vector as 18px and Retina 36px template icons."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
head = [(2.5, 2), (9, 5), (15, 5), (21.5, 2), (20, 13), (12, 22), (4, 13)]
holes = [
    [(4, 4), (8, 6), (5, 10)],
    [(20, 4), (16, 6), (19, 10)],
    [(5, 12), (10, 13), (12, 17), (14, 13), (19, 12), (16, 17), (12, 21), (8, 17)],
]
nose = [(10.5, 16.5), (13.5, 16.5), (12, 19)]
eyes = [(7, 9, 9, 10.5), (15, 9, 17, 10.5)]

def polygon(points, fill):
    return '<polygon points="' + ' '.join(f'{x},{y}' for x, y in points) + f'" fill="{fill}"/>'

svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><mask id="fox">'
svg += polygon(head, 'white')
svg += ''.join(polygon(points, 'black') for points in holes)
svg += ''.join(f'<ellipse cx="{(x0+x1)/2}" cy="{(y0+y1)/2}" rx="{(x1-x0)/2}" ry="{(y1-y0)/2}" fill="black"/>' for x0,y0,x1,y1 in eyes)
svg += polygon(nose, 'white') + '</mask></defs><rect width="24" height="24" fill="black" mask="url(#fox)"/></svg>\n'
(root / 'media/tray-fox.svg').write_text(svg)

scale = 16
mask = Image.new('L', (24 * scale, 24 * scale))
draw = ImageDraw.Draw(mask)
draw.polygon([(x*scale,y*scale) for x,y in head], fill=255)
for points in holes:
    draw.polygon([(x*scale,y*scale) for x,y in points], fill=0)
for box in eyes:
    draw.ellipse(tuple(value*scale for value in box), fill=0)
draw.polygon([(x*scale,y*scale) for x,y in nose], fill=255)
for size, filename in [(18, 'tray.png'), (36, 'tray@2x.png')]:
    image = Image.new('RGBA', (size, size))
    image.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    image.save(root / 'media' / filename, optimize=True)
print('Fox menu-bar icons generated: 18px and 36px')
