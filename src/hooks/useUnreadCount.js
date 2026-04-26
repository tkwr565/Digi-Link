import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useUnreadCount() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const channelRef = useRef(null)
  const mountedRef = useRef(true)  // ✅ Added

  useEffect(() => {
    mountedRef.current = true  // ✅ Added
    
    if (!user?.id) {
      setUnreadCount(0)
      return
    }

    const loadUnreadCount = async () => {
      if (!mountedRef.current) return  // ✅ Added
      
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

      if (mountedRef.current) {  // ✅ Added
        setUnreadCount(count)
      }
    }

    loadUnreadCount()

    const channel = supabase
      .channel(`unread-messages-${user.id}`)  // ✅ Unique name
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => mountedRef.current && loadUnreadCount()  // ✅ Check mounted
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battles' },
        () => mountedRef.current && loadUnreadCount()  // ✅ Check mounted
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      mountedRef.current = false  // ✅ Added
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id])  // ✅ Only user.id

  return unreadCount
}
