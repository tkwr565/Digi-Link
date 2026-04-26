import { useState, useEffect } from 'react'
import spriteIndex from '../utils/spritesheet_index.json'
import styles from './DigimonSprite.module.css'

const CELL    = 32
const COLS    = 40
const ROWS_F  = 25       // rows per frame block in the sheet
const SHEET_W = 1280
const SHEET_H = 1600

const SIZE_PX = { sm: 32, md: 48, lg: 64 }

function sheetStyle(index, frame, size) {
  const col  = index % COLS
  const row  = (frame === 0 ? 0 : ROWS_F) + Math.floor(index / COLS)
  const scale = size / CELL
  return {
    backgroundImage:    'url(/sprites/spritesheet.png)',
    backgroundRepeat:   'no-repeat',
    backgroundSize:     `${SHEET_W * scale}px ${SHEET_H * scale}px`,
    backgroundPosition: `-${col * size}px -${row * size}px`,
    imageRendering:     'pixelated',
  }
}

export default function DigimonSprite({ suffix, size = 'md' }) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setFrame(f => f === 0 ? 1 : 0), 500)
    return () => clearInterval(id)
  }, [])

  const index = spriteIndex[suffix]
  const px    = SIZE_PX[size] ?? SIZE_PX.md

  const sizeClass = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
  }[size] ?? styles.sizeMd

  if (index === undefined) return <div className={`${styles.sprite} ${sizeClass}`} />

  return (
    <div
      className={`${styles.sprite} ${sizeClass}`}
      style={sheetStyle(index, frame, px)}
    />
  )
}
