# Digimon Sprite & Database Update Guide

This guide explains the workflow for adding new Digimon or modifying existing sprites and metadata in the application.

## Overview

The application uses an optimized "Atomic Update" architecture:
1.  **Binary Bundling:** All sprite frames and the `digimon_db.json` are packed into a single binary file (`public/sprites/bundle_v1.bin`).
2.  **Service Worker Caching:** On update, the browser makes **exactly one network call** to fetch the binary bundle and unpacks it into the local cache.
3.  **Dynamic Metadata:** The frontend fetches the Digimon list from the cache/bundle rather than importing it into the JavaScript, keeping the main app bundle small.

---

## Step-by-Step Workflow

### 1. Prepare Sprite Assets
- Create a folder: `public/sprites/spr_mon_<suffix>/`
- Add at least two PNG frames:
  - `spr_mon_<suffix>_0.png` (Idle Frame 1)
  - `spr_mon_<suffix>_1.png` (Idle Frame 2)
- *Note: Frame 0 and 1 are required for the idle animation logic.*

### 2. Update the Database
- Add the entry to `public/sprites/digimon_db.json`.
- Ensure the `suffix` matches your folder name.
- Example:
  ```json
  {
    "name": "Agumon",
    "sprite_folder": "spr_mon_agu",
    "type": "Vaccine",
    "suffix": "agu"
  }
  ```
- **Important:** Also copy this change to `src/utils/digimon_db.json` to keep the local source in sync.

### 3. Generate Sprite Offsets
The app needs to know where the "feet" of the Digimon are to prevent them from jumping during animation.
- Run the PowerShell script:
  ```powershell
  .\public\sprites\generate_offsets.ps1
  ```
- This updates `src/utils/spriteOffsets.json` with the bounding box and vertical "ground" coordinates for every sprite.

### 4. Re-bundle the Binary File
Pack the new images and the updated JSON database into the binary bundle:
- Run the bundling script:
  ```bash
  node scripts/bundle-sprites.js
  ```
- This updates `public/sprites/bundle_v1.bin`.

### 5. Trigger User Updates (Bump Version)
Existing users will only see the new Digimon if the Service Worker detects a version change.
- Open `public/sw.js`.
- Increment the `CACHE_NAME`:
  ```javascript
  const CACHE_NAME = 'sprites-v1.02' // Increment this
  ```
- This forces the browser to download the new bundle and update its local cache.

---

## Local Verification
You can verify the database state and sprite alignment without logging into the app by visiting:
**`http://localhost:3000/debug-db`** (Only accessible on localhost).

## Summary of Files
- **`public/sprites/`**: Raw images and source DB.
- **`public/sw.js`**: Controls the update version.
- **`scripts/bundle-sprites.js`**: The packing engine.
- **`src/utils/spriteOffsets.json`**: Auto-generated UI alignment data.
- **`public/sprites/bundle_v1.bin`**: The final production asset.
