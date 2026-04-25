import { ShoppingBag } from 'lucide-react'
import styles from './PoiMarkers.module.css'

function pickName(poi, lang) {
  if (lang === 'zh-HK') return poi.nameZh || poi.nameEn
  return poi.nameEn || poi.nameZh
}

// Custom SVG for the Hong Kong MTR logo
const MtrLogo = ({ size = 12 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 100 100" 
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M90,45H65.3c-1.3-11.4-6.4-21.3-15.3-29.3V12c0-1.1-0.9-2-2-2h-6c-1.1,0-2,0.9-2,2v3.7c-8.9,8-14,17.9-15.3,29.3H10 c-1.1,0-2,0.9-2,2v6c0,1.1,0.9,2,2,2h14.7c1.3,11.4,6.4,21.3,15.3,29.3V88c0,1.1,0.9,2,2,2h6c1.1,0,2-0.9,2-2v-3.7 c8.9-8,14-17.9,15.3-29.3H90c1.1,0,2-0.9,2-2v-6C92,45.9,91.1,45,90,45z M50,75.4c-7.3-6.5-11.5-14.7-12.6-24.4h25.1 C61.5,60.7,57.3,68.9,50,75.4z M37.4,49c1.1-9.7,5.3-17.9,12.6-24.4c7.3,6.5,11.5,14.7,12.6,24.4H37.4z" />
  </svg>
)

export function MtrMarker({ station, lang }) {
  const name = pickName(station, lang)
  return (
    <div className={styles.pin}>
      {name && <span className={`${styles.label} ${styles.mtrLabel}`}>{name}</span>}
      <div className={styles.mtrBadge}>
        <MtrLogo size={14} />
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
        <div className={styles.mallPulse} />
      </div>
    </div>
  )
}
