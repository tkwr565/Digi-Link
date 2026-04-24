import { useState, useEffect, useRef, Fragment } from 'react'
import { Trophy, Users, WifiOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase'
import DigimonSprite from '../components/DigimonSprite'
import EmptyState from '../components/EmptyState'
import styles from './LeaderboardPage.module.css'

const LEADERBOARD_LIMIT = 50
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export default function LeaderboardPage() {
  const { user } = useAuth()
  const userRowRef = useRef(null)

  const [scope, setScope] = useState('all')      // 'all' | 'friends'
  const [period, setPeriod] = useState('weekly') // 'weekly' | 'alltime'

  // Four datasets
  const [weeklyAll, setWeeklyAll] = useState([])
  const [weeklyAllUserAppended, setWeeklyAllUserAppended] = useState(false)
  const [allTimeAll, setAllTimeAll] = useState([])
  const [allTimeAllUserAppended, setAllTimeAllUserAppended] = useState(false)
  const [friendWeekly, setFriendWeekly] = useState([])
  const [friendAllTime, setFriendAllTime] = useState([])

  // Own profile (needed for appended row when user is outside top N)
  const [ownProfile, setOwnProfile] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    loadLeaderboard()
  }, [user])

  const loadLeaderboard = async () => {
    setLoading(true)
    setError('')
    try {
      const weekAgo = new Date(Date.now() - WEEK_MS).toISOString()

      // Parallel: weekly battles + all-time top N + friendships
      const [
        { data: weeklyBattles, error: weeklyErr },
        { data: topUsers, error: topErr },
        { data: friendshipRows, error: friendsErr },
      ] = await Promise.all([
        supabase
          .from('battles')
          .select('requester_id, responder_id')
          .not('battle_completed_at', 'is', null)
          .gte('battle_completed_at', weekAgo),
        supabase
          .from('profiles')
          .select('id, username, favourite_digimon, total_battles')
          .order('total_battles', { ascending: false })
          .limit(LEADERBOARD_LIMIT),
        supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', user.id)
          .eq('status', 'accepted'),
      ])
      if (weeklyErr) throw weeklyErr
      if (topErr) throw topErr
      if (friendsErr) throw friendsErr

      // ── Weekly count map ─────────────────────────────────────────
      const weeklyCount = {}
      for (const b of weeklyBattles || []) {
        weeklyCount[b.requester_id] = (weeklyCount[b.requester_id] || 0) + 1
        weeklyCount[b.responder_id] = (weeklyCount[b.responder_id] || 0) + 1
      }

      // ── All-time global ──────────────────────────────────────────
      const allTimeRanked = (topUsers || []).map((u, i) => ({ ...u, rank: i + 1 }))

      // Own profile — fetch if outside top N
      let own = allTimeRanked.find(u => u.id === user.id) || null
      if (!own) {
        const { data: p, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, favourite_digimon, total_battles')
          .eq('id', user.id)
          .single()
        if (pErr) throw pErr
        const { count: above, error: aboveErr } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gt('total_battles', p.total_battles)
        if (aboveErr) throw aboveErr
        own = { ...p, rank: (above ?? 0) + 1 }
      }
      setOwnProfile(own)

      const selfInAllTime = allTimeRanked.some(u => u.id === user.id)
      setAllTimeAll(
        selfInAllTime
          ? allTimeRanked
          : [...allTimeRanked, { ...own, _appended: true }]
      )
      setAllTimeAllUserAppended(!selfInAllTime)

      // ── Weekly global ─────────────────────────────────────────────
      const userWeeklyCount = weeklyCount[user.id] || 0
      const usersAboveWeekly = Object.values(weeklyCount).filter(c => c > userWeeklyCount).length
      const userWeeklyRankNum = usersAboveWeekly + 1

      const topWeeklyIds = Object.entries(weeklyCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, LEADERBOARD_LIMIT)
        .map(([id]) => id)

      let weeklyEntries = []
      if (topWeeklyIds.length > 0) {
        const { data: wProfiles, error: wErr } = await supabase
          .from('profiles')
          .select('id, username, favourite_digimon, total_battles')
          .in('id', topWeeklyIds)
        if (wErr) throw wErr
        const pMap = Object.fromEntries((wProfiles || []).map(p => [p.id, p]))
        weeklyEntries = topWeeklyIds
          .map((id, i) => ({
            ...pMap[id],
            weekly_battles: weeklyCount[id],
            rank: i + 1,
          }))
          .filter(e => e.id)
      }

      const selfInWeekly = weeklyEntries.some(e => e.id === user.id)
      setWeeklyAll(
        selfInWeekly
          ? weeklyEntries
          : [
              ...weeklyEntries,
              {
                ...own,
                weekly_battles: userWeeklyCount,
                rank: userWeeklyRankNum,
                _appended: true,
              },
            ]
      )
      setWeeklyAllUserAppended(!selfInWeekly)

      // ── Friends ───────────────────────────────────────────────────
      const friendIds = (friendshipRows || []).map(r => r.friend_id)
      const friendAndSelfIds = [...friendIds, user.id]

      const { data: fProfiles, error: fpErr } = await supabase
        .from('profiles')
        .select('id, username, favourite_digimon, total_battles')
        .in('id', friendAndSelfIds)
      if (fpErr) throw fpErr

      const fp = fProfiles || []

      setFriendAllTime(
        [...fp]
          .sort((a, b) => b.total_battles - a.total_battles)
          .map((u, i) => ({ ...u, rank: i + 1 }))
      )
      setFriendWeekly(
        [...fp]
          .map(u => ({ ...u, weekly_battles: weeklyCount[u.id] || 0 }))
          .sort((a, b) => b.weekly_battles - a.weekly_battles)
          .map((u, i) => ({ ...u, rank: i + 1 }))
      )
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
      setError('Failed to load leaderboard. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Derived state
  const entries =
    scope === 'friends'
      ? period === 'weekly' ? friendWeekly : friendAllTime
      : period === 'weekly' ? weeklyAll : allTimeAll

  const isUserAppended =
    scope === 'all' &&
    (period === 'weekly' ? weeklyAllUserAppended : allTimeAllUserAppended)

  const battleKey = period === 'weekly' ? 'weekly_battles' : 'total_battles'
  const battleLabel = period === 'weekly' ? 'this week' : 'battles'

  const scrollToUser = () => {
    userRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>Loading leaderboard...</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* ── Fixed controls (do not scroll) ── */}
      <div className={styles.controls}>
        <div className={styles.header}>
          <h1 className={styles.title}>LEADERBOARD</h1>
          <p className={styles.subtitle}>Ranked by confirmed battles</p>
        </div>

        {/* Scope tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${scope === 'all' ? styles.tabActive : ''}`}
            onClick={() => setScope('all')}
          >
            All Trainers
          </button>
          <button
            className={`${styles.tab} ${scope === 'friends' ? styles.tabActive : ''}`}
            onClick={() => setScope('friends')}
          >
            Friends
          </button>
        </div>

        {/* Period row */}
        <div className={styles.periodRow}>
          <div className={styles.periodTabs}>
            <button
              className={`${styles.periodTab} ${period === 'weekly' ? styles.periodTabActive : ''}`}
              onClick={() => setPeriod('weekly')}
            >
              This Week
            </button>
            <button
              className={`${styles.periodTab} ${period === 'alltime' ? styles.periodTabActive : ''}`}
              onClick={() => setPeriod('alltime')}
            >
              All Time
            </button>
          </div>
          <button className={styles.yourRankBtn} onClick={scrollToUser}>
            ↑ Your Rank
          </button>
        </div>
      </div>

      {/* ── Scrollable list area ── */}
      <div className={styles.scrollArea}>
        {error ? (
          <EmptyState
            icon={WifiOff}
            title="Could not load leaderboard"
            message={error}
            variant="error"
          />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={scope === 'friends' ? Users : Trophy}
            title={
              scope === 'friends' && period === 'weekly' ? 'No friend battles this week' :
              scope === 'friends' ? 'No friends ranked yet' :
              period === 'weekly' ? 'No battles this week' :
              'No trainers yet'
            }
            message={
              scope === 'friends'
                ? 'Add friends to compare battle rankings!'
                : period === 'weekly'
                ? 'Be the first to battle this week!'
                : 'Be the first trainer on the leaderboard.'
            }
          />
        ) : (
          <div className={styles.list}>
            {entries.map(entry => {
              const isOwn = entry.id === user?.id
              const rowClass = [
                styles.row,
                entry.rank === 1 ? styles.rankGold : '',
                entry.rank >= 2 && entry.rank <= 3 ? styles.rankTop3 : '',
                isOwn ? styles.rankOwn : '',
              ].filter(Boolean).join(' ')

              return (
                <Fragment key={entry.id}>
                  {entry._appended && (
                    <div className={styles.ellipsis}>· · ·</div>
                  )}
                  <div
                    className={rowClass}
                    ref={isOwn ? userRowRef : null}
                  >
                    <div className={styles.rankNum}>#{entry.rank}</div>
                    <div className={styles.spriteWrapper}>
                      <DigimonSprite suffix={entry.favourite_digimon} size="sm" />
                    </div>
                    <div className={styles.nameCol}>
                      <span className={styles.username}>{entry.username}</span>
                      {isOwn && <span className={styles.youTag}>YOU</span>}
                    </div>
                    <div className={styles.battles}>
                      <span className={styles.battlesNum}>
                        {entry[battleKey] ?? 0}
                      </span>
                      <span className={styles.battlesLabel}>{battleLabel}</span>
                    </div>
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
