import { useState, useEffect } from 'react'
import DigimonSprite from './DigimonSprite'
import styles from './DigimonPicker.module.css'

export default function DigimonPicker({
  value,
  onChange,
  multiple = false,
  maxSelection = 3,
  label = "Select Digimon"
}) {
  const [digimonList, setDigimonList] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/sprites/digimon_db.json')
      .then(res => res.json())
      .then(data => {
        setDigimonList(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load Digimon data:', err)
        setLoading(false)
      })
  }, [])

  const filteredDigimon = digimonList.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = typeFilter === 'all' || d.type === typeFilter
    return matchesSearch && matchesType
  })

  // Debug: log unique types in filtered results
  useEffect(() => {
    const uniqueTypes = new Set(filteredDigimon.map(d => d.type))
  }, [typeFilter, filteredDigimon])

  const handleSelect = (digimon) => {
    if (multiple) {
      const currentSelection = value || []
      const alreadySelected = currentSelection.find(d => d.suffix === digimon.suffix)

      if (alreadySelected) {
        onChange(currentSelection.filter(d => d.suffix !== digimon.suffix))
      } else if (currentSelection.length < maxSelection) {
        onChange([...currentSelection, digimon])
      }
    } else {
      onChange(digimon)
    }
  }

  const isSelected = (digimon) => {
    if (multiple) {
      const currentSelection = value || []
      return currentSelection.some(d => d.suffix === digimon.suffix)
    }
    return value?.suffix === digimon.suffix
  }

  if (loading) {
    return <div className={styles.loading}>Loading Digimon...</div>
  }

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <h3 className={styles.label}>{label}</h3>
        <span className={styles.counter}>
          {multiple ? `${(value || []).length} / ${maxSelection} selected` : `${filteredDigimon.length} shown`}
        </span>
      </div>

      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className={styles.search}
        />

        <div className={styles.typeFilters}>
          {['all', 'Vaccine', 'Data', 'Virus', 'Free'].map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`${styles.typeFilter} ${typeFilter === type ? styles.active : ''}`}
              data-type={type.toLowerCase()}
            >
              {type === 'all' ? 'All' : type}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {filteredDigimon.map((digimon, index) => (
          <button
            key={`${digimon.suffix}-${index}`}
            onClick={() => handleSelect(digimon)}
            className={`${styles.card} ${isSelected(digimon) ? styles.selected : ''}`}
          >
            <DigimonSprite suffix={digimon.suffix} size="md" />
            <div className={styles.name}>{digimon.name}</div>
            <div className={`${styles.type} ${styles[`type-${digimon.type.toLowerCase()}`]}`}>
              {digimon.type}
            </div>
          </button>
        ))}
      </div>

      {filteredDigimon.length === 0 && (
        <div className={styles.empty}>
          No Digimon found matching your search.
        </div>
      )}
    </div>
  )
}
