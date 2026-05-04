import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const spritesDir = path.resolve(__dirname, '../public/sprites')
const outputPath = path.resolve(__dirname, '../public/sprites/bundle_v1.bin')

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkDir(full))
    } else if (entry.name.endsWith('.png') || entry.name.endsWith('.json')) {
      files.push(full)
    }
  }
  return files
}

const allFiles = walkDir(spritesDir)
// Only frames 0 and 1 — the only frames DigimonSprite renders, PLUS the database
const spriteFiles = allFiles.filter(f => {
  const base = path.basename(f)
  return base.endsWith('_0.png') || base.endsWith('_1.png') || base === 'digimon_db.json'
})

console.log(`Bundling ${spriteFiles.length} sprites...`)

const parts = []

const countBuf = Buffer.alloc(4)
countBuf.writeUInt32LE(spriteFiles.length, 0)
parts.push(countBuf)

for (const file of spriteFiles) {
  const relativePath = path.relative(spritesDir, file).replace(/\\/g, '/')
  const pathBuf = Buffer.from(relativePath, 'utf8')
  const data = fs.readFileSync(file)

  const header = Buffer.alloc(2 + pathBuf.length + 4)
  header.writeUInt16LE(pathBuf.length, 0)
  pathBuf.copy(header, 2)
  header.writeUInt32LE(data.length, 2 + pathBuf.length)

  parts.push(header)
  parts.push(data)
}

const bundle = Buffer.concat(parts)
fs.writeFileSync(outputPath, bundle)
console.log(`Done: ${(bundle.length / 1024 / 1024).toFixed(2)} MB  (${spriteFiles.length} sprites → ${outputPath})`)
