import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useUnreadCount() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0)
      return
    }

    const loadUnreadCount = async () => {
      // Unread conversations (accepted requests with new messages)
      const { data: convData } = await supabase
        .from('conversations')
        .select('id, user1_id, user2_id, user1_has_unread, user2_has_unread')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)

      // Pending battle requests where current user is the pin owner (responder)
      const { data: battleData } = await supabase
        .from('battles')
        .select('id')
        .eq('responder_id', user.id)
        .eq('request_status', 'pending')

      let count = 0

      if (convData) {
        count += convData.filter(conv => {
          if (conv.user1_id === user.id) return conv.user1_has_unread
          return conv.user2_has_unread
        }).length
      }

      if (battleData) {
        count += battleData.length
      }

      setUnreadCount(count)
    }

    loadUnreadCount()

    // Subscribe to conversation changes (both users' conversations)
    // Supabase realtime doesn't support OR filters, so subscribe without filter
    // and re-query on any change — safe because query itself is scoped to user
    const channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => loadUnreadCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battles' },
        () => loadUnreadCount()
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id])

  return unreadCount
}
