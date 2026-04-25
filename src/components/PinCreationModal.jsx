import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, MapPin } from 'lucide-react'
import Map, { Marker } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { loadDeviceList, getDeviceFullDisplay, loadDigimonDb, getDigimonName } from '../utils/digimonUtils'
import { getDistrictKey, DISTRICTS } from '../utils/hkDistrict'
import DigimonSprite from './DigimonSprite'
import { MtrMarker, MallMarker } from './PoiMarkers'
import { useTranslation } from 'react-i18next'
import styles from './PinCreationModal.module.css'

const CARTO_DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

// Coordinate snapping function for privacy (~100m grid)
const snapCoordinate = (coord) => Math.round(coord * 1000) / 1000

// Time mode options
const TIME_MODES = {
  NOW: 'now',
  TODAY: 'today',
  THIS_WEEK: 'this_week',
  RECURRING: 'recurring'
}

// Duration options for "Now" mode (in minutes)
const NOW_DURATIONS = [
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
  { label: '8 hours', minutes: 480 },
]

// Days of week for recurring pins
const DAYS_OF_WEEK = [
  { value: 'MON', label: 'Monday' },
  { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' },
  { value: 'SAT', label: 'Saturday' },
  { value: 'SUN', label: 'Sunday' },
]

export default function PinCreationModal({ isOpen, onClose, onSuccess, userLocation, showMtr = false, showMalls = false }) {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Form data
  const [location, setLocation] = useState(null)
  const [isPickingLocation, setIsPickingLocation] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')

  // Time window data
  const [timeMode, setTimeMode] = useState(TIME_MODES.NOW)
  const [nowDuration, setNowDuration] = useState(60) // Default 1 hour
  const [todayStartTime, setTodayStartTime] = useState('')
  const [todayEndTime, setTodayEndTime] = useState('')
  const [weekDate, setWeekDate] = useState('') // actual date in YYYY-MM-DD format
  const [weekStartTime, setWeekStartTime] = useState('')
  const [weekEndTime, setWeekEndTime] = useState('')
  const [recurringDays, setRecurringDays] = useState([])
  const [recurringStartTime, setRecurringStartTime] = useState('09:00')
  const [recurringEndTime, setRecurringEndTime] = useState('17:00')

  // Generate next 6 days (starting from tomorrow)
  const getNextSixDays = () => {
    const days = []
    const today = new Date()
    const locale = i18n.language === 'zh-HK' ? 'zh-HK' : 'en-US'

    for (let i = 1; i <= 6; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)

      const dayName = date.toLocaleDateString(locale, { weekday: 'short' })
      const dateStr = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })

      days.push({
        date: date,
        value: date.toISOString().split('T')[0], // YYYY-MM-DD format
        label: `${dayName}, ${dateStr}` // e.g., "Tue, Apr 22"
      })
    }

    return days
  }

  const nextSixDays = getNextSixDays()

  // User data
  const [userDevices, setUserDevices] = useState([])
  const [selectedDevices, setSelectedDevices] = useState([]) // Track selected devices
  const [selectedPartners, setSelectedPartners] = useState([]) // Track selected partners
  const [userProfile, setUserProfile] = useState(null)
  const [deviceList, setDeviceList] = useState(null) // Device list for name mapping
  const [digimonDb, setDigimonDb] = useState(null) // Digimon database for name mapping

  // POI states for mini-map
  const [mtrPois, setMtrPois] = useState([])
  const [mallPois, setMallPois] = useState([])
  const [isFetchingPois, setIsFetchingPois] = useState(false)
  const lastPoiFetchRef = useRef(0)

  // Map state for location picker
  const [mapViewState, setMapViewState] = useState({
    longitude: 114.1694,
    latitude: 22.3193,
    zoom: 15
  })
  const miniMapRef = useRef()

  const handleDistrictJump = (key) => {
    if (!key) return
    const district = DISTRICTS.find(d => d.key === key)
    if (!district) return
    setMapViewState({ longitude: district.lng, latitude: district.lat, zoom: 13 })
    if (miniMapRef.current) {
      miniMapRef.current.flyTo({ center: [district.lng, district.lat], zoom: 13, duration: 800 })
    }
  }

  // Load user data on mount
  useEffect(() => {
    if (isOpen && user) {
      loadUserData()
      // Load device list and Digimon database for name mapping
      loadDeviceList().then(setDeviceList)
      loadDigimonDb().then(setDigimonDb)
      // Set initial location from GPS
      if (userLocation) {
        setLocation({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude
        })
        setMapViewState({
          longitude: userLocation.longitude,
          latitude: userLocation.latitude,
          zoom: 15
        })
      }
    }
  }, [isOpen, user, userLocation])

  const loadUserData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError
      setUserProfile(profile)

      // Load active devices
      const { data: devices, error: devicesError } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (devicesError) throw devicesError
      setUserDevices(devices)

      // Validation: must have at least one active device
      if (!devices || devices.length === 0) {
        setError(t('createPin.noActiveDevicesError'))
        return
      }

    } catch (err) {
      console.error('Error loading user data:', err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  // Fetch MTR stations + shopping malls from Overpass for the mini-map viewport.
  const loadPois = async () => {
    if (!miniMapRef.current || isFetchingPois) return
    const map = miniMapRef.current.getMap()
    const zoom = map.getZoom()

    // If both toggles are off, clear and exit
    if (!showMtr && !showMalls) {
      setMtrPois([])
      setMallPois([])
      return
    }

    if (zoom < 11) {
      setMtrPois([])
      setMallPois([])
      return
    }

    const now = Date.now()
    if (now - lastPoiFetchRef.current < 5000) return
    
    setIsFetchingPois(true)
    lastPoiFetchRef.current = now

    const b = map.getBounds()
    const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`
    
    let queryParts = ''
    if (showMtr) queryParts += `node["railway"="station"](${bbox});way["railway"="station"](${bbox});`
    if (showMalls) queryParts += `node["shop"~"mall|shopping_centre"](${bbox});way["shop"~"mall|shopping_centre"](${bbox});relation["shop"~"mall|shopping_centre"](${bbox});`

    if (!queryParts) {
      setIsFetchingPois(false)
      return
    }

    const query = `[out:json][timeout:25];(${queryParts});out center tags;`

    try {
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('Overpass error')
      const { elements } = await res.json()

      const mtr = []
      const malls = []
      const seen = new Set()

      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        if (lat == null || lng == null) continue

        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
        if (seen.has(key)) continue
        seen.add(key)

        const tags = el.tags || {}
        const nameEn = tags['name:en'] || tags.name || ''
        const nameZh = tags['name:zh'] || tags['name:zh-Hant'] || tags.name || ''

        if (tags.railway === 'station') {
          mtr.push({ lat, lng, nameEn, nameZh })
        } else if (tags.shop === 'mall' || tags.shop === 'shopping_centre') {
          malls.push({ lat, lng, nameEn, nameZh })
        }
      }

      setMtrPois(mtr)
      setMallPois(malls)
    } catch (err) {
      console.error('Mini-map POI fetch error:', err)
    } finally {
      setIsFetchingPois(false)
    }
  }

  // Trigger POI fetch when modal opens or settings change
  useEffect(() => {
    if (isOpen && step === 1) {
      // Delay slightly to ensure map is mounted and bounds are available
      const timer = setTimeout(loadPois, 500)
      return () => clearTimeout(timer)
    }
  }, [isOpen, step, showMtr, showMalls])

  const handleNext = () => {
    // Validation for each step
    if (step === 1 && !location) {
      setError(t('createPin.confirmLocationError'))
      return
    }
    if (step === 2) {
      if (timeMode === TIME_MODES.TODAY) {
        if (!todayStartTime || !todayEndTime) {
          setError(t('createPin.setTodayTimesError'))
          return
        }

        // Check if end time is after start time
        if (todayEndTime <= todayStartTime) {
          setError(t('createPin.endTimeAfterStartError'))
          return
        }

        // Check if start time is not in the past
        const now = new Date()
        const today = new Date()
        const [startHour, startMin] = todayStartTime.split(':').map(Number)
        const startDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin)

        if (startDateTime < now) {
          setError(t('createPin.startTimePastError'))
          return
        }
      }

      if (timeMode === TIME_MODES.THIS_WEEK) {
        if (!weekDate || !weekStartTime || !weekEndTime) {
          setError(t('createPin.selectDateTimesError'))
          return
        }

        // Check if end time is after start time
        if (weekEndTime <= weekStartTime) {
          setError(t('createPin.endTimeAfterStartError'))
          return
        }
      }

      if (timeMode === TIME_MODES.RECURRING) {
        if (recurringDays.length === 0 || !recurringStartTime || !recurringEndTime) {
          setError(t('createPin.selectRecurringError'))
          return
        }

        // Check if end time is after start time
        if (recurringEndTime <= recurringStartTime) {
          setError(t('createPin.endTimeAfterStartError'))
          return
        }
      }
    }
    // Step 3: validate device selection
    if (step === 3 && selectedDevices.length === 0) {
      setError(t('createPin.selectDeviceError'))
      return
    }
    // Step 4: validate partner selection
    if (step === 4 && selectedPartners.length === 0) {
      setError(t('createPin.selectPartnerError'))
      return
    }

    setError(null)
    setStep(step + 1)
  }

  const handleBack = () => {
    setError(null)
    setStep(step - 1)
  }

  const handleMapClick = (event) => {
    if (isPickingLocation) {
      setLocation({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng
      })
    }
  }

  const toggleRecurringDay = (day) => {
    setRecurringDays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day)
      } else {
        return [...prev, day]
      }
    })
  }

  const toggleDeviceSelection = (device) => {
    setSelectedDevices(prev => {
      const isSelected = prev.find(d => d.id === device.id)
      if (isSelected) {
        return prev.filter(d => d.id !== device.id)
      } else {
        return [...prev, device]
      }
    })
  }

  const togglePartnerSelection = (partner) => {
    setSelectedPartners(prev => {
      const isSelected = prev.includes(partner)
      if (isSelected) {
        return prev.filter(p => p !== partner)
      } else {
        return [...prev, partner]
      }
    })
  }

  const resetForm = () => {
    setStep(1)
    setLocation(null)
    setIsPickingLocation(false)
    setTimeMode(TIME_MODES.NOW)
    setNowDuration(60)
    setTitle('')
    setMessage('')
    setTodayStartTime('')
    setTodayEndTime('')
    setWeekDate('')
    setWeekStartTime('')
    setWeekEndTime('')
    setRecurringDays([])
    setRecurringStartTime('09:00')
    setRecurringEndTime('17:00')
    setSelectedDevices([])
    setSelectedPartners([])
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      setError(null)

      // Snap coordinates for privacy
      const snappedLat = snapCoordinate(location.latitude)
      const snappedLng = snapCoordinate(location.longitude)

      // Prepare device snapshot from SELECTED devices only
      const deviceSnapshot = selectedDevices.map(device => {
        if (device.version_label) {
          return `${device.digivice_id}:${device.version_label}`
        }
        return device.digivice_id
      })

      // Calculate time window based on mode
      let startTime, endTime, isRecurring = false, recurrenceRule = null

      const now = new Date()

      if (timeMode === TIME_MODES.NOW) {
        startTime = now
        endTime = new Date(now.getTime() + nowDuration * 60000)
      } else if (timeMode === TIME_MODES.TODAY) {
        const today = new Date()
        const [startHour, startMin] = todayStartTime.split(':')
        const [endHour, endMin] = todayEndTime.split(':')

        startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin)
        endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endHour, endMin)

        // If start time is in the past, start now
        if (startTime < now) {
          startTime = now
        }
      } else if (timeMode === TIME_MODES.THIS_WEEK) {
        // Use the selected date directly (YYYY-MM-DD format)
        const [year, month, day] = weekDate.split('-').map(Number)
        const [startHour, startMin] = weekStartTime.split(':').map(Number)
        const [endHour, endMin] = weekEndTime.split(':').map(Number)

        // Create dates using the selected date
        startTime = new Date(year, month - 1, day, startHour, startMin)
        endTime = new Date(year, month - 1, day, endHour, endMin)

        // If start time is in the past, start now
        if (startTime < now) {
          startTime = now
        }
      } else if (timeMode === TIME_MODES.RECURRING) {
        isRecurring = true
        startTime = now
        endTime = null // Recurring pins don't have an end_time
        recurrenceRule = {
          days: recurringDays,
          start: recurringStartTime,
          end: recurringEndTime
        }
      }

      // Insert pin
      const { data, error: insertError } = await supabase
        .from('pins')
        .insert({
          user_id: user.id,
          title: title || 'Pin',
          message: message || null,
          lat: snappedLat,
          lng: snappedLng,
          start_time: startTime.toISOString(),
          end_time: endTime ? endTime.toISOString() : null,
          is_recurring: isRecurring,
          recurrence_rule: recurrenceRule,
          active_partners_snapshot: selectedPartners,
          active_devices_snapshot: deviceSnapshot,
          is_active: true
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Success!
      resetForm()

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess()
      } else {
        // Fallback: just close the modal
        onClose()
      }

    } catch (err) {
      console.error('Error creating pin:', err)
      setError(t('createPin.createFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Don't render if no active devices
  if (userDevices.length === 0 && !loading) {
    return createPortal(
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <h2>{t('createPin.cannotCreate')}</h2>
            <button onClick={handleClose} className={styles.closeButton}>
              <X size={24} />
            </button>
          </div>
          <div className={styles.content}>
            <p className={styles.errorText}>
              {t('createPin.noActiveDevicesError')}
            </p>
            <button onClick={handleClose} className="btn-primary">
              {t('createPin.goToProfile')}
            </button>
          </div>
        </div>

      </div>,
      document.body
    )
  }

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2>{t('createPin.title')}</h2>
          <button onClick={handleClose} className={styles.closeButton}>
            <X size={24} />
          </button>
        </div>

        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          {[1, 2, 3, 4, 5].map((s) => (
            <React.Fragment key={s}>
              <div className={`${styles.step} ${step >= s ? styles.stepActive : ''}`}>{s}</div>
              {s < 5 && <div className={styles.stepLine} />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className={styles.content}>
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* Step 1: Location */}
          {step === 1 && (
            <div className={styles.stepContent}>
              <h3>{t('createPin.stepLocation')}</h3>
              <p className={styles.stepDescription}>
                {t('createPin.stepLocationDesc')}
              </p>

              {/* District jump — pan minimap to a district */}
              <select
                className={styles.districtJump}
                value=""
                onChange={(e) => handleDistrictJump(e.target.value)}
              >
                <option value="">{t('createPin.jumpToDistrict')}</option>
                {DISTRICTS.map(d => (
                  <option key={d.key} value={d.key}>{t(`districts.${d.key}`)}</option>
                ))}
              </select>

              {/* Map for location picking */}
              <div className={styles.mapContainer}>
                <Map
                  ref={miniMapRef}
                  {...mapViewState}
                  onMove={(evt) => setMapViewState(evt.viewState)}
                  onIdle={loadPois}
                  onClick={handleMapClick}
                  mapStyle={CARTO_DARK_MATTER}
                  style={{ width: '100%', height: '250px', borderRadius: '8px' }}
                >
                  {location && (
                    <Marker
                      longitude={location.longitude}
                      latitude={location.latitude}
                      anchor="center"
                    >
                      <MapPin size={32} color="#00d4ff" fill="#00d4ff" />
                    </Marker>
                  )}

                  {/* MTR station markers */}
                  {showMtr && mtrPois.map((station, i) => (
                    <Marker
                      key={`mtr-${i}`}
                      longitude={station.lng}
                      latitude={station.lat}
                      anchor="bottom"
                    >
                      <MtrMarker station={station} lang={i18n.language} />
                    </Marker>
                  ))}

                  {/* Shopping mall markers */}
                  {showMalls && mallPois.map((mall, i) => (
                    <Marker
                      key={`mall-${i}`}
                      longitude={mall.lng}
                      latitude={mall.lat}
                      anchor="bottom"
                    >
                      <MallMarker mall={mall} lang={i18n.language} />
                    </Marker>
                  ))}
                </Map>
              </div>

              <div className={styles.locationButtons}>
                <button
                  onClick={() => {
                    if (userLocation) {
                      setLocation({
                        latitude: userLocation.latitude,
                        longitude: userLocation.longitude
                      })
                      setMapViewState({
                        longitude: userLocation.longitude,
                        latitude: userLocation.latitude,
                        zoom: 15
                      })
                    }
                  }}
                  className="btn-secondary"
                >
                  {t('createPin.useCurrentLocation')}
                </button>
                <button
                  onClick={() => setIsPickingLocation(!isPickingLocation)}
                  className={isPickingLocation ? 'btn-primary' : 'btn-secondary'}
                >
                  {isPickingLocation ? t('createPin.tapMapToPlace') : t('createPin.pickLocationOnMap')}
                </button>
              </div>

              {location && (() => {
                const snLat = snapCoordinate(location.latitude)
                const snLng = snapCoordinate(location.longitude)
                const districtKey = getDistrictKey(snLat, snLng)
                return (
                  <div className={styles.locationDisplay}>
                    <span className="section-label">{t('createPin.selectedLocation')}</span>
                    <span className="mono">
                      {snLat}, {snLng}
                    </span>
                    {districtKey && (
                      <span className={styles.locationDistrict}>
                        {t(`districts.${districtKey}`)}
                      </span>
                    )}
                  </div>
                )
              })()}

              <div className={styles.optionalFields}>
                <label className="section-label">{t('createPin.pinTitleLabel')}</label>
                <input
                  type="text"
                  placeholder={t('createPin.pinTitlePlaceholder')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />

                <label className="section-label" style={{ marginTop: '1rem' }}>
                  {t('createPin.messageLabel')}
                </label>
                <textarea
                  placeholder={t('createPin.messagePlaceholder')}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 2: Time Window */}
          {step === 2 && (
            <div className={styles.stepContent}>
              <h3>{t('createPin.stepTime')}</h3>
              <p className={styles.stepDescription}>
                {t('createPin.stepTimeDesc')}
              </p>

              {/* Time mode selection */}
              <div className={styles.timeModeButtons}>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.NOW ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.NOW)}
                >
                  {t('createPin.modeNow')}
                </button>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.TODAY ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.TODAY)}
                >
                  {t('createPin.modeToday')}
                </button>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.THIS_WEEK ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.THIS_WEEK)}
                >
                  {t('createPin.modeThisWeek')}
                </button>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.RECURRING ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.RECURRING)}
                >
                  {t('createPin.modeRecurring')}
                </button>
              </div>

              {/* Now mode */}
              {timeMode === TIME_MODES.NOW && (
                <div className={styles.timeModeContent}>
                  <label className="section-label">{t('createPin.durationLabel')}</label>
                  <div className={styles.timeOptions}>
                    {NOW_DURATIONS.map((option) => (
                      <button
                        key={option.minutes}
                        className={`${styles.timeOption} ${
                          nowDuration === option.minutes ? styles.timeOptionSelected : ''
                        }`}
                        onClick={() => setNowDuration(option.minutes)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.timePreview}>
                    <span className="section-label">{t('createPin.pinWillExpire')}</span>
                    <span className="mono">
                      {new Date(Date.now() + nowDuration * 60000).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Today mode */}
              {timeMode === TIME_MODES.TODAY && (
                <div className={styles.timeModeContent}>
                  <div className={styles.timeInputRow}>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">{t('createPin.startTime')}</label>
                      <input
                        type="time"
                        value={todayStartTime}
                        onChange={(e) => setTodayStartTime(e.target.value)}
                      />
                    </div>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">{t('createPin.endTime')}</label>
                      <input
                        type="time"
                        value={todayEndTime}
                        onChange={(e) => setTodayEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* This Week mode */}
              {timeMode === TIME_MODES.THIS_WEEK && (
                <div className={styles.timeModeContent}>
                  <div className={styles.timeInputGroup}>
                    <label className="section-label">{t('createPin.selectDate')}</label>
                    <select value={weekDate} onChange={(e) => setWeekDate(e.target.value)}>
                      <option value="">{t('createPin.selectDatePlaceholder')}</option>
                      {nextSixDays.map(day => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.timeInputRow}>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">{t('createPin.startTime')}</label>
                      <input
                        type="time"
                        value={weekStartTime}
                        onChange={(e) => setWeekStartTime(e.target.value)}
                      />
                    </div>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">{t('createPin.endTime')}</label>
                      <input
                        type="time"
                        value={weekEndTime}
                        onChange={(e) => setWeekEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Recurring mode */}
              {timeMode === TIME_MODES.RECURRING && (
                <div className={styles.timeModeContent}>
                  <label className="section-label">{t('createPin.activeDays')}</label>
                  <div className={styles.daySelector}>
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.value}
                        className={`${styles.dayButton} ${
                          recurringDays.includes(day.value) ? styles.dayButtonActive : ''
                        }`}
                        onClick={() => toggleRecurringDay(day.value)}
                      >
                        {day.label.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div className={styles.timeInputRow}>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">{t('createPin.startTime')}</label>
                      <input
                        type="time"
                        value={recurringStartTime}
                        onChange={(e) => setRecurringStartTime(e.target.value)}
                      />
                    </div>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">{t('createPin.endTime')}</label>
                      <input
                        type="time"
                        value={recurringEndTime}
                        onChange={(e) => setRecurringEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Device Selection */}
          {step === 3 && (
            <div className={styles.stepContent}>
              <h3>{t('createPin.stepDevices')}</h3>
              <p className={styles.stepDescription}>
                {t('createPin.stepDevicesDesc')}
              </p>

              <div className={styles.deviceList}>
                {userDevices.map((device) => {
                  const isSelected = !!selectedDevices.find(d => d.id === device.id)
                  return (
                    <button
                      key={device.id}
                      className={`${styles.deviceItem} ${isSelected ? styles.deviceItemSelected : ''}`}
                      onClick={() => toggleDeviceSelection(device)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className={styles.deviceCheckbox}
                      />
                      <div className={styles.deviceName}>
                        {getDeviceFullDisplay(device.digivice_id, device.version_label, deviceList)}
                      </div>
                    </button>
                  )
                })}
              </div>

              <p className={styles.deviceNote}>
                {t('createPin.selectedCount', { count: selectedDevices.length })} {t(selectedDevices.length === 1 ? 'createPin.device_one' : 'createPin.device_other')}
              </p>
            </div>
          )}

          {/* Step 4: Partner Selection */}
          {step === 4 && (
            <div className={styles.stepContent}>
              <h3>{t('createPin.stepPartners')}</h3>
              <p className={styles.stepDescription}>
                {t('createPin.stepPartnersDesc')}
              </p>

              <div className={styles.deviceList}>
                {userProfile?.active_partners?.map((partner, index) => {
                  const isSelected = selectedPartners.includes(partner)
                  return (
                    <button
                      key={index}
                      className={`${styles.deviceItem} ${isSelected ? styles.deviceItemSelected : ''}`}
                      onClick={() => togglePartnerSelection(partner)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className={styles.deviceCheckbox}
                      />
                      <DigimonSprite suffix={partner} size="sm" />
                      <div className={styles.deviceName}>
                        {getDigimonName(partner, digimonDb)}
                      </div>
                    </button>
                  )
                })}
              </div>

              <p className={styles.deviceNote}>
                {t('createPin.selectedCount', { count: selectedPartners.length })} {t(selectedPartners.length === 1 ? 'createPin.partner_one' : 'createPin.partner_other')}
              </p>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className={styles.stepContent}>
              <h3>{t('createPin.stepReview')}</h3>

              <div className={styles.reviewSection}>
                <label className="section-label">{t('createPin.reviewLocation')}</label>
                <p className="mono">
                  {location?.latitude.toFixed(3)}, {location?.longitude.toFixed(3)}
                </p>
              </div>

              {title && (
                <div className={styles.reviewSection}>
                  <label className="section-label">{t('createPin.reviewTitle')}</label>
                  <p>{title}</p>
                </div>
              )}

              {message && (
                <div className={styles.reviewSection}>
                  <label className="section-label">{t('createPin.reviewMessage')}</label>
                  <p>{message}</p>
                </div>
              )}

              <div className={styles.reviewSection}>
                <label className="section-label">{t('createPin.reviewSchedule')}</label>
                {timeMode === TIME_MODES.NOW && (
                  <p>{NOW_DURATIONS.find(d => d.minutes === nowDuration)?.label} {t('createPin.startingNow')}</p>
                )}
                {timeMode === TIME_MODES.TODAY && (
                  <p>{t('common.today')} {t('createPin.fromTime', { start: todayStartTime, end: todayEndTime })}</p>
                )}
                {timeMode === TIME_MODES.THIS_WEEK && (
                  <p>
                    {nextSixDays.find(d => d.value === weekDate)?.label || weekDate} {t('createPin.fromTime', { start: weekStartTime, end: weekEndTime })}
                  </p>
                )}
                {timeMode === TIME_MODES.RECURRING && (
                  <div>
                    <p>{t('createPin.everyDay', { days: recurringDays.join(', ') })}</p>
                    <p>{t('createPin.fromTime', { start: recurringStartTime, end: recurringEndTime })}</p>
                  </div>
                )}
              </div>

              <div className={styles.reviewSection}>
                <label className="section-label">{t('createPin.reviewDevices', { count: selectedDevices.length })}</label>
                {selectedDevices.map((device) => (
                  <p key={device.id} className={styles.deviceReview}>
                    {getDeviceFullDisplay(device.digivice_id, device.version_label, deviceList)}
                  </p>
                ))}
              </div>

              <div className={styles.reviewSection}>
                <label className="section-label">{t('createPin.reviewPartners', { count: selectedPartners.length })}</label>
                <div className={styles.partnerReviewList}>
                  {selectedPartners.map((partner, i) => (
                    <div key={i} className={styles.partnerReviewItem}>
                      <DigimonSprite suffix={partner} size="sm" />
                      <span>{getDigimonName(partner, digimonDb)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className={styles.footer}>
          {step > 1 && (
            <button
              onClick={handleBack}
              className="btn-secondary"
              disabled={loading}
            >
              {t('common.back')}
            </button>
          )}

          {step < 5 ? (
            <button
              onClick={handleNext}
              className="btn-primary"
              disabled={loading || !location}
            >
              {t('common.next')}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="btn-primary"
              disabled={loading}
            >
              {loading ? t('createPin.creating') : t('createPin.title')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
