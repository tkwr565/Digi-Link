import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useUnreadCount() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const channelRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    if (!user?.id) {
      setUnreadCount(0)
      return
    }

    const loadUnreadCount = async () => {
      if (!mountedRef.current) return

      const { data: convData } = await supabase
        .from('conversations')
        .select('id, user1_id, user2_id, user1_has_unread, user2_has_unread')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)

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

      if (mountedRef.current) {
        setUnreadCount(count)
      }
    }

    loadUnreadCount()

    // Use filtered subscriptions so only this user's events are sent over the wire.
    // conversations needs two listeners (OR not supported in realtime filters).
    const channel = supabase
      .channel(`unread-messages-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user1_id=eq.${user.id}` },
        () => mountedRef.current && loadUnreadCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user2_id=eq.${user.id}` },
        () => mountedRef.current && loadUnreadCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battles', filter: `responder_id=eq.${user.id}` },
        () => mountedRef.current && loadUnreadCount()
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      mountedRef.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id])

  return unreadCount
}
