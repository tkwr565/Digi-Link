import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getOrCreateConversation, markConversationAsRead, sendMessage as sendMessageUtil, formatMessageTimestamp, getBattleForConversation, toggleBattleConfirmation } from '../utils/messageUtils'
import DigimonSprite from '../components/DigimonSprite'
import { useTranslation } from 'react-i18next'
import styles from './MessageThreadPage.module.css'

const FRIEND_PROMPT_DAYS = 3

function MessageThreadPage() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
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
  const [friendStatus, setFriendStatus] = useState('loading')
  const [friendPromptDismissed, setFriendPromptDismissed] = useState(false)
  const channelRef = useRef(null)
  const battleChannelRef = useRef(null)

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }

  const loadConversation = async () => {
    if (!user || !conversationId) return
    const { data: conv, error: convError } = await supabase.from('conversations').select('*').eq('id', conversationId).single()
    if (convError) { setLoading(false); return }
    if (conv.user1_id !== user.id && conv.user2_id !== user.id) { navigate('/messages'); return }
    setConversation(conv)
    const otherUserId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id

    const { data: profile } = await supabase.from('profiles').select('id, username, favourite_digimon').eq('id', otherUserId).single()
    if (profile) setOtherUser(profile)

    if (otherUserId) {
      const [{ data: outgoing }, { data: incoming }] = await Promise.all([
        supabase.from('friendships').select('status').eq('user_id', user.id).eq('friend_id', otherUserId).maybeSingle(),
        supabase.from('friendships').select('status').eq('user_id', otherUserId).eq('friend_id', user.id).maybeSingle(),
      ])
      if (outgoing?.status === 'accepted') setFriendStatus('friends')
      else if (outgoing?.status === 'pending') setFriendStatus('pending_out')
      else if (incoming) setFriendStatus('pending_in')
      else setFriendStatus('none')
    }

    if (conv.pin_id) {
      const { data: pinData } = await supabase.from('pins').select('id, title, user_id, is_active, end_time').eq('id', conv.pin_id).single()
      if (pinData) setPin(pinData)
    }

    const { data: msgs } = await supabase.from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    setMessages(msgs || [])

    const { data: battleData } = await getBattleForConversation(conv.id, supabase)
    if (battleData) setBattle(battleData)

    await markConversationAsRead(conv.id, user.id, supabase)
    setLoading(false)
    setTimeout(scrollToBottom, 100)
  }

  useEffect(() => { loadConversation() }, [user, conversationId])
  useEffect(() => { if (messages.length > 0) scrollToBottom() }, [messages])

  useEffect(() => {
    if (!conversation?.id) return
    const setupSubscription = () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      const channel = supabase.channel(`messages-${conversation.id}-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
          setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
          if (payload.new.to_user_id === user.id) markConversationAsRead(conversation.id, user.id, supabase)
        })
        .subscribe()
      channelRef.current = channel
    }
    setupSubscription()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [conversation?.id, user?.id])

  useEffect(() => {
    if (!battle?.id) return
    const channel = supabase.channel(`battle-${battle.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${battle.id}` }, payload => setBattle(payload.new))
      .subscribe()
    battleChannelRef.current = channel
    return () => { if (battleChannelRef.current) supabase.removeChannel(battleChannelRef.current) }
  }, [battle?.id])

  const handleBattleConfirmation = async () => {
    if (!battle || confirmingBattle) return
    setConfirmingBattle(true)
    const { data, error } = await toggleBattleConfirmation(battle.id, user.id, battle.requester_id === user.id, supabase)
    if (error) alert(t('common.error'))
    else setBattle(data)
    setConfirmingBattle(false)
  }

  const handleAddFriend = async () => {
    if (!otherUser) return
    const { error } = await supabase.from('friendships').insert({ user_id: user.id, friend_id: otherUser.id, status: 'pending' })
    if (!error) setFriendStatus('pending_out')
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!messageText.trim() || !conversation || sending) return
    setSending(true)
    const otherUserId = conversation.user1_id === user.id ? conversation.user2_id : conversation.user1_id
    const { data, error } = await sendMessageUtil(conversation.id, user.id, otherUserId, conversation.pin_id, messageText, supabase)
    if (!error && data) setMessages(prev => [...prev, data])
    setMessageText('')
    setSending(false)
  }

  if (loading) return <div className={styles.container}><div className={styles.loading}>{t('messages.loadingData')}</div></div>
  if (!conversation) return <div className={styles.container}><div className={styles.error}>{t('messages.notFound')}</div><button onClick={() => navigate('/messages')} className={styles.backButton}>← {t('messages.title')}</button></div>

  const isPinDeleted = !conversation.pin_id
  const isPinActive = pin && pin.is_active
  const currentUserConfirmed = battle && (battle.requester_id === user.id ? battle.requester_confirmed : battle.responder_confirmed)
  const battleCompleted = battle && battle.battle_completed_at
  const now = new Date()
  const promptWindowMs = FRIEND_PROMPT_DAYS * 24 * 60 * 60 * 1000
  const encounterEndedAt = isPinDeleted ? (battle?.battle_completed_at ? new Date(battle.battle_completed_at) : null) : (pin && !pin.is_active ? (pin.end_time ? new Date(pin.end_time) : (battle?.battle_completed_at ? new Date(battle.battle_completed_at) : null)) : null)
  const showFriendPrompt = !!battleCompleted && !friendPromptDismissed && friendStatus === 'none' && encounterEndedAt !== null && now >= encounterEndedAt && now - encounterEndedAt < promptWindowMs

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/messages')}>←</button>
        <div className={isPinActive ? styles.headerClickable : styles.headerNonClickable} onClick={isPinActive ? () => navigate(`/?pinId=${pin.id}`) : undefined} title={isPinActive ? t('messages.viewOnMap') : isPinDeleted ? t('messages.pinDeletedTooltip') : t('messages.pinExpiredTooltip')}>
          <div className={styles.avatar}><DigimonSprite suffix={otherUser?.favourite_digimon} size="sm" /></div>
          <div className={styles.headerInfo}>
            <div className={styles.username}>{otherUser?.username}</div>
            <div className={styles.pinTitle}>{isPinActive ? <>📍 {pin.title}</> : isPinDeleted ? <>🔒 {conversation.pin_title_snapshot ? t('messages.pinDeleted', { title: conversation.pin_title_snapshot }) : t('messages.pinDeletedGeneric')}</> : <>🔒 {pin?.title ? t('messages.pinExpired', { title: pin.title }) : t('messages.pinExpiredGeneric')}</>}</div>
          </div>
        </div>
        {battle && (
          <button className={`${styles.battleButton} ${currentUserConfirmed ? styles.battleButtonConfirmed : ''} ${battleCompleted ? styles.battleButtonCompleted : ''}`} onClick={handleBattleConfirmation} disabled={confirmingBattle || battleCompleted} title={battleCompleted ? t('messages.battleCompletedTooltip') : currentUserConfirmed ? t('messages.youConfirmedTooltip') : t('messages.confirmBattleTooltip')}>
            {battleCompleted ? t('messages.battleCompleted') : currentUserConfirmed ? t('messages.youConfirmed') : t('messages.confirmBattle')}
          </button>
        )}
      </div>

      <div className={styles.messagesContainer}>
        {!isPinActive && <div className={styles.archivedBanner}>{isPinDeleted ? t('messages.archivedDeleted') : t('messages.archivedExpired')}</div>}
        {showFriendPrompt && (
          <div className={styles.friendPrompt}>
            <div className={styles.friendPromptText}>{t('messages.addFriendPrompt', { name: otherUser.username })}</div>
            <div className={styles.friendPromptActions}>
              <button className={styles.friendPromptAdd} onClick={handleAddFriend}>{t('friends.btnAdd')}</button>
              <button className={styles.friendPromptDismiss} onClick={() => setFriendPromptDismissed(true)}>{t('messages.maybeLater')}</button>
            </div>
          </div>
        )}
        {friendStatus === 'pending_out' && battleCompleted && encounterEndedAt && <div className={styles.friendPromptSent}>{t('messages.friendRequestSent', { name: otherUser.username })}</div>}
        {friendStatus === 'friends' && battleCompleted && <div className={styles.friendPromptSent}>{t('messages.nowFriends', { name: otherUser.username })}</div>}
        {messages.length === 0 ? <div className={styles.emptyMessages}><p>{t('messages.noMessagesThread')}</p></div> : (
          <div className={styles.messagesList}>
            {messages.map((m) => (
              <div key={m.id} className={`${styles.messageWrapper} ${m.from_user_id === user.id ? styles.ownMessage : styles.otherMessage}`}>
                <div className={styles.messageBubble}><div className={styles.messageContent}>{m.content}</div><div className={styles.messageTimestamp}>{formatMessageTimestamp(m.created_at)}</div></div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form className={styles.inputContainer} onSubmit={handleSendMessage}>
        <input type="text" className={styles.input} placeholder={t('messages.typeMessage')} value={messageText} onChange={(e) => setMessageText(e.target.value)} disabled={sending} maxLength={1000} />
        <button type="submit" className={styles.sendButton} disabled={!messageText.trim() || sending}>{sending ? '...' : t('common.send')}</button>
      </form>
    </div>
  )
}

export default MessageThreadPage
