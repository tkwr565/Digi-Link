import styles from './PinLegend.module.css'

export default function PinLegend() {
  // Hexagon SVG component for legend
  const Hexagon = ({ color }) => (
    <svg
      width="20"
      height="22"
      viewBox="0 0 32 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.hexagon}
    >
      <path
        d="M16 2L28.3923 9.5V24.5L16 32L3.60769 24.5V9.5L16 2Z"
        fill="var(--bg-deep)"
        stroke={color}
        strokeWidth="2"
      />
      <path
        d="M16 11L20 16L16 21L12 16L16 11Z"
        fill={color}
        opacity="0.9"
      />
      <circle
        cx="16"
        cy="16"
        r="2"
        fill={color}
      />
    </svg>
  )

  return (
    <div className={styles.legendContainer}>
      <div className={styles.legendPanel}>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <Hexagon color="var(--blue-bright)" />
            <span className={styles.legendLabel}>Your Pins</span>
          </div>

          <div className={styles.legendItem}>
            <Hexagon color="var(--red)" />
            <span className={styles.legendLabel}>Available</span>
          </div>

          <div className={styles.legendItem}>
            <Hexagon color="var(--amber)" />
            <span className={styles.legendLabel}>Contacted</span>
          </div>

          <div className={styles.legendItem}>
            <Hexagon color="var(--green-bright)" />
            <span className={styles.legendLabel}>Battled</span>
          </div>
        </div>
      </div>
    </div>
  )
}
