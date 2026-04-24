import { useNavigate, useLocation } from 'react-router-dom'
import { Map as MapIcon, MessageCircle, Trophy, User } from 'lucide-react'
import { useUnreadCount } from '../hooks/useUnreadCount'
import styles from './AppLayout.module.css'

const SESSION_FLAG = 'digimap_load_anim_played'

/**
 * AppLayout - Persistent layout wrapper with bottom navigation
 * This component wraps all main app pages to provide a consistent
 * bottom navigation bar that doesn't re-render on route changes
 */
export default function AppLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const unreadCount = useUnreadCount()

  // Slide-up animation only on first session load (before flag is set by AppLoadAnimation)
  const shouldAnimate = !sessionStorage.getItem(SESSION_FLAG)

  // Determine which nav button is active based on current path
  const isMapActive = location.pathname === '/'
  const isMessagesActive = location.pathname.startsWith('/messages')
  const isLeaderboardActive = location.pathname === '/leaderboard'
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
          title="Map"
        >
          <MapIcon size={24} />
          <span>Map</span>
        </button>
        <button
          className={`${styles.navButton} ${isMessagesActive ? styles.active : ''}`}
          onClick={() => navigate('/messages')}
          title="Messages"
        >
          <div className={styles.navIconWrapper}>
            <MessageCircle size={24} />
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount}</span>
            )}
          </div>
          <span>Messages</span>
        </button>
        <button
          className={`${styles.navButton} ${isLeaderboardActive ? styles.active : ''}`}
          onClick={() => navigate('/leaderboard')}
          title="Leaderboard"
        >
          <Trophy size={24} />
          <span>Leaderboard</span>
        </button>
        <button
          className={`${styles.navButton} ${isProfileActive ? styles.active : ''}`}
          onClick={() => navigate('/profile')}
          title="Profile"
        >
          <User size={24} />
          <span>Profile</span>
        </button>
      </div>
    </div>
  )
}
