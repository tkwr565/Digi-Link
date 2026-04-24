import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, MapPin } from 'lucide-react'
import Map, { Marker } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { loadDeviceList, getDeviceFullDisplay, loadDigimonDb, getDigimonName } from '../utils/digimonUtils'
import DigimonSprite from './DigimonSprite'
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

// Generate next 6 days (starting from tomorrow)
const getNextSixDays = () => {
  const days = []
  const today = new Date()

  for (let i = 1; i <= 6; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    days.push({
      date: date,
      value: date.toISOString().split('T')[0], // YYYY-MM-DD format
      label: `${dayName}, ${dateStr}` // e.g., "Tue, Apr 22"
    })
  }

  return days
}

export default function PinCreationModal({ isOpen, onClose, onSuccess, userLocation }) {
  const { user } = useAuth()
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
  const [weekDate, setWeekDate] = useState('') // Changed: actual date in YYYY-MM-DD format
  const [weekStartTime, setWeekStartTime] = useState('')
  const [weekEndTime, setWeekEndTime] = useState('')
  const [recurringDays, setRecurringDays] = useState([])
  const [recurringStartTime, setRecurringStartTime] = useState('09:00')
  const [recurringEndTime, setRecurringEndTime] = useState('17:00')

  // Generate next 6 days options
  const nextSixDays = getNextSixDays()

  // User data
  const [userDevices, setUserDevices] = useState([])
  const [selectedDevices, setSelectedDevices] = useState([]) // Track selected devices
  const [selectedPartners, setSelectedPartners] = useState([]) // Track selected partners
  const [userProfile, setUserProfile] = useState(null)
  const [deviceList, setDeviceList] = useState(null) // Device list for name mapping
  const [digimonDb, setDigimonDb] = useState(null) // Digimon database for name mapping

  // Map state for location picker
  const [mapViewState, setMapViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 15
  })

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
        setError('You must have at least one active device to create a pin. Please update your profile.')
        return
      }

    } catch (err) {
      console.error('Error loading user data:', err)
      setError('Failed to load user data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => {
    // Validation for each step
    if (step === 1 && !location) {
      setError('Please confirm your location')
      return
    }
    if (step === 2) {
      if (timeMode === TIME_MODES.TODAY) {
        if (!todayStartTime || !todayEndTime) {
          setError('Please set start and end times for today')
          return
        }

        // Check if end time is after start time
        if (todayEndTime <= todayStartTime) {
          setError('End time must be after start time')
          return
        }

        // Check if start time is not in the past
        const now = new Date()
        const today = new Date()
        const [startHour, startMin] = todayStartTime.split(':').map(Number)
        const startDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin)

        if (startDateTime < now) {
          setError('Start time cannot be in the past')
          return
        }
      }

      if (timeMode === TIME_MODES.THIS_WEEK) {
        if (!weekDate || !weekStartTime || !weekEndTime) {
          setError('Please select a date and times for this week')
          return
        }

        // Check if end time is after start time
        if (weekEndTime <= weekStartTime) {
          setError('End time must be after start time')
          return
        }
      }

      if (timeMode === TIME_MODES.RECURRING) {
        if (recurringDays.length === 0 || !recurringStartTime || !recurringEndTime) {
          setError('Please select days and times for recurring pin')
          return
        }

        // Check if end time is after start time
        if (recurringEndTime <= recurringStartTime) {
          setError('End time must be after start time')
          return
        }
      }
    }
    // Step 3: validate device selection
    if (step === 3 && selectedDevices.length === 0) {
      setError('Please select at least one device')
      return
    }
    // Step 4: validate partner selection
    if (step === 4 && selectedPartners.length === 0) {
      setError('Please select at least one partner')
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
      setError('Failed to create pin. Please try again.')
    } finally {
      setLoading(false)
    }
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

  if (!isOpen) return null

  // Don't render if no active devices
  if (userDevices.length === 0 && !loading) {
    return createPortal(
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <h2>Cannot Create Pin</h2>
            <button onClick={handleClose} className={styles.closeButton}>
              <X size={24} />
            </button>
          </div>
          <div className={styles.content}>
            <p className={styles.errorText}>
              You must have at least one active device to create a pin.
              Please update your profile to mark devices as active.
            </p>
            <button onClick={handleClose} className="btn-primary">
              Go to Profile
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
          <h2>Create Pin</h2>
          <button onClick={handleClose} className={styles.closeButton}>
            <X size={24} />
          </button>
        </div>

        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={`${styles.step} ${step >= 1 ? styles.stepActive : ''}`}>1</div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 2 ? styles.stepActive : ''}`}>2</div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 3 ? styles.stepActive : ''}`}>3</div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 4 ? styles.stepActive : ''}`}>4</div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 5 ? styles.stepActive : ''}`}>5</div>
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
              <h3>Choose Location</h3>
              <p className={styles.stepDescription}>
                Use your current location or tap on the map to place your pin.
                Location is snapped to ~100m grid for privacy.
              </p>

              {/* Map for location picking */}
              <div className={styles.mapContainer}>
                <Map
                  {...mapViewState}
                  onMove={(evt) => setMapViewState(evt.viewState)}
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
                  Use Current Location
                </button>
                <button
                  onClick={() => setIsPickingLocation(!isPickingLocation)}
                  className={isPickingLocation ? 'btn-primary' : 'btn-secondary'}
                >
                  {isPickingLocation ? 'Tap Map to Place Pin' : 'Pick Location on Map'}
                </button>
              </div>

              {location && (
                <div className={styles.locationDisplay}>
                  <span className="section-label">Selected Location</span>
                  <span className="mono">
                    {snapCoordinate(location.latitude).toFixed(3)}, {snapCoordinate(location.longitude).toFixed(3)}
                  </span>
                </div>
              )}

              <div className={styles.optionalFields}>
                <label className="section-label">Pin Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., At T.O.P. Mall!"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />

                <label className="section-label" style={{ marginTop: '1rem' }}>
                  Message (Optional)
                </label>
                <textarea
                  placeholder="e.g., Bring your Pendulum!"
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
              <h3>Set Time Window</h3>
              <p className={styles.stepDescription}>
                Choose when your pin should be active
              </p>

              {/* Time mode selection */}
              <div className={styles.timeModeButtons}>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.NOW ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.NOW)}
                >
                  Now
                </button>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.TODAY ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.TODAY)}
                >
                  Today
                </button>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.THIS_WEEK ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.THIS_WEEK)}
                >
                  This Week
                </button>
                <button
                  className={`${styles.timeModeButton} ${timeMode === TIME_MODES.RECURRING ? styles.timeModeButtonActive : ''}`}
                  onClick={() => setTimeMode(TIME_MODES.RECURRING)}
                >
                  Recurring
                </button>
              </div>

              {/* Now mode */}
              {timeMode === TIME_MODES.NOW && (
                <div className={styles.timeModeContent}>
                  <label className="section-label">Duration</label>
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
                    <span className="section-label">Pin will expire:</span>
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
                      <label className="section-label">Start Time</label>
                      <input
                        type="time"
                        value={todayStartTime}
                        onChange={(e) => setTodayStartTime(e.target.value)}
                      />
                    </div>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">End Time</label>
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
                    <label className="section-label">Select Date (Next 6 Days)</label>
                    <select value={weekDate} onChange={(e) => setWeekDate(e.target.value)}>
                      <option value="">Select date</option>
                      {nextSixDays.map(day => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.timeInputRow}>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">Start Time</label>
                      <input
                        type="time"
                        value={weekStartTime}
                        onChange={(e) => setWeekStartTime(e.target.value)}
                      />
                    </div>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">End Time</label>
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
                  <label className="section-label">Active Days</label>
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
                      <label className="section-label">Start Time</label>
                      <input
                        type="time"
                        value={recurringStartTime}
                        onChange={(e) => setRecurringStartTime(e.target.value)}
                      />
                    </div>
                    <div className={styles.timeInputGroup}>
                      <label className="section-label">End Time</label>
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
              <h3>Select Devices You're Bringing</h3>
              <p className={styles.stepDescription}>
                Choose which of your active devices you're carrying today.
                These will be shown on your pin.
              </p>

              <div className={styles.deviceList}>
                {userDevices.map((device) => {
                  const isSelected = selectedDevices.find(d => d.id === device.id)
                  return (
                    <button
                      key={device.id}
                      className={`${styles.deviceItem} ${isSelected ? styles.deviceItemSelected : ''}`}
                      onClick={() => toggleDeviceSelection(device)}
                    >
                      <input
                        type="checkbox"
                        checked={!!isSelected}
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
                Selected: {selectedDevices.length} device{selectedDevices.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Step 4: Partner Selection */}
          {step === 4 && (
            <div className={styles.stepContent}>
              <h3>Select Active Partners</h3>
              <p className={styles.stepDescription}>
                Choose which Digimon partners you're carrying today.
                These will be shown on your pin.
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
                Selected: {selectedPartners.length} partner{selectedPartners.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className={styles.stepContent}>
              <h3>Review & Confirm</h3>

              <div className={styles.reviewSection}>
                <label className="section-label">Location</label>
                <p className="mono">
                  {snapCoordinate(location.latitude).toFixed(3)}, {snapCoordinate(location.longitude).toFixed(3)}
                </p>
              </div>

              {title && (
                <div className={styles.reviewSection}>
                  <label className="section-label">Title</label>
                  <p>{title}</p>
                </div>
              )}

              {message && (
                <div className={styles.reviewSection}>
                  <label className="section-label">Message</label>
                  <p>{message}</p>
                </div>
              )}

              <div className={styles.reviewSection}>
                <label className="section-label">Schedule</label>
                {timeMode === TIME_MODES.NOW && (
                  <p>{NOW_DURATIONS.find(d => d.minutes === nowDuration)?.label} starting now</p>
                )}
                {timeMode === TIME_MODES.TODAY && (
                  <p>Today from {todayStartTime} to {todayEndTime}</p>
                )}
                {timeMode === TIME_MODES.THIS_WEEK && (
                  <p>
                    {nextSixDays.find(d => d.value === weekDate)?.label || weekDate} from {weekStartTime} to {weekEndTime}
                  </p>
                )}
                {timeMode === TIME_MODES.RECURRING && (
                  <div>
                    <p>Every {recurringDays.join(', ')}</p>
                    <p>From {recurringStartTime} to {recurringEndTime}</p>
                  </div>
                )}
              </div>

              <div className={styles.reviewSection}>
                <label className="section-label">Devices Bringing ({selectedDevices.length})</label>
                {selectedDevices.map((device) => (
                  <p key={device.id} className={styles.deviceReview}>
                    {getDeviceFullDisplay(device.digivice_id, device.version_label, deviceList)}
                  </p>
                ))}
              </div>

              <div className={styles.reviewSection}>
                <label className="section-label">Active Partners ({selectedPartners.length})</label>
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
              Back
            </button>
          )}

          {step < 5 ? (
            <button
              onClick={handleNext}
              className="btn-primary"
              disabled={loading || !location}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Pin'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
