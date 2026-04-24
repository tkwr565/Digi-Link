import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import DigimonPicker from '../components/DigimonPicker'
import DeviceChecklist from '../components/DeviceChecklist'
import DigimonSprite from '../components/DigimonSprite'
import { useTranslation } from 'react-i18next'
import styles from './ProfileSetupPage.module.css'

export default function ProfileSetupPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [language, setLanguage] = useState(i18n.language || 'en')
  const [username, setUsername] = useState('')
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameError, setUsernameError] = useState('')

  const [favouriteDigimon, setFavouriteDigimon] = useState(null)
  const [activePartners, setActivePartners] = useState([])
  const [ownedDevices, setOwnedDevices] = useState([])
  const [activeDevices, setActiveDevices] = useState([])
  const [deviceList, setDeviceList] = useState([])

  useEffect(() => {
    fetch('/DIGIVICE_LIST.json')
      .then(res => res.json())
      .then(data => setDeviceList(data))
      .catch(err => console.error('Failed to load device list:', err))
  }, [])

  const getDeviceName = (deviceId) => {
    for (const category of deviceList) {
      for (const device of category.devices) {
        if (device.id === deviceId) {
          return device.name
        }
        if (device.versions) {
          for (const version of device.versions) {
            if (`${device.id}:${version}` === deviceId) {
              return `${device.name} - ${version}`
            }
          }
        }
      }
    }
    return deviceId
  }

  const checkUsernameUnique = async (username) => {
    if (!username || username.length < 5) {
      return false
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

  const handleLanguageNext = () => {
    i18n.changeLanguage(language)
    setStep(2)
  }

  const handleUsernameNext = async () => {
    if (username.length < 5) {
      setUsernameError('Username must be at least 5 characters')
      return
    }

    if (username.length > 20) {
      setUsernameError('Username must be 20 characters or less')
      return
    }

    if (!/^[a-zA-Z0-9_一-鿿㐀-䶿]+$/.test(username)) {
      setUsernameError('Username can only contain letters, numbers, underscores, or Chinese characters')
      return
    }

    const isUnique = await checkUsernameUnique(username)
    if (isUnique) {
      setStep(3)
    }
  }

  const handleFavouriteNext = () => {
    if (!favouriteDigimon) {
      setError(t('profile.selectFavourite'))
      return
    }
    setError('')
    setStep(4)
  }

  const handlePartnersNext = () => {
    if (activePartners.length === 0) {
      setError(t('profile.selectPartners'))
      return
    }
    setError('')
    setStep(5)
  }

  const handleDevicesNext = () => {
    if (ownedDevices.length === 0) {
      setError('Please select at least one device you own')
      return
    }
    setError('')
    setStep(6)
  }

  const handleSubmit = async () => {
    if (activeDevices.length === 0) {
      setError('Please select at least one active device')
      return
    }

    setLoading(true)
    setError('')

    try {

      // First check if profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()


      if (checkError) {
        throw new Error(`Profile check failed: ${checkError.message}`)
      }

      const profileData = {
        username,
        favourite_digimon: favouriteDigimon.suffix,
        active_partners: activePartners.map(d => d.suffix),
        language: language
      }

      if (!existingProfile) {
        // Profile doesn't exist (Google OAuth case) - create it
        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            ...profileData
          })

        if (createError) {
          // Fallback if language column missing
          const { error: retryError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              username: profileData.username,
              favourite_digimon: profileData.favourite_digimon,
              active_partners: profileData.active_partners
            })
          if (retryError) throw retryError
        }

      } else {
        // Profile exists - update it
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', user.id)

        if (profileError) {
          // Fallback if language column missing
          const { error: retryError } = await supabase
            .from('profiles')
            .update({
              username: profileData.username,
              favourite_digimon: profileData.favourite_digimon,
              active_partners: profileData.active_partners
            })
            .eq('id', user.id)
          if (retryError) throw retryError
        }
      }

      const deviceRecords = activeDevices.map(deviceId => {
        const [digiviceId, versionLabel] = deviceId.includes(':')
          ? deviceId.split(':')
          : [deviceId, 'Standard']

        return {
          user_id: user.id,
          digivice_id: digiviceId,
          version_label: versionLabel,
          is_active: true,
        }
      })


      const { error: devicesError } = await supabase
        .from('user_devices')
        .insert(deviceRecords)

      if (devicesError) {
        throw new Error(`Devices insert failed: ${devicesError.message}`)
      }


      navigate('/')
    } catch (err) {
      console.error('Profile setup error:', err)
      setError(`Failed to save profile: ${err.message}`)
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Profile Setup</h1>
        <div className={styles.stepIndicator}>
          Step {step} of 6
        </div>

        {error && (
          <div className={styles.error}>
            <div>{error}</div>
            {error.includes('profile was not found') && (
              <button
                onClick={() => {
                  signOut().then(() => navigate('/login'))
                }}
                className={styles.btnSecondary}
                style={{ marginTop: '12px', width: '100%' }}
              >
                Back to Login
              </button>
            )}
          </div>
        )}

        {step === 1 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Choose Your Language</h2>
            <p className={styles.stepDesc}>
              Select your preferred language for the interface.
            </p>

            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              className={styles.input}
              style={{ marginBottom: '20px' }}
            >
              <option value="en">English</option>
              <option value="zh-HK">繁體中文 (香港)</option>
            </select>

            <button
              onClick={handleLanguageNext}
              className={styles.btnPrimary}
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Choose Your Username</h2>
            <p className={styles.stepDesc}>
              This is how other trainers will see you on the map.
            </p>

            <input
              type="text"
              value={username}
              onChange={e => {
                setUsername(e.target.value)
                setUsernameError('')
              }}
              onBlur={() => username && checkUsernameUnique(username)}
              placeholder="Enter username..."
              className={styles.input}
              disabled={loading}
              autoFocus
            />

            {usernameChecking && (
              <div className={styles.hint}>{t('profile.checkingUsername')}</div>
            )}

            {usernameError && (
              <div className={styles.inputError}>{usernameError}</div>
            )}

            {username && !usernameError && !usernameChecking && (
              <div className={styles.hintSuccess}>{t('profile.usernameAvailable')}</div>
            )}

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(1)} className={styles.btnSecondary}>
                Back
              </button>
              <button
                onClick={handleUsernameNext}
                disabled={loading || usernameChecking || !username || !!usernameError}
                className={styles.btnPrimary}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Pick Your Favourite Digimon</h2>
            <p className={styles.stepDesc}>
              This will be your profile picture.
            </p>

            {favouriteDigimon && (
              <div className={styles.preview}>
                <DigimonSprite suffix={favouriteDigimon.suffix} size="lg" />
                <div className={styles.previewName}>{favouriteDigimon.name}</div>
              </div>
            )}

            <DigimonPicker
              value={favouriteDigimon}
              onChange={setFavouriteDigimon}
              multiple={false}
              label={t('profile.selectFavourite')}
            />

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(2)} className={styles.btnSecondary}>
                Back
              </button>
              <button onClick={handleFavouriteNext} className={styles.btnPrimary}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Choose Your Active Partners</h2>
            <p className={styles.stepDesc}>
              Select up to 3 Digimon you're currently partnered with.
            </p>

            {activePartners.length > 0 && (
              <div className={styles.previewPartners}>
                {activePartners.map(digimon => (
                  <div key={digimon.suffix} className={styles.partnerPreview}>
                    <DigimonSprite suffix={digimon.suffix} size="md" />
                    <div className={styles.partnerName}>{digimon.name}</div>
                  </div>
                ))}
              </div>
            )}

            <DigimonPicker
              value={activePartners}
              onChange={setActivePartners}
              multiple={true}
              maxSelection={3}
              label={t('profile.selectPartners')}
            />

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(3)} className={styles.btnSecondary}>
                Back
              </button>
              <button onClick={handlePartnersNext} className={styles.btnPrimary}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Which Devices Do You Own?</h2>
            <p className={styles.stepDesc}>
              Select all the digivices you have.
            </p>

            <DeviceChecklist
              value={ownedDevices}
              onChange={setOwnedDevices}
              label={t('profile.ownedDevices')}
            />

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(4)} className={styles.btnSecondary}>
                Back
              </button>
              <button onClick={handleDevicesNext} className={styles.btnPrimary}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Mark Your Active Devices</h2>
            <p className={styles.stepDesc}>
              Which devices do you currently have with you or use regularly?
            </p>

            <div className={styles.activeDeviceList}>
              {ownedDevices.map(deviceId => (
                <label key={deviceId} className={styles.activeDeviceLabel}>
                  <input
                    type="checkbox"
                    checked={activeDevices.includes(deviceId)}
                    onChange={e => {
                      if (e.target.checked) {
                        setActiveDevices([...activeDevices, deviceId])
                      } else {
                        setActiveDevices(activeDevices.filter(id => id !== deviceId))
                      }
                    }}
                    className={styles.checkbox}
                  />
                  <span className={styles.deviceText}>{getDeviceName(deviceId)}</span>
                </label>
              ))}
            </div>

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(5)} className={styles.btnSecondary}>
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className={styles.btnPrimary}
              >
                {loading ? 'Creating Profile...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
