import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { hasUnread, formatMessageTime, acceptBattleRequest } from '../utils/messageUtils'
import { loadDigimonDb } from '../utils/digimonUtils'
import DigimonSprite from '../components/DigimonSprite'
import EmptyState from '../components/EmptyState'
import styles from './MessagesPage.module.css'

function MessagesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [digimonDb, setDigimonDb] = useState([])
  const reconnectTimeoutRef = useRef(null)
  const channelRef = useRef(null)
  const requestsChannelRef = useRef(null)

  // Load Digimon database
  useEffect(() => {
    loadDigimonDb().then(setDigimonDb)
  }, [])

  // Load conversations
  const loadConversations = async () => {
    if (!user) {
      return
    }


    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        pin:pins(id, title, is_active),
        user1:profiles!conversations_user1_id_fkey(id, username, favourite_digimon),
        user2:profiles!conversations_user2_id_fkey(id, username, favourite_digimon)
      `)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (error) {
      console.error('[MessagesPage] Error loading conversations:', error)
      setLoadError(true)
      setLoading(false)
      return
    }

    setConversations(data || [])
    setLoading(false)
  }

  // Load pending battle requests (both received and sent)
  const loadPendingRequests = async () => {
    if (!user) {
      return
    }


    // Load requests where user is EITHER requester OR responder
    const { data, error } = await supabase
      .from('battles')
      .select(`
        *,
        requester:profiles!battles_requester_id_fkey(id, username, favourite_digimon),
        responder:profiles!battles_responder_id_fkey(id, username, favourite_digimon),
        pin:pins(id, title, is_active, user_id)
      `)
      .or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`)
      .eq('request_status', 'pending')
      .order('request_created_at', { ascending: false })

    if (error) {
      console.error('[MessagesPage] Error loading pending requests:', error)
      return
    }

    // Filter out requests for expired pins
    const activeRequests = data?.filter(req => req.pin && req.pin.is_active) || []
    setPendingRequests(activeRequests)
  }

  useEffect(() => {
    loadConversations()
    loadPendingRequests()
  }, [user])

  // Subscribe to conversation updates (realtime) with monitoring and auto-reconnect
  useEffect(() => {
    if (!user?.id) {
      return
    }


    let reconnectAttempts = 0
    const maxReconnectAttempts = 3
    let isSubscribed = false

    const setupSubscription = () => {
      // Clear any existing channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }

      const channel = supabase
        .channel(`conversations-${user.id}-${Date.now()}`, {
          config: {
            broadcast: { self: false },
            presence: { key: '' }
          }
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `or(user1_id.eq.${user.id},user2_id.eq.${user.id})`
          },
          (payload) => {
            // Reload conversations when any conversation is updated
            loadConversations()
          }
        )
        .subscribe((status, err) => {

          if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0
            isSubscribed = true
          } else if (status === 'CHANNEL_ERROR') {
            isSubscribed = false
            console.error('[MessagesPage] ✗ Channel error:', err)

            // Attempt reconnection with exponential backoff
            if (reconnectAttempts < maxReconnectAttempts) {
              const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
              reconnectAttempts++

              reconnectTimeoutRef.current = setTimeout(() => {
                setupSubscription()
              }, delay)
            } else {
              console.error('[MessagesPage] Max reconnection attempts reached')
            }
          } else if (status === 'CLOSED') {
            isSubscribed = false
          } else if (status === 'TIMED_OUT') {
            isSubscribed = false
            console.error('[MessagesPage] Subscription timed out')
          }
        })

      channelRef.current = channel
    }

    // Small delay to ensure user is fully loaded
    const initTimeout = setTimeout(() => {
      setupSubscription()
    }, 100)

    return () => {
      clearTimeout(initTimeout)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id])

  // Subscribe to battle requests (realtime)
  useEffect(() => {
    if (!user?.id) {
      return
    }


    const channel = supabase
      .channel(`battle-requests-${user.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'battles',
          filter: `or(requester_id.eq.${user.id},responder_id.eq.${user.id})`
        },
        (payload) => {
          loadPendingRequests()
          // Also reload conversations in case request was accepted
          if (payload.eventType === 'UPDATE' && payload.new.request_status === 'accepted') {
            loadConversations()
          }
        }
      )
      .subscribe()

    requestsChannelRef.current = channel

    return () => {
      if (requestsChannelRef.current) {
        supabase.removeChannel(requestsChannelRef.current)
        requestsChannelRef.current = null
      }
    }
  }, [user?.id])

  const handleConversationClick = (conversation) => {
    navigate(`/messages/${conversation.id}`)
  }

  const handleAcceptRequest = async (battleRequest) => {

    const { data, error } = await acceptBattleRequest(
      battleRequest.id,
      battleRequest.pin_id,
      user.id,
      battleRequest.requester_id,
      supabase,
      battleRequest.pin?.title || null
    )

    if (error) {
      console.error('[MessagesPage] Error accepting request:', error)
      alert('Failed to accept request. Please try again.')
      return
    }


    // Remove from pending list
    setPendingRequests(prev => prev.filter(req => req.id !== battleRequest.id))

    // Navigate to the new conversation
    navigate(`/messages/${data.conversation.id}`)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Messages</h1>
        </div>
        <div className={styles.loading}>Loading conversations...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Messages</h1>
        </div>
        <EmptyState
          icon={WifiOff}
          title="Could not load messages"
          message="Check your connection and try again."
          action={{ label: 'Retry', onClick: () => { setLoadError(false); setLoading(true); loadConversations() } }}
          variant="error"
        />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Messages</h1>
        {(conversations.length > 0 || pendingRequests.length > 0) && (
          <div className={styles.unreadCount}>
            {(conversations.filter(c => hasUnread(c, user.id)).length + pendingRequests.length) > 0 && (
              <span className={styles.badge}>
                {conversations.filter(c => hasUnread(c, user.id)).length + pendingRequests.length}
              </span>
            )}
          </div>
        )}
      </div>

      {conversations.length === 0 && pendingRequests.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No messages yet"
          message="Request a battle from a pin on the map to start a conversation."
        />
      ) : (() => {
        const activeConversations = conversations.filter(c => c.pin && c.pin.is_active)
        const expiredConversations = conversations.filter(c => !c.pin || !c.pin.is_active)

        const renderRequest = (request) => {
          const isRequester = request.requester_id === user.id
          const otherUser = isRequester ? request.responder : request.requester
          return (
            <div
              key={request.id}
              className={`${styles.conversationItem} ${styles.pendingRequest}`}
            >
              <div className={styles.avatar}>
                <DigimonSprite suffix={otherUser.favourite_digimon} size="md" />
              </div>
              <div className={styles.conversationContent}>
                <div className={styles.conversationHeader}>
                  <span className={styles.username}>{otherUser.username}</span>
                  <span className={styles.timestamp}>
                    {formatMessageTime(request.request_created_at)}
                  </span>
                </div>
                <div className={styles.pinTitle}>
                  ⚔️ Battle Request — {request.pin.title}
                </div>
                <div className={styles.preview}>
                  {isRequester
                    ? `Waiting for ${otherUser.username} to accept your request...`
                    : 'Wants to battle at your pin!'}
                </div>
                {isRequester ? (
                  <button className={styles.pendingButton} disabled>⏳ Pending</button>
                ) : (
                  <button className={styles.acceptButton} onClick={() => handleAcceptRequest(request)}>
                    ✓ Accept Request
                  </button>
                )}
              </div>
            </div>
          )
        }

        const renderConversation = (conversation) => {
          const otherUser = conversation.user1_id === user.id ? conversation.user2 : conversation.user1
          const isUnread = hasUnread(conversation, user.id)
          // pin === null means the pin was deleted by its owner (pin_id SET NULL on delete).
          // pin exists but is_active === false means the pin expired naturally.
          const isPinDeleted = !conversation.pin
          const isPinActive = conversation.pin && conversation.pin.is_active
          const pinDisplayTitle = isPinDeleted
            ? (conversation.pin_title_snapshot
                ? `[Deleted] ${conversation.pin_title_snapshot}`
                : '[Deleted Pin by User]')
            : conversation.pin?.title
              ? `[Expired] ${conversation.pin.title}`
              : '[Expired Pin]'
          return (
            <div
              key={conversation.id}
              className={`${styles.conversationItem} ${isUnread ? styles.unread : ''} ${!isPinActive ? styles.archived : ''}`}
              onClick={() => handleConversationClick(conversation)}
            >
              <div className={styles.avatar}>
                <DigimonSprite suffix={otherUser.favourite_digimon} size="md" />
              </div>
              <div className={styles.conversationContent}>
                <div className={styles.conversationHeader}>
                  <span className={styles.username}>{otherUser.username}</span>
                  {conversation.last_message_at && (
                    <span className={styles.timestamp}>
                      {formatMessageTime(conversation.last_message_at)}
                    </span>
                  )}
                </div>
                <div className={styles.pinTitle}>
                  {isPinActive ? (
                    <>📍 {conversation.pin.title}</>
                  ) : (
                    <>🔒 {pinDisplayTitle}</>
                  )}
                </div>
                {conversation.last_message_preview && (
                  <div className={styles.preview}>{conversation.last_message_preview}</div>
                )}
                {isUnread && <div className={styles.unreadIndicator} />}
              </div>
            </div>
          )
        }

        return (
          <div className={styles.conversationList}>
            {pendingRequests.length > 0 && (
              <>
                <div className={styles.sectionHeader}>New Requests</div>
                {pendingRequests.map(renderRequest)}
              </>
            )}
            {activeConversations.length > 0 && (
              <>
                <div className={styles.sectionHeader}>Active</div>
                {activeConversations.map(renderConversation)}
              </>
            )}
            {expiredConversations.length > 0 && (
              <>
                <div className={styles.sectionHeader}>Expired</div>
                {expiredConversations.map(renderConversation)}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}

export default MessagesPage
