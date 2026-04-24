import styles from './PinMarker.module.css'

/**
 * PinMarker component with 4-color relationship system:
 * - 'own' (BLUE) - User's own pin
 * - 'other' (RED) - Other user's pin, no interaction yet
 * - 'messaged' (YELLOW) - DM sent/received OR battle request pending
 * - 'battled' (GREEN) - Battle confirmed/completed
 */
export default function PinMarker({ relationshipState = 'other', onClick, index = 0 }) {
  const markerClass = styles[`${relationshipState}Marker`]

  return (
    <div
      className={`${styles.pinMarker} ${markerClass}`}
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Hexagon SVG shape */}
      <svg
        width="40"
        height="45"
        viewBox="0 0 32 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.hexagon}
      >
        {/* Hexagon path */}
        <path
          d="M16 2L28.3923 9.5V24.5L16 32L3.60769 24.5V9.5L16 2Z"
          fill="var(--bg-deep)"
          stroke="currentColor"
          strokeWidth="2"
        />
        {/* Digimon crest icon - simplified triangular crest */}
        <path
          d="M16 11L20 16L16 21L12 16L16 11Z"
          fill="currentColor"
          opacity="0.9"
        />
        <circle
          cx="16"
          cy="16"
          r="2"
          fill="currentColor"
        />
      </svg>

      {/* Glow effect */}
      <div className={styles.glow} />
    </div>
  )
}
