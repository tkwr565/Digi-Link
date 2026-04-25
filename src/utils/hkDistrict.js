// Nearest-centroid lookup for Hong Kong's 18 District Council districts.
// Coordinates are approximate district centroids; squared Euclidean distance
// is good enough at HK's scale (~50km span, no projection distortion needed).
// Pins are snapped to a 3-decimal (~100m) grid so precision is already limited.

export const DISTRICTS = [
  { key: 'centralWestern', lat: 22.2846, lng: 114.1540 },
  { key: 'wanChai',        lat: 22.2793, lng: 114.1724 },
  { key: 'eastern',        lat: 22.2838, lng: 114.2226 },
  { key: 'southern',       lat: 22.2461, lng: 114.1697 },
  { key: 'yauTsimMong',    lat: 22.3219, lng: 114.1700 },
  { key: 'shamShuiPo',     lat: 22.3309, lng: 114.1621 },
  { key: 'kowloonCity',    lat: 22.3282, lng: 114.1914 },
  { key: 'wongTaiSin',     lat: 22.3419, lng: 114.1950 },
  { key: 'kwunTong',       lat: 22.3130, lng: 114.2262 },
  { key: 'kwaiTsing',      lat: 22.3556, lng: 114.1288 },
  { key: 'tsuenWan',       lat: 22.3720, lng: 114.1138 },
  { key: 'tuenMun',        lat: 22.3915, lng: 113.9736 },
  { key: 'yuenLong',       lat: 22.4449, lng: 114.0222 },
  { key: 'north',          lat: 22.4971, lng: 114.1388 },
  { key: 'taiPo',          lat: 22.4498, lng: 114.2310 },
  { key: 'shaTin',         lat: 22.3831, lng: 114.1888 },
  { key: 'saiKung',        lat: 22.3815, lng: 114.2705 },
  { key: 'islands',        lat: 22.2602, lng: 113.9460 },
]

// ~0.3 degrees ≈ 33 km — anything further is outside HK, return null
const MAX_DIST_SQ = 0.09

export function getDistrictKey(lat, lng) {
  if (lat == null || lng == null) return null
  let bestKey = null
  let bestDist = Infinity
  for (const d of DISTRICTS) {
    const dlat = lat - d.lat
    const dlng = lng - d.lng
    const dist = dlat * dlat + dlng * dlng
    if (dist < bestDist) {
      bestDist = dist
      bestKey = d.key
    }
  }
  return bestDist <= MAX_DIST_SQ ? bestKey : null
}
