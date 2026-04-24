import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import styles from './DeviceChecklist.module.css'

export default function DeviceChecklist({ value = [], onChange, label = "Select Devices" }) {
  const [categories, setCategories] = useState([])
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/DIGIVICE_LIST.json')
      .then(res => res.json())
      .then(data => {
        setCategories(data)
        setExpandedCategories(new Set([data[0]?.category]))
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load device data:', err)
        setLoading(false)
      })
  }, [])

  const toggleCategory = (categoryName) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName)
    } else {
      newExpanded.add(categoryName)
    }
    setExpandedCategories(newExpanded)
  }

  const handleDeviceToggle = (deviceId) => {
    const currentSelection = value || []
    if (currentSelection.includes(deviceId)) {
      onChange(currentSelection.filter(id => id !== deviceId))
    } else {
      onChange([...currentSelection, deviceId])
    }
  }

  const handleVersionToggle = (deviceId, version) => {
    const versionId = `${deviceId}:${version}`
    const currentSelection = value || []
    if (currentSelection.includes(versionId)) {
      onChange(currentSelection.filter(id => id !== versionId))
    } else {
      onChange([...currentSelection, versionId])
    }
  }

  const isDeviceSelected = (device) => {
    const currentSelection = value || []
    if (device.versions && device.versions.length > 1) {
      return device.versions.every(v => currentSelection.includes(`${device.id}:${v}`))
    }
    return currentSelection.includes(device.id)
  }

  const isVersionSelected = (deviceId, version) => {
    const currentSelection = value || []
    return currentSelection.includes(`${deviceId}:${version}`)
  }

  if (loading) {
    return <div className={styles.loading}>Loading devices...</div>
  }

  return (
    <div className={styles.checklist}>
      <div className={styles.header}>
        <h3 className={styles.label}>{label}</h3>
        <span className={styles.counter}>{value.length} selected</span>
      </div>

      <div className={styles.categories}>
        {categories.map(category => (
          <div key={category.category} className={styles.category}>
            <button
              onClick={() => toggleCategory(category.category)}
              className={styles.categoryHeader}
            >
              {expandedCategories.has(category.category) ? (
                <ChevronDown size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
              <span className={styles.categoryName}>{category.category}</span>
              <span className={styles.categoryMeta}>
                {category.display} • {category.devices.length} devices
              </span>
            </button>

            {expandedCategories.has(category.category) && (
              <div className={styles.devices}>
                {category.devices.map(device => (
                  <div key={device.id} className={styles.device}>
                    {device.versions && device.versions.length > 1 ? (
                      <div className={styles.deviceWithVersions}>
                        <div className={styles.deviceMain}>
                          <span className={styles.deviceName}>
                            {device.name}
                            {device.year && <span className={styles.year}> ({device.year})</span>}
                          </span>
                          {device.notes && <span className={styles.notes}>{device.notes}</span>}
                        </div>
                        <div className={styles.versions}>
                          {device.versions.map(version => (
                            <label key={version} className={styles.versionLabel}>
                              <input
                                type="checkbox"
                                checked={isVersionSelected(device.id, version)}
                                onChange={() => handleVersionToggle(device.id, version)}
                                className={styles.checkbox}
                              />
                              <span className={styles.versionText}>{version}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <label className={styles.deviceLabel}>
                        <input
                          type="checkbox"
                          checked={isDeviceSelected(device)}
                          onChange={() => handleDeviceToggle(device.id)}
                          className={styles.checkbox}
                        />
                        <span className={styles.deviceContent}>
                          <span className={styles.deviceName}>
                            {device.name}
                            {device.year && <span className={styles.year}> ({device.year})</span>}
                          </span>
                          {device.notes && <span className={styles.notes}>{device.notes}</span>}
                        </span>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
