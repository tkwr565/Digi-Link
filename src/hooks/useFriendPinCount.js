import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Badge count = pending incoming friend requests + unseen pin notifications from friends.
// Both figures come straight from the DB — no localStorage timestamp hacks.
// Two dedicated channels keep each concern isolated so a broken table subscription
// cannot spill over and silence the other.
export function useFriendPinCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const friendsChannelRef = useRef(null)
  const notifsChannelRef = useRef(null)

  useEffect(() => {
    if (!user?.id) {
      setCount(0)
      return
    }

    const loadCount = async () => {
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
      setCount((reqCount || 0) + (pinCount || 0))
    }

    loadCount()

    // FriendsPage dispatches this after marking notifications seen — re-query so badge drops
    const handleSeen = () => loadCount()
    window.addEventListener('friendsSeen', handleSeen)

    // Channel 1: friendships only
    const friendsChannel = supabase
      .channel(`friend-requests-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          loadCount()
          window.dispatchEvent(new CustomEvent('friendshipChanged'))
        }
      )
      .subscribe()
    friendsChannelRef.current = friendsChannel

    // Channel 2: pin notifications only — INSERT updates badge + signals FriendsPage activity list
    const notifsChannel = supabase
      .channel(`pin-notifs-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friend_pin_notifications' },
        () => {
          loadCount()
          window.dispatchEvent(new CustomEvent('pinNotificationChanged'))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friend_pin_notifications' },
        () => loadCount()
      )
      .subscribe()
    notifsChannelRef.current = notifsChannel

    return () => {
      window.removeEventListener('friendsSeen', handleSeen)
      if (friendsChannelRef.current) {
        supabase.removeChannel(friendsChannelRef.current)
        friendsChannelRef.current = null
      }
      if (notifsChannelRef.current) {
        supabase.removeChannel(notifsChannelRef.current)
        notifsChannelRef.current = null
      }
    }
  }, [user?.id])

  return count
}
