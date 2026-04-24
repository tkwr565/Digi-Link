import { useNavigate, useLocation } from 'react-router-dom'
import { Map as MapIcon, MessageCircle, Users, User } from 'lucide-react'
import { useUnreadCount } from '../hooks/useUnreadCount'
import { useFriendPinCount } from '../hooks/useFriendPinCount'
import { useTranslation } from 'react-i18next'
import styles from './AppLayout.module.css'

const SESSION_FLAG = 'digi_guts_load_anim_played'

/**
 * AppLayout - Persistent layout wrapper with bottom navigation
 * This component wraps all main app pages to provide a consistent
 * bottom navigation bar that doesn't re-render on route changes
 */
export default function AppLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const unreadCount = useUnreadCount()
  const friendPinCount = useFriendPinCount()
  const { t } = useTranslation()

  // Slide-up animation only on first session load (before flag is set by AppLoadAnimation)
  const shouldAnimate = !sessionStorage.getItem(SESSION_FLAG)

  // Determine which nav button is active based on current path
  const isMapActive = location.pathname === '/'
  const isMessagesActive = location.pathname.startsWith('/messages')
  const isFriendsActive = location.pathname === '/friends'
  const isProfileActive = location.pathname === '/profile'

  return (
    <div className={styles.layout}>
      {/* Page content */}
      <div className={styles.content}>
        {children}
      </div>

      {/* Bottom Navigation Bar */}
      <div className={`${styles.bottomNav} ${shouldAnimate ? styles.navSlideUp : ''}`}>
        <button
          className={`${styles.navButton} ${isMapActive ? styles.active : ''}`}
          onClick={() => navigate('/')}
          title={t('nav.map')}
        >
          <MapIcon size={24} />
          <span>{t('nav.map')}</span>
        </button>
        <button
          className={`${styles.navButton} ${isMessagesActive ? styles.active : ''}`}
          onClick={() => navigate('/messages')}
          title={t('nav.messages')}
        >
          <div className={styles.navIconWrapper}>
            <MessageCircle size={24} />
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount}</span>
            )}
          </div>
          <span>{t('nav.messages')}</span>
        </button>
        <button
          className={`${styles.navButton} ${isFriendsActive ? styles.active : ''}`}
          onClick={() => navigate('/friends')}
          title={t('nav.friends')}
        >
          <div className={styles.navIconWrapper}>
            <Users size={24} />
            {friendPinCount > 0 && (
              <span className={styles.unreadBadge}>{friendPinCount}</span>
            )}
          </div>
          <span>{t('nav.friends')}</span>
        </button>
        <button
          className={`${styles.navButton} ${isProfileActive ? styles.active : ''}`}
          onClick={() => navigate('/profile')}
          title={t('nav.profile')}
        >
          <User size={24} />
          <span>{t('nav.profile')}</span>
        </button>
      </div>
    </div>
  )
}
