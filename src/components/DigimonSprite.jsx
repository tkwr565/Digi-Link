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
    
    // Use scale 1 for all Digimon as requested to keep them uniform.
    // The browser will scale the image to fit the container (32px, 48px, or 64px) via CSS.
    const scale = 1

    const currentW = frame === 0 ? w0 : w1
    const currentH = frame === 0 ? h0 : h1
    const currentY = frame === 0 ? y0 : y1

    // Calculate vertical shift to ground the lowest pixel
    // currentFullH is the original canvas height
    const currentFullH = frame === 0 ? (data.fh0 || h0) : (data.fh1 || h1)
    const translateY = ((currentFullH - currentY - 1) / currentFullH) * 100

    // Adjust width relative to the "max" width to prevent horizontal jumping
    const maxW = Math.max(w0, w1)
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
