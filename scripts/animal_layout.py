"""Read the actual grid spacing of generated atlases, including empty margins."""
import numpy as np

def row_ranges(pixels, extras=False):
    height, width = pixels.shape[:2]
    if not extras:
        return [(round(row*height/7), round((row+1)*height/7)) for row in range(7)]
    active = (pixels[:, :, 3] > 128).sum(axis=1) > max(3, width*.003)
    bands, start = [], None
    for y, occupied in enumerate(active):
        if occupied and start is None:
            start = y
        if not occupied and start is not None:
            bands.append((start, y)); start = None
    if start is not None:
        bands.append((start, height))
    bands = [band for band in bands if band[1]-band[0] > height*.05]
    if len(bands) not in (4, 7, 8):
        raise ValueError(f'Unexpected generated row count: {len(bands)}')
    centers = np.array([(a+b)/2 for a,b in bands])
    pitch = float(np.median(np.diff(centers)))
    origin = max(0, float(np.median(centers-np.arange(len(bands))*pitch)-pitch/2))
    return [(round(origin+row*pitch), min(height, round(origin+(row+1)*pitch))) for row in range(len(bands))]
