import styles from './EmptyState.module.css'

/**
 * EmptyState — Digital World themed empty/error state
 * Props:
 *   icon      — Lucide React icon component (optional)
 *   title     — Main heading
 *   message   — Supporting text
 *   action    — { label, onClick } for optional CTA button
 *   variant   — 'default' | 'error' (changes colors)
 */
export default function EmptyState({ icon: Icon, title, message, action, variant = 'default' }) {
  return (
    <div className={`${styles.container} ${variant === 'error' ? styles.error : ''}`}>
      {Icon && (
        <div className={styles.iconWrap}>
          <Icon size={40} strokeWidth={1.5} />
        </div>
      )}
      <p className={styles.title}>{title}</p>
      {message && <p className={styles.message}>{message}</p>}
      {action && (
        <button className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
