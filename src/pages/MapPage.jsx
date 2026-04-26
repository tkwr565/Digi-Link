import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Map, { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Plus, Radar, Crosshair, MapPin, ChevronUp, Train, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './MapPage.module.css'
import { useAuth } from '../hooks/useAuth'
import PinCreationModal from '../components/PinCreationModal'
import PinMarker from '../components/PinMarker'
import PinLegend from '../components/PinLegend'
import PinCard from '../components/PinCard'
import { MtrMarker, MallMarker } from '../components/PoiMarkers'
import { DISTRICTS } from '../utils/hkDistrict'
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
  const { t, i18n } = useTranslation()
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
  // Map is not rendered until we have a real starting position (geolocation or fallback).
  // This prevents a wasted tile load at (0, 0) that would fire onIdle early and dismiss
  // the radar before tiles at the actual location are ready.
  const [hasInitialPosition, setHasInitialPosition] = useState(false)
  const [pendingPinId, setPendingPinId] = useState(null)
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [districtOpen, setDistrictOpen] = useState(false)
  const [mtrPois, setMtrPois] = useState([])
  const [mallPois, setMallPois] = useState([])
  const [showMtr, setShowMtr] = useState(false)
  const [showMalls, setShowMalls] = useState(false)
  const [isFetchingPois, setIsFetchingPois] = useState(false)
  const mapRef = useRef()
  const districtRef = useRef()
  const lastPoiFetchRef = useRef(0)
  const idleTimeout = useRef(null)

  
  useEffect(() => {
    ;(async () => {
      let lat, lng

      if (navigator.geolocation) {
        try {
          const pos = await Promise.race([
            new Promise((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 8000,
                maximumAge: 60000,
              })
            ),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Location timeout')), 8000)
            ),
          ])
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

      setHasInitialPosition(true)

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

  // Load pins within viewport bounds; returns the count of loaded pins
  const loadPinsInViewport = async () => {
    if (!mapRef.current) return 0

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
        return 0
      }

      setPins(data || [])
      return data?.length ?? 0
    } catch (error) {
      console.error('Error loading pins:', error)
      return 0
    } finally {
      setLoadingPins(false)
    }
  }

  // Fetch MTR stations + shopping malls from Overpass for the current viewport.
  // Only runs at zoom >= 11 and throttles to at most one fetch every 5 s.
  const loadPois = async () => {
    if (!mapRef.current || isFetchingPois) return
    const map = mapRef.current.getMap()
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
    // Overpass bbox: south,west,north,east
    const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`
    
    // Build query parts conditionally
    let queryParts = ''
    if (showMtr) queryParts += `node["railway"="station"](${bbox});way["railway"="station"](${bbox});`
    if (showMalls) queryParts += `node["shop"~"mall|shopping_centre"](${bbox});way["shop"~"mall|shopping_centre"](${bbox});relation["shop"~"mall|shopping_centre"](${bbox});`

    if (!queryParts) {
      setIsFetchingPois(false)
      return
    }

    const query = `[out:json][timeout:25];(${queryParts});out center tags;`

    try {
      // Using a more reliable Overpass instance
      const res = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      )
      if (!res.ok) {
        console.error('Overpass API error:', res.status)
        lastPoiFetchRef.current = 0
        return
      }
      const { elements } = await res.json()

      const mtr = []
      const malls = []
      const seen = new Set()

      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        if (lat == null || lng == null) continue

        // deduplicate by rounded coordinate (catches duplicate nodes from combined queries)
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
        if (seen.has(key)) continue
        seen.add(key)

        const tags = el.tags || {}
        const nameEn = tags['name:en'] || tags.name || ''
        const nameZh = tags['name:zh'] || tags['name:zh-Hant'] || tags.name || ''

        // Simple filtering based on tags
        if (tags.railway === 'station') {
          mtr.push({ lat, lng, nameEn, nameZh })
        } else if (tags.shop === 'mall' || tags.shop === 'shopping_centre') {
          malls.push({ lat, lng, nameEn, nameZh })
        }
      }

      setMtrPois(mtr)
      setMallPois(malls)
    } catch (err) {
      console.error('POI fetch error:', err)
      lastPoiFetchRef.current = 0
    } finally {
      setIsFetchingPois(false)
    }
  }

  // Reload POIs when toggles change
  useEffect(() => {
    loadPois()
  }, [showMtr, showMalls])

  const handleMapLoad = () => {
    if (isMapLoading) setIsMapLoading(false)
    loadPinsInViewport()
    loadPois()
  }

  const handleMapIdle = () => {
    loadPinsInViewport()
    loadPois()
  }

  // Load relationship data on mount
  useEffect(() => {
    if (user) {
      loadRelationshipData()
    }
  }, [user])

  // Step 1: capture pinId from URL immediately and clear it, so the param
  // doesn't linger while the map is still loading.
  useEffect(() => {
    const pinId = searchParams.get('pinId')
    if (!pinId) return
    setPendingPinId(pinId)
    setSearchParams({})
  }, [searchParams, setSearchParams])

  // Step 2: once the map is loaded AND we have a pending pin, fetch + fly + open card.
  // Splitting from Step 1 means navigating fresh from another tab works reliably —
  // the URL param is captured immediately, and the flyTo only runs after onLoad fires.
  useEffect(() => {
    if (isMapLoading || !pendingPinId || !user) return

    const pinId = pendingPinId
    setPendingPinId(null)

    const loadAndShowPin = async () => {
      try {
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

        if (error || !pinData) {
          console.error('Error loading pin:', error)
          showToast('error', t('map.pinNotFound'))
          return
        }

        mapRef.current.flyTo({
          center: [pinData.lng, pinData.lat],
          zoom: 15,
          duration: 1500
        })
        setTimeout(() => setSelectedPin(pinData), 1600)
      } catch (err) {
        console.error('Error loading pin:', err)
      }
    }

    loadAndShowPin()
  }, [isMapLoading, pendingPinId, user, showToast, t])

  // Handle successful pin creation
  const handlePinCreated = () => {
    // Show success toast
    showToast('success', t('map.pinCreated'))

    // Refresh pins on map
    loadPinsInViewport()

    // Close modal
    setShowPinModal(false)
  }

  // Close district dropup on outside tap/click
  useEffect(() => {
    const close = (e) => {
      if (districtRef.current && !districtRef.current.contains(e.target)) {
        setDistrictOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [])

  const handleDistrictSelect = (district) => {
    setSelectedDistrict(district.key)
    setDistrictOpen(false)
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [district.lng, district.lat], zoom: 13, duration: 1500 })
    }
  }

  const handleDistrictClear = () => {
    setSelectedDistrict(null)
    setDistrictOpen(false)
    if (mapRef.current && userLocation) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 13,
        duration: 1000,
      })
    }
  }

  // Scan area around user location
  // Scan whatever area the map is currently showing
  const handleScan = async () => {
    setIsScanning(true)
    try {
      const count = await loadPinsInViewport()
      showToast('info', t('map.foundPins', { count }))
    } catch (error) {
      console.error('Error scanning area:', error)
      showToast('error', t('common.error'))
    } finally {
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
      const scanRadiusMeters = parseInt(localStorage.getItem('digimap_scan_radius') || '2000', 10)

      // Compute a bounding box around user location for the scan radius
      // 1 degree lat ≈ 111,320 m; 1 degree lng ≈ 111,320 * cos(lat) m
      const latDelta = scanRadiusMeters / 111320
      const lngDelta = scanRadiusMeters / (111320 * Math.cos((userLocation.latitude * Math.PI) / 180))

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
        .gte('lat', userLocation.latitude - latDelta)
        .lte('lat', userLocation.latitude + latDelta)
        .gte('lng', userLocation.longitude - lngDelta)
        .lte('lng', userLocation.longitude + lngDelta)

      if (error) {
        console.error('Error loading pins:', error)
        showToast('error', t('common.error'))
        setIsFindingNearest(false)
        return
      }

      // Calculate exact distance and find nearest (excluding own pins, within radius)
      let nearestPin = null
      let minDistance = Infinity

      ;(data || []).forEach((pin) => {
        if (pin.user_id === user?.id) return

        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          pin.lat,
          pin.lng
        )
        if (distance <= scanRadiusMeters && distance < minDistance) {
          minDistance = distance
          nearestPin = { ...pin, distance_meters: distance }
        }
      })

      if (!nearestPin) {
        const label = scanRadiusMeters >= 1000 ? `${scanRadiusMeters / 1000}km` : `${scanRadiusMeters}m`
        showToast('info', t('map.noPinsInRadius', { distance: label }))
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
      // Fit map to HK bounds — adapts zoom to actual screen aspect ratio
      if (mapRef.current) {
        mapRef.current.fitBounds(
          [
            [HONG_KONG_BOUNDS.bounds.west, HONG_KONG_BOUNDS.bounds.south],
            [HONG_KONG_BOUNDS.bounds.east, HONG_KONG_BOUNDS.bounds.north]
          ],
          { padding: 24, duration: 2000 }
        )
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
        {hasInitialPosition && (
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          onLoad={handleMapLoad}
          onIdle={handleMapIdle}
          mapStyle={CARTO_DARK_MATTER}
          style={{ width: '100%', height: '100%' }}
        >
          {/* MTR station markers */}
          {showMtr && mtrPois.map((station, i) => (
            <Marker
              key={`mtr-${i}`}
              longitude={station.lng}
              latitude={station.lat}
              anchor="bottom"
              zIndex={1}
              style={{ zIndex: 1 }}
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
              zIndex={1}
              style={{ zIndex: 1 }}
            >
              <MallMarker mall={mall} lang={i18n.language} />
            </Marker>
          ))}

          {/* User location marker */}
          {userLocation && (
            <Marker
              longitude={userLocation.longitude}
              latitude={userLocation.latitude}
              anchor="center"
              zIndex={3}
              style={{ zIndex: 3 }}
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
                zIndex={2}
                style={{ zIndex: 2 }}
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
        )}

        {/* App wordmark */}
        <div className={styles.wordmark}>
          <span className={styles.wordmarkRoman}>Digi-Link</span>
          <span className={styles.wordmarkChinese}>數碼連結</span>
        </div>

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

      {/* POI Toggles — bottom-left, above district selector */}
      <div className={styles.poiToggles}>
        <button
          className={`${styles.toggleBtn} ${showMtr ? styles.toggleActive : ''}`}
          onClick={() => setShowMtr(prev => !prev)}
        >
          <Train size={14} className={showMtr ? styles.toggleIconMtr : ''} />
          <span>MTR</span>
        </button>
        <button
          className={`${styles.toggleBtn} ${showMalls ? styles.toggleActive : ''}`}
          onClick={() => setShowMalls(prev => !prev)}
        >
          <ShoppingBag size={14} className={showMalls ? styles.toggleIconMall : ''} />
          <span>{t('map.malls')}</span>
        </button>
      </div>

      {/* District selector — bottom-left dropup */}
      <div ref={districtRef} className={styles.districtSelector}>
        <button
          className={`${styles.districtBtn} ${selectedDistrict ? styles.districtBtnActive : ''}`}
          onClick={() => setDistrictOpen(o => !o)}
        >
          <MapPin size={13} />
          <span>{selectedDistrict ? t(`districts.${selectedDistrict}`) : t('map.districtSelect')}</span>
          <ChevronUp size={13} className={districtOpen ? styles.chevronFlipped : ''} />
        </button>

        {districtOpen && (
          <ul className={styles.districtDropup}>
            {selectedDistrict && (
              <li className={`${styles.districtOption} ${styles.districtClear}`} onClick={handleDistrictClear}>
                {t('map.districtClear')}
              </li>
            )}
            {DISTRICTS.map(d => (
              <li
                key={d.key}
                className={`${styles.districtOption} ${selectedDistrict === d.key ? styles.districtOptionActive : ''}`}
                onClick={() => handleDistrictSelect(d)}
              >
                {t(`districts.${d.key}`)}
              </li>
            ))}
          </ul>
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
          disabled={isScanning}
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
        showMtr={showMtr}
        showMalls={showMalls}
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
