import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getOrCreateConversation, markConversationAsRead, sendMessage as sendMessageUtil, formatMessageTimestamp, getBattleForConversation, toggleBattleConfirmation } from '../utils/messageUtils'
import DigimonSprite from '../components/DigimonSprite'
import styles from './MessageThreadPage.module.css'

// Days after the pin expires that the "add friend" prompt stays visible — easy to adjust
const FRIEND_PROMPT_DAYS = 3

function MessageThreadPage() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const messagesEndRef = useRef(null)
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [otherUser, setOtherUser] = useState(null)
  const [pin, setPin] = useState(null)
  const [battle, setBattle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmingBattle, setConfirmingBattle] = useState(false)
  const [friendStatus, setFriendStatus] = useState('loading') // 'loading' | 'friends' | 'pending_out' | 'pending_in' | 'none'
  const [friendPromptDismissed, setFriendPromptDismissed] = useState(false)
  const reconnectTimeoutRef = useRef(null)
  const channelRef = useRef(null)
  const battleChannelRef = useRef(null)

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load conversation and messages
  const loadConversation = async () => {
    if (!user || !conversationId) return

    // Load conversation
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (convError) {
      console.error('Error loading conversation:', convError)
      setLoading(false)
      return
    }

    // Verify user is a participant
    if (conv.user1_id !== user.id && conv.user2_id !== user.id) {
      console.error('User is not a participant in this conversation')
      navigate('/messages')
      return
    }

    setConversation(conv)

    // Determine other user ID
    const otherUserId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id

    // Load other user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, favourite_digimon')
      .eq('id', otherUserId)
      .single()

    if (profileError) {
      console.error('Error loading profile:', profileError)
    } else {
      setOtherUser(profile)
    }

    // Load friendship status with the other user
    if (otherUserId) {
      const [{ data: outgoing }, { data: incoming }] = await Promise.all([
        supabase.from('friendships').select('status')
          .eq('user_id', user.id).eq('friend_id', otherUserId).maybeSingle(),
        supabase.from('friendships').select('status')
          .eq('user_id', otherUserId).eq('friend_id', user.id).maybeSingle(),
      ])

      if (outgoing?.status === 'accepted') setFriendStatus('friends')
      else if (outgoing?.status === 'pending') setFriendStatus('pending_out')
      else if (incoming) setFriendStatus('pending_in')
      else setFriendStatus('none')
    }

    // Load pin details — skip fetch if pin was deleted (pin_id is null)
    if (conv.pin_id) {
      const { data: pinData, error: pinError } = await supabase
        .from('pins')
        .select('id, title, user_id, is_active, end_time')
        .eq('id', conv.pin_id)
        .single()

      if (pinError) {
        console.error('Error loading pin:', pinError)
      } else {
        setPin(pinData)
      }
    }

    // Load messages
    const { data: msgs, error: msgsError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })

    if (msgsError) {
      console.error('Error loading messages:', msgsError)
    } else {
      setMessages(msgs || [])
    }

    // Load battle record
    const { data: battleData, error: battleError } = await getBattleForConversation(conv.id, supabase)
    if (battleError) {
      console.error('Error loading battle:', battleError)
    } else if (battleData) {
      setBattle(battleData)
    }

    // Mark messages as read
    await markConversationAsRead(conv.id, user.id, supabase)

    setLoading(false)
    setTimeout(scrollToBottom, 100)
  }

  useEffect(() => {
    loadConversation()
  }, [user, conversationId])

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages])

  // Subscribe to new messages (realtime) with monitoring and auto-reconnect
  useEffect(() => {
    if (!conversation?.id) {
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
        .channel(`messages-${conversation.id}-${Date.now()}`, {
          config: {
            broadcast: { self: false },
            presence: { key: '' }
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversation.id}`
          },
          (payload) => {
            setMessages((prev) => {
              // Prevent duplicates - check if message already exists
              if (prev.some(msg => msg.id === payload.new.id)) {
                return prev
              }
              return [...prev, payload.new]
            })

            // Mark as read if message is from other user
            if (payload.new.to_user_id === user.id) {
              markConversationAsRead(conversation.id, user.id, supabase)
            }
          }
        )
        .subscribe((status, err) => {

          if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0
            isSubscribed = true
          } else if (status === 'CHANNEL_ERROR') {
            isSubscribed = false
            console.error('[MessageThread] ✗ Channel error:', err)

            // Attempt reconnection with exponential backoff
            if (reconnectAttempts < maxReconnectAttempts) {
              const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
              reconnectAttempts++

              reconnectTimeoutRef.current = setTimeout(() => {
                setupSubscription()
              }, delay)
            } else {
              console.error('[MessageThread] Max reconnection attempts reached')
            }
          } else if (status === 'CLOSED') {
            isSubscribed = false
          } else if (status === 'TIMED_OUT') {
            isSubscribed = false
            console.error('[MessageThread] Subscription timed out')
          }
        })

      channelRef.current = channel
    }

    // Small delay to ensure conversation is fully loaded
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
  }, [conversation?.id, user?.id])

  // Subscribe to battle updates (realtime)
  useEffect(() => {
    if (!battle?.id) {
      return
    }


    const channel = supabase
      .channel(`battle-${battle.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'battles',
          filter: `id=eq.${battle.id}`
        },
        (payload) => {
          setBattle(payload.new)
        }
      )
      .subscribe()

    battleChannelRef.current = channel

    return () => {
      if (battleChannelRef.current) {
        supabase.removeChannel(battleChannelRef.current)
        battleChannelRef.current = null
      }
    }
  }, [battle?.id])

  const handleBattleConfirmation = async () => {
    if (!battle || confirmingBattle) return

    setConfirmingBattle(true)

    const isRequester = battle.requester_id === user.id

    const { data, error } = await toggleBattleConfirmation(
      battle.id,
      user.id,
      isRequester,
      supabase
    )

    if (error) {
      console.error('Error toggling battle confirmation:', error)
      alert('Failed to update battle status. Please try again.')
    } else {
      setBattle(data)
    }

    setConfirmingBattle(false)
  }

  const handleAddFriend = async () => {
    if (!otherUser) return
    const { error } = await supabase
      .from('friendships')
      .insert({ user_id: user.id, friend_id: otherUser.id, status: 'pending' })
    if (error) { console.error('Failed to send friend request:', error); return }
    setFriendStatus('pending_out')
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!messageText.trim() || !conversation || sending) return

    setSending(true)

    const otherUserId = conversation.user1_id === user.id ? conversation.user2_id : conversation.user1_id

    const { data, error } = await sendMessageUtil(
      conversation.id,
      user.id,
      otherUserId,
      conversation.pin_id,
      messageText,
      supabase
    )

    if (error) {
      console.error('Error sending message:', error)
    } else {
      // Add the sent message to local state immediately (optimistic update)
      if (data) {
        setMessages((prev) => [...prev, data])
      }
      setMessageText('')
    }

    setSending(false)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading conversation...</div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Conversation not found</div>
        <button onClick={() => navigate('/messages')} className={styles.backButton}>
          ← Back to Messages
        </button>
      </div>
    )
  }

  if (!otherUser) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Loading conversation data...</div>
      </div>
    )
  }

  const isPinDeleted = !conversation.pin_id  // null = owner deleted the pin
  const isPinActive = pin && pin.is_active

  // Determine battle confirmation status
  const isRequester = battle && battle.requester_id === user.id
  const currentUserConfirmed = battle && (isRequester ? battle.requester_confirmed : battle.responder_confirmed)
  const otherUserConfirmed = battle && (isRequester ? battle.responder_confirmed : battle.requester_confirmed)
  const battleCompleted = battle && battle.battle_completed_at

  // Friend prompt: show for FRIEND_PROMPT_DAYS after the pin expires (or battle_completed_at if pin deleted)
  const now = new Date()
  const promptWindowMs = FRIEND_PROMPT_DAYS * 24 * 60 * 60 * 1000
  const encounterEndedAt = (() => {
    if (isPinDeleted) return battle?.battle_completed_at ? new Date(battle.battle_completed_at) : null
    if (pin && !pin.is_active) return pin.end_time ? new Date(pin.end_time) : (battle?.battle_completed_at ? new Date(battle.battle_completed_at) : null)
    return null  // pin still active → too early to show
  })()
  const showFriendPrompt =
    !!battleCompleted &&
    !friendPromptDismissed &&
    friendStatus === 'none' &&
    encounterEndedAt !== null &&
    now >= encounterEndedAt &&
    now - encounterEndedAt < promptWindowMs

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/messages')}>
          ←
        </button>
        <div
          className={isPinActive ? styles.headerClickable : styles.headerNonClickable}
          onClick={isPinActive ? () => navigate(`/?pinId=${pin.id}`) : undefined}
          title={isPinActive ? 'View pin on map' : isPinDeleted ? 'Pin deleted by owner' : 'Pin expired'}
        >
          <div className={styles.avatar}>
            <DigimonSprite suffix={otherUser.favourite_digimon} size="sm" />
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.username}>{otherUser.username}</div>
            <div className={styles.pinTitle}>
              {isPinActive
                ? `📍 ${pin.title}`
                : isPinDeleted
                  ? `🔒 ${conversation.pin_title_snapshot ? `[Deleted] ${conversation.pin_title_snapshot}` : '[Deleted Pin by User]'}`
                  : `🔒 ${pin?.title ? `[Expired] ${pin.title}` : '[Expired Pin]'}`
              }
            </div>
          </div>
        </div>

        {/* Battle Completed Button */}
        {battle && (
          <button
            className={`${styles.battleButton} ${currentUserConfirmed ? styles.battleButtonConfirmed : ''} ${battleCompleted ? styles.battleButtonCompleted : ''}`}
            onClick={handleBattleConfirmation}
            disabled={confirmingBattle || battleCompleted}
            title={
              battleCompleted
                ? 'Battle completed!'
                : currentUserConfirmed
                ? 'You confirmed this battle'
                : 'Confirm battle completion'
            }
          >
            {battleCompleted ? (
              <>✓ Battle Completed</>
            ) : currentUserConfirmed ? (
              <>✓ You Confirmed</>
            ) : (
              <>⚔️ Confirm Battle</>
            )}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className={styles.messagesContainer}>
        {!isPinActive && (
          <div className={styles.archivedBanner}>
            {isPinDeleted
              ? '🗑️ This conversation is archived — Pin was deleted by the owner'
              : '🔒 This conversation is archived — Pin has expired'}
          </div>
        )}

        {showFriendPrompt && (
          <div className={styles.friendPrompt}>
            <div className={styles.friendPromptText}>
              Add <strong>{otherUser.username}</strong> as a friend?
            </div>
            <div className={styles.friendPromptActions}>
              <button className={styles.friendPromptAdd} onClick={handleAddFriend}>
                Add Friend
              </button>
              <button className={styles.friendPromptDismiss} onClick={() => setFriendPromptDismissed(true)}>
                Maybe Later
              </button>
            </div>
          </div>
        )}

        {friendStatus === 'pending_out' && battleCompleted && encounterEndedAt && (
          <div className={styles.friendPromptSent}>
            Friend request sent to {otherUser.username} ✓
          </div>
        )}
        {friendStatus === 'friends' && battleCompleted && (
          <div className={styles.friendPromptSent}>
            You and {otherUser.username} are friends ✓
          </div>
        )}
        {messages.length === 0 ? (
          <div className={styles.emptyMessages}>
            <p>No messages yet. Say hello! 👋</p>
          </div>
        ) : (
          <div className={styles.messagesList}>
            {messages.map((message) => {
              const isOwn = message.from_user_id === user.id
              return (
                <div
                  key={message.id}
                  className={`${styles.messageWrapper} ${isOwn ? styles.ownMessage : styles.otherMessage}`}
                >
                  <div className={styles.messageBubble}>
                    <div className={styles.messageContent}>{message.content}</div>
                    <div className={styles.messageTimestamp}>
                      {formatMessageTimestamp(message.created_at)}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input - always available for battle conversations */}
      <form className={styles.inputContainer} onSubmit={handleSendMessage}>
        <input
          type="text"
          className={styles.input}
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          disabled={sending}
          maxLength={1000}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={!messageText.trim() || sending}
        >
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}

export default MessageThreadPage
