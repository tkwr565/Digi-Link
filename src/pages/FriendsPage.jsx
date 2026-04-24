import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info, Users, WifiOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import DigimonSprite from '../components/DigimonSprite'
import EmptyState from '../components/EmptyState'
import { useTranslation } from 'react-i18next'
import styles from './FriendsPage.module.css'

export default function FriendsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [friends, setFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequestIds, setOutgoingRequestIds] = useState(new Set())
  const [battleContacts, setBattleContacts] = useState([])
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError] = useState('')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!user) return
    loadAll()
  }, [user])

  // Debounced search — fires 400ms after the user stops typing
  useEffect(() => {
    clearTimeout(searchTimer.current)
    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) {
      setSearchResults([])
      return
    }
    searchTimer.current = setTimeout(() => runSearch(trimmed), 400)
    return () => clearTimeout(searchTimer.current)
  }, [searchQuery])

  const runSearch = async (query) => {
    setSearching(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, favourite_digimon, total_battles')
      .ilike('username', `%${query}%`)
      .neq('id', user.id)
      .limit(8)
    setSearching(false)
    if (error) { console.error('Search failed:', error); return }
    setSearchResults(data || [])
  }

  const loadAll = async () => {
    setLoading(true)
    setError('')

    try {
      // 1. Accepted friend IDs
      const { data: friendshipRows, error: friendsErr } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted')
      if (friendsErr) throw friendsErr

      const friendIds = (friendshipRows || []).map(r => r.friend_id)
      const friendIdSet = new Set(friendIds)

      let friendProfiles = []
      if (friendIds.length > 0) {
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, favourite_digimon, total_battles')
          .in('id', friendIds)
        if (profErr) throw profErr
        friendProfiles = data || []
      }
      setFriends(friendProfiles)

      // 2. Incoming pending requests
      const { data: incomingRows, error: incomingErr } = await supabase
        .from('friendships')
        .select('user_id')
        .eq('friend_id', user.id)
        .eq('status', 'pending')
      if (incomingErr) throw incomingErr

      const requesterIds = (incomingRows || []).map(r => r.user_id)
      const incomingIdSet = new Set(requesterIds)

      let requesterProfiles = []
      if (requesterIds.length > 0) {
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, favourite_digimon')
          .in('id', requesterIds)
        if (profErr) throw profErr
        requesterProfiles = data || []
      }
      setIncomingRequests(requesterProfiles)

      // 3. Outgoing pending request IDs
      const { data: outgoingRows, error: outgoingErr } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
      if (outgoingErr) throw outgoingErr
      setOutgoingRequestIds(new Set((outgoingRows || []).map(r => r.friend_id)))

      // 4. Battle contacts — completed battles, other party not yet a friend or incoming request
      const { data: battles, error: battlesErr } = await supabase
        .from('battles')
        .select('requester_id, responder_id')
        .not('battle_completed_at', 'is', null)
        .or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`)
      if (battlesErr) throw battlesErr

      const contactIdSet = new Set()
      ;(battles || []).forEach(b => {
        const otherId = b.requester_id === user.id ? b.responder_id : b.requester_id
        if (!friendIdSet.has(otherId) && !incomingIdSet.has(otherId)) contactIdSet.add(otherId)
      })

      let contactProfiles = []
      const contactIds = [...contactIdSet]
      if (contactIds.length > 0) {
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, favourite_digimon, total_battles')
          .in('id', contactIds)
        if (profErr) throw profErr
        contactProfiles = data || []
      }
      setBattleContacts(contactProfiles)
    } catch (err) {
      console.error('Failed to load friends data:', err)
      setError(t('friends.error'))
    } finally {
      setLoading(false)
    }
  }

  // Send a friend request. If the target already sent us a request, accept theirs instead.
  const sendRequest = async (targetId) => {
    setActionLoading(targetId)

    const isIncoming = incomingRequests.some(r => r.id === targetId)
    if (isIncoming) {
      // Accept their existing request — no new row needed, avoids duplicate
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('user_id', targetId)
        .eq('friend_id', user.id)
      setActionLoading(null)
      if (error) { console.error('Failed to accept friend request:', error); return }
      await loadAll()
      return
    }

    const { error } = await supabase
      .from('friendships')
      .insert({ user_id: user.id, friend_id: targetId, status: 'pending' })
    setActionLoading(null)
    if (error) { console.error('Failed to send friend request:', error); return }

    // Optimistic update — no full reload needed, button state derives from this set
    setOutgoingRequestIds(prev => new Set([...prev, targetId]))
  }

  // Accept an incoming request.
  // IMPORTANT: If we also have an outgoing pending request to this same person
  // (mutual-send edge case), delete ours first. Without this, the DB trigger that
  // creates the reciprocal row tries to UPDATE the already-locked outgoing row inside
  // the same transaction, causing a recursive deadlock → silent failure.
  const acceptRequest = async (requesterId) => {
    setActionLoading(requesterId)

    if (outgoingRequestIds.has(requesterId)) {
      await supabase.from('friendships').delete()
        .eq('user_id', user.id).eq('friend_id', requesterId)
    }

    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('user_id', requesterId)
      .eq('friend_id', user.id)
    setActionLoading(null)

    if (error) { console.error('Failed to accept friend request:', error); return }
    await loadAll()
  }

  const rejectRequest = async (requesterId) => {
    setActionLoading(`reject-${requesterId}`)
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_id', requesterId)
      .eq('friend_id', user.id)
    setActionLoading(null)
    if (error) { console.error('Failed to reject friend request:', error); return }
    setIncomingRequests(prev => prev.filter(r => r.id !== requesterId))
  }

  const removeFriend = async (friendId) => {
    setActionLoading(`remove-${friendId}`)
    await supabase.from('friendships').delete()
      .eq('user_id', user.id).eq('friend_id', friendId)
    await supabase.from('friendships').delete()
      .eq('user_id', friendId).eq('friend_id', user.id)
    setActionLoading(null)
    await loadAll()
  }

  // Derive the relationship status for a search result (computed from live state)
  const friendIdSet = new Set(friends.map(f => f.id))
  const incomingIdSet = new Set(incomingRequests.map(r => r.id))

  const getStatus = (id) => {
    if (friendIdSet.has(id)) return 'friends'
    if (incomingIdSet.has(id)) return 'incoming'
    if (outgoingRequestIds.has(id)) return 'outgoing'
    return 'none'
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>{t('friends.loading')}</div>
      </div>
    )
  }

  const isSearchActive = searchQuery.trim().length >= 2
  const hasContent = friends.length > 0 || incomingRequests.length > 0 || battleContacts.length > 0

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/profile')} className={styles.backBtn}>← {t('common.back')}</button>
        <h1 className={styles.title}>{t('friends.title')}</h1>
      </div>

      <div className={styles.infoBanner}>
        <Info size={13} />
        <span>{t('friends.infoBanner')}</span>
      </div>

      {error && (
        <EmptyState
          icon={WifiOff}
          title={t('friends.error')}
          message={error}
          action={{ label: t('common.retry'), onClick: loadAll }}
          variant="error"
        />
      )}

      {/* ── Username Search ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('friends.findByUsername')}</h2>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t('friends.searchPlaceholder')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />

        {isSearchActive && (
          <div className={styles.searchResults}>
            {searching && <div className={styles.searchHint}>{t('friends.searching')}</div>}
            {!searching && searchResults.length === 0 && (
              <div className={styles.searchHint}>{t('friends.noTrainersFound')}</div>
            )}
            {!searching && searchResults.map(result => {
              const status = getStatus(result.id)
              return (
                <div key={result.id} className={styles.contactCard}>
                  <div className={styles.userInfo}>
                    <DigimonSprite suffix={result.favourite_digimon} size="sm" />
                    <div className={styles.userDetails}>
                      <span className={styles.username}>{result.username}</span>
                      <span className={styles.battleCount}>
                        {t('friends.battlesCount', { count: result.total_battles })}
                      </span>
                    </div>
                  </div>
                  {status === 'friends' && (
                    <span className={styles.tagFriends}>{t('friends.tagFriends')}</span>
                  )}
                  {status === 'incoming' && (
                    <button
                      className={styles.btnAccept}
                      onClick={() => acceptRequest(result.id)}
                      disabled={actionLoading === result.id}
                    >
                      {actionLoading === result.id ? '...' : t('friends.btnAccept')}
                    </button>
                  )}
                  {status === 'outgoing' && (
                    <span className={styles.btnPending}>{t('friends.btnPending')}</span>
                  )}
                  {status === 'none' && (
                    <button
                      className={styles.btnAdd}
                      onClick={() => sendRequest(result.id)}
                      disabled={actionLoading === result.id}
                    >
                      {actionLoading === result.id ? '...' : t('friends.btnAdd')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Incoming Requests ── */}
      {incomingRequests.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('friends.incomingRequests')}</h2>
          {incomingRequests.map(req => (
            <div key={req.id} className={styles.requestCard}>
              <div className={styles.userInfo}>
                <DigimonSprite suffix={req.favourite_digimon} size="sm" />
                <span className={styles.username}>{req.username}</span>
              </div>
              <div className={styles.actionGroup}>
                <button
                  className={styles.btnAccept}
                  onClick={() => acceptRequest(req.id)}
                  disabled={actionLoading === req.id}
                >
                  {actionLoading === req.id ? '...' : t('friends.btnAccept')}
                </button>
                <button
                  className={styles.btnReject}
                  onClick={() => rejectRequest(req.id)}
                  disabled={actionLoading === `reject-${req.id}`}
                >
                  {actionLoading === `reject-${req.id}` ? '...' : t('friends.btnReject')}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── My Friends ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('friends.myFriends')}</h2>
        {friends.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('friends.noFriendsYet')}
            message={t('friends.battleSomeone')}
          />
        ) : (
          friends.map(friend => (
            <div key={friend.id} className={styles.friendCard}>
              <div className={styles.userInfo}>
                <DigimonSprite suffix={friend.favourite_digimon} size="sm" />
                <div className={styles.userDetails}>
                  <span className={styles.username}>{friend.username}</span>
                  <span className={styles.battleCount}>
                    {t('friends.battlesCount', { count: friend.total_battles })}
                  </span>
                </div>
              </div>
              <button
                className={styles.btnRemove}
                onClick={() => removeFriend(friend.id)}
                disabled={actionLoading === `remove-${friend.id}`}
              >
                {actionLoading === `remove-${friend.id}` ? '...' : t('friends.btnRemove')}
              </button>
            </div>
          ))
        )}
      </section>

      {/* ── Battle Contacts ── */}
      {battleContacts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('friends.battleContacts')}</h2>
          <p className={styles.sectionHint}>{t('friends.battleContactsHint')}</p>
          {battleContacts.map(contact => {
            const isPending = outgoingRequestIds.has(contact.id)
            return (
              <div key={contact.id} className={styles.contactCard}>
                <div className={styles.userInfo}>
                  <DigimonSprite suffix={contact.favourite_digimon} size="sm" />
                  <div className={styles.userDetails}>
                    <span className={styles.username}>{contact.username}</span>
                    <span className={styles.battleCount}>
                      {t('friends.battlesCount', { count: contact.total_battles })}
                    </span>
                  </div>
                </div>
                <button
                  className={isPending ? styles.btnPending : styles.btnAdd}
                  onClick={() => !isPending && sendRequest(contact.id)}
                  disabled={isPending || actionLoading === contact.id}
                >
                  {actionLoading === contact.id ? '...' : isPending ? t('friends.btnPending') : t('friends.btnAdd')}
                </button>
              </div>
            )
          })}
        </section>
      )}

      {!hasContent && !isSearchActive && (
        <div className={styles.fullEmpty}>
          <div className={styles.fullEmptyTitle}>{t('friends.noConnectionsYet')}</div>
          <div className={styles.fullEmptyHint}>
            {t('friends.noConnectionsHint')}
          </div>
        </div>
      )}
    </div>
  )
}
