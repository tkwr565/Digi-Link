import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import DigimonPicker from '../components/DigimonPicker'
import DeviceChecklist from '../components/DeviceChecklist'
import DigimonSprite from '../components/DigimonSprite'
import styles from './ProfileSetupPage.module.css'

export default function ProfileSetupPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      setUsernameError('Error checking username availability')
      return false
    }

    if (data) {
      setUsernameError('Username already taken')
      return false
    }

    return true
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
      setStep(2)
    }
  }

  const handleFavouriteNext = () => {
    if (!favouriteDigimon) {
      setError('Please select a favourite Digimon')
      return
    }
    setError('')
    setStep(3)
  }

  const handlePartnersNext = () => {
    if (activePartners.length === 0) {
      setError('Please select at least one active partner')
      return
    }
    setError('')
    setStep(4)
  }

  const handleDevicesNext = () => {
    if (ownedDevices.length === 0) {
      setError('Please select at least one device you own')
      return
    }
    setError('')
    setStep(5)
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

      if (!existingProfile) {
        // Profile doesn't exist (Google OAuth case) - create it
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            username,
            favourite_digimon: favouriteDigimon.suffix,
            active_partners: activePartners.map(d => d.suffix),
          })
          .select()

        if (createError) {
          console.error('Profile creation error:', createError)
          throw new Error(`Failed to create profile: ${createError.message}`)
        }

      } else {
        // Profile exists - update it
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .update({
            username,
            favourite_digimon: favouriteDigimon.suffix,
            active_partners: activePartners.map(d => d.suffix),
          })
          .eq('id', user.id)
          .select()

        if (profileError) {
          console.error('Profile update error:', profileError)
          throw new Error(`Profile update failed: ${profileError.message}`)
        }


        if (!profileData || profileData.length === 0) {
          throw new Error('Profile update returned no data')
        }
      }

      const deviceRecords = activeDevices.map(deviceId => {
        // Split device ID into digivice_id and version_label
        // Format is either "device-id" or "device-id:version"
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


      const { data: devicesData, error: devicesError } = await supabase
        .from('user_devices')
        .insert(deviceRecords)
        .select()

      if (devicesError) {
        console.error('Devices insert error:', devicesError)
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
          Step {step} of 5
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
              <div className={styles.hint}>Checking availability...</div>
            )}

            {usernameError && (
              <div className={styles.inputError}>{usernameError}</div>
            )}

            {username && !usernameError && !usernameChecking && (
              <div className={styles.hintSuccess}>Username available!</div>
            )}

            <button
              onClick={handleUsernameNext}
              disabled={loading || usernameChecking || !username || !!usernameError}
              className={styles.btnPrimary}
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
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
              label="Select Favourite Digimon"
            />

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(1)} className={styles.btnSecondary}>
                Back
              </button>
              <button onClick={handleFavouriteNext} className={styles.btnPrimary}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
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
              label="Select Active Partners"
            />

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(2)} className={styles.btnSecondary}>
                Back
              </button>
              <button onClick={handlePartnersNext} className={styles.btnPrimary}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Which Devices Do You Own?</h2>
            <p className={styles.stepDesc}>
              Select all the digivices you have.
            </p>

            <DeviceChecklist
              value={ownedDevices}
              onChange={setOwnedDevices}
              label="Your Devices"
            />

            <div className={styles.buttonGroup}>
              <button onClick={() => setStep(3)} className={styles.btnSecondary}>
                Back
              </button>
              <button onClick={handleDevicesNext} className={styles.btnPrimary}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
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
              <button onClick={() => setStep(4)} className={styles.btnSecondary}>
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
