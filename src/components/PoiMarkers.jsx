import { Train, ShoppingBag } from 'lucide-react'
import styles from './PoiMarkers.module.css'

function pickName(poi, lang) {
  if (lang === 'zh-HK') return poi.nameZh || poi.nameEn
  return poi.nameEn || poi.nameZh
}

export function MtrMarker({ station }) {
  // User requested NO Chinese translation for MTR stations, so we default to nameEn
  const name = station.nameEn || station.nameZh
  return (
    <div className={styles.pin}>
      {name && <span className={`${styles.label} ${styles.mtrLabel}`}>{name}</span>}
      <div className={styles.mtrBadge}>
        <Train size={12} strokeWidth={2.5} />
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
        <ShoppingBag size={12} strokeWidth={2.5} />
      </div>
    </div>
  )
}
