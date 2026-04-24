import { useEffect } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
import styles from './Toast.module.css'

/**
 * Toast notification component
 * @param {string} type - 'success' | 'error' | 'info'
 * @param {string} message - Message to display
 * @param {function} onClose - Callback when toast closes
 * @param {number} duration - Auto-close duration in ms (default 3000)
 */
export default function Toast({ type = 'success', message, onClose, duration = 3000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <Check size={20} />
      case 'error':
        return <AlertCircle size={20} />
      default:
        return <AlertCircle size={20} />
    }
  }

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <div className={styles.icon}>
        {getIcon()}
      </div>
      <div className={styles.message}>
        {message}
      </div>
      <button className={styles.closeButton} onClick={onClose}>
        <X size={18} />
      </button>
    </div>
  )
}
