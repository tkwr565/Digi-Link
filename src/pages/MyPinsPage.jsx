import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Edit2, Trash2, RefreshCw, Clock, X, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
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
      setError('Failed to load pins.')
    } else {
      setPins(data || [])
    }
    setLoading(false)
  }, [user])

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
      setEditError('Title is required.')
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
      setEditError('Failed to save changes.')
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
        {status === 'active' && 'ACTIVE'}
        {status === 'recurring' && <><RefreshCw size={10} /> RECURRING</>}
        {status === 'upcoming' && <><Clock size={10} /> UPCOMING</>}
        {status === 'expired' && 'EXPIRED'}
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
                  title="Edit pin"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => setDeletingPin(pin.id)}
                  title="Delete pin"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            {isDeleting && (
              <div className={styles.deleteConfirm}>
                <span>Delete?</span>
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

  const renderSection = (label, pinList) => {
    if (pinList.length === 0) return null
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeader}>{label}</div>
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
        <h1 className={styles.title}>MY PINS</h1>
        <span className={styles.pinCount}>{totalPins}</span>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {loading && (
          <div className={styles.centered}>Loading...</div>
        )}

        {!loading && error && (
          <div className={styles.errorMsg}>{error}</div>
        )}

        {!loading && !error && totalPins === 0 && (
          <div className={styles.emptyState}>
            <MapPin size={48} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>No pins yet</p>
            <p className={styles.emptyText}>Create a pin from the map to show up for other Tamers nearby.</p>
            <button className={styles.goToMapBtn} onClick={() => navigate('/')}>
              Open Map
            </button>
          </div>
        )}

        {!loading && !error && totalPins > 0 && (
          <>
            {renderSection('ACTIVE', grouped.active)}
            {renderSection('RECURRING', grouped.recurring)}
            {renderSection('UPCOMING', grouped.upcoming)}
            {renderSection('EXPIRED', grouped.expired)}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingPin && (
        <div className={styles.modalBackdrop} onClick={closeEdit}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHandle} />

            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Edit Pin</h2>
              <button className={styles.modalCloseBtn} onClick={closeEdit}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.locationNote}>
              <MapPin size={14} />
              Location and time window cannot be changed — delete and recreate to adjust.
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Title</label>
              <input
                className={styles.input}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                maxLength={80}
                placeholder="Pin title"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Message <span className={styles.optional}>(optional)</span></label>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={editMessage}
                onChange={e => setEditMessage(e.target.value)}
                maxLength={200}
                placeholder="Optional message for other Tamers"
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
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                className={styles.cancelBtn}
                onClick={closeEdit}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
