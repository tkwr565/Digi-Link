import { ShoppingBag } from 'lucide-react'
import styles from './PoiMarkers.module.css'

function pickName(poi, lang) {
  if (lang === 'zh-HK') return poi.nameZh || poi.nameEn
  return poi.nameEn || poi.nameZh
}

export function MtrMarker({ station, lang }) {
  const name = pickName(station, lang)
  return (
    <div className={styles.pin}>
      {name && <span className={`${styles.label} ${styles.mtrLabel}`}>{name}</span>}
      <div className={styles.mtrBadge}>
        <img src="/map/mtr_label.png" alt="MTR" className={styles.mtrIcon} />
      </div>
    </div>
  )
}

export function MallMarker({ mall, lang }) {
  const name = pickName(mall, lang)
  return (
    <div className={styles.pin}>
      {name && <span className={`${styles.label} ${styles.mallLabel}`}>{name}</span>}
      <div className={styles.mallBadge}>
        <div className={styles.mallIconInner}>
          <ShoppingBag size={12} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  )
}
