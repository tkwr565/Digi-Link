import { useState, useEffect, useMemo } from 'react'
import { getSpriteUrl } from '../utils/digimonUtils'
import styles from './DigimonSprite.module.css'
import spriteData from '../utils/spriteOffsets.json'

export default function DigimonSprite({ suffix, size = 'md' }) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(prev => prev === 0 ? 1 : 0)
    }, 500)

    return () => clearInterval(interval)
  }, [])

  const sizeClass = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
  }[size] || styles.sizeMd

  // Calculate normalization styles
  const spriteStyle = useMemo(() => {
    const data = spriteData[suffix]
    if (!data) return {}

    const { w0, h0, y0, w1, h1, y1 } = data
    
    // Determine the "max" dimensions for this Digimon to prevent jumping
    const maxW = Math.max(w0, w1)
    const maxH = Math.max(h0, h1)
    
    // Normalize scaling: 
    // Standard sprites are ~16px. Bosses are ~32px.
    // We want bosses to look bigger, but not overflow too much.
    // If we assume the container size (32, 48, 64) corresponds to a 16px "logical" sprite:
    const baseSize = 16
    let scale = 1

    // If it's a boss (larger than 16), we scale it so it fits but still looks bigger
    if (maxH > baseSize || maxW > baseSize) {
        // Limit max size to 1.5x of standard if it's very large
        const ratio = Math.max(maxW, maxH) / baseSize
        if (ratio > 1.5) {
            scale = 1.5 / ratio
        }
    }

    const currentW = frame === 0 ? w0 : w1
    const currentH = frame === 0 ? h0 : h1
    const currentY = frame === 0 ? y0 : y1

    // Calculate vertical shift to ground the lowest pixel
    // pixelsBelow is how many transparent pixels are below the lowest color pixel
    const pixelsBelow = currentH - currentY - 1
    const translateY = (pixelsBelow / currentH) * 100

    // Adjust width relative to the "max" width to prevent horizontal jumping
    const widthRatio = currentW / maxW

    return {
      transform: `scale(${scale}) translateY(${translateY}%)`,
      width: `${widthRatio * 100}%`,
      height: 'auto',
      transformOrigin: 'bottom center'
    }
  }, [suffix, frame])

  return (
    <div className={`${styles.sprite} ${sizeClass}`}>
      <img
        src={getSpriteUrl(suffix, frame)}
        alt=""
        className={styles.image}
        style={spriteStyle}
      />
    </div>
  )
}
