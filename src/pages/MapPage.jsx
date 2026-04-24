import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Map, { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Plus, Radar, Crosshair, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './MapPage.module.css'
import { useAuth } from '../hooks/useAuth'
import PinCreationModal from '../components/PinCreationModal'
import PinMarker from '../components/PinMarker'
import PinLegend from '../components/PinLegend'
import PinCard from '../components/PinCard'
import { useToast } from '../hooks/useToast'
import { supabase } from '../lib/supabase'
import { getPinRelationshipState } from '../utils/pinUtils'
import { fetchWeather, WEATHER_META } from '../utils/weatherUtils'

const CARTO_DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const HONG_KONG_BOUNDS = {
  center: { lat: 22.3193, lng: 114.1694 },
  zoom: 11,
  bounds: { north: 22.5600, south: 22.1500, east: 114.4400, west: 113.8300 }
}

const WEATHER_CLASSES = {
  night:  'weatherNight',
  clear:  'weatherClear',
  cloudy: 'weatherCloudy',
  rain:   'weatherRain',
}

export default function MapPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 13
  })
  const [userLocation, setUserLocation] = useState(null)
  const [locationError, setLocationError] = useState(null)
  const [weather, setWeather] = useState(null)    // 'night' | 'clear' | 'cloudy' | 'rain' | null
  const [showPinModal, setShowPinModal] = useState(false)
  const [pins, setPins] = useState([])
  const [loadingPins, setLoadingPins] = useState(false)
  const [activeConversations, setActiveConversations] = useState([])
  const [battles, setBattles] = useState([])
  const { showToast } = useToast()
  const [selectedPin, setSelectedPin] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isFindingNearest, setIsFindingNearest] = useState(false)
  const [isMapLoading, setIsMapLoading] = useState(true)
  const mapRef = useRef()

  useEffect(() => {
    ;(async () => {
      let lat, lng

      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 15000,
              maximumAge: 60000,
            })
          )
          lat = pos.coords.latitude
          lng = pos.coords.longitude
          setUserLocation({ latitude: lat, longitude: lng })
          setViewState({ longitude: lng, latitude: lat, zoom: 13 })
        } catch (err) {
          console.error('Geolocation error:', err)
          setLocationError(err.message)
          lat = HONG_KONG_BOUNDS.center.lat
          lng = HONG_KONG_BOUNDS.center.lng
          setViewState({ longitude: lng, latitude: lat, zoom: HONG_KONG_BOUNDS.zoom })
        }
      } else {
        setLocationError('Geolocation not supported')
        lat = HONG_KONG_BOUNDS.center.lat
        lng = HONG_KONG_BOUNDS.center.lng
        setViewState({ longitude: lng, latitude: lat, zoom: HONG_KONG_BOUNDS.zoom })
      }

      // Fetch weather at determined location (non-blocking — fails silently)
      const w = await fetchWeather(lat, lng)
      if (w) setWeather(w.condition)
    })()
  }, [])

  // Load user's messages and battles for relationship states
  const loadRelationshipData = async () => {
    if (!user) return

    try {
      // Load conversations with active pins only — used to determine "Contacted" pin color
      const { data: convsData, error: convsError } = await supabase
        .from('conversations')
        .select('user1_id, user2_id, pin:pins!conversations_pin_id_fkey(is_active)')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)

      if (convsError) {
        console.error('Error loading conversations:', convsError)
      } else {
        setActiveConversations(
          (convsData || []).filter(c => c.pin && c.pin.is_active)
        )
      }

      // Load pending/completed battles involving current user
      const { data: battlesData, error: battlesError } = await supabase
        .from('battles')
        .select('requester_id, responder_id, request_status, battle_completed_at')
        .or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`)

      if (battlesError) {
        console.error('Error loading battles:', battlesError)
      } else {
        setBattles(battlesData || [])
      }
    } catch (error) {
      console.error('Error loading relationship data:', error)
    }
  }

  // Load pins within viewport bounds
  const loadPinsInViewport = async () => {
    if (!mapRef.current) return

    try {
      setLoadingPins(true)
      const map = mapRef.current.getMap()
      const bounds = map.getBounds()

      // Query pins within bounding box
      const { data, error } = await supabase
        .from('pins')
        .select(`
          *,
          profiles!user_id (
            id,
            username,
            favourite_digimon,
            total_battles
          )
        `)
        .eq('is_active', true)
        .gte('lng', bounds.getWest())
        .lte('lng', bounds.getEast())
        .gte('lat', bounds.getSouth())
        .lte('lat', bounds.getNorth())

      if (error) {
        console.error('Error loading pins:', error)
        return
      }

      setPins(data || [])
    } catch (error) {
      console.error('Error loading pins:', error)
    } finally {
      setLoadingPins(false)
    }
  }

  // Load pins when map becomes idle (after user stops moving/zooming)
  const handleMapIdle = () => {
    loadPinsInViewport()
  }

  // Load relationship data on mount
  useEffect(() => {
    if (user) {
      loadRelationshipData()
    }
  }, [user])

  // Handle pinId URL parameter - load and show specific pin
  useEffect(() => {
    const pinId = searchParams.get('pinId')
    if (!pinId || !user) return

    const loadAndShowPin = async () => {
      try {
        // Fetch the specific pin
        const { data: pinData, error } = await supabase
          .from('pins')
          .select(`
            *,
            profiles!user_id (
              id,
              username,
              favourite_digimon,
              total_battles
            )
          `)
          .eq('id', pinId)
          .single()

        if (error) {
          console.error('Error loading pin:', error)
          showToast('error', t('map.pinNotFound'))
          // Clear the pinId parameter
          setSearchParams({})
          return
        }

        // Fly to pin location
        if (mapRef.current && pinData) {
          mapRef.current.flyTo({
            center: [pinData.lng, pinData.lat],
            zoom: 15,
            duration: 1500
          })

          // Wait for map to fly, then show pin card
          setTimeout(() => {
            setSelectedPin(pinData)
            // Clear the pinId parameter from URL
            setSearchParams({})
          }, 1600)
        }
      } catch (error) {
        console.error('Error loading pin:', error)
      }
    }

    loadAndShowPin()
  }, [searchParams, user, setSearchParams, t])

  // Handle successful pin creation
  const handlePinCreated = () => {
    // Show success toast
    showToast('success', t('map.pinCreated'))

    // Refresh pins on map
    loadPinsInViewport()

    // Close modal
    setShowPinModal(false)
  }

  // Scan area around user location
  const handleScan = async () => {
    if (!userLocation) {
      showToast('error', t('map.locationRequired'))
      return
    }

    setIsScanning(true)

    try {
      // Fly to user location with zoom 14 (neighborhood view)
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [userLocation.longitude, userLocation.latitude],
          zoom: 14,
          duration: 1500
        })
      }

      // Wait for map to finish flying, then load pins
      setTimeout(async () => {
        await loadPinsInViewport()
        showToast('info', t('map.foundPins', { count: pins.length }))
        setIsScanning(false)
      }, 1600)
    } catch (error) {
      console.error('Error scanning area:', error)
      showToast('error', t('common.error'))
      setIsScanning(false)
    }
  }

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lng2 - lng1) * Math.PI) / 180

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }

  // Find nearest pin using client-side distance calculation
  const handleFindNearest = async () => {
    if (!userLocation) {
      showToast('error', t('map.locationRequired'))
      return
    }

    setIsFindingNearest(true)

    try {
      // Get all active pins in Hong Kong region (to ensure we have pins to search)
      const { data, error } = await supabase
        .from('pins')
        .select(`
          *,
          profiles!user_id (
            id,
            username,
            favourite_digimon,
            total_battles
          )
        `)
        .eq('is_active', true)
        .gte('lng', HONG_KONG_BOUNDS.bounds.west)
        .lte('lng', HONG_KONG_BOUNDS.bounds.east)
        .gte('lat', HONG_KONG_BOUNDS.bounds.south)
        .lte('lat', HONG_KONG_BOUNDS.bounds.north)

      if (error) {
        console.error('Error loading pins:', error)
        showToast('error', t('common.error'))
        setIsFindingNearest(false)
        return
      }

      if (!data || data.length === 0) {
        showToast('info', t('map.noPinsFound'))
        setIsFindingNearest(false)
        return
      }

      // Calculate distance to each pin and find nearest (excluding own pins)
      let nearestPin = null
      let minDistance = Infinity

      data.forEach((pin) => {
        // Skip user's own pins
        if (pin.user_id === user?.id) {
          return
        }

        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          pin.lat,
          pin.lng
        )
        if (distance < minDistance) {
          minDistance = distance
          nearestPin = { ...pin, distance_meters: distance }
        }
      })

      if (!nearestPin) {
        showToast('info', t('map.noPinsFound'))
        setIsFindingNearest(false)
        return
      }

      // Fly to nearest pin
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [nearestPin.lng, nearestPin.lat],
          zoom: 15,
          duration: 2000
        })
      }

      showToast('success', t('map.foundNearest', { distance: Math.round(minDistance) }))

      // Load pins in new viewport after flight
      setTimeout(() => {
        loadPinsInViewport()
      }, 2100)
    } catch (error) {
      console.error('Error finding nearest pin:', error)
      showToast('error', t('common.error'))
    } finally {
      setIsFindingNearest(false)
    }
  }

  // Scan entire Hong Kong
  const handleScanHongKong = async () => {
    setIsScanning(true)

    try {
      // Fly to Hong Kong view
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [HONG_KONG_BOUNDS.center.lng, HONG_KONG_BOUNDS.center.lat],
          zoom: HONG_KONG_BOUNDS.zoom,
          duration: 2000
        })
      }

      // Load all pins in Hong Kong bounds
      const { data, error } = await supabase
        .from('pins')
        .select(`
          *,
          profiles!user_id (
            id,
            username,
            favourite_digimon,
            total_battles
          )
        `)
        .eq('is_active', true)
        .gte('lng', HONG_KONG_BOUNDS.bounds.west)
        .lte('lng', HONG_KONG_BOUNDS.bounds.east)
        .gte('lat', HONG_KONG_BOUNDS.bounds.south)
        .lte('lat', HONG_KONG_BOUNDS.bounds.north)

      if (error) {
        console.error('Error loading Hong Kong pins:', error)
        showToast('error', t('common.error'))
        setIsScanning(false)
        return
      }

      setPins(data || [])
      showToast('success', t('map.foundPins', { count: data?.length || 0 }))
    } catch (error) {
      console.error('Error scanning Hong Kong:', error)
      showToast('error', t('common.error'))
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.mapWrapper}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          onLoad={() => setIsMapLoading(false)}
          onIdle={handleMapIdle}
          mapStyle={CARTO_DARK_MATTER}
          style={{ width: '100%', height: '100%' }}
        >
          {/* User location marker */}
          {userLocation && (
            <Marker
              longitude={userLocation.longitude}
              latitude={userLocation.latitude}
              anchor="center"
            >
              <div className={styles.userMarker} />
            </Marker>
          )}

          {/* Pin markers */}
          {pins.map((pin, index) => {
            const relationshipState = getPinRelationshipState(
              user?.id,
              pin,
              activeConversations,
              battles
            )
            return (
              <Marker
                key={pin.id}
                longitude={pin.lng}
                latitude={pin.lat}
                anchor="bottom"
              >
                <PinMarker
                  relationshipState={relationshipState}
                  onClick={() => setSelectedPin(pin)}
                  index={index}
                />
              </Marker>
            )
          })}

          {/* Map controls */}
          <NavigationControl position="top-right" />
          <GeolocateControl
            position="top-right"
            trackUserLocation
            onGeolocate={(e) => {
              setUserLocation({
                latitude: e.coords.latitude,
                longitude: e.coords.longitude
              })
            }}
          />
        </Map>

        {/* Map loading overlay */}
        {isMapLoading && (
          <div className={styles.mapLoadingOverlay}>
            <div className={styles.radarRing} />
            <div className={styles.radarSweep} />
            <div className={styles.radarDot} />
            <span className={styles.radarLabel}>SCANNING…</span>
          </div>
        )}

        {/* Weather overlay — CSS tint over map, pointer-events: none */}
        {weather && (
          <div className={`${styles.weatherOverlay} ${styles[WEATHER_CLASSES[weather]]}`} />
        )}
      </div>

      {/* Weather badge */}
      {weather && (
        <div className={styles.weatherBadge}>
          <span>{WEATHER_META[weather].emoji}</span>
          <span>{WEATHER_META[weather].label}</span>
        </div>
      )}

      {/* Pin color legend */}
      <PinLegend />

      {/* Location error message */}
      {locationError && (
        <div className={styles.errorBanner}>
          {t('map.gpsUnavailable')}: {locationError}
        </div>
      )}

      {/* Map control buttons */}
      <div className={styles.mapControls}>
        {/* Floating Action Button */}
        <button
          className={styles.fab}
          onClick={() => setShowPinModal(true)}
          title={t('map.createPin')}
        >
          <Plus size={22} />
        </button>

        {/* Scan Hong Kong */}
        <button
          className={`${styles.mapButton} ${isScanning ? styles.active : ''}`}
          onClick={handleScanHongKong}
          disabled={isScanning}
        >
          <MapPin size={18} />
          <span className={styles.buttonLabel}>{t('map.scanHK')}</span>
        </button>

        {/* Find Nearest */}
        <button
          className={`${styles.mapButton} ${isFindingNearest ? styles.active : ''}`}
          onClick={handleFindNearest}
          disabled={isFindingNearest || !userLocation}
        >
          <Crosshair size={18} />
          <span className={styles.buttonLabel}>{t('map.findNearest')}</span>
        </button>

        {/* Scan Area Around User */}
        <button
          className={`${styles.mapButton} ${isScanning ? styles.active : ''}`}
          onClick={handleScan}
          disabled={isScanning || !userLocation}
        >
          <Radar size={18} />
          <span className={styles.buttonLabel}>{t('map.scanArea')}</span>
        </button>
      </div>

      {/* Pin Creation Modal */}
      <PinCreationModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={handlePinCreated}
        userLocation={userLocation}
      />

      {/* Pin Card Bottom Sheet */}
      {selectedPin && (
        <PinCard
          pin={selectedPin}
          onClose={() => setSelectedPin(null)}
          currentUserId={user?.id}
        />
      )}

    </div>
  )
}
