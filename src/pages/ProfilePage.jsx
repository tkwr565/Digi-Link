import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import DigimonSprite from '../components/DigimonSprite'
import DigimonPicker from '../components/DigimonPicker'
import DeviceChecklist from '../components/DeviceChecklist'
import styles from './ProfilePage.module.css'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)

  // View mode data
  const [profile, setProfile] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceList, setDeviceList] = useState([])
  const [digimonList, setDigimonList] = useState([])

  // Edit mode data
  const [editUsername, setEditUsername] = useState('')
  const [editFavouriteDigimon, setEditFavouriteDigimon] = useState(null)
  const [editActivePartners, setEditActivePartners] = useState([])
  const [editOwnedDevices, setEditOwnedDevices] = useState([])
  const [editActiveDevices, setEditActiveDevices] = useState([])

  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameError, setUsernameError] = useState('')

  // Load device list and digimon list
  useEffect(() => {
    fetch('/DIGIVICE_LIST.json')
      .then(res => res.json())
      .then(data => setDeviceList(data))
      .catch(err => console.error('Failed to load device list:', err))

    fetch('/sprites/digimon_db.json')
      .then(res => res.json())
      .then(data => setDigimonList(data))
      .catch(err => console.error('Failed to load digimon list:', err))
  }, [])

  // Load profile data
  useEffect(() => {
    if (!user) return
    loadProfile()
  }, [user])

  const loadProfile = async () => {
    setLoading(true)
    setError('')

    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      setProfile(profileData)

      // Load devices
      const { data: devicesData, error: devicesError } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)

      if (devicesError) throw devicesError

      setDevices(devicesData || [])
    } catch (err) {
      console.error('Failed to load profile:', err)
      setError(`Failed to load profile: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const getDeviceName = (deviceId, versionLabel = 'Standard') => {
    for (const category of deviceList) {
      for (const device of category.devices) {
        if (device.id === deviceId) {
          if (versionLabel === 'Standard' && !device.versions) {
            return device.name
          }
          return `${device.name}${versionLabel !== 'Standard' ? ` - ${versionLabel}` : ''}`
        }
      }
    }
    return `${deviceId}${versionLabel !== 'Standard' ? ` - ${versionLabel}` : ''}`
  }

  const getDigimonName = (suffix) => {
    const digimon = digimonList.find(d => d.suffix === suffix)
    return digimon ? digimon.name : suffix
  }

  const handleEditClick = () => {
    // Populate edit fields from current profile
    setEditUsername(profile.username)

    // Load Digimon data for edit mode
    fetch('/sprites/digimon_db.json')
      .then(res => res.json())
      .then(digimonList => {
        const favourite = digimonList.find(d => d.suffix === profile.favourite_digimon)
        setEditFavouriteDigimon(favourite || null)

        const partners = profile.active_partners
          .map(suffix => digimonList.find(d => d.suffix === suffix))
          .filter(Boolean)
        setEditActivePartners(partners)
      })

    // Convert devices to the format expected by DeviceChecklist
    const owned = devices.map(d =>
      d.version_label !== 'Standard' ? `${d.digivice_id}:${d.version_label}` : d.digivice_id
    )
    setEditOwnedDevices(owned)

    const active = devices
      .filter(d => d.is_active)
      .map(d =>
        d.version_label !== 'Standard' ? `${d.digivice_id}:${d.version_label}` : d.digivice_id
      )
    setEditActiveDevices(active)

    setEditMode(true)
  }

  const checkUsernameUnique = async (username) => {
    if (!username || username.length < 3) {
      return false
    }

    // Don't check if username hasn't changed
    if (username === profile.username) {
      return true
    }

    setUsernameChecking(true)
    setUsernameError('')

    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle()

    setUsernameChecking(false)

    if (error) {
      console.error('Error checking username:', error)
      setUsernameError('Error checking username availability')
      return false
    }

    if (data) {
      setUsernameError('Username already taken')
      return false
    }

    return true
  }

  const handleSave = async () => {
    // Validate username
    if (editUsername.length < 3 || editUsername.length > 20) {
      setError('Username must be between 3 and 20 characters')
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(editUsername)) {
      setError('Username can only contain letters, numbers, and underscores')
      return
    }

    const isUnique = await checkUsernameUnique(editUsername)
    if (!isUnique) {
      setError('Username is already taken')
      return
    }

    // Validate Digimon
    if (!editFavouriteDigimon) {
      setError('Please select a favourite Digimon')
      return
    }

    if (editActivePartners.length === 0) {
      setError('Please select at least one active partner')
      return
    }

    // Validate devices
    if (editActiveDevices.length === 0) {
      setError('Please select at least one active device')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          username: editUsername,
          favourite_digimon: editFavouriteDigimon.suffix,
          active_partners: editActivePartners.map(d => d.suffix),
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      // Delete existing devices
      const { error: deleteError } = await supabase
        .from('user_devices')
        .delete()
        .eq('user_id', user.id)

      if (deleteError) throw deleteError

      // Insert new devices
      const deviceRecords = editOwnedDevices.map(deviceId => {
        const [digiviceId, versionLabel] = deviceId.includes(':')
          ? deviceId.split(':')
          : [deviceId, 'Standard']

        return {
          user_id: user.id,
          digivice_id: digiviceId,
          version_label: versionLabel,
          is_active: editActiveDevices.includes(deviceId),
        }
      })

      const { error: devicesError } = await supabase
        .from('user_devices')
        .insert(deviceRecords)

      if (devicesError) throw devicesError

      // Reload profile and exit edit mode
      await loadProfile()
      setEditMode(false)
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError(`Failed to save profile: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditMode(false)
    setError('')
    setUsernameError('')
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Profile</h1>
        </div>
        <div className={styles.loading}>Loading profile...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Profile</h1>
        </div>
        <div className={styles.error}>Profile not found</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{editMode ? 'Edit Profile' : 'Profile'}</h1>
        {!editMode && (
          <button onClick={handleEditClick} className={styles.btnEdit}>Edit</button>
        )}
      </div>

      <div className={styles.scrollArea}>
      <div className={styles.card}>
        {!editMode ? (
          // VIEW MODE
          <>
            <div className={styles.usernameRow}>
              <span className={styles.username}>{profile.username}</span>
            </div>

            {/* Favourite Digimon */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Favourite Digimon</h2>
              <div className={styles.favouriteDisplay}>
                <DigimonSprite suffix={profile.favourite_digimon} size="lg" />
                <div className={styles.digimonName}>
                  {getDigimonName(profile.favourite_digimon)}
                </div>
              </div>
            </div>

            {/* Active Partners */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Active Partners</h2>
              <div className={styles.partnersGrid}>
                {profile.active_partners.map(suffix => (
                  <div key={suffix} className={styles.partnerCard}>
                    <DigimonSprite suffix={suffix} size="md" />
                    <div className={styles.partnerName}>{getDigimonName(suffix)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Devices */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Active Devices</h2>
              <div className={styles.devicesList}>
                {devices.filter(d => d.is_active).map(device => (
                  <div key={`${device.digivice_id}-${device.version_label}`} className={styles.deviceItem}>
                    {getDeviceName(device.digivice_id, device.version_label)}
                  </div>
                ))}
                {devices.filter(d => d.is_active).length === 0 && (
                  <div className={styles.emptyState}>No active devices</div>
                )}
              </div>
            </div>

            {/* Battle Stats */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Battle Statistics</h2>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{profile.total_battles}</div>
                  <div className={styles.statLabel}>Total Battles</div>
                </div>
              </div>
            </div>

            <button onClick={() => navigate('/friends')} className={styles.btnFriends}>
              Friends
            </button>

            <button onClick={() => navigate('/my-pins')} className={styles.btnMyPins}>
              My Pins
            </button>

            <button onClick={signOut} className={styles.btnLogout}>
              Log Out
            </button>
          </>
        ) : (
          // EDIT MODE
          <>
            {error && (
              <div className={styles.errorBox}>{error}</div>
            )}

            {/* Username */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Username</h2>
              <input
                type="text"
                value={editUsername}
                onChange={e => {
                  setEditUsername(e.target.value)
                  setUsernameError('')
                }}
                onBlur={() => editUsername !== profile.username && checkUsernameUnique(editUsername)}
                className={styles.input}
                disabled={saving}
              />
              {usernameChecking && (
                <div className={styles.hint}>Checking availability...</div>
              )}
              {usernameError && (
                <div className={styles.inputError}>{usernameError}</div>
              )}
              {editUsername !== profile.username && !usernameError && !usernameChecking && editUsername.length >= 3 && (
                <div className={styles.hintSuccess}>Username available!</div>
              )}
            </div>

            {/* Favourite Digimon */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Favourite Digimon</h2>
              {editFavouriteDigimon && (
                <div className={styles.preview}>
                  <DigimonSprite suffix={editFavouriteDigimon.suffix} size="lg" />
                  <div className={styles.previewName}>{editFavouriteDigimon.name}</div>
                </div>
              )}
              <DigimonPicker
                value={editFavouriteDigimon}
                onChange={setEditFavouriteDigimon}
                multiple={false}
                label="Select Favourite Digimon"
              />
            </div>

            {/* Active Partners */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Active Partners</h2>
              {editActivePartners.length > 0 && (
                <div className={styles.previewPartners}>
                  {editActivePartners.map(digimon => (
                    <div key={digimon.suffix} className={styles.partnerPreview}>
                      <DigimonSprite suffix={digimon.suffix} size="md" />
                      <div className={styles.partnerName}>{digimon.name}</div>
                    </div>
                  ))}
                </div>
              )}
              <DigimonPicker
                value={editActivePartners}
                onChange={setEditActivePartners}
                multiple={true}
                maxSelection={3}
                label="Select Active Partners"
              />
            </div>

            {/* Devices */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Devices Owned</h2>
              <DeviceChecklist
                value={editOwnedDevices}
                onChange={(owned) => {
                  setEditOwnedDevices(owned)
                  // Remove any active devices that are no longer owned
                  setEditActiveDevices(prev => prev.filter(id => owned.includes(id)))
                }}
                label="Your Devices"
              />
            </div>

            {/* Active Devices */}
            {editOwnedDevices.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Active Devices</h2>
                <div className={styles.activeDeviceList}>
                  {editOwnedDevices.map(deviceId => {
                    const [digiviceId, versionLabel] = deviceId.includes(':')
                      ? deviceId.split(':')
                      : [deviceId, 'Standard']

                    return (
                      <label key={deviceId} className={styles.activeDeviceLabel}>
                        <input
                          type="checkbox"
                          checked={editActiveDevices.includes(deviceId)}
                          onChange={e => {
                            if (e.target.checked) {
                              setEditActiveDevices([...editActiveDevices, deviceId])
                            } else {
                              setEditActiveDevices(editActiveDevices.filter(id => id !== deviceId))
                            }
                          }}
                          className={styles.checkbox}
                        />
                        <span className={styles.deviceText}>
                          {getDeviceName(digiviceId, versionLabel)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className={styles.buttonGroup}>
              <button
                onClick={handleCancel}
                disabled={saving}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={styles.btnPrimary}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
