import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useFriendPinCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const channelRef = useRef(null)  // ✅ Single ref for tracking
  const mountedRef = useRef(true)  // ✅ Track if component is mounted

  useEffect(() => {
    mountedRef.current = true
    
    if (!user?.id) {
      setCount(0)
      return
    }

    const loadCount = async () => {
      if (!mountedRef.current) return  // ✅ Don't update unmounted component
      
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

    // ✅ SINGLE CHANNEL with multiple listeners
    const channel = supabase
      .channel(`user-activity-${user.id}`)  // Unique channel name
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          if (mountedRef.current) {
            loadCount()
            window.dispatchEvent(new CustomEvent('friendshipChanged'))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_pin_notifications' },
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
      mountedRef.current = false  // ✅ Mark as unmounted
      window.removeEventListener('friendsSeen', handleSeen)
      
      // ✅ GUARANTEED cleanup
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id])  // ✅ Only user.id, not entire user object

  return count
}
