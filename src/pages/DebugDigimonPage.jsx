import { useState, useEffect } from 'react'
import { loadDigimonDb } from '../utils/digimonUtils'
import DigimonSprite from '../components/DigimonSprite'

export default function DebugDigimonPage() {
  const [digimonList, setDigimonList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDigimonDb().then(data => {
      setDigimonList(data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ padding: '20px', color: 'white' }}>Loading DB...</div>

  return (
    <div style={{
      padding: '20px',
      background: '#1a1a1a',
      color: 'white',
      minHeight: '100vh',
      fontFamily: 'monospace'
    }}>
      <h1 style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
        Local Debug: Digimon List ({digimonList.length})
      </h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #444' }}>
            <th style={{ padding: '10px' }}>Sprite</th>
            <th style={{ padding: '10px' }}>Name</th>
            <th style={{ padding: '10px' }}>Suffix</th>
            <th style={{ padding: '10px' }}>Type</th>
          </tr>
        </thead>
        <tbody>
          {digimonList.map((d, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #333' }}>
              <td style={{ padding: '5px' }}>
                <DigimonSprite suffix={d.suffix} size="sm" />
              </td>
              <td style={{ padding: '10px' }}>{d.name}</td>
              <td style={{ padding: '10px' }}>{d.suffix}</td>
              <td style={{ padding: '10px' }}>{d.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
