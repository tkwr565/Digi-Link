import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import DigimonSprite from './DigimonSprite'
import Toast from './Toast'
import { useTranslation } from 'react-i18next'
import styles from './PinCard.module.css'
import { getDigimonName, getDeviceFullDisplay, loadDigimonDb, loadDeviceList } from '../utils/digimonUtils'
import { getBattleRequestForPin, createBattleRequest } from '../utils/messageUtils'
import { supabase } from '../lib/supabase'

export default function PinCard({ pin, onClose, currentUserId }) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [digimonDb, setDigimonDb] = useState(null)
  const [deviceList, setDeviceList] = useState(null)
  const [battleRequest, setBattleRequest] = useState(null)
  const [loadingBattleStatus, setLoadingBattleStatus] = useState(true)
  const [sendingRequest, setSendingRequest] = useState(false)
  const [toast, setToast] = useState(null)

  const isOwnPin = currentUserId && pin.user_id === currentUserId

  useEffect(() => {
    loadDigimonDb().then(setDigimonDb)
    loadDeviceList().then(setDeviceList)
  }, [])

  useEffect(() => {
    const loadBattleStatus = async () => {
      if (!currentUserId || isOwnPin) {
        setLoadingBattleStatus(false)
        return
      }
      const { data, error } = await getBattleRequestForPin(currentUserId, pin.id, supabase)
      if (!error) setBattleRequest(data)
      setLoadingBattleStatus(false)
    }
    loadBattleStatus()
  }, [currentUserId, pin.id, isOwnPin])

  if (!pin) return null

  const formatTimeWindow = () => {
    const startTime = new Date(pin.start_time)
    const endTime = pin.end_time ? new Date(pin.end_time) : null
    const locale = i18n.language === 'zh-HK' ? 'zh-HK' : 'en-US'

    const timeFormatter = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true })
    const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })

    if (pin.is_recurring) {
      const rule = pin.recurrence_rule
      const days = rule.days?.join(', ') || t('pinCard.recurring')
      return `${days}, ${rule.start} – ${rule.end} (${t('pinCard.recurring')})`
    } else {
      const today = new Date()
      const isToday = startTime.toDateString() === today.toDateString()
      const startStr = isToday ? t('common.today') : dateFormatter.format(startTime)
      return `${startStr} ${timeFormatter.format(startTime)} – ${endTime ? timeFormatter.format(endTime) : t('common.ongoing')}`
    }
  }

  const parseDeviceSnapshot = (deviceStr) => {
    if (deviceStr.includes(':')) {
      const [digiviceId, versionLabel] = deviceStr.split(':')
      return { digiviceId, versionLabel }
    }
    return { digiviceId: deviceStr, versionLabel: null }
  }

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.bottomSheet}>
        <div className={styles.handleBar} />
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={24} />
        </button>
        <div className={styles.content}>
          <div className={styles.header}>
            <DigimonSprite suffix={pin.profiles.favourite_digimon} size="lg" />
            <div className={styles.userInfo}>
              <h2 className={styles.username}>{pin.profiles.username}</h2>
              <p className={styles.favouriteLabel}>
                {t('pinCard.favourite')} <span className={styles.favouriteName}>
                  {getDigimonName(pin.profiles.favourite_digimon, digimonDb)}
                </span>
              </p>
            </div>
          </div>

          {pin.active_partners_snapshot?.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('pinCard.activePartners')}</h3>
              <div className={styles.partnersGrid}>
                {pin.active_partners_snapshot.map((partner, index) => (
                  <div key={`${partner}-${index}`} className={styles.partnerItem}>
                    <DigimonSprite suffix={partner} size="md" />
                    <span className={styles.partnerName}>{getDigimonName(partner, digimonDb)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pin.active_devices_snapshot?.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('pinCard.devices')}</h3>
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

          <div className={styles.section}>
            <h3 className={styles.pinTitle}>{pin.title || 'Pin'}</h3>
            {pin.message && <p className={styles.pinMessage}>{pin.message}</p>}
            <div className={styles.pinMeta}>
              <div className={styles.metaItem}>📍 {pin.title || t('pinCard.locationPin')}</div>
              <div className={styles.metaItem}>🕐 {formatTimeWindow()}</div>
            </div>
          </div>

          {pin.profiles.total_battles > 0 && (
            <div className={styles.battleCount}>
              ⚔️ {t('friends.battlesCount', { count: pin.profiles.total_battles })}
            </div>
          )}

          {!isOwnPin && !loadingBattleStatus && (
            <div className={styles.actions}>
              {!battleRequest ? (
                <button
                  className={styles.sendMessageButton}
                  onClick={async () => {
                    setSendingRequest(true)
                    const { data, error } = await createBattleRequest(currentUserId, pin.user_id, pin.id, supabase)
                    if (error) {
                      setToast({ type: 'error', message: error.code === '23505' ? t('pinCard.alreadyRequested') : t('pinCard.requestFailed') })
                    } else {
                      setBattleRequest(data)
                      setToast({ type: 'success', message: t('pinCard.requestSent') })
                    }
                    setSendingRequest(false)
                  }}
                  disabled={sendingRequest}
                >
                  {sendingRequest ? t('common.saving') : `⚔️ ${t('pinCard.requestBattle')}`}
                </button>
              ) : battleRequest.request_status === 'pending' ? (
                <button className={`${styles.sendMessageButton} ${styles.pendingButton}`} disabled>
                  ⏳ {t('pinCard.requestPending')}
                </button>
              ) : (
                <button className={styles.sendMessageButton} onClick={() => { onClose(); navigate(`/messages/${battleRequest.conversation_id}`) }}>
                  💬 {t('pinCard.openChat')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </>
  )
}
