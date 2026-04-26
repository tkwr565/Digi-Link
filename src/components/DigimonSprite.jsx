import { useState, useEffect, useMemo } from 'react'
import { getSpriteUrl } from '../utils/digimonUtils'
import styles from './DigimonSprite.module.css'
import spriteData from '../utils/spriteOffsets.json'

function computeFrameStyle(data, frameIndex) {
  if (!data) return {}

  const { w0, h0, y0, w1, h1, y1 } = data
  const maxW = Math.max(w0, w1)
  const maxH = Math.max(h0, h1)
  const baseSize = 16
  let scale = 1

  if (maxH > baseSize || maxW > baseSize) {
    const ratio = Math.max(maxW, maxH) / baseSize
    if (ratio > 1.5) scale = 1.5 / ratio
  }

  const w = frameIndex === 0 ? w0 : w1
  const h = frameIndex === 0 ? h0 : h1
  const y = frameIndex === 0 ? y0 : y1
  const pixelsBelow = h - y - 1
  const translateY = (pixelsBelow / h) * 100
  const widthRatio = w / maxW

  return {
    transform: `scale(${scale}) translateY(${translateY}%)`,
    width: `${widthRatio * 100}%`,
    height: 'auto',
    transformOrigin: 'bottom center'
  }
}

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

  const data = spriteData[suffix]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const style0 = useMemo(() => computeFrameStyle(data, 0), [suffix])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const style1 = useMemo(() => computeFrameStyle(data, 1), [suffix])

  return (
    <div className={`${styles.sprite} ${sizeClass}`}>
      {/* Both frames are always in the DOM so the browser loads and caches them once.
          Toggling display avoids changing src, which would cause repeat network requests. */}
      <img
        src={getSpriteUrl(suffix, 0)}
        alt=""
        className={styles.image}
        style={frame === 0 ? style0 : { ...style0, display: 'none' }}
      />
      <img
        src={getSpriteUrl(suffix, 1)}
        alt=""
        className={styles.image}
        style={frame === 1 ? style1 : { ...style1, display: 'none' }}
      />
    </div>
  )
}
