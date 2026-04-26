// Utility functions for Digimon data
import digimonDbData from './digimon_db.json'

export const getSpriteUrl = (suffix, frame) =>
  `/sprites/spr_mon_${suffix}/spr_mon_${suffix}_${frame}.png`

export const loadDigimonDb = async () => digimonDbData

// Get full Digimon name from suffix
export const getDigimonName = (suffix, digimonDb = null) => {
  const db = digimonDb || digimonDbCache

  if (!db) {
    return suffix
  }

  const digimon = db.find(d => d.suffix === suffix)
  return digimon ? digimon.name : suffix
}

// Get full device name from device ID
// Loads DIGIVICE_LIST.json and finds the matching device
export const getDeviceName = async (deviceId, versionLabel = null) => {
  try {
    const response = await fetch('/DIGIVICE_LIST.json')
    const categories = await response.json()

    // Search through all categories and devices
    for (const category of categories) {
      for (const device of category.devices) {
        if (device.id === deviceId) {
          // If version label is provided, include it
          if (versionLabel) {
            return `${device.name} - ${versionLabel}`
          }
          return device.name
        }
      }
    }

    // Fallback if device not found
    return versionLabel ? `${deviceId} - ${versionLabel}` : deviceId
  } catch (error) {
    console.error('Error loading device list:', error)
    return versionLabel ? `${deviceId} - ${versionLabel}` : deviceId
  }
}

// Synchronous version that caches the device list
let deviceListCache = null

export const loadDeviceList = async () => {
  if (deviceListCache) return deviceListCache

  try {
    const response = await fetch('/DIGIVICE_LIST.json')
    deviceListCache = await response.json()
    return deviceListCache
  } catch (error) {
    console.error('Error loading device list:', error)
    return []
  }
}

export const getDeviceNameSync = (deviceId, versionLabel = null, deviceList = null) => {
  const categories = deviceList || deviceListCache

  if (!categories) {
    return versionLabel ? `${deviceId} - ${versionLabel}` : deviceId
  }

  // Search through all categories and devices
  for (const category of categories) {
    for (const device of category.devices) {
      if (device.id === deviceId) {
        // If version label is provided, include it
        if (versionLabel) {
          return `${device.name} - ${versionLabel}`
        }
        return device.name
      }
    }
  }

  // Fallback if device not found
  return versionLabel ? `${deviceId} - ${versionLabel}` : deviceId
}

// Get device category from device ID
export const getDeviceCategory = (deviceId, deviceList = null) => {
  const categories = deviceList || deviceListCache

  if (!categories) {
    return null
  }

  // Search through all categories and devices
  for (const category of categories) {
    for (const device of category.devices) {
      if (device.id === deviceId) {
        return category.category
      }
    }
  }

  return null
}

// Get full device display with category: "Device Name (Category)"
export const getDeviceFullDisplay = (deviceId, versionLabel = null, deviceList = null) => {
  const name = getDeviceNameSync(deviceId, versionLabel, deviceList)
  const category = getDeviceCategory(deviceId, deviceList)

  if (category) {
    return `${name} (${category})`
  }

  return name
}
