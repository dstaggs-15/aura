'use client'
import { useState, useEffect, useRef, memo } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile, Post, Comment, LedgerEntry, Friendship } from '@/lib/types'

const VOTE_OPTS = [-50, -10, -5, -1, 1, 5, 10, 50]
const fmtAura = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString()
const clownCount = (a: number) => a < -499 ? 3 : a < -99 ? 2 : a < 0 ? 1 : 0
const clownTitle = (a: number) => a <= -500 ? 'Mega Clown' : a <= -100 ? 'Big Clown' : a < 0 ? 'Clown' : null
const currentWeekStart = () => {
  const d = new Date()
  const diff = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}
const urlBase64ToUint8Array = (value: string) => {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)))
}
const timeAgo = (ts: string) => {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

const S = {
  bg: '#0d0d0d', card: '#161616', card2: '#1e1e1e', border: '#2a2a2a', border2: '#333',
  text: '#f0f0f0', text2: '#888', text3: '#555', blue: '#3b82f6', blueDim: '#1e3a5f',
  red: '#ef4444', redDim: '#3b1515', fire: '#f97316',
}

const Av = ({ p, size = 36 }: { p: any; size?: number }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', border: `1.5px solid ${S.border2}`,
    background: p.avatar_url ? 'transparent' : S.blue,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.33, fontWeight: 700, color: '#fff',
  }}>
    {p.avatar_url
      ? <img src={p.avatar_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : p.username.slice(0, 2).toUpperCase()}
  </div>
)

const Card = ({ children, style = {}, ...props }: any) => (
  <div {...props} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 16, ...style }}>{children}</div>
)

const CommentInput = memo(({ postId, profile, profiles, onSubmit }: {
  postId: number; profile: any; profiles: any[]; onSubmit: (postId: number, text: string) => void
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const updateMentionQuery = (value: string, caret = value.length) => {
    const beforeCaret = value.slice(0, caret)
    const match = beforeCaret.match(/(?:^|\\s)@([\\w]*)$/)
    setMentionQuery(match ? match[1].toLowerCase() : null)
  }
  const suggestions = mentionQuery === null ? [] : profiles
    .filter(p => p.id !== profile.id && p.username.toLowerCase().startsWith(mentionQuery))
    .slice(0, 6)
  const chooseMention = (username: string) => {
    const input = inputRef.current
    if (!input) return
    const caret = input.selectionStart ?? input.value.length
    const before = input.value.slice(0, caret).replace(/(?:^|\\s)@[\\w]*$/, m => {
      const prefix = m.startsWith(' ') ? ' ' : ''
      return `${prefix}@${username} `
    })
    input.value = before + input.value.slice(caret)
    setMentionQuery(null)
    input.focus()
    requestAnimationFrame(() => input.setSelectionRange(before.length, before.length))
  }
  const handleSubmit = () => {
    const text = inputRef.current?.value?.trim()
    if (!text) return
    onSubmit(postId, text)
    if (inputRef.current) inputRef.current.value = ''
    setMentionQuery(null)
  }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6, position: 'relative' }}>
      <Av p={profile} size={26} />
      <div style={{ flex: 1, position: 'relative' }}>
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 6px)', zIndex: 120, background: S.card, border: `1px solid ${S.border2}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,.45)' }}>
            {suggestions.map(p => (
              <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => chooseMention(p.username)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: `1px solid ${S.border}`, color: S.text, cursor: 'pointer', textAlign: 'left' }}>
                <Av p={p} size={26} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>@{p.username}</span>
              </button>
            ))}
          </div>
        )}
        <input ref={inputRef} type="text" placeholder="add a comment..." dir="ltr"
          onChange={e => updateMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyUp={e => { if (e.key !== 'Enter') updateMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length) }}
          onKeyDown={e => { if (e.key === 'Enter' && suggestions.length === 0) handleSubmit() }}
          style={{ width: '100%', boxSizing: 'border-box', background: S.card2, border: `1px solid ${S.border2}`, borderRadius: 20, padding: '7px 14px', fontSize: 13, color: S.text, outline: 'none', fontFamily: 'inherit', direction: 'ltr' } as any} />
      </div>
      <button onClick={handleSubmit} style={{ padding: '7px 14px', borderRadius: 20, background: S.blue, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Post</button>
    </div>
  )
})
CommentInput.displayName = 'CommentInput'

const renderText = (text: string, color = '#ccc') => {
  const parts = text.split(/(@\w+)/g)
  return (
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color, unicodeBidi: 'plaintext', textAlign: 'left' } as any}>
      {parts.map((part, i) =>
        part.startsWith('@')
          ? <span key={i} style={{ color: S.blue, fontWeight: 600 }}>{part}</span>
          : part
      )}
    </p>
  )
}

const PostCard = memo(({ post, profile, profiles, myVote, comments, commentCount, isCommentsOpen, tags, commentVotes, postVotes, onVote, onCommentVote, onOpenProfile, onToggleComments, onComment }: {
  post: any; profile: any; profiles: any[]; myVote: number | undefined;
  comments: any[]; commentCount: number; isCommentsOpen: boolean; tags: string[]; commentVotes: Record<number, number>; postVotes: any[];
  onVote: (postId: number, val: number) => void; onCommentVote: (commentId: number, val: number) => void;
  onOpenProfile: (p: any) => void;
  onToggleComments: (postId: number) => void;
  onComment: (postId: number, text: string) => void;
}) => {
  const owner = profiles.find((p: any) => p.id === post.user_id)
  if (!owner) return null
  const isOwn = post.user_id === profile?.id
  const cc = clownCount(owner.aura)
  const taggedUsers = tags.map(id => profiles.find((p: any) => p.id === id)).filter(Boolean)
  const [showVotes, setShowVotes] = useState(false)

  return (
    <Card style={{ marginBottom: 8 }}>
      <div style={{ padding: '14px 16px 12px', display: 'flex', gap: 11 }}>
        <div onClick={() => onOpenProfile(owner)} style={{ cursor: 'pointer', marginTop: 1 }}>
          <Av p={owner} size={38} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span onClick={() => onOpenProfile(owner)} style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer', color: S.text }}>{owner.username}</span>
            {cc > 0 && <span style={{ fontSize: 13 }}>{'🤡'.repeat(cc)}</span>}
            {owner.streak >= 3 && <span style={{ fontSize: 12, color: S.fire }}>🔥{owner.streak}</span>}
            <span style={{ fontSize: 11, color: S.text3, marginLeft: 'auto' }}>{timeAgo(post.created_at)}</span>
          </div>
          {renderText(post.text)}
          {taggedUsers.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
              {taggedUsers.map((u: any) => (
                <span key={u.id} onClick={() => onOpenProfile(u)} style={{ fontSize: 11, color: S.blue, background: S.blueDim, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', fontWeight: 500 }}>
                  📍 {u.username}
                </span>
              ))}
            </div>
          )}
          {post.image_url && (
            <img src={post.image_url} alt="post" style={{ width: '100%', borderRadius: 10, marginTop: 10, maxHeight: 400, objectFit: 'contain', background: S.card2 }} />
          )}
        </div>
      </div>

      <div style={{ padding: '10px 16px 12px', borderTop: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setShowVotes(!showVotes)} style={{ background: 'transparent', border: 'none', padding: 0, fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: post.aura >= 0 ? S.blue : S.red, cursor: 'pointer' }}>{fmtAura(post.aura)}</button>
        {isOwn
          ? <span style={{ fontSize: 11, color: S.text3 }}>your post</span>
          : <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {VOTE_OPTS.map(v => {
                const active = myVote === v
                const neg = v < 0
                return (
                  <button key={v} onClick={() => onVote(post.id, v)} style={{
                    padding: '4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    fontFamily: 'monospace', cursor: 'pointer',
                    border: `1px solid ${active ? 'transparent' : S.border2}`,
                    background: active ? (neg ? S.red : S.blue) : S.card2,
                    color: active ? '#fff' : (neg ? S.red : S.blue),
                  }}>{v > 0 ? `+${v}` : v}</button>
                )
              })}
            </div>
        }
      </div>

      {showVotes && <div style={{ padding: '8px 16px 10px', borderTop: `1px solid ${S.border}`, fontSize: 12 }}>
        {postVotes.length === 0 ? <span style={{ color: S.text3 }}>No votes yet.</span> : postVotes.map((v: any) => { const vp=profiles.find((p:any)=>p.id===v.voter_id); return <div key={v.voter_id} style={{ display:'flex',justifyContent:'space-between',padding:'4px 0' }}><span style={{ color:S.text2 }}>@{vp?.username || 'user'}</span><b style={{ color:v.value>=0?S.blue:S.red }}>{fmtAura(v.value)}</b></div> })}
      </div>}
      <div style={{ borderTop: `1px solid ${S.border}` }}>
        <button onClick={() => onToggleComments(post.id)} style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', color: S.text3, fontSize: 12, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
          💬 {commentCount > 0 ? `${commentCount} comment${commentCount !== 1 ? 's' : ''}` : 'Add a comment'} {isCommentsOpen ? '▲' : '▼'}
        </button>
        {isCommentsOpen && (
          <div style={{ padding: '0 16px 14px' }}>
            {comments.length === 0 && <p style={{ fontSize: 12, color: S.text3, marginBottom: 10 }}>No comments yet.</p>}
            {comments.map((c: any) => {
              const cu = profiles.find((p: any) => p.id === c.user_id)
              if (!cu) return null
              return (
                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <Av p={cu} size={26} />
                  <div style={{ flex: 1, background: S.card2, borderRadius: 10, padding: '8px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: S.text, marginBottom: 3 }}>{cu.username}</div>
                    {renderText(c.text, '#ccc')}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: (c.aura || 0) >= 0 ? S.blue : S.red }}>{fmtAura(c.aura || 0)}</span>
                      {cu.id !== profile.id && [-1, 1].map(v => <button key={v} onClick={() => onCommentVote(c.id, v)} style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: `1px solid ${commentVotes[c.id] === v ? 'transparent' : S.border2}`, background: commentVotes[c.id] === v ? (v > 0 ? S.blue : S.red) : 'transparent', color: commentVotes[c.id] === v ? '#fff' : (v > 0 ? S.blue : S.red), cursor: 'pointer' }}>{v > 0 ? '+1' : '-1'}</button>)}
                    </div>
                  </div>
                </div>
              )
            })}
            <CommentInput postId={post.id} profile={profile} profiles={profiles} onSubmit={onComment} />
          </div>
        )}
      </div>
    </Card>
  )
})
PostCard.displayName = 'PostCard'

const TagPicker = ({ profiles, selected, onToggle }: { profiles: any[], selected: string[], onToggle: (id: string) => void }) => (
  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: S.card, border: `1px solid ${S.border2}`, borderRadius: 12, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
    {profiles.map(p => (
      <div key={p.id} onClick={() => onToggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: selected.includes(p.id) ? S.blueDim : 'transparent', borderBottom: `1px solid ${S.border}` }}>
        <Av p={p} size={28} />
        <span style={{ fontSize: 13, color: S.text }}>{p.username}</span>
        {selected.includes(p.id) && <span style={{ marginLeft: 'auto', color: S.blue, fontSize: 12 }}>✓ Tagged</span>}
      </div>
    ))}
  </div>
)

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [myVotes, setMyVotes] = useState<Record<number, number>>({})
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({})
  const [postTags, setPostTags] = useState<Record<number, string[]>>({})
  const [tab, setTab] = useState('feed')
  const [lbTab, setLbTab] = useState('people')
  const [filter, setFilter] = useState('recent')
  const [composing, setComposing] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postImage, setPostImage] = useState<File | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [taxBucket, setTaxBucket] = useState(0)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [modalProfile, setModalProfile] = useState<Profile | null>(null)
  const [editingBio, setEditingBio] = useState(false)
  const [profileVotes, setProfileVotes] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<number, Comment[]>>({})
  const [commentVotes, setCommentVotes] = useState<Record<number, number>>({})
  const [allPostVotes, setAllPostVotes] = useState<any[]>([])
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({})
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [showLedger, setShowLedger] = useState(false)
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const toastTimer = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const postImageRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef<string>('')
  const bioRef = useRef<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/auth'; return }
      loadAll(data.user.id)
    })
  }, [])

  useEffect(() => {
    if (!profile?.id || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.register('/sw.js').then(async registration => {
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) { setPushEnabled(false); return }
      const { data } = await supabase.from('push_subscriptions').select('endpoint').eq('user_id', profile.id).eq('endpoint', subscription.endpoint).maybeSingle()
      setPushEnabled(!!data)
    }).catch(() => setPushEnabled(false))
  }, [profile?.id])

  const loadAll = async (uid: string) => {
    const [
      { data: profs }, { data: ps }, { data: bucket }, { data: vs },
      { data: counts }, { data: tags }, { data: pvs }, { data: friendshipRows }, { data: allVotes },
    ] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('posts').select('*, profiles(*)').order('created_at', { ascending: false }),
      supabase.from('tax_bucket').select('*').single(),
      supabase.from('votes').select('*').eq('voter_id', uid),
      supabase.from('post_comment_counts').select('*'),
      supabase.from('post_tags').select('*'),
      supabase.from('profile_votes').select('*').eq('voter_id', uid),
      supabase.from('friendships').select('*').order('created_at', { ascending: false }),
      supabase.from('votes').select('post_id,voter_id,value'),
    ])

    if (profs) {
      const visible = profs.filter((p: Profile) => p.is_member)
      setProfiles(visible)
      const myProf = visible.find((p: Profile) => p.id === uid)
      if (!myProf) {
        await supabase.auth.signOut()
        window.location.href = '/auth'
        return
      }
      setProfile(myProf)
    }
    if (ps) setPosts(ps)
    if (bucket) setTaxBucket(Number(bucket.amount) || 0)
    if (vs) { const m: Record<number, number> = {}; vs.forEach((v: any) => m[v.post_id] = v.value); setMyVotes(m) }
    if (counts) { const m: Record<number, number> = {}; counts.forEach((x: any) => m[x.post_id] = Number(x.count)); setCommentCounts(m) }
    if (tags) {
      const m: Record<number, string[]> = {}
      tags.forEach((t: any) => { if (!m[t.post_id]) m[t.post_id] = []; m[t.post_id].push(t.tagged_user_id) })
      setPostTags(m)
    }
    if (pvs) { const m: Record<string, number> = {}; pvs.forEach((v: any) => m[v.target_id] = v.value); setProfileVotes(m) }
    if (friendshipRows) setFriendships(friendshipRows)
    if (allVotes) setAllPostVotes(allVotes)
  }

  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase.channel('aura-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadAll(profile.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadAll(profile.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => loadAll(profile.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => loadAll(profile.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  const notify = (msg: string, type = 'neutral') => {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }

  const handleVote = async (postId: number, val: number) => {
    if (!profile) return
    const { data, error } = await supabase.rpc('cast_post_vote', { p_post_id: postId, p_value: val })
    if (error) { notify(error.message, 'neg'); return }
    if (data?.reason === 'anti_glaze') notify('🚫 Anti-glaze penalty: −50 aura', 'neg')
    else notify(val > 0 ? `+${val} vote sent` : `${val} vote sent`, val > 0 ? 'pos' : 'neg')
    await loadAll(profile.id)
  }

  const handleProfileVote = async (targetId: string, val: number) => {
    if (!profile || targetId === profile.id) return
    const { data, error } = await supabase.rpc('cast_profile_vote', { p_target_id: targetId, p_value: val })
    if (error) { notify(error.message, 'neg'); return }
    if (data?.reason === 'anti_glaze') notify('🚫 Anti-glaze penalty: −50 aura', 'neg')
    else notify(val > 0 ? `+${val} profile vote` : `${val} profile vote`, val > 0 ? 'pos' : 'neg')
    await loadAll(profile.id)
  }

  const handleCheckIn = async () => {
    if (!profile) return
    const { data, error } = await supabase.rpc('daily_checkin')
    if (error) { notify(error.message, 'neg'); return }
    if (!data?.ok) { notify('Already checked in today'); return }
    notify(`🔥 +${data.reward} aura — ${data.streak} day streak!`, 'pos')
    await loadAll(profile.id)
  }

  const friendshipWith = (targetId: string) =>
    friendships.find(f =>
      (f.requester_id === profile?.id && f.addressee_id === targetId) ||
      (f.addressee_id === profile?.id && f.requester_id === targetId)
    )

  const handleFriend = async (targetId: string, action: 'request' | 'accept' | 'remove') => {
    if (!profile) return
    const { error } = await supabase.rpc('manage_friend_request', { p_target_id: targetId, p_action: action })
    if (error) { notify(error.message, 'neg'); return }
    notify(action === 'accept' ? 'Friend added' : action === 'remove' ? 'Friend removed' : 'Friend request sent', 'pos')
    await loadAll(profile.id)
  }

  const enablePushNotifications = async () => {
    if (!profile || pushBusy) return
    setPushBusy(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push is not supported in this browser.')
      const publicKey = 'BEbse352LwkSuMmgi3olJXrLjjVlbiCVU7JdSiBcJJBwRhaVGWFOf1IyscziCFBky_rQudsQlUrCzHs-PLy1cJM'
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications were not allowed.')
      const registration = await navigator.serviceWorker.register('/sw.js')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Could not create a push subscription.')
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: profile.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (error) throw error
      setPushEnabled(true)
      notify('Browser notifications enabled', 'pos')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not enable notifications', 'neg')
    } finally {
      setPushBusy(false)
    }
  }

  const handlePost = async () => {
    if (!draftRef.current.trim() || !profile || posting) return
    setPosting(true)
    let image_url = null
    if (postImage) {
      const ext = postImage.name.split('.').pop()
      const path = `${profile.id}-${Date.now()}.${ext}`
      await supabase.storage.from('posts').upload(path, postImage, { upsert: true })
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
      image_url = urlData.publicUrl
    }
    const { data } = await supabase.from('posts').insert({ user_id: profile.id, text: draftRef.current.trim(), aura: 0, image_url }).select('*, profiles(*)').single()
    if (data) {
      if (selectedTags.length > 0) {
        await supabase.from('post_tags').insert(selectedTags.map(uid => ({ post_id: data.id, tagged_user_id: uid })))
        setPostTags(t => ({ ...t, [data.id]: selectedTags }))
      }
      setPosts(ps => [data, ...ps])
      draftRef.current = ''
      const ta = document.getElementById('post-textarea') as HTMLTextAreaElement
      if (ta) ta.value = ''
      setPostImage(null)
      setSelectedTags([])
      setComposing(false)
      notify('Posted 🔥')
      const { error: pushError } = await supabase.functions.invoke('send-new-post-push', { body: { post_id: data.id } })
      if (pushError) console.warn('Push fanout failed:', pushError.message)
    }
    setPosting(false)
  }

  const handleComment = async (postId: number, text: string) => {
    if (!profile || !text.trim()) return
    const { data, error } = await supabase.from('comments').insert({ post_id: postId, user_id: profile.id, text: text.trim() }).select('*').single()
    if (error) { notify(`Could not post comment: ${error.message}`, 'neg'); return }
    if (data) {
      setComments(c => ({ ...c, [postId]: [...(c[postId] || []), data] }))
      setCommentCounts(c => ({ ...c, [postId]: (c[postId] || 0) + 1 }))
    }
  }

  const handleCommentVote = async (commentId: number, val: number) => {
    if (!profile) return
    const { error } = await supabase.rpc('cast_comment_vote', { p_comment_id: commentId, p_value: val })
    if (error) { notify(error.message, 'neg'); return }
    setCommentVotes(v => ({ ...v, [commentId]: val }))
    setComments(groups => Object.fromEntries(Object.entries(groups).map(([postId, rows]) => [postId, rows.map((row: any) => row.id === commentId ? { ...row, aura: (row.aura || 0) + val - (commentVotes[commentId] || 0) } : row)])))
    await loadAll(profile.id)
  }

  const handleToggleComments = async (postId: number) => {
    const nowOpen = !openComments[postId]
    setOpenComments(o => ({ ...o, [postId]: nowOpen }))
    if (nowOpen && !comments[postId]) {
      const { data, error } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true })
      if (error) { notify(`Could not load comments: ${error.message}`, 'neg'); return }
      if (data) {
        setComments(c => ({ ...c, [postId]: data }))
        const ids = data.map((x: any) => x.id)
        if (ids.length) {
          const { data: votes } = await supabase.from('comment_votes').select('comment_id,value').eq('voter_id', profile!.id).in('comment_id', ids)
          if (votes) setCommentVotes(v => ({ ...v, ...Object.fromEntries(votes.map((x: any) => [x.comment_id, x.value])) }))
        }
      }
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const ext = file.name.split('.').pop()
    const path = `${profile.id}.${ext}`
    await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
    setProfile(p => p ? { ...p, avatar_url: data.publicUrl } : p)
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, avatar_url: data.publicUrl } : p))
    notify('Photo updated', 'pos')
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const ext = file.name.split('.').pop()
    const path = `banner-${profile.id}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file)
    if (uploadError) { notify(uploadError.message, 'neg'); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const bannerUrl = `${data.publicUrl}?v=${Date.now()}`
    const { error: updateError } = await supabase.from('profiles').update({ banner_url: bannerUrl }).eq('id', profile.id)
    if (updateError) { notify(updateError.message, 'neg'); return }
    setProfile(p => p ? { ...p, banner_url: bannerUrl } : p)
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, banner_url: bannerUrl } : p))
    notify('Banner updated', 'pos')
  }

  const handleSaveBio = async () => {
    if (!profile) return
    const bio = bioRef.current
    await supabase.from('profiles').update({ bio }).eq('id', profile.id)
    setProfile(p => p ? { ...p, bio } : p)
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, bio } : p))
    setEditingBio(false)
    notify('Bio saved', 'pos')
  }

  const loadLedger = async () => {
    if (!profile) return
    const { data } = await supabase.from('aura_ledger').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50)
    if (data) setLedger(data)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }

  const checkedInToday = profile?.last_checkin === new Date().toISOString().split('T')[0]
  const weeklyPosts = posts.filter(p => new Date(p.created_at) >= currentWeekStart())
  const topPost = [...weeklyPosts].sort((a, b) => b.aura - a.aura)[0]
  const topPostUser = topPost ? profiles.find(p => p.id === topPost.user_id) : null
  const sorted = [...posts].sort((a, b) => filter === 'trending' ? b.aura - a.aura : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const getBadges = (p: any) => {
    const b = ['🌐 Joined']
    if (p.streak >= 7) b.push('🔥 Streaker')
    if (p.streak >= 30) b.push('💀 Obsessed')
    if (p.aura >= 1000) b.push('⚡ Legendary')
    if (p.aura >= 500) b.push('👑 Elite')
    if (p.aura < 0) b.push('🤡 ' + (clownCount(p.aura) === 1 ? 'Clown' : clownCount(p.aura) === 2 ? 'Big Clown' : 'Mega Clown'))
    return b
  }

  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.bg }}>
      <div style={{ fontSize: 40 }}>🔥</div>
    </div>
  )

  const otherProfiles = profiles.filter(p => p.id !== profile.id)
  const TABS = ['feed', 'leaderboard', 'friends', 'bank', 'help', 'profile']

  return (
    <div style={{ minHeight: '100vh', background: S.bg, fontFamily: "'Outfit', sans-serif", color: S.text }}>
      <style>{`
        html, body { width:100%; max-width:100%; overflow-x:hidden; -webkit-text-size-adjust:100%; }
        * { box-sizing:border-box; }
        img, video { max-width:100%; }
        button, input, textarea, select { max-width:100%; }
        @media (max-width: 480px) {
          .aura-shell { padding-left:10px !important; padding-right:10px !important; }
          .aura-votes { gap:5px !important; padding-left:10px !important; padding-right:10px !important; }
          .aura-votes button { flex:1 1 42px !important; min-width:0 !important; padding-left:4px !important; padding-right:4px !important; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-text-size-adjust: 100%; }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(-10px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${S.bg}; }
        ::-webkit-scrollbar-thumb { background: ${S.border2}; border-radius: 4px; }
        textarea, input[type="text"], input[type="email"], input[type="password"] {
          direction: ltr !important; unicode-bidi: plaintext !important; text-align: left !important;
        }
      `}</style>

      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', zIndex: 999, pointerEvents: 'none', transform: 'translateX(-50%)', animation: 'toastIn .2s ease', background: toast.type === 'pos' ? S.blue : toast.type === 'neg' ? S.red : '#222', color: '#fff', padding: '9px 20px', borderRadius: 99, fontSize: 13, fontWeight: 500, whiteSpace: 'normal', maxWidth: 'calc(100vw - 28px)', boxSizing: 'border-box', textAlign: 'center', overflowWrap: 'anywhere' }}>{toast.msg}</div>
      )}

      {modalProfile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
          onClick={() => { setModalProfile(null); setEditingBio(false) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ height: 90, background: clownCount(modalProfile.aura) > 0 ? `repeating-linear-gradient(45deg,${S.redDim} 0,${S.redDim} 12px,${S.card} 12px,${S.card} 24px)` : `linear-gradient(135deg, ${S.blueDim}, ${S.card})`, backgroundImage: modalProfile.banner_url ? `url(${modalProfile.banner_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '20px 20px 0 0', position: 'relative' }}>
              <button onClick={() => setModalProfile(null)} style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,.5)', border: `1px solid ${S.border2}`, cursor: 'pointer', fontSize: 14, color: '#fff' }}>✕</button>
            </div>
            <div style={{ padding: '0 20px 24px', marginTop: -22 }}>
              <Av p={modalProfile} size={54} />
              <div style={{ marginTop: 10, marginBottom: 2, fontWeight: 700, fontSize: 20, color: S.text }}>
                {modalProfile.username} {clownCount(modalProfile.aura) > 0 && '🤡'.repeat(clownCount(modalProfile.aura))}
              </div>
              {modalProfile.bio && <p style={{ fontSize: 13, color: S.text2, marginBottom: 14, lineHeight: 1.55 }}>{modalProfile.bio}</p>}
              <div style={{ display: 'flex', gap: 24, margin: '14px 0' }}>
                {[
                  { label: 'Aura', val: fmtAura(modalProfile.aura), color: modalProfile.aura >= 0 ? S.blue : S.red },
                  { label: 'All-time', val: fmtAura(modalProfile.aura_all_time || 0), color: S.fire },
                  { label: 'Streak', val: `🔥${modalProfile.streak}`, color: S.text },
                  { label: 'Posts', val: posts.filter(p => p.user_id === modalProfile.id).length, color: S.text },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: S.text3, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {modalProfile.id !== profile.id && (() => {
                const friendship = friendshipWith(modalProfile.id)
                const incoming = friendship?.status === 'pending' && friendship.addressee_id === profile.id
                return (
                  <div style={{ marginBottom: 14 }}>
                    {!friendship && <button onClick={() => handleFriend(modalProfile.id, 'request')} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${S.blue}`, background: S.blueDim, color: S.blue, cursor: 'pointer', fontWeight: 600 }}>＋ Add friend</button>}
                    {incoming && <button onClick={() => handleFriend(modalProfile.id, 'accept')} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: S.blue, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Accept friend request</button>}
                    {friendship?.status === 'pending' && !incoming && <span style={{ fontSize: 12, color: S.text3 }}>Friend request pending</span>}
                    {friendship?.status === 'accepted' && <button onClick={() => handleFriend(modalProfile.id, 'remove')} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${S.border2}`, background: 'transparent', color: S.text2, cursor: 'pointer' }}>✓ Friends · Remove</button>}
                  </div>
                )
              })()}
              {modalProfile.id !== profile.id && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: S.text3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Rate their vibe</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {VOTE_OPTS.map(v => {
                      const active = profileVotes[modalProfile.id] === v
                      const neg = v < 0
                      return (
                        <button key={v} onClick={() => handleProfileVote(modalProfile.id, v)} style={{ padding: '5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer', border: `1px solid ${active ? 'transparent' : S.border2}`, background: active ? (neg ? S.red : S.blue) : S.card2, color: active ? '#fff' : (neg ? S.red : S.blue) }}>{v > 0 ? `+${v}` : v}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                {getBadges(modalProfile).map(b => (
                  <span key={b} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: S.card2, border: `1px solid ${S.border2}`, color: S.text2 }}>{b}</span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: S.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Posts</div>
              {posts.filter(p => p.user_id === modalProfile.id).length === 0 && <p style={{ fontSize: 13, color: S.text3 }}>No posts yet.</p>}
              {posts.filter(p => p.user_id === modalProfile.id).map(p => (
                <div key={p.id} style={{ background: S.card2, borderRadius: 10, padding: '10px 13px', marginBottom: 8 }}>
                  <p style={{ fontSize: 13, color: '#ccc', marginBottom: 6, lineHeight: 1.5 }}>{p.text}</p>
                  {p.image_url && <img src={p.image_url} alt="post" style={{ width: '100%', borderRadius: 8, marginBottom: 6, maxHeight: 200, objectFit: 'contain', background: S.card }} />}
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: p.aura >= 0 ? S.blue : S.red }}>{fmtAura(p.aura)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(13,13,13,.95)', borderBottom: `1px solid ${S.border}`, padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: -.5, color: S.text }}>aura</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: profile.aura >= 0 ? S.blue : S.red }}>
            {clownCount(profile.aura) > 0 ? '🤡 ' : ''}{fmtAura(profile.aura)}
          </span>
          <button onClick={handleCheckIn} disabled={checkedInToday} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${checkedInToday ? S.border : S.blue}`, cursor: checkedInToday ? 'default' : 'pointer', background: checkedInToday ? 'transparent' : S.blue, color: checkedInToday ? S.text3 : '#fff' }}>
            {checkedInToday ? '✓ Checked in' : '🔥 Check in'}
          </button>
          <button onClick={handleLogout} style={{ fontSize: 12, color: S.text3, background: 'none', border: 'none', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      <div style={{ background: S.card, borderBottom: `1px solid ${S.border}`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: S.text2, flexWrap: 'wrap' }}>
        <span>🏆</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: S.text }}>{taxBucket.toFixed(1)} aura</span>
        <span style={{ color: S.border2 }}>·</span>
        <span>in the prize pool · top post wins Sunday</span>
        {topPostUser && <><span style={{ color: S.border2 }}>·</span><span style={{ color: S.blue }}>👑 {topPostUser.username} leading</span></>}
      </div>

      <div style={{ background: S.card, borderBottom: `1px solid ${S.border}`, display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as any}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '14px 18px', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? S.text : S.text3, background: 'transparent', border: 'none', borderBottom: tab === t ? `2px solid ${S.blue}` : '2px solid transparent', cursor: 'pointer', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
            {t === 'bank' ? '🏦 Bank' : t === 'help' ? '❓ Help' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="aura-shell" style={{ width: '100%', maxWidth: 600, margin: '0 auto', padding: 14, overflowX: 'hidden' }}>

        {tab === 'feed' && <>
          {composing ? (
            <Card style={{ padding: 16, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 11, marginBottom: 12 }}>
                <Av p={profile} size={36} />
                <textarea id="post-textarea" defaultValue="" onChange={e => { draftRef.current = e.target.value }} placeholder="what happened?" rows={3} dir="ltr" autoComplete="off"
                  style={{ flex: 1, border: 'none', background: 'transparent', color: S.text, fontSize: 16, lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', outline: 'none', direction: 'ltr', unicodeBidi: 'plaintext', textAlign: 'left' } as any} />
              </div>
              {postImage && (
                <div style={{ marginBottom: 10, position: 'relative' }}>
                  <img src={URL.createObjectURL(postImage)} alt="preview" style={{ width: '100%', borderRadius: 10, maxHeight: 200, objectFit: 'contain', background: S.card2 }} />
                  <button onClick={() => setPostImage(null)} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              )}
              {selectedTags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {selectedTags.map(id => {
                    const u = profiles.find(p => p.id === id)
                    return u ? (
                      <span key={id} style={{ fontSize: 12, color: S.blue, background: S.blueDim, padding: '3px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
                        📍 {u.username}
                        <span onClick={() => setSelectedTags(t => t.filter(x => x !== id))} style={{ cursor: 'pointer', opacity: .7 }}>✕</span>
                      </span>
                    ) : null
                  })}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ cursor: 'pointer', color: postImage ? S.blue : S.text3, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${postImage ? S.blue : S.border}`, background: postImage ? S.blueDim : 'transparent' }}>
                      📷 {postImage ? 'Photo added' : 'Add photo'}
                      <input ref={postImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPostImage(e.target.files?.[0] || null)} />
                    </label>
                    <button onClick={() => setShowTagPicker(!showTagPicker)} style={{ cursor: 'pointer', color: selectedTags.length > 0 ? S.blue : S.text3, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${selectedTags.length > 0 ? S.blue : S.border}`, background: selectedTags.length > 0 ? S.blueDim : 'transparent' }}>
                      📍 {selectedTags.length > 0 ? `${selectedTags.length} tagged` : 'Tag people'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setComposing(false); draftRef.current = ''; setPostImage(null); setSelectedTags([]) }} style={{ padding: '7px 16px', borderRadius: 10, fontSize: 13, border: `1px solid ${S.border2}`, background: 'transparent', color: S.text2, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handlePost} disabled={posting} style={{ padding: '7px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', background: posting ? S.border : S.blue, color: posting ? S.text3 : '#fff', cursor: posting ? 'default' : 'pointer' }}>
                      {posting ? '...' : 'Post'}
                    </button>
                  </div>
                </div>
                {showTagPicker && (
                  <TagPicker profiles={otherProfiles} selected={selectedTags}
                    onToggle={id => setSelectedTags(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id])} />
                )}
              </div>
            </Card>
          ) : (
            <button onClick={() => setComposing(true)} style={{ width: '100%', background: S.card, border: `1px solid ${S.border}`, borderRadius: 16, padding: '13px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
              <Av p={profile} size={34} />
              <span style={{ fontSize: 14, color: S.text3 }}>what happened today? 🔥</span>
            </button>
          )}
          <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
            {['recent', 'trending'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1px solid ${filter === f ? S.blue : S.border2}`, background: filter === f ? S.blueDim : 'transparent', color: filter === f ? S.blue : S.text2, cursor: 'pointer' }}>
                {f === 'trending' ? '🔥 Trending' : 'Recent'}
              </button>
            ))}
          </div>
          {sorted.length === 0 && <p style={{ color: S.text3, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>No posts yet. Be the first 👆</p>}
          {sorted.map(p => (
            <PostCard key={p.id} post={p} profile={profile} profiles={profiles} myVote={myVotes[p.id]}
              comments={comments[p.id] || []} commentCount={commentCounts[p.id] || 0}
              isCommentsOpen={openComments[p.id] || false} tags={postTags[p.id] || []} commentVotes={commentVotes} postVotes={allPostVotes.filter(v => v.post_id === p.id)}
              onVote={handleVote} onCommentVote={handleCommentVote} onOpenProfile={setModalProfile}
              onToggleComments={handleToggleComments} onComment={handleComment} />
          ))}
        </>}

        {tab === 'leaderboard' && <>
          <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
            {['people', 'posts'].map(t => (
              <button key={t} onClick={() => setLbTab(t)} style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1px solid ${lbTab === t ? S.blue : S.border2}`, background: lbTab === t ? S.blueDim : 'transparent', color: lbTab === t ? S.blue : S.text2, cursor: 'pointer' }}>
                {t === 'posts' ? '🔥 Posts' : '👤 People'}
              </button>
            ))}
          </div>
          {lbTab === 'people' && [...profiles].sort((a, b) => b.aura - a.aura).map((u, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
            const cc = clownCount(u.aura)
            return (
              <Card key={u.id} style={{ padding: '13px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', border: u.id === profile.id ? `1px solid ${S.blue}` : `1px solid ${S.border}` }}
                onClick={() => setModalProfile(u)}>
                <div style={{ width: 28, textAlign: 'center', fontSize: medal ? 18 : 13, color: S.text3, fontWeight: 700, flexShrink: 0 }}>{medal || i + 1}</div>
                <Av p={u} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: S.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {u.username}
                    {u.id === profile.id && <span style={{ fontSize: 10, color: S.blue, background: S.blueDim, padding: '1px 6px', borderRadius: 4 }}>you</span>}
                    {cc > 0 && <span>{'🤡'.repeat(cc)}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: S.text3, marginTop: 2 }}>🔥 {u.streak} day streak · all-time {fmtAura(u.aura_all_time || 0)}</div>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: u.aura >= 0 ? S.blue : S.red }}>{fmtAura(u.aura)}</div>
              </Card>
            )
          })}
          {lbTab === 'posts' && [...weeklyPosts].sort((a, b) => b.aura - a.aura).map((p, i) => {
            const owner = profiles.find(u => u.id === p.user_id)
            if (!owner) return null
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
            return (
              <Card key={p.id} style={{ padding: '13px 16px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 28, textAlign: 'center', fontSize: medal ? 18 : 13, color: S.text3, fontWeight: 700, flexShrink: 0 }}>{medal || i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, color: '#ccc', marginBottom: 7, lineHeight: 1.5 }}>{p.text}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Av p={owner} size={18} />
                    <span style={{ fontSize: 12, color: S.text2 }}>{owner.username}</span>
                    <span style={{ fontSize: 11, color: S.text3 }}>· {timeAgo(p.created_at)}</span>
                  </div>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: p.aura >= 0 ? S.blue : S.red, flexShrink: 0 }}>{fmtAura(p.aura)}</div>
              </Card>
            )
          })}
        </>}

        {tab === 'friends' && <>
          <Card style={{ padding: 18, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: S.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Friend requests</div>
            {friendships.filter(f => f.status === 'pending' && f.addressee_id === profile.id).length === 0 && <p style={{ fontSize: 13, color: S.text3 }}>No pending requests.</p>}
            {friendships.filter(f => f.status === 'pending' && f.addressee_id === profile.id).map(f => {
              const u = profiles.find(p => p.id === f.requester_id)
              if (!u) return null
              return <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${S.border}` }}>
                <Av p={u} size={34} />
                <span onClick={() => setModalProfile(u)} style={{ flex: 1, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{u.username}</span>
                <button onClick={() => handleFriend(u.id, 'accept')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: S.blue, color: '#fff', cursor: 'pointer' }}>Accept</button>
                <button onClick={() => handleFriend(u.id, 'remove')} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${S.border2}`, background: 'transparent', color: S.text2, cursor: 'pointer' }}>Decline</button>
              </div>
            })}
          </Card>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: S.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Your friends</div>
            {friendships.filter(f => f.status === 'accepted').length === 0 && <p style={{ fontSize: 13, color: S.text3 }}>No friends yet. Open a profile to add someone.</p>}
            {friendships.filter(f => f.status === 'accepted').map(f => {
              const friendId = f.requester_id === profile.id ? f.addressee_id : f.requester_id
              const u = profiles.find(p => p.id === friendId)
              if (!u) return null
              return <div key={f.id} onClick={() => setModalProfile(u)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${S.border}`, cursor: 'pointer' }}>
                <Av p={u} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{u.username} {clownCount(u.aura) > 0 && '🤡'.repeat(clownCount(u.aura))}</div>
                  <div style={{ fontSize: 11, color: S.text3 }}>{fmtAura(u.aura)} aura</div>
                </div>
              </div>
            })}
          </Card>
        </>}

        {tab === 'bank' && <>
          <Card style={{ padding: 24, marginBottom: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: S.text3, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Weekly Prize Pool</div>
            <div style={{ fontFamily: 'monospace', fontSize: 48, fontWeight: 700, color: S.blue, margin: '4px 0' }}>{taxBucket.toFixed(1)}</div>
            <div style={{ fontSize: 13, color: S.text2 }}>aura points · resets Sunday midnight</div>
            {topPost && topPostUser && (
              <div style={{ background: S.card2, borderRadius: 12, padding: '12px 14px', marginTop: 16, textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: S.text3, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 1 }}>👑 Leading post</div>
                <p style={{ fontSize: 14, color: '#ccc', marginBottom: 8, lineHeight: 1.5 }}>{topPost.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Av p={topPostUser} size={20} />
                  <span style={{ fontSize: 12, color: S.text2 }}>{topPostUser.username}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: S.blue, marginLeft: 'auto' }}>{fmtAura(topPost.aura)}</span>
                </div>
              </div>
            )}
          </Card>
          <Card style={{ padding: 20, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: S.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Economy Stats</div>
            {[
              ['Total aura in circulation', fmtAura(profiles.reduce((s, u) => s + u.aura, 0))],
              ['Users in clown mode', `${profiles.filter(u => u.aura < 0).length} 🤡`],
              ['Clown tax tiers', '25% / 35% / 50%'],
              ['Daily check-in reward', '+5 🔥'],
              ['Missed day penalty', '−2 per day missed'],
              ['Cost to send +50 vote', '5 aura'],
              ['Negative votes', 'Free'],
              ['Tagged users', 'split a 50% bonus pool'],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${S.border}` }}>
                <span style={{ fontSize: 13, color: S.text2 }}>{label}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: S.text }}>{val}</span>
              </div>
            ))}
          </Card>
        </>}

        {tab === 'help' && <>
          {[
            { title: '🔥 What is aura?', body: 'Your score on this site. Post something, people vote on it, your aura goes up or down. Simple.' },
            { title: '🗳️ Voting', body: 'Vote +1 to +50 or negative on any post. Positive votes cost aura: +1 and +5 are free, +10 costs 1, and +50 costs 5. Changing a vote only charges or refunds the difference. Negative votes are free.' },
            { title: '📍 Tagging', body: 'When making a post, tap "Tag people" to tag someone in it. If your post gets votes, tagged people split a 50% bonus pool so tagging cannot multiply aura without limit. Tag people who are actually in the post.' },
            { title: '📊 Profile votes', body: "You can vote on someone's whole profile, not just their posts. Tap their name or avatar anywhere to pull up their profile and rate their vibe." },
            { title: '🤡 Negative aura', body: 'Drop below 0 and clown emojis start showing on your profile. Clown mode now has escalating tiers: Clown, Big Clown, and Mega Clown. Positive gains are taxed 25%, 35%, or 50% into the prize pool, while negative users get a larger daily comeback check-in.' },
            { title: '🏆 Prize pool', body: 'Every Sunday at midnight, whoever has the highest-aura post that week wins the entire pool. The pool fills from the 25% tax on negative users.' },
            { title: '🔥 Streaks', body: 'Hit Check In every day for +5 aura, or +7 while in clown mode. Miss a day and your streak resets and you lose 2 aura per missed day (max 20). Log in daily or fall behind.' },
            { title: '🚫 Glazing', body: "Max 3 big votes (+50 or -50) to the same person per 24 hours. Go over that and you get hit with -50. Don't glaze." },
            { title: '💬 Comments', body: 'Tap the comment button on any post to see and leave comments.' },
            { title: '📒 Ledger', body: 'Go to your Profile and tap Ledger to see every aura transaction — what you gained, lost, and when.' },
            { title: '⭐ All-time aura', body: 'Your highest aura ever. Shows on your profile and leaderboard. Even if you lose aura, your all-time record stays.' },
          ].map(item => (
            <Card key={item.title} style={{ padding: 18, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: S.text, marginBottom: 8 }}>{item.title}</div>
              <p style={{ fontSize: 14, color: S.text2, lineHeight: 1.65 }}>{item.body}</p>
            </Card>
          ))}
        </>}

        {tab === 'profile' && <>
          <Card style={{ overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: 120, background: clownCount(profile.aura) > 0 ? `repeating-linear-gradient(45deg,${S.redDim} 0,${S.redDim} 12px,${S.card} 12px,${S.card} 24px)` : `linear-gradient(135deg, ${S.blueDim}, ${S.card})`, backgroundImage: profile.banner_url ? `url(${profile.banner_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
              <label style={{ position: 'absolute', bottom: 10, right: 10, cursor: 'pointer', background: 'rgba(0,0,0,.6)', border: `1px solid ${S.border2}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                📷 Edit banner
                <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerUpload} />
              </label>
            </div>
            <div style={{ padding: '0 18px 22px', marginTop: -26 }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
                <Av p={profile} size={56} />
                <label style={{ position: 'absolute', bottom: 0, right: -3, width: 22, height: 22, borderRadius: '50%', background: S.card2, border: `1px solid ${S.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer' }}>
                  ✏️<input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                </label>
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: S.text, marginBottom: 4 }}>
                {profile.username} {clownCount(profile.aura) > 0 && '🤡'.repeat(clownCount(profile.aura))}
              </div>
              <div style={{ margin: '10px 0 16px' }}>
                {editingBio ? (
                  <div>
                    <textarea defaultValue={profile.bio || ''} onChange={e => { bioRef.current = e.target.value }} placeholder="say something..." rows={2} dir="ltr"
                      style={{ width: '100%', border: `1px solid ${S.border2}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, background: S.card2, color: S.text, lineHeight: 1.55, resize: 'none', fontFamily: 'inherit', outline: 'none', direction: 'ltr', textAlign: 'left' } as any} />
                    <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                      <button onClick={handleSaveBio} style={{ padding: '6px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600, background: S.blue, color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingBio(false)} style={{ padding: '6px 16px', borderRadius: 9, fontSize: 12, border: `1px solid ${S.border2}`, background: 'transparent', color: S.text2, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <p style={{ fontSize: 14, color: profile.bio ? S.text2 : S.text3, flex: 1, lineHeight: 1.5 }}>{profile.bio || 'No bio yet.'}</p>
                    <button onClick={() => { setEditingBio(true); bioRef.current = profile.bio || '' }} style={{ fontSize: 11, color: S.text3, background: 'none', border: `1px solid ${S.border}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Aura', val: fmtAura(profile.aura), color: profile.aura >= 0 ? S.blue : S.red },
                  { label: 'All-time', val: fmtAura(profile.aura_all_time || 0), color: S.fire },
                  { label: 'Streak', val: `🔥${profile.streak}`, color: S.text },
                  { label: 'Posts', val: posts.filter(p => p.user_id === profile.id).length, color: S.text },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: S.text3, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {getBadges(profile).map(b => (
                  <span key={b} style={{ fontSize: 11, padding: '4px 11px', borderRadius: 20, background: S.card2, border: `1px solid ${S.border2}`, color: S.text2 }}>{b}</span>
                ))}
              </div>
              {profile.aura < 0 && (
                <div style={{ background: S.redDim, border: `1px solid ${S.red}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 6 }}>🤡 {clownTitle(profile.aura)} mode</div>
                  <div style={{ fontSize: 12, color: '#f3b5b5', marginBottom: 8 }}>{Math.abs(profile.aura).toFixed(1)} aura until you escape. Negative users get a +7 check-in comeback reward; higher clown tiers pay more tax on positive gains.</div>
                  <div style={{ height: 6, background: '#260d0d', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(4, Math.min(100, 100 - Math.abs(profile.aura) / 5))}%`, background: S.red }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={enablePushNotifications} disabled={pushBusy || pushEnabled} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${pushEnabled ? S.blue : S.border2}`, background: pushEnabled ? S.blueDim : 'transparent', color: pushEnabled ? S.blue : S.text2, cursor: pushBusy || pushEnabled ? 'default' : 'pointer' }}>
                  {pushEnabled ? '🔔 Notifications enabled' : pushBusy ? 'Enabling...' : '🔔 Enable post notifications'}
                </button>
                <button onClick={() => { setShowLedger(!showLedger); if (!showLedger) loadLedger() }} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${S.border2}`, background: showLedger ? S.blue : 'transparent', color: showLedger ? '#fff' : S.text2, cursor: 'pointer' }}>
                📒 {showLedger ? 'Hide Ledger' : 'View Ledger'}
                </button>
              </div>
            </div>
          </Card>

          {showLedger && (
            <Card style={{ padding: 20, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: S.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Aura Ledger</div>
              {ledger.length === 0 && <p style={{ fontSize: 13, color: S.text3 }}>No transactions yet.</p>}
              {ledger.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${S.border}` }}>
                  <div>
                    <div style={{ fontSize: 13, color: S.text }}>{e.description}</div>
                    <div style={{ fontSize: 11, color: S.text3, marginTop: 2 }}>{timeAgo(e.created_at)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: e.amount >= 0 ? S.blue : S.red }}>{e.amount >= 0 ? '+' : ''}{e.amount}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: S.text3 }}>bal: {e.balance_after}</div>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, color: S.text3, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Your Posts</div>
          {posts.filter(p => p.user_id === profile.id).length === 0
            ? <p style={{ fontSize: 14, color: S.text3, textAlign: 'center', padding: '30px 0' }}>No posts yet.</p>
            : posts.filter(p => p.user_id === profile.id).map(p => (
              <PostCard key={p.id} post={p} profile={profile} profiles={profiles} myVote={myVotes[p.id]}
                comments={comments[p.id] || []} commentCount={commentCounts[p.id] || 0}
                isCommentsOpen={openComments[p.id] || false} tags={postTags[p.id] || []} commentVotes={commentVotes} postVotes={allPostVotes.filter(v => v.post_id === p.id)}
                onVote={handleVote} onCommentVote={handleCommentVote} onOpenProfile={setModalProfile}
                onToggleComments={handleToggleComments} onComment={handleComment} />
            ))
          }
        </>}

      </div>
    </div>
  )
}