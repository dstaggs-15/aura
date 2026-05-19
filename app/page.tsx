'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile, Post } from '@/lib/types'

const VOTE_OPTS = [-10, -5, -1, 1, 5, 10, 50]
const VOTE_COST: Record<string, number> = { "50": 5, "10": 1, "5": .5, "1": .5, "-1": .5, "-5": .5, "-10": 1 }
const fmtAura = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString()
const clownCount = (a: number) => a < -499 ? 3 : a < -99 ? 2 : a < 0 ? 1 : 0
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

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [myVotes, setMyVotes] = useState<Record<number, number>>({})
  const [tab, setTab] = useState('feed')
  const [lbTab, setLbTab] = useState('people')
  const [filter, setFilter] = useState('recent')
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [postImage, setPostImage] = useState<File | null>(null)
  const [taxBucket, setTaxBucket] = useState(0)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [modalProfile, setModalProfile] = useState<Profile | null>(null)
  const [editingBio, setEditingBio] = useState(false)
  const [bioText, setBioText] = useState('')
  const [profileVotes, setProfileVotes] = useState<Record<string, number>>({})
  const toastTimer = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const postImageRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/auth'; return }
      loadAll(data.user.id)
    })
  }, [])

  const loadAll = async (uid: string) => {
    const [{ data: profs }, { data: ps }, { data: bucket }, { data: vs }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('posts').select('*, profiles(*)').order('created_at', { ascending: false }),
      supabase.from('tax_bucket').select('*').single(),
      supabase.from('votes').select('*').eq('voter_id', uid),
    ])
    if (profs) { setProfiles(profs); setProfile(profs.find((p: Profile) => p.id === uid) || null) }
    if (ps) setPosts(ps)
    if (bucket) setTaxBucket(bucket.amount)
    if (vs) { const m: Record<number, number> = {}; vs.forEach((v: any) => m[v.post_id] = v.value); setMyVotes(m) }
    const { data: pvs } = await supabase.from('profile_votes').select('*').eq('voter_id', uid)
    if (pvs) { const m: Record<string, number> = {}; pvs.forEach((v: any) => m[v.target_id] = v.value); setProfileVotes(m) }
  }

  const notify = (msg: string, type = 'neutral') => {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }

  const handleVote = async (postId: number, val: number) => {
    if (!profile) return
    const prev = myVotes[postId] ?? 0
    if (prev === val) return
    const cost = VOTE_COST[String(val)] ?? 0.5
    const post = posts.find(p => p.id === postId)
    if (!post) return
    if (prev === 0) {
      await supabase.from('votes').insert({ voter_id: profile.id, post_id: postId, value: val })
    } else {
      await supabase.from('votes').update({ value: val }).eq('voter_id', profile.id).eq('post_id', postId)
    }
    const newPostAura = post.aura - prev + val
    await supabase.from('posts').update({ aura: newPostAura }).eq('id', postId)
    const newMyAura = Math.round((profile.aura - cost) * 10) / 10
    await supabase.from('profiles').update({ aura: newMyAura }).eq('id', profile.id)
    const owner = profiles.find(p => p.id === post.user_id)
    if (owner && owner.id !== profile.id) {
      let gain = val - prev
      if (owner.aura < 0 && gain > 0) {
        const tax = gain * 0.25
        const newBucket = Math.round((taxBucket + tax) * 10) / 10
        await supabase.from('tax_bucket').update({ amount: newBucket }).eq('id', 1)
        setTaxBucket(newBucket)
        gain *= 0.75
      }
      const newOwnerAura = Math.round((owner.aura + gain) * 10) / 10
      await supabase.from('profiles').update({ aura: newOwnerAura }).eq('id', owner.id)
    }
    setMyVotes(v => ({ ...v, [postId]: val }))
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, aura: newPostAura } : p))
    setProfile(p => p ? { ...p, aura: newMyAura } : p)
    setProfiles(ps => ps.map(p => {
      if (p.id === profile.id) return { ...p, aura: newMyAura }
      if (p.id === post.user_id) {
        let gain = val - prev
        if (p.aura < 0 && gain > 0) gain *= 0.75
        return { ...p, aura: Math.round((p.aura + gain) * 10) / 10 }
      }
      return p
    }))
    notify(val > 0 ? `+${val} aura sent` : `${val} aura sent`, val > 0 ? 'pos' : 'neg')
  }

  const handleProfileVote = async (targetId: string, val: number) => {
    if (!profile || targetId === profile.id) return
    const prev = profileVotes[targetId] ?? 0
    if (prev === val) return
    if (prev === 0) {
      await supabase.from('profile_votes').insert({ voter_id: profile.id, target_id: targetId, value: val })
    } else {
      await supabase.from('profile_votes').update({ value: val }).eq('voter_id', profile.id).eq('target_id', targetId)
    }
    const gain = val - prev
    const target = profiles.find(p => p.id === targetId)
    if (target) {
      const newAura = Math.round((target.aura + gain) * 10) / 10
      await supabase.from('profiles').update({ aura: newAura }).eq('id', targetId)
      setProfiles(ps => ps.map(p => p.id === targetId ? { ...p, aura: newAura } : p))
      if (modalProfile?.id === targetId) setModalProfile(mp => mp ? { ...mp, aura: newAura } : mp)
    }
    setProfileVotes(v => ({ ...v, [targetId]: val }))
    notify(val > 0 ? `+${val} to their profile` : `${val} to their profile`, val > 0 ? 'pos' : 'neg')
  }

  const handleCheckIn = async () => {
    if (!profile) return
    const today = new Date().toISOString().split('T')[0]
    if (profile.last_checkin === today) { notify('Already checked in today'); return }
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const newStreak = profile.last_checkin === yesterday ? profile.streak + 1 : 1
    const newAura = profile.aura + 5
    await supabase.from('profiles').update({ aura: newAura, streak: newStreak, last_checkin: today }).eq('id', profile.id)
    setProfile(p => p ? { ...p, aura: newAura, streak: newStreak, last_checkin: today } : p)
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, aura: newAura, streak: newStreak, last_checkin: today } : p))
    notify(`🔥 +5 aura — ${newStreak} day streak!`, 'pos')
  }

  const handlePost = async () => {
    if (!draft.trim() || !profile) return
    let image_url = null
    if (postImage) {
      const ext = postImage.name.split('.').pop()
      const path = `${profile.id}-${Date.now()}.${ext}`
      await supabase.storage.from('posts').upload(path, postImage, { upsert: true })
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
      image_url = urlData.publicUrl
    }
    const { data } = await supabase.from('posts').insert({ user_id: profile.id, text: draft.trim(), aura: 0, image_url }).select('*, profiles(*)').single()
    if (data) { setPosts(ps => [data, ...ps]); setDraft(''); setPostImage(null); setComposing(false); notify('Posted 🔥') }
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
    const path = `banner-${profile.id}.${ext}`
    await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ banner_url: data.publicUrl } as any).eq('id', profile.id)
    setProfile(p => p ? { ...p, banner_url: data.publicUrl } as any : p)
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, banner_url: data.publicUrl } as any : p))
    notify('Banner updated', 'pos')
  }

  const handleSaveBio = async () => {
    if (!profile) return
    await supabase.from('profiles').update({ bio: bioText }).eq('id', profile.id)
    setProfile(p => p ? { ...p, bio: bioText } : p)
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, bio: bioText } : p))
    setEditingBio(false)
    notify('Bio saved', 'pos')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }

  const checkedInToday = profile?.last_checkin === new Date().toISOString().split('T')[0]
  const topPost = [...posts].sort((a, b) => b.aura - a.aura)[0]
  const topPostUser = topPost ? profiles.find(p => p.id === topPost.user_id) : null
  const sorted = [...posts].sort((a, b) => filter === 'trending' ? b.aura - a.aura : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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

  const Card = ({ children, style = {} }: any) => (
    <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 16, ...style }}>{children}</div>
  )

  const PostCard = ({ post }: { post: any }) => {
    const owner = profiles.find(p => p.id === post.user_id)
    if (!owner) return null
    const isOwn = post.user_id === profile?.id
    const mv = myVotes[post.id]
    const cc = clownCount(owner.aura)
    return (
      <Card style={{ marginBottom: 8 }}>
        <div style={{ padding: '14px 16px 12px', display: 'flex', gap: 11 }}>
          <div onClick={() => setModalProfile(owner)} style={{ cursor: 'pointer', marginTop: 1 }}>
            <Av p={owner} size={38} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span onClick={() => setModalProfile(owner)} style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer', color: S.text }}>{owner.username}</span>
              {cc > 0 && <span style={{ fontSize: 13 }}>{'🤡'.repeat(cc)}</span>}
              {owner.streak >= 3 && <span style={{ fontSize: 12, color: S.fire }}>🔥{owner.streak}</span>}
              <span style={{ fontSize: 11, color: S.text3, marginLeft: 'auto' }}>{timeAgo(post.created_at)}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#ccc', unicodeBidi: 'plaintext', textAlign: 'left' }}>{post.text}</p>
            {post.image_url && (
              <img src={post.image_url} alt="post" style={{ width: '100%', borderRadius: 10, marginTop: 10, maxHeight: 400, objectFit: 'contain', background: S.card2 }} />
            )}
          </div>
        </div>
        <div style={{ padding: '10px 16px 12px', borderTop: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: post.aura >= 0 ? S.blue : S.red }}>{fmtAura(post.aura)}</span>
          {isOwn
            ? <span style={{ fontSize: 11, color: S.text3 }}>your post</span>
            : <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {VOTE_OPTS.map(v => {
                  const active = mv === v
                  const neg = v < 0
                  return (
                    <button key={v} onClick={() => handleVote(post.id, v)} style={{
                      padding: '4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                      fontFamily: 'monospace', cursor: 'pointer', transition: 'all .1s',
                      border: `1px solid ${active ? 'transparent' : S.border2}`,
                      background: active ? (neg ? S.red : S.blue) : S.card2,
                      color: active ? '#fff' : (neg ? S.red : S.blue),
                    }}>{v > 0 ? `+${v}` : v}</button>
                  )
                })}
              </div>
          }
        </div>
      </Card>
    )
  }

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

  const TABS = ['feed', 'leaderboard', 'bank', 'help', 'profile']

  return (
    <div style={{ minHeight: '100vh', background: S.bg, fontFamily: "'Outfit', sans-serif", color: S.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-text-size-adjust: 100%; }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(-10px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${S.bg}; }
        ::-webkit-scrollbar-thumb { background: ${S.border2}; border-radius: 4px; }
        textarea, input { direction: ltr !important; unicode-bidi: plaintext !important; text-align: left !important; }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', zIndex: 999, pointerEvents: 'none',
          transform: 'translateX(-50%)', animation: 'toastIn .2s ease',
          background: toast.type === 'pos' ? S.blue : toast.type === 'neg' ? S.red : '#222',
          color: '#fff', padding: '9px 20px', borderRadius: 99, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
        }}>{toast.msg}</div>
      )}

      {modalProfile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
          onClick={() => { setModalProfile(null); setEditingBio(false) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{
              height: 90,
              background: clownCount(modalProfile.aura) > 0
                ? `repeating-linear-gradient(45deg,${S.redDim} 0,${S.redDim} 12px,${S.card} 12px,${S.card} 24px)`
                : `linear-gradient(135deg, ${S.blueDim}, ${S.card})`,
              backgroundImage: (modalProfile as any).banner_url ? `url(${(modalProfile as any).banner_url})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
              borderRadius: '20px 20px 0 0', position: 'relative'
            }}>
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
                  { label: 'Streak', val: `🔥${modalProfile.streak}`, color: S.text },
                  { label: 'Posts', val: posts.filter(p => p.user_id === modalProfile.id).length, color: S.text },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: S.text3, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {modalProfile.id !== profile.id && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: S.text3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Rate their vibe</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {VOTE_OPTS.map(v => {
                      const active = profileVotes[modalProfile.id] === v
                      const neg = v < 0
                      return (
                        <button key={v} onClick={() => handleProfileVote(modalProfile.id, v)} style={{
                          padding: '5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                          fontFamily: 'monospace', cursor: 'pointer',
                          border: `1px solid ${active ? 'transparent' : S.border2}`,
                          background: active ? (neg ? S.red : S.blue) : S.card2,
                          color: active ? '#fff' : (neg ? S.red : S.blue),
                        }}>{v > 0 ? `+${v}` : v}</button>
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
        <span>in the prize pool</span>
        <span style={{ color: S.border2 }}>·</span>
        <span>top post wins Sunday</span>
        {topPostUser && <><span style={{ color: S.border2 }}>·</span><span style={{ color: S.blue }}>👑 {topPostUser.username} leading</span></>}
      </div>

      <div style={{ background: S.card, borderBottom: `1px solid ${S.border}`, display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as any}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '14px 18px', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? S.text : S.text3, background: 'transparent', border: 'none', borderBottom: tab === t ? `2px solid ${S.blue}` : '2px solid transparent', cursor: 'pointer', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
            {t === 'bank' ? '🏦 Bank' : t === 'help' ? '❓ Help' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: 14 }}>

        {tab === 'feed' && <>
          {composing ? (
            <Card style={{ padding: 16, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 11, marginBottom: 12 }}>
                <Av p={profile} size={36} />
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="what happened?"
                  rows={3}
                  autoFocus
                  dir="ltr"
                  style={{ flex: 1, border: 'none', background: 'transparent', color: S.text, fontSize: 16, lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', outline: 'none', direction: 'ltr', unicodeBidi: 'plaintext', textAlign: 'left' } as any}
                />
              </div>
              {postImage && (
                <div style={{ marginBottom: 10, position: 'relative' }}>
                  <img src={URL.createObjectURL(postImage)} alt="preview" style={{ width: '100%', borderRadius: 10, maxHeight: 200, objectFit: 'contain', background: S.card2 }} />
                  <button onClick={() => setPostImage(null)} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ cursor: 'pointer', color: postImage ? S.blue : S.text3, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${postImage ? S.blue : S.border}`, background: postImage ? S.blueDim : 'transparent' }}>
                  📷 {postImage ? 'Photo added' : 'Add photo'}
                  <input ref={postImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPostImage(e.target.files?.[0] || null)} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setComposing(false); setDraft(''); setPostImage(null) }} style={{ padding: '7px 16px', borderRadius: 10, fontSize: 13, border: `1px solid ${S.border2}`, background: 'transparent', color: S.text2, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handlePost} disabled={!draft.trim()} style={{ padding: '7px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', background: draft.trim() ? S.blue : S.border, color: draft.trim() ? '#fff' : S.text3, cursor: draft.trim() ? 'pointer' : 'default' }}>Post</button>
                </div>
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
          {sorted.map(p => <PostCard key={p.id} post={p} />)}
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
                  <div style={{ fontSize: 11, color: S.text3, marginTop: 2 }}>🔥 {u.streak} day streak</div>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: u.aura >= 0 ? S.blue : S.red }}>{fmtAura(u.aura)}</div>
              </Card>
            )
          })}
          {lbTab === 'posts' && [...posts].sort((a, b) => b.aura - a.aura).map((p, i) => {
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
              ['Tax rate on negative users', '25%'],
              ['Daily check-in reward', '+5 🔥'],
              ['Cost to send +50 vote', '5 aura'],
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
            { title: '🗳️ Voting', body: 'Vote +1 to +50 or negative on any post. Voting costs you a small amount of your own aura — sending +10 costs you 1, sending +50 costs you 5. Votes mean something.' },
            { title: '📊 Profile votes', body: 'You can vote on someone\'s whole profile, not just their posts. Tap their name or avatar anywhere to pull up their profile and rate their vibe.' },
            { title: '🤡 Negative aura', body: 'Drop below 0 and clown emojis start showing on your profile. You also only keep 75% of aura you earn while negative — the rest goes into the prize pool.' },
            { title: '🏆 Prize pool', body: 'Every Sunday at midnight, whoever has the highest-aura post that week wins the entire pool. The pool fills from the 25% tax on negative users.' },
            { title: '🔥 Streaks', body: 'Hit Check In every day for +5 aura. Miss a day and your streak resets to zero.' },
            { title: '🚫 Glazing', body: 'Max 3 big votes (+50 or -10) to the same person per 24 hours. Go over that and you get hit with -50. Don\'t glaze.' },
          ].map(item => (
            <Card key={item.title} style={{ padding: 18, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: S.text, marginBottom: 8 }}>{item.title}</div>
              <p style={{ fontSize: 14, color: S.text2, lineHeight: 1.65 }}>{item.body}</p>
            </Card>
          ))}
        </>}

        {tab === 'profile' && <>
          <Card style={{ overflow: 'hidden', marginBottom: 10 }}>
            <div style={{
              height: 120,
              background: clownCount(profile.aura) > 0
                ? `repeating-linear-gradient(45deg,${S.redDim} 0,${S.redDim} 12px,${S.card} 12px,${S.card} 24px)`
                : `linear-gradient(135deg, ${S.blueDim}, ${S.card})`,
              backgroundImage: (profile as any).banner_url ? `url(${(profile as any).banner_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'relative',
            }}>
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
                    <textarea
                      value={bioText}
                      onChange={e => setBioText(e.target.value)}
                      placeholder="say something..."
                      rows={2}
                      dir="ltr"
                      style={{ width: '100%', border: `1px solid ${S.border2}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, background: S.card2, color: S.text, lineHeight: 1.55, resize: 'none', fontFamily: 'inherit', outline: 'none', direction: 'ltr', textAlign: 'left' } as any}
                    />
                    <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                      <button onClick={handleSaveBio} style={{ padding: '6px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600, background: S.blue, color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingBio(false)} style={{ padding: '6px 16px', borderRadius: 9, fontSize: 12, border: `1px solid ${S.border2}`, background: 'transparent', color: S.text2, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <p style={{ fontSize: 14, color: profile.bio ? S.text2 : S.text3, flex: 1, lineHeight: 1.5 }}>{profile.bio || 'No bio yet.'}</p>
                    <button onClick={() => { setEditingBio(true); setBioText(profile.bio || '') }} style={{ fontSize: 11, color: S.text3, background: 'none', border: `1px solid ${S.border}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 28, marginBottom: 16 }}>
                {[
                  { label: 'Aura', val: fmtAura(profile.aura), color: profile.aura >= 0 ? S.blue : S.red },
                  { label: 'Streak', val: `🔥${profile.streak}`, color: S.text },
                  { label: 'Posts', val: posts.filter(p => p.user_id === profile.id).length, color: S.text },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: S.text3, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {getBadges(profile).map(b => (
                  <span key={b} style={{ fontSize: 11, padding: '4px 11px', borderRadius: 20, background: S.card2, border: `1px solid ${S.border2}`, color: S.text2 }}>{b}</span>
                ))}
              </div>
            </div>
          </Card>
          <div style={{ fontSize: 11, fontWeight: 600, color: S.text3, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Your Posts</div>
          {posts.filter(p => p.user_id === profile.id).length === 0
            ? <p style={{ fontSize: 14, color: S.text3, textAlign: 'center', padding: '30px 0' }}>No posts yet.</p>
            : posts.filter(p => p.user_id === profile.id).map(p => <PostCard key={p.id} post={p} />)
          }
        </>}

      </div>
    </div>
  )
}