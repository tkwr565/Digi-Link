import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './PlaceSearch.module.css'

const PHOTON = 'https://photon.komoot.io/api/'
const HK_LAT = 22.3193
const HK_LNG = 114.1694

// Build a readable label from Photon feature properties
function featureLabel(props) {
  const parts = [
    props.name,
    props.district || props.county,
    props.city,
  ].filter(Boolean)
  // deduplicate adjacent identical parts
  const unique = parts.filter((v, i) => v !== parts[i - 1])
  return unique.join(', ') || props.name || ''
}

export default function PlaceSearch({ onSelect, className }) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  // Close dropdown on outside tap/click
  useEffect(() => {
    const close = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [])

  const search = useCallback(async (q) => {
    const trimmed = q?.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      // Photon supports 'en', 'de', 'fr' — fall back to 'en' for zh-HK
      const params = new URLSearchParams({
        q: trimmed,
        limit: '6',
        lat: String(HK_LAT),
        lon: String(HK_LNG),
        lang: 'en',
      })
      const res = await fetch(`${PHOTON}?${params}`)
      if (!res.ok) throw new Error(`Photon HTTP ${res.status}`)
      const json = await res.json()
      const features = json.features || []
      setResults(features)
      setOpen(features.length > 0)
    } catch (err) {
      console.error('PlaceSearch:', err)
      setResults([])
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }, [i18n.language])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 400)
  }

  // Enter key triggers immediate search (important for phone keyboards)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      search(query)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleSelect = (feature) => {
    const [lng, lat] = feature.geometry.coordinates
    const label = featureLabel(feature.properties)
    setQuery(label)
    setOpen(false)
    onSelect({ lat, lng, displayName: label })
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`${styles.container} ${className || ''}`}>
      <div className={styles.inputRow}>
        <Search size={15} className={styles.icon} />
        <input
          className={styles.input}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t('map.searchPlaceholder')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {loading && <Loader size={14} className={styles.loader} />}
        {query && !loading && (
          <button className={styles.clearBtn} onMouseDown={handleClear} tabIndex={-1}>
            <X size={13} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className={styles.dropdown}>
          {results.map((feature, i) => (
            <li
              key={feature.properties.osm_id ?? i}
              className={styles.item}
              onMouseDown={() => handleSelect(feature)}
            >
              <Search size={11} className={styles.itemIcon} />
              <span className={styles.itemText}>{featureLabel(feature.properties)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
