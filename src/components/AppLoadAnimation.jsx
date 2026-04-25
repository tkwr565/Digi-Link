import { useState, useEffect } from 'react'
import { loadDigimonDb } from '../utils/digimonUtils'
import DigimonSprite from './DigimonSprite'
import styles from './AppLoadAnimation.module.css'

export default function AppLoadAnimation() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)
  const [digimon, setDigimon] = useState(null)

  useEffect(() => {
    loadDigimonDb().then(db => {
      if (db.length > 0) {
        setDigimon(db[Math.floor(Math.random() * db.length)])
      }
    })

    const fadeTimer = setTimeout(() => setFading(true), 2000)
    const unmountTimer = setTimeout(() => {
      setVisible(false)
    }, 2500)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(unmountTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div className={`${styles.overlay} ${fading ? styles.fading : ''}`}>
      <div className={styles.scanline} />
      <div className={styles.content}>
        <span className={styles.loadingText}>Loading...</span>
        {digimon && (
          <>
            <DigimonSprite suffix={digimon.suffix} size="md" />
            <span className={styles.digimonName}>{digimon.name}</span>
          </>
        )}
      </div>
    </div>
  )
}
