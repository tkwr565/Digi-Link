import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import DigimonSprite from '../components/DigimonSprite'
import DigimonPicker from '../components/DigimonPicker'
import DeviceChecklist from '../components/DeviceChecklist'
import { useTranslation } from 'react-i18next'
import styles from './ProfilePage.module.css'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

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
      
      // If profile has a language, set it
      if (profileData.language && profileData.language !== i18n.language) {
        i18n.changeLanguage(profileData.language)
      }

      // Load devices
      const { data: devicesData, error: devicesError } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)

      if (devicesError) throw devicesError

      setDevices(devicesData || [])
    } catch (err) {
      console.error('Failed to load profile:', err)
      setError(`${t('common.error')}: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleLanguageChange = async (newLang) => {
    i18n.changeLanguage(newLang)
    
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ language: newLang })
          .eq('id', user.id)
      } catch (err) {
        console.error('Failed to persist language choice:', err)
      }
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
    if (!username || username.length < 5) {
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
      setUsernameError(t('common.error'))
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
    if (editUsername.length < 5 || editUsername.length > 20) {
      setError('Username must be between 5 and 20 characters')
      return
    }

    if (!/^[a-zA-Z0-9_一-鿿㐀-䶿]+$/.test(editUsername)) {
      setError('Username can only contain letters, numbers, underscores, or Chinese characters')
      return
    }

    const isUnique = await checkUsernameUnique(editUsername)
    if (!isUnique) {
      setError('Username is already taken')
      return
    }

    // Validate Digimon
    if (!editFavouriteDigimon) {
      setError(t('profile.selectFavourite'))
      return
    }

    if (editActivePartners.length === 0) {
      setError(t('profile.selectPartners'))
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
      setError(`${t('common.error')}: ${err.message}`)
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
          <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        </div>
        <div className={styles.loading}>{t('common.loading')}</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
        </div>
        <div className={styles.error}>{t('common.error')}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{editMode ? t('profile.editTitle') : t('profile.title')}</h1>
        <div className={styles.headerActions}>
          <select 
            className={styles.langSwitcher}
            value={i18n.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            <option value="en">EN</option>
            <option value="zh-HK">中</option>
          </select>
          {!editMode && (
            <button onClick={handleEditClick} className={styles.btnEdit}>{t('common.edit')}</button>
          )}
        </div>
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
              <h2 className={styles.sectionTitle}>{t('profile.favouriteDigimon')}</h2>
              <div className={styles.favouriteDisplay}>
                <DigimonSprite suffix={profile.favourite_digimon} size="lg" />
                <div className={styles.digimonName}>
                  {getDigimonName(profile.favourite_digimon)}
                </div>
              </div>
            </div>

            {/* Active Partners */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('profile.activePartners')}</h2>
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
              <h2 className={styles.sectionTitle}>{t('profile.activeDevices')}</h2>
              <div className={styles.devicesList}>
                {devices.filter(d => d.is_active).map(device => (
                  <div key={`${device.digivice_id}-${device.version_label}`} className={styles.deviceItem}>
                    {getDeviceName(device.digivice_id, device.version_label)}
                  </div>
                ))}
                {devices.filter(d => d.is_active).length === 0 && (
                  <div className={styles.emptyState}>{t('profile.noActiveDevices')}</div>
                )}
              </div>
            </div>

            {/* Battle Stats */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('profile.battleStats')}</h2>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{profile.total_battles}</div>
                  <div className={styles.statLabel}>{t('profile.totalBattles')}</div>
                </div>
              </div>
            </div>

            <button onClick={() => navigate('/my-pins')} className={styles.btnMyPins}>
              {t('profile.myPins')}
            </button>

            <button onClick={signOut} className={styles.btnLogout}>
              {t('profile.logout')}
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
              <h2 className={styles.sectionTitle}>{t('profile.username')}</h2>
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
                <div className={styles.hint}>{t('profile.checkingUsername')}</div>
              )}
              {usernameError && (
                <div className={styles.inputError}>{usernameError}</div>
              )}
              {editUsername !== profile.username && !usernameError && !usernameChecking && editUsername.length >= 5 && (
                <div className={styles.hintSuccess}>{t('profile.usernameAvailable')}</div>
              )}
            </div>

            {/* Favourite Digimon */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('profile.favouriteDigimon')}</h2>
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
                label={t('profile.selectFavourite')}
              />
            </div>

            {/* Active Partners */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('profile.activePartners')}</h2>
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
                label={t('profile.selectPartners')}
              />
            </div>

            {/* Devices */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('profile.ownedDevices')}</h2>
              <DeviceChecklist
                value={editOwnedDevices}
                onChange={(owned) => {
                  setEditOwnedDevices(owned)
                  // Remove any active devices that are no longer owned
                  setEditActiveDevices(prev => prev.filter(id => owned.includes(id)))
                }}
                label={t('profile.ownedDevices')}
              />
            </div>

            {/* Active Devices */}
            {editOwnedDevices.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t('profile.activeDevices')}</h2>
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
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={styles.btnPrimary}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
