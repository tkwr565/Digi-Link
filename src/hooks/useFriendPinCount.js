import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useFriendPinCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const channelRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    if (!user?.id) {
      setCount(0)
      return
    }

    const loadCount = async () => {
      if (!mountedRef.current) return

      const [{ count: reqCount }, { count: pinCount }] = await Promise.all([
        supabase
          .from('friendships')
          .select('id', { count: 'exact', head: true })
          .eq('friend_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('friend_pin_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('seen', false),
      ])

      if (mountedRef.current) {
        setCount((reqCount || 0) + (pinCount || 0))
      }
    }

    loadCount()

    const handleSeen = () => loadCount()
    window.addEventListener('friendsSeen', handleSeen)

    // Filtered subscriptions: only events relevant to this user are sent over the wire.
    const channel = supabase
      .channel(`user-activity-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${user.id}` },
        () => {
          if (mountedRef.current) {
            loadCount()
            window.dispatchEvent(new CustomEvent('friendshipChanged'))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_pin_notifications', filter: `user_id=eq.${user.id}` },
        () => {
          if (mountedRef.current) {
            loadCount()
            window.dispatchEvent(new CustomEvent('pinNotificationChanged'))
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      mountedRef.current = false
      window.removeEventListener('friendsSeen', handleSeen)

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id])

  return count
}
