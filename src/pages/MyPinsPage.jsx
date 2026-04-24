import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Edit2, Trash2, RefreshCw, Clock, X, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import { useTranslation } from 'react-i18next'
import styles from './MyPinsPage.module.css'

const DAY_LABELS = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }

// Compute real status from pin data
function getPinStatus(pin) {
  if (pin.is_recurring) return 'recurring'
  const now = new Date()
  const start = pin.start_time ? new Date(pin.start_time) : null
  const end = pin.end_time ? new Date(pin.end_time) : null
  if (!end) return 'expired'
  if (now >= (start || 0) && now <= end) return 'active'
  if (start && start > now) return 'upcoming'
  return 'expired'
}

function formatDateTime(isoString, opts = {}) {
  if (!isoString) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    ...opts
  }).format(new Date(isoString))
}

function formatTimeOnly(timeStr) {
  // timeStr = "HH:MM" (24h)
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d)
}

function formatTimeWindow(pin) {
  if (pin.is_recurring && pin.recurrence_rule) {
    const { days = [], start = '', end = '' } = pin.recurrence_rule
    const dayStr = days.map(d => DAY_LABELS[d] || d).join(', ')
    return `${dayStr} | ${formatTimeOnly(start)} – ${formatTimeOnly(end)}`
  }
  if (pin.start_time && pin.end_time) {
    const start = formatDateTime(pin.start_time)
    const end = formatDateTime(pin.end_time, { hour: 'numeric', minute: '2-digit' })
    return `${start} – ${end}`
  }
  return '—'
}


export default function MyPinsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [pins, setPins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit modal state
  const [editingPin, setEditingPin] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editMessage, setEditMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete confirm state: pinId or null
  const [deletingPin, setDeletingPin] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const loadPins = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('pins')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (err) {
      console.error(err)
      setError(t('myPins.error'))
    } else {
      setPins(data || [])
    }
    setLoading(false)
  }, [user, t])

  useEffect(() => { loadPins() }, [loadPins])

  // Group and sort pins
  const grouped = {
    active: [],
    recurring: [],
    upcoming: [],
    expired: [],
  }
  for (const pin of pins) {
    const status = getPinStatus(pin)
    grouped[status].push(pin)
  }
  // upcoming: soonest start first
  grouped.upcoming.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  const openEdit = (pin) => {
    setEditingPin(pin)
    setEditTitle(pin.title || '')
    setEditMessage(pin.message || '')
    setEditError('')
  }

  const closeEdit = () => {
    setEditingPin(null)
    setEditError('')
  }

  const handleSave = async () => {
    if (!editingPin) return
    setEditError('')

    if (!editTitle.trim()) {
      setEditError(t('myPins.titleRequired'))
      return
    }

    setSaving(true)
    try {
      const { error: err } = await supabase
        .from('pins')
        .update({
          title: editTitle.trim(),
          message: editMessage.trim() || null,
        })
        .eq('id', editingPin.id)
        .eq('user_id', user.id)

      if (err) throw err

      closeEdit()
      await loadPins()
    } catch (err) {
      console.error(err)
      setEditError(t('myPins.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (pin) => {
    setDeleting(true)
    const { error: err } = await supabase
      .from('pins')
      .delete()
      .eq('id', pin.id)
      .eq('user_id', user.id)

    if (err) {
      console.error(err)
    }
    setDeletingPin(null)
    setDeleting(false)
    await loadPins()
  }

  const renderStatusBadge = (pin) => {
    const status = getPinStatus(pin)
    return (
      <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
        {status === 'active' && t('myPins.statusActive')}
        {status === 'recurring' && <><RefreshCw size={10} /> {t('myPins.statusRecurring')}</>}
        {status === 'upcoming' && <><Clock size={10} /> {t('myPins.statusUpcoming')}</>}
        {status === 'expired' && t('myPins.statusExpired')}
      </span>
    )
  }

  const renderPinCard = (pin) => {
    const isDeleting = deletingPin === pin.id

    return (
      <div key={pin.id} className={`${styles.card} ${styles[`card_${getPinStatus(pin)}`]}`}>
        <div className={styles.cardTop}>
          {renderStatusBadge(pin)}
          <div className={styles.cardActions}>
            {!isDeleting && (
              <>
                <button
                  className={styles.iconBtn}
                  onClick={() => openEdit(pin)}
                  title={t('common.edit')}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => setDeletingPin(pin.id)}
                  title={t('common.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            {isDeleting && (
              <div className={styles.deleteConfirm}>
                <span>{t('myPins.deleteConfirm')}</span>
                <button
                  className={styles.confirmDeleteBtn}
                  onClick={() => handleDelete(pin)}
                  disabled={deleting}
                >
                  <Check size={14} />
                </button>
                <button
                  className={styles.cancelDeleteBtn}
                  onClick={() => setDeletingPin(null)}
                  disabled={deleting}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={styles.cardTitle}>
          <MapPin size={14} className={styles.pinIcon} />
          {pin.title || 'Pin'}
        </div>

        {pin.message && (
          <div className={styles.cardMessage}>{pin.message}</div>
        )}

        <div className={styles.cardTime}>{formatTimeWindow(pin)}</div>
      </div>
    )
  }

  const renderSection = (labelKey, pinList) => {
    if (pinList.length === 0) return null
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeader}>{t(`myPins.status${labelKey.charAt(0).toUpperCase() + labelKey.slice(1)}`)}</div>
        {pinList.map(renderPinCard)}
      </div>
    )
  }

  const totalPins = pins.length

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/profile')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>{t('myPins.title')}</h1>
        <span className={styles.pinCount}>{totalPins}</span>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {loading && (
          <div className={styles.centered}>{t('myPins.loading')}</div>
        )}

        {!loading && error && (
          <div className={styles.errorMsg}>{error}</div>
        )}

        {!loading && !error && totalPins === 0 && (
          <div className={styles.emptyState}>
            <MapPin size={48} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>{t('myPins.emptyTitle')}</p>
            <p className={styles.emptyText}>{t('myPins.emptyText')}</p>
            <button className={styles.goToMapBtn} onClick={() => navigate('/')}>
              {t('myPins.openMap')}
            </button>
          </div>
        )}

        {!loading && !error && totalPins > 0 && (
          <>
            {renderSection('active', grouped.active)}
            {renderSection('recurring', grouped.recurring)}
            {renderSection('upcoming', grouped.upcoming)}
            {renderSection('expired', grouped.expired)}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingPin && (
        <div className={styles.modalBackdrop} onClick={closeEdit}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHandle} />

            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t('myPins.editPin')}</h2>
              <button className={styles.modalCloseBtn} onClick={closeEdit}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.locationNote}>
              <MapPin size={14} />
              {t('myPins.locationNote')}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>{t('myPins.titleLabel')}</label>
              <input
                className={styles.input}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                maxLength={80}
                placeholder={t('myPins.pinTitlePlaceholder')}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>{t('myPins.messageLabel')} <span className={styles.optional}>{t('myPins.optional')}</span></label>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={editMessage}
                onChange={e => setEditMessage(e.target.value)}
                maxLength={200}
                placeholder={t('myPins.messagePlaceholder')}
                rows={3}
              />
            </div>

            {editError && <div className={styles.editError}>{editError}</div>}

            <div className={styles.modalActions}>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t('common.saving') : t('myPins.saveChanges')}
              </button>
              <button
                className={styles.cancelBtn}
                onClick={closeEdit}
                disabled={saving}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
