const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'

export async function fetchWeather(lat, lng) {
  try {
    const url = `${OPEN_METEO}?latitude=${lat}&longitude=${lng}&current=weathercode,is_day&forecast_days=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const { weathercode, is_day } = json.current
    return { condition: classify(weathercode, is_day) }
  } catch {
    return null
  }
}

// WMO weather code → app condition
// 0–1: clear sky / mainly clear
// 2–48: partly cloudy, overcast, fog
// 51+: any precipitation (drizzle, rain, snow, showers, thunderstorm)
function classify(code, is_day) {
  if (!is_day) return 'night'
  if (code <= 1) return 'clear'
  if (code <= 48) return 'cloudy'
  return 'rain'
}

export const WEATHER_META = {
  night:  { label: 'Digital World Sky', emoji: '🌙', color: 'var(--blue-dim)' },
  clear:  { label: 'File Island',        emoji: '☀️', color: 'var(--amber)' },
  cloudy: { label: 'Server Farm',        emoji: '☁️', color: 'var(--text-secondary)' },
  rain:   { label: 'Dark Area',          emoji: '🌧', color: 'var(--blue-bright)' },
}
