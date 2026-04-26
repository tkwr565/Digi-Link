import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { hasUnread, formatMessageTime, acceptBattleRequest } from '../utils/messageUtils'
import { loadDigimonDb } from '../utils/digimonUtils'
import DigimonSprite from '../components/DigimonSprite'
import EmptyState from '../components/EmptyState'
import { useTranslation } from 'react-i18next'
import styles from './MessagesPage.module.css'

function MessagesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
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
    if (!user) return

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

  const loadPendingRequests = async () => {
    if (!user) return
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

    const activeRequests = data?.filter(req => req.pin && req.pin.is_active) || []
    setPendingRequests(activeRequests)
  }

  useEffect(() => {
    loadConversations()
    loadPendingRequests()
  }, [user])

  // ✅ FIXED: Conversations subscription - removed Date.now()
  useEffect(() => {
    if (!user?.id) return
    
    // Cleanup old channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    
    // Static channel name - no Date.now()!
    const channel = supabase
      .channel(`messages-list-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => loadConversations()
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

  // ✅ FIXED: Battle requests subscription - removed Date.now()
  useEffect(() => {
    if (!user?.id) return
    
    // Cleanup old channel first
    if (requestsChannelRef.current) {
      supabase.removeChannel(requestsChannelRef.current)
      requestsChannelRef.current = null
    }
    
    // Static channel name - no Date.now()!
    const channel = supabase
      .channel(`battle-requests-list-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battles' },
        (payload) => {
          loadPendingRequests()
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

  const handleAcceptRequest = async (battleRequest) => {
    const { data, error } = await acceptBattleRequest(
      battleRequest.id, battleRequest.pin_id, user.id, battleRequest.requester_id,
      supabase, battleRequest.pin?.title || null
    )
    if (error) {
      alert(t('common.error'))
      return
    }
    setPendingRequests(prev => prev.filter(req => req.id !== battleRequest.id))
    navigate(`/messages/${data.conversation.id}`)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}><h1 className={styles.title}>{t('messages.title')}</h1></div>
        <div className={styles.loading}>{t('messages.loading')}</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.header}><h1 className={styles.title}>{t('messages.title')}</h1></div>
        <EmptyState icon={WifiOff} title={t('messages.error')} message={t('messages.errorHint')}
          action={{ label: t('common.retry'), onClick: () => { setLoadError(false); setLoading(true); loadConversations() } }}
          variant="error" />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('messages.title')}</h1>
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
        <EmptyState icon={MessageCircle} title={t('messages.noMessages')} message={t('messages.noMessagesHint')} />
      ) : (() => {
        const activeConversations = conversations.filter(c => c.pin && c.pin.is_active)
        const expiredConversations = conversations.filter(c => !c.pin || !c.pin.is_active)

        const renderRequest = (request) => {
          const isRequester = request.requester_id === user.id
          const otherUser = isRequester ? request.responder : request.requester
          return (
            <div key={request.id} className={`${styles.conversationItem} ${styles.pendingRequest}`}>
              <div className={styles.avatar}><DigimonSprite suffix={otherUser.favourite_digimon} size="md" /></div>
              <div className={styles.conversationContent}>
                <div className={styles.conversationHeader}>
                  <span className={styles.username}>{otherUser.username}</span>
                  <span className={styles.timestamp}>{formatMessageTime(request.request_created_at)}</span>
                </div>
                <div className={styles.pinTitle}>⚔️ {t('messages.battleRequest')} — {request.pin.title}</div>
                <div className={styles.preview}>
                  {isRequester ? t('messages.waitingAccept', { name: otherUser.username }) : t('messages.wantsToBattle')}
                </div>
                {isRequester ? (
                  <button className={styles.pendingButton} disabled>⏳ {t('messages.pending')}</button>
                ) : (
                  <button className={styles.acceptButton} onClick={() => handleAcceptRequest(request)}>✓ {t('messages.acceptRequest')}</button>
                )}
              </div>
            </div>
          )
        }

        const renderConversation = (conversation) => {
          const otherUser = conversation.user1_id === user.id ? conversation.user2 : conversation.user1
          const isUnread = hasUnread(conversation, user.id)
          const isPinActive = conversation.pin && conversation.pin.is_active
          const pinDisplayTitle = !conversation.pin
            ? (conversation.pin_title_snapshot ? t('messages.pinDeleted', { title: conversation.pin_title_snapshot }) : t('messages.pinDeletedGeneric'))
            : (conversation.pin?.title ? t('messages.pinExpired', { title: conversation.pin.title }) : t('messages.pinExpiredGeneric'))
          
          return (
            <div key={conversation.id} className={`${styles.conversationItem} ${isUnread ? styles.unread : ''} ${!isPinActive ? styles.archived : ''}`} onClick={() => navigate(`/messages/${conversation.id}`)}>
              <div className={styles.avatar}><DigimonSprite suffix={otherUser.favourite_digimon} size="md" /></div>
              <div className={styles.conversationContent}>
                <div className={styles.conversationHeader}>
                  <span className={styles.username}>{otherUser.username}</span>
                  {conversation.last_message_at && <span className={styles.timestamp}>{formatMessageTime(conversation.last_message_at)}</span>}
                </div>
                <div className={styles.pinTitle}>{isPinActive ? <>📍 {conversation.pin.title}</> : <>🔒 {pinDisplayTitle}</>}</div>
                {conversation.last_message_preview && <div className={styles.preview}>{conversation.last_message_preview}</div>}
                {isUnread && <div className={styles.unreadIndicator} />}
              </div>
            </div>
          )
        }

        return (
          <div className={styles.conversationList}>
            {pendingRequests.length > 0 && (<><div className={styles.sectionHeader}>{t('messages.sectionNew')}</div>{pendingRequests.map(renderRequest)}</>)}
            {activeConversations.length > 0 && (<><div className={styles.sectionHeader}>{t('messages.sectionActive')}</div>{activeConversations.map(renderConversation)}</>)}
            {expiredConversations.length > 0 && (<><div className={styles.sectionHeader}>{t('messages.sectionExpired')}</div>{expiredConversations.map(renderConversation)}</>)}
          </div>
        )
      })()}
    </div>
  )
}

export default MessagesPage
