"""
Generate a single sprite sheet PNG from all individual Digimon sprite files.

Layout:
  - 40 columns, 32x32px cells
  - Frame 0 for all 980 Digimon: rows 0-24   (cells 0-979)
  - Frame 1 for all 980 Digimon: rows 25-49  (cells 980-1959)
  - Each sprite is bottom-aligned + horizontally centred in its cell

Outputs:
  public/sprites/spritesheet.png      -- the sheet (served as static asset)
  src/utils/spritesheet_index.json    -- { suffix: index } bundled into JS
"""

import json, os, sys
from PIL import Image

CELL   = 32
COLS   = 40
ROWS_F = 25   # rows per frame half (ceil(980/40))

SPRITE_DIR  = 'public/sprites'
SHEET_OUT   = 'public/sprites/spritesheet.png'
INDEX_OUT   = 'src/utils/spritesheet_index.json'
DB_PATH     = 'public/sprites/digimon_db.json'

def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    with open(DB_PATH) as f:
        db = json.load(f)
    suffixes = [d['suffix'] for d in db]
    N = len(suffixes)
    print(f'Digimon count: {N}')

    total_rows = ROWS_F * 2
    sheet_w = COLS * CELL
    sheet_h = total_rows * CELL
    sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))

    index_map = {}
    missing = []

    for idx, suffix in enumerate(suffixes):
        index_map[suffix] = idx

        for frame in [0, 1]:
            path = os.path.join(SPRITE_DIR, f'spr_mon_{suffix}',
                                f'spr_mon_{suffix}_{frame}.png')
            if not os.path.exists(path):
                missing.append(f'{suffix}_f{frame}')
                continue

            sprite = Image.open(path).convert('RGBA')
            sw, sh = sprite.size

            # Cell position: frame 0 in top half, frame 1 in bottom half
            cell_idx = idx if frame == 0 else N + idx
            col = cell_idx % COLS
            # Use the half-block row offset so frames don't share rows
            base_row = 0 if frame == 0 else ROWS_F
            row = base_row + idx // COLS

            px = col * CELL + (CELL - sw) // 2   # horizontally centred
            py = row * CELL + (CELL - sh)          # bottom-aligned

            sheet.paste(sprite, (px, py), sprite)

    sheet.save(SHEET_OUT, optimize=True)
    size_kb = os.path.getsize(SHEET_OUT) // 1024
    print(f'Saved {SHEET_OUT}  ({sheet_w}x{sheet_h}px, {size_kb} KB)')

    with open(INDEX_OUT, 'w') as f:
        json.dump(index_map, f, separators=(',', ':'))
    print(f'Saved {INDEX_OUT}  ({len(index_map)} entries)')

    if missing:
        print(f'Warning: {len(missing)} sprites not found: {missing[:5]}...')

if __name__ == '__main__':
    main()
