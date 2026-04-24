import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import DigimonSprite from './DigimonSprite'
import Toast from './Toast'
import styles from './PinCard.module.css'
import { getDigimonName, getDeviceFullDisplay, loadDigimonDb, loadDeviceList } from '../utils/digimonUtils'
import { getBattleRequestForPin, createBattleRequest } from '../utils/messageUtils'
import { supabase } from '../lib/supabase'

export default function PinCard({ pin, onClose, currentUserId }) {
  const navigate = useNavigate()
  const [digimonDb, setDigimonDb] = useState(null)
  const [deviceList, setDeviceList] = useState(null)
  const [battleRequest, setBattleRequest] = useState(null)
  const [loadingBattleStatus, setLoadingBattleStatus] = useState(true)
  const [sendingRequest, setSendingRequest] = useState(false)
  const [toast, setToast] = useState(null)

  // Check if this is the current user's own pin
  const isOwnPin = currentUserId && pin.user_id === currentUserId

  useEffect(() => {
    // Load data on mount
    loadDigimonDb().then(setDigimonDb)
    loadDeviceList().then(setDeviceList)
  }, [])

  // Load battle request status
  useEffect(() => {
    const loadBattleStatus = async () => {
      if (!currentUserId || isOwnPin) {
        setLoadingBattleStatus(false)
        return
      }

      const { data, error } = await getBattleRequestForPin(currentUserId, pin.id, supabase)
      if (error) {
        console.error('Error loading battle request:', error)
      } else {
        setBattleRequest(data)
      }
      setLoadingBattleStatus(false)
    }

    loadBattleStatus()
  }, [currentUserId, pin.id, isOwnPin])

  if (!pin) return null

  // Format time window for display
  const formatTimeWindow = () => {
    const startTime = new Date(pin.start_time)
    const endTime = pin.end_time ? new Date(pin.end_time) : null

    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })

    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    })

    if (pin.is_recurring) {
      // Recurring pin
      const rule = pin.recurrence_rule
      const days = rule.days?.join(', ') || 'Daily'
      return `${days}, ${rule.start} – ${rule.end} (Recurring)`
    } else {
      // One-time pin
      const today = new Date()
      const isToday = startTime.toDateString() === today.toDateString()

      if (isToday) {
        return `Today ${timeFormatter.format(startTime)} – ${endTime ? timeFormatter.format(endTime) : 'Ongoing'}`
      } else {
        return `${dateFormatter.format(startTime)} ${timeFormatter.format(startTime)} – ${endTime ? timeFormatter.format(endTime) : 'Ongoing'}`
      }
    }
  }

  // Parse device snapshots (handles both old and new formats)
  const parseDeviceSnapshot = (deviceStr) => {
    if (deviceStr.includes(':')) {
      // New format: "vpet-dm:ver1"
      const [digiviceId, versionLabel] = deviceStr.split(':')
      return { digiviceId, versionLabel }
    } else {
      // Old format: "vpet-dm-ver1"
      return { digiviceId: deviceStr, versionLabel: null }
    }
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Bottom sheet */}
      <div className={styles.bottomSheet}>
        {/* Handle bar */}
        <div className={styles.handleBar} />

        {/* Close button */}
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={24} />
        </button>

        {/* Content */}
        <div className={styles.content}>
          {/* Username + Favourite Digimon */}
          <div className={styles.header}>
            <DigimonSprite suffix={pin.profiles.favourite_digimon} size="lg" />
            <div className={styles.userInfo}>
              <h2 className={styles.username}>{pin.profiles.username}</h2>
              <p className={styles.favouriteLabel}>
                Favourite: <span className={styles.favouriteName}>
                  {getDigimonName(pin.profiles.favourite_digimon, digimonDb)}
                </span>
              </p>
            </div>
          </div>

          {/* Active Partners */}
          {pin.active_partners_snapshot && pin.active_partners_snapshot.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Active Partners</h3>
              <div className={styles.partnersGrid}>
                {pin.active_partners_snapshot.map((partner, index) => (
                  <div key={`${partner}-${index}`} className={styles.partnerItem}>
                    <DigimonSprite suffix={partner} size="md" />
                    <span className={styles.partnerName}>
                      {getDigimonName(partner, digimonDb)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Devices */}
          {pin.active_devices_snapshot && pin.active_devices_snapshot.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Devices</h3>
              <div className={styles.deviceList}>
                {pin.active_devices_snapshot.map((deviceStr, index) => {
                  const { digiviceId, versionLabel } = parseDeviceSnapshot(deviceStr)
                  return (
                    <div key={`${deviceStr}-${index}`} className={styles.deviceItem}>
                      {getDeviceFullDisplay(digiviceId, versionLabel, deviceList)}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pin Details */}
          <div className={styles.section}>
            <h3 className={styles.pinTitle}>{pin.title || 'Pin'}</h3>
            {pin.message && (
              <p className={styles.pinMessage}>{pin.message}</p>
            )}
            <div className={styles.pinMeta}>
              <div className={styles.metaItem}>
                📍 {pin.title || 'Location Pin'}
              </div>
              <div className={styles.metaItem}>
                🕐 {formatTimeWindow()}
              </div>
            </div>
          </div>

          {/* Battle Count */}
          {pin.profiles.total_battles > 0 && (
            <div className={styles.battleCount}>
              ⚔️ {pin.profiles.total_battles} Battle{pin.profiles.total_battles !== 1 ? 's' : ''}
            </div>
          )}

          {/* Battle Request / Open Chat Button - only show for other users' pins */}
          {!isOwnPin && !loadingBattleStatus && (
            <>
              {!battleRequest && (
                <button
                  className={styles.sendMessageButton}
                  onClick={async () => {
                    setSendingRequest(true)

                    const { data, error } = await createBattleRequest(
                      currentUserId,
                      pin.user_id,
                      pin.id,
                      supabase
                    )

                    if (error) {
                      if (error.code === '23505') {
                        // Duplicate request - shouldn't happen but handle gracefully
                        setToast({
                          type: 'error',
                          message: 'You have already sent a request to this pin.'
                        })
                      } else {
                        console.error('Error creating battle request:', error)
                        setToast({
                          type: 'error',
                          message: 'Failed to send request. Please try again.'
                        })
                      }
                    } else {
                      setBattleRequest(data)
                      setToast({
                        type: 'success',
                        message: 'Battle request sent! Check Messages to see status.'
                      })
                    }

                    setSendingRequest(false)
                  }}
                  disabled={sendingRequest}
                >
                  {sendingRequest ? 'Sending...' : '⚔️ Request Battle'}
                </button>
              )}

              {battleRequest && battleRequest.request_status === 'pending' && (
                <button
                  className={`${styles.sendMessageButton} ${styles.pendingButton}`}
                  disabled
                >
                  ⏳ Request Pending
                </button>
              )}

              {battleRequest && battleRequest.request_status === 'accepted' && (
                <button
                  className={styles.sendMessageButton}
                  onClick={() => {
                    onClose()
                    navigate(`/messages/${battleRequest.conversation_id}`)
                  }}
                >
                  💬 Open Chat
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
