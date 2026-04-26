import { useState, useEffect, useRef } from 'react'
import { Info, MapPin, Users, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import DigimonSprite from '../components/DigimonSprite'
import EmptyState from '../components/EmptyState'
import { useTranslation } from 'react-i18next'
import { getDistrictKey } from '../utils/hkDistrict'
import styles from './FriendsPage.module.css'

// Shift a UTC ISO string by +8h and return a plain Date-like object in HKT
const asHKT = (iso) => {
  const d = new Date(iso)
  return new Date(d.getTime() + 8 * 3_600_000)
}

// Format a UTC ISO time string as HH:MM in HKT
const toHKTTime = (iso) => {
  if (!iso) return null
  const hkt = asHKT(iso)
  return `${hkt.getUTCHours().toString().padStart(2, '0')}:${hkt.getUTCMinutes().toString().padStart(2, '0')}`
}

const formatPinWindow = (startTime, endTime) => {
  const start = toHKTTime(startTime)
  const end = toHKTTime(endTime)
  if (!start) return null
  return end ? `${start} – ${end}` : start
}

// Returns true when startTime falls on today's date in HKT
const isPinToday = (startTime) => {
  if (!startTime) return false
  const now = asHKT(new Date().toISOString())
  const pin = asHKT(startTime)
  return now.getUTCFullYear() === pin.getUTCFullYear() &&
         now.getUTCMonth()    === pin.getUTCMonth()    &&
         now.getUTCDate()     === pin.getUTCDate()
}

// Returns a short locale date string for non-today pins, e.g. "Mon, 28 Apr" / "4月28日"
const formatPinDate = (startTime, lang) => {
  if (!startTime) return null
  const d = new Date(startTime)
  const locale = lang === 'zh-HK' ? 'zh-HK' : 'en-HK'
  return d.toLocaleDateString(locale, {
    timeZone: 'Asia/Hong_Kong',
    weekday: 'short',
    month:   'short',
    day:     'numeric',
  })
}

export default function FriendsPage() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [friends, setFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [outgoingRequestIds, setOutgoingRequestIds] = useState(new Set())
  const [battleContacts, setBattleContacts] = useState([])
  const [pinNotifications, setPinNotifications] = useState([])
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError] = useState('')

  // Code search state
  const [codeQuery, setCodeQuery] = useState('')
  const [codeResult, setCodeResult] = useState(null)   // single profile or null
  const [codeSearched, setCodeSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!user) return
    loadAll()
  }, [user])

  // Realtime: two filtered listeners cover friendships where user is either side.
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`friends-page-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_id=eq.${user.id}` },
        () => loadAll(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${user.id}` },
        () => loadAll(true)
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

  // Realtime (fallback): hook dispatches this when its friendships channel fires first
  useEffect(() => {
    const handler = () => loadAll(true)
    window.addEventListener('friendshipChanged', handler)
    return () => window.removeEventListener('friendshipChanged', handler)
  }, [])

  // Realtime: new pin notification from a friend arrived
  useEffect(() => {
    const handler = () => loadPinNotifications()
    window.addEventListener('pinNotificationChanged', handler)
    return () => window.removeEventListener('pinNotificationChanged', handler)
  }, [])

  const searchByCode = async () => {
    const code = codeQuery.trim().toUpperCase()
    if (!code) return
    setSearching(true)
    setCodeSearched(false)
    setCodeResult(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, favourite_digimon, total_battles')
      .eq('friend_code', code)
      .neq('id', user.id)
      .maybeSingle()
    setSearching(false)
    setCodeSearched(true)
    if (error) { console.error('Code search failed:', error); return }
    setCodeResult(data || null)
  }

  // Fetch recent pin notifications, display them (capturing seen state for NEW badge),
  // then mark all as seen and tell the hook to drop the badge count.
  const loadPinNotifications = async () => {
    const { data, error: notifErr } = await supabase
      .from('friend_pin_notifications')
      .select(`
        id, seen, created_at,
        pin:pins!pin_id(id, title, is_active, lat, lng, start_time, end_time),
        friend:profiles!friend_id(id, username, favourite_digimon)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (notifErr) { console.error('Failed to load pin notifications:', notifErr); return }

    // Only surface notifications whose pin is still active
    const active = (data || []).filter(n => n.pin?.is_active)
    // Capture seen state before marking — used to render NEW badges this session
    const withSeenSnapshot = active.map(n => ({ ...n, wasSeen: n.seen }))
    setPinNotifications(withSeenSnapshot)

    // Mark unseen as seen in DB (fire and forget — component state already captured
    // seen=false for display, so NEW badges stay visible for this session)
    supabase
      .from('friend_pin_notifications')
      .update({ seen: true })
      .eq('user_id', user.id)
      .eq('seen', false)
      .then(() => window.dispatchEvent(new CustomEvent('friendsSeen')))
  }

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true)
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

      // 3. Outgoing pending request IDs + profiles
      const { data: outgoingRows, error: outgoingErr } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
      if (outgoingErr) throw outgoingErr

      const outgoingIds = (outgoingRows || []).map(r => r.friend_id)
      setOutgoingRequestIds(new Set(outgoingIds))

      let outgoingProfiles = []
      if (outgoingIds.length > 0) {
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, favourite_digimon')
          .in('id', outgoingIds)
        if (profErr) throw profErr
        outgoingProfiles = data || []
      }
      setOutgoingRequests(outgoingProfiles)

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

      // 5. Pin notifications — fetched separately so they can also be refreshed independently
      await loadPinNotifications()
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

  const hasContent = friends.length > 0 || incomingRequests.length > 0 || battleContacts.length > 0

  return (
    <div className={styles.container}>
      <div className={styles.header}>
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

      {/* ── Sent Requests ── */}
      {outgoingRequests.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('friends.sentRequests')}</h2>
          <p className={styles.sectionHint}>{t('friends.sentRequestsHint')}</p>
          {outgoingRequests.map(req => (
            <div key={req.id} className={styles.contactCard}>
              <div className={styles.userInfo}>
                <DigimonSprite suffix={req.favourite_digimon} size="sm" />
                <span className={styles.username}>{req.username}</span>
              </div>
              <span className={styles.btnPending}>{t('friends.btnPending')}</span>
            </div>
          ))}
        </section>
      )}

      {/* ── Friend Activity (active pins from friends) ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('friends.friendActivity')}</h2>
        {pinNotifications.length === 0 ? (
          <div className={styles.activityEmpty}>{t('friends.noFriendActivity')}</div>
        ) : (
          pinNotifications.map(notif => {
            const districtKey = getDistrictKey(notif.pin?.lat, notif.pin?.lng)
            const pinWindow   = formatPinWindow(notif.pin?.start_time, notif.pin?.end_time)
            const today       = isPinToday(notif.pin?.start_time)
            const dateStr     = today
              ? t('common.today')
              : formatPinDate(notif.pin?.start_time, i18n.language)
            const metaParts   = [
              districtKey ? t(`districts.${districtKey}`) : null,
              dateStr,
              pinWindow,
            ].filter(Boolean)
            return (
              <div
                key={notif.id}
                className={styles.activityCard}
                onClick={() => navigate(`/?pinId=${notif.pin.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate(`/?pinId=${notif.pin.id}`)}
              >
                <div className={styles.userInfo}>
                  <DigimonSprite suffix={notif.friend?.favourite_digimon} size="sm" />
                  <div className={styles.userDetails}>
                    <span className={styles.username}>{notif.friend?.username}</span>
                    <span className={styles.activityPin}>
                      {notif.pin?.title || t('friends.pinNoTitle')}
                    </span>
                    {metaParts.length > 0 && (
                      <span className={styles.activityMeta}>
                        {districtKey && <MapPin size={10} />}
                        {metaParts.map((part, i) => (
                          <span key={i}>
                            {i > 0 && <span className={styles.metaDot}>·</span>}
                            {part}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                {!notif.wasSeen && <span className={styles.newBadge}>NEW</span>}
              </div>
            )
          })
        )}
      </section>

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

      {/* ── Find by Code ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('friends.findByCode')}</h2>
        <p className={styles.sectionHint}>{t('friends.findByCodeHint')}</p>
        <div className={styles.codeSearchRow}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('friends.codePlaceholder')}
            value={codeQuery}
            onChange={e => { setCodeQuery(e.target.value.toUpperCase()); setCodeSearched(false); setCodeResult(null) }}
            onKeyDown={e => e.key === 'Enter' && searchByCode()}
            autoComplete="off"
            spellCheck="false"
            maxLength={8}
          />
          <button
            className={styles.codeSearchBtn}
            onClick={searchByCode}
            disabled={searching || !codeQuery.trim()}
          >
            {searching ? '...' : t('friends.btnSearch')}
          </button>
        </div>

        {codeSearched && (
          <div className={styles.searchResults}>
            {!codeResult && (
              <div className={styles.searchHint}>{t('friends.noTrainerWithCode')}</div>
            )}
            {codeResult && (() => {
              const status = getStatus(codeResult.id)
              return (
                <div className={styles.contactCard}>
                  <div className={styles.userInfo}>
                    <DigimonSprite suffix={codeResult.favourite_digimon} size="sm" />
                    <div className={styles.userDetails}>
                      <span className={styles.username}>{codeResult.username}</span>
                      <span className={styles.battleCount}>
                        {t('friends.battlesCount', { count: codeResult.total_battles })}
                      </span>
                    </div>
                  </div>
                  {status === 'friends' && (
                    <span className={styles.tagFriends}>{t('friends.tagFriends')}</span>
                  )}
                  {status === 'incoming' && (
                    <button
                      className={styles.btnAccept}
                      onClick={() => acceptRequest(codeResult.id)}
                      disabled={actionLoading === codeResult.id}
                    >
                      {actionLoading === codeResult.id ? '...' : t('friends.btnAccept')}
                    </button>
                  )}
                  {status === 'outgoing' && (
                    <span className={styles.btnPending}>{t('friends.btnPending')}</span>
                  )}
                  {status === 'none' && (
                    <button
                      className={styles.btnAdd}
                      onClick={() => sendRequest(codeResult.id)}
                      disabled={actionLoading === codeResult.id}
                    >
                      {actionLoading === codeResult.id ? '...' : t('friends.btnAdd')}
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </section>

      {!hasContent && (
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
