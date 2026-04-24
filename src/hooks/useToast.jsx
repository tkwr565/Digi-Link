import { createContext, useContext, useState, useCallback } from 'react'
import Toast from '../components/Toast'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((type, message, duration = 3000) => {
    // New key on every call forces Toast to remount and reset its timer
    setToast({ type, message, duration, key: Date.now() })
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Toast
          key={toast.key}
          type={toast.type}
          message={toast.message}
          duration={toast.duration}
          onClose={() => setToast(null)}
        />
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
