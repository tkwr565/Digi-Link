import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import AppLoadAnimation from './components/AppLoadAnimation'
import { ToastProvider } from './hooks/useToast'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import ProfilePage from './pages/ProfilePage'
import MapPage from './pages/MapPage'
import MessagesPage from './pages/MessagesPage'
import MessageThreadPage from './pages/MessageThreadPage'
import AppLayout from './components/AppLayout'
import MyPinsPage from './pages/MyPinsPage'
import FriendsPage from './pages/FriendsPage'
// LeaderboardPage intentionally not imported — route disabled to reduce Vercel usage

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileComplete, setProfileComplete] = useState(false)

  useEffect(() => {
    if (!user) {
      setProfileLoading(false)
      return
    }

    const checkProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error checking profile:', error)
        // If profile doesn't exist, redirect to profile setup
        setProfileComplete(false)
        setProfileLoading(false)
        return
      }

      // Profile is complete if username exists AND doesn't start with 'user_' (default)
      const isComplete = data?.username && !data.username.startsWith('user_')
      setProfileComplete(isComplete)
      setProfileLoading(false)
    }

    checkProfile()
  }, [user])

  if (loading || profileLoading) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        background: 'var(--bg-deep)',
      }} />
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!profileComplete) {
    return <Navigate to="/profile-setup" replace />
  }

  return children
}

// Route wrapper for profile setup (must be logged in but profile NOT complete)
function ProfileSetupRoute({ children }) {
  const { user, loading, signOut } = useAuth()
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileComplete, setProfileComplete] = useState(false)
  const [profileError, setProfileError] = useState(false)

  useEffect(() => {
    if (!user) {
      setProfileLoading(false)
      return
    }

    const checkProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error checking profile:', error)
        // Profile doesn't exist - this is an error state (user deleted from DB but session still exists)
        setProfileError(true)
        setProfileLoading(false)
        return
      }

      // Profile is complete if username exists AND doesn't start with 'user_' (default)
      const isComplete = data?.username && !data.username.startsWith('user_')
      setProfileComplete(isComplete)
      setProfileLoading(false)
    }

    checkProfile()
  }, [user])

  if (loading || profileLoading) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        background: 'var(--bg-deep)',
      }} />
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Handle case where user auth exists but profile was deleted
  if (profileError) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-primary)',
        gap: '20px',
        padding: '20px'
      }}>
        <p style={{ color: 'var(--red)', textAlign: 'center' }}>
          Profile data not found. This may happen if the database was reset.
        </p>
        <button
          onClick={async () => {
            await signOut()
            window.location.href = '/login'
          }}
          style={{
            background: 'var(--blue-bright)',
            color: 'var(--bg-deepest)',
            padding: '12px 24px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 600,
            fontSize: '16px'
          }}
        >
          Log Out and Start Fresh
        </button>
      </div>
    )
  }

  if (profileComplete) {
    return <Navigate to="/" replace />
  }

  return children
}

// Public route wrapper (redirect to home if already logged in)
function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        background: 'var(--bg-deep)',
      }} />
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppLoadAnimation />
          <Routes>
          {/* Protected routes - wrapped with AppLayout for persistent bottom nav */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <MapPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Profile setup route - no layout (full screen) */}
          <Route
            path="/profile-setup"
            element={
              <ProfileSetupRoute>
                <ProfileSetupPage />
              </ProfileSetupRoute>
            }
          />

          {/* Profile page */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ProfilePage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Messages pages */}
          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <MessagesPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages/:conversationId"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <MessageThreadPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* My Pins page */}
          <Route
            path="/my-pins"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <MyPinsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Leaderboard disabled — redirect to home until re-enabled */}
          <Route path="/leaderboard" element={<Navigate to="/" replace />} />

          {/* Friends page */}
          <Route
            path="/friends"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <FriendsPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Public routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
