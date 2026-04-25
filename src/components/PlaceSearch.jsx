import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './PlaceSearch.module.css'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

// HK bounding box: west, north, east, south
const HK_VIEWBOX = '113.83,22.56,114.44,22.15'

export default function PlaceSearch({ onSelect, className }) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

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
    if (!q || q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const lang = i18n.language === 'zh-HK' ? 'zh-HK,zh,en' : 'en,zh-HK,zh'
      const params = new URLSearchParams({
        format: 'json',
        q: q.trim(),
        viewbox: HK_VIEWBOX,
        bounded: '1',
        limit: '6',
        'accept-language': lang,
      })
      const res = await fetch(`${NOMINATIM}?${params}`)
      const data = await res.json()
      setResults(data)
      setOpen(data.length > 0)
    } catch {
      // Silently fail — map still usable without search
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

  const handleSelect = (result) => {
    // Show first two comma-parts as a tidy label
    const label = result.display_name.split(',').slice(0, 2).join(', ')
    setQuery(label)
    setOpen(false)
    onSelect({
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
    })
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
          type="text"
          value={query}
          onChange={handleChange}
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
          {results.map((r) => (
            <li
              key={r.place_id}
              className={styles.item}
              onMouseDown={() => handleSelect(r)}
            >
              <Search size={11} className={styles.itemIcon} />
              <span className={styles.itemText}>{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
