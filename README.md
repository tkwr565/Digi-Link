# 數碼連結 (Digi-Link)

> Find other Digimon fans in the real world. · 尋找現實世界中的數碼暴龍粉絲

[![License: Custom NC](https://img.shields.io/badge/license-NonCommercial-red.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase)](https://supabase.com)
[![MapLibre](https://img.shields.io/badge/MapLibre-Map-396CB2)](https://maplibre.org)

Remember bumping into a stranger on the street who also had a Digivice? 數碼連結 (Digi-Link) brings that back — for adults, anywhere on the planet.

The app is fully localised in **English** and **繁體中文 (Traditional Chinese / Hong Kong)**.

---

## What it does

Drop a timed pin on the map when you're out and about with your Digivice. Other fans nearby can see your pin, check out your profile, and send you a message. Meet up, battle, and log it.

---

## Features

- **Live map** — dark Digital World-themed map showing active fan pins near you
- **Location pins** — set a time window for when you'll be around; pins auto-expire
- **Profiles** — pick your favourite Digimon as your avatar, list the Digivices you carry
- **Direct messages** — chat with fans who spotted your pin, one thread per pin
- **Battle log** — both players confirm a real-life battle inside the DM thread; your count goes up
- **Friends** — add fans you've met, get notified when friends drop new pins
- **Leaderboard** — see who's battled the most in the community

---

## How to use

1. **Register** with your email or Google account
2. **Set up your profile** — choose your favourite Digimon and list the Digivices you own
3. **Drop a pin** on the map when you're heading out — set how long you'll be available
4. **Tap any pin** on the map to see that fan's profile and send them a message
5. **Confirm a battle** inside the DM thread once you've met in person — both players tap the button

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Map | MapLibre GL JS via react-map-gl |
| Map tiles | CartoCDN Dark Matter (free, no API key) |
| Backend / DB / Auth | Supabase (PostgreSQL + PostGIS + Realtime) |
| Hosting | Vercel |

---

## Running locally

```bash
# 1. Clone the repo
git clone https://github.com/tkwr565/Digi-Link.git
cd Digi-Link

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Fill in your Supabase URL and anon key

# 4. Start the dev server
npm run dev
```

You will need a [Supabase](https://supabase.com) project with PostGIS enabled. See `.env.example` for the required variables.

---

## Contributing

This is a personal fan project. Bug reports and suggestions are welcome via [GitHub Issues](https://github.com/tkwr565/Digi-Link/issues). Pull requests may be considered at the maintainer's discretion.

Please read the [license](LICENSE) before contributing — commercial use of this code or any derivative is not permitted.

---

## License

Copyright © 2026 Thomas Wong. All rights reserved.

This project is released under a custom **NonCommercial** license. You may view, fork, and run the code for personal and educational purposes. **Commercial use of any kind is strictly prohibited.** See [LICENSE](LICENSE) for full terms.

---

## Disclaimer

This is an unofficial fan project. Digimon and all related characters, names, and trademarks are the property of Bandai and Toei Animation. This project is not affiliated with, endorsed by, or connected to Bandai or Toei Animation in any way.
