import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the page.tsx file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile, Post } from '@/lib/types'

const VOTE_OPTS = [-10, -5, -1, 1, 5, 10, 50]
const VOTE_COST: Record<string, number> = { "50": 5, "10": 1, "5": .5, "1": .5, "-1": .5, "-5": .5, "-10": 1 }
const fmtAura = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString()
const clownCount = (a: number) => a < -499 ? 3 : a < -99 ? 2 : a < 0 ? 1 : 0

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
  const [taxBucket, setTaxBucket] = useState(0)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [modalProfile, setModalProfile] = useState<Profile | null>(null)
  const [editingBio, setEditingBio] = useState(false)
  const [bioText, setBioText] = useState('')
  const [profileVotes, setProfileVotes] = useState<Record<string, number>>({})
  const toastTimer = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    notify(val > 0 ? `Sent +${val} aura (cost you ${cost})` : `Sent ${val} aura (cost you ${cost})`, val > 0 ? 'pos' : 'neg')
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
    notify(val > 0 ? `Gave +${val} to their profile` : `Gave ${val} to their profile`, val > 0 ? 'pos' : 'neg')
  }

  const handleCheckIn = async () => {
    if (!profile) return
    const today = new Date().toISOString().split('T')[0]
    if (profile.last_checkin === today) { notify('Already checked in today!'); return }
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
    const { data } = await supabase.from('posts').insert({ user_id: profile.id, text: draft.trim(), aura: 0 }).select('*, profiles(*)').single()
    if (data) { setPosts(ps => [data, ...ps]); setDraft(''); setComposing(false); notify('Post dropped 🔥') }
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
    notify('Profile photo updated ✓', 'pos')
  }

  const handleSaveBio = async () => {
    if (!profile) return
    await supabase.from('profiles').update({ bio: bioText }).eq('id', profile.id)
    setProfile(p => p ? { ...p, bio: bioText } : p)
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, bio: bioText } : p))
    setEditingBio(false)
    notify('Bio saved ✓', 'pos')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }

  const checkedInToday = profile?.last_checkin === new Date().toISOString().split('T')[0]
  const topPost = [...posts].sort((a, b) => b.aura - a.aura)[0]
  const topPostUser = topPost ? profiles.find(p => p.id === topPost.user_id) : null
  const sorted = [...posts].sort((a, b) => filter === 'trending' ? b.aura - a.aura : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const AvatarComp = ({ p, size = 36 }: { p: Profile; size?: number }) => (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      overflow: 'hidden', border: '1.5px solid #e8e8e8',
      background: p.avatar_url ? 'transparent' : '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 600, color: '#fff',
    }}>
      {p.avatar_url
        ? <img src={p.avatar_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : p.username.slice(0, 2).toUpperCase()}
    </div>
  )

  const PostCard = ({ post }: { post: Post }) => {
    const owner = profiles.find(p => p.id === post.user_id)
    if (!owner) return null
    const isOwn = post.user_id === profile?.id
    const mv = myVotes[post.id]
    const cc = clownCount(owner.aura)
    const ago = Math.round((Date.now() - new Date(post.created_at).getTime()) / 60000)
    const agoStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`
    return (
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px 10px', display: 'flex', gap: 10 }}>
          <div onClick={() => setModalProfile(owner)} style={{ cursor: 'pointer' }}>
            <AvatarComp p={owner} size={38} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span onClick={() => setModalProfile(owner)} style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#0a0a0a' }}>{owner.username}</span>
              {cc > 0 && <span style={{ fontSize: 12 }}>{'🤡'.repeat(cc)}</span>}
              {owner.streak >= 3 && <span style={{ fontSize: 11, color: '#f97316' }}>🔥{owner.streak}</span>}
              <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>{agoStr}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#0a0a0a' }}>{post.text}</p>
          </div>
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: post.aura >= 0 ? '#1d4ed8' : '#dc2626' }}>{fmtAura(post.aura)}</span>
          {isOwn
            ? <span style={{ fontSize: 11, color: '#999' }}>your post</span>
            : <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {VOTE_OPTS.map(v => (
                  <button key={v} onClick={() => handleVote(post.id, v)} style={{
                    padding: '3px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    fontFamily: 'monospace', cursor: 'pointer',
                    border: mv === v ? 'none' : '1px solid #e8e8e8',
                    background: mv === v ? (v < 0 ? '#dc2626' : '#1d4ed8') : '#f7f7f7',
                    color: mv === v ? '#fff' : (v < 0 ? '#dc2626' : '#1d4ed8'),
                  }}>{v > 0 ? `+${v}` : v}</button>
                ))}
              </div>
          }
        </div>
      </div>
    )
  }

  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 40 }}>🔥</div>
    </div>
  )

  const getBadges = (p: Profile) => {
    const b = ['🌐 Joined']
    if (p.streak >= 7) b.push('🔥 Streaker')
    if (p.aura >= 1000) b.push('⚡ Legendary')
    if (p.aura < 0) b.push('🤡 ' + (clownCount(p.aura) === 1 ? 'Clown' : clownCount(p.aura) === 2 ? 'Big Clown' : 'Mega Clown'))
    return b
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f7', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(-8px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }
        @media(prefers-color-scheme:dark) {
          body { background: #111 !important; }
          .dc { background: #1a1a1a !important; border-color: #2a2a2a !important; }
          .dt { color: #f0f0f0 !important; }
          .ds { color: #888 !important; }
          .db { background: #111 !important; }
          .di { background: #1a1a1a !important; border-color: #333 !important; color: #f0f0f0 !important; }
        }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 14, left: '50%', zIndex: 999, pointerEvents: 'none',
          transform: 'translateX(-50%)', animation: 'toastIn .18s ease',
          background: toast.type === 'pos' ? '#1d4ed8' : toast.type === 'neg' ? '#dc2626' : '#0a0a0a',
          color: '#fff', padding: '9px 18px', borderRadius: 99, fontSize: 13,
          fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,.15)'
        }}>{toast.msg}</div>
      )}

      {modalProfile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { setModalProfile(null); setEditingBio(false) }}>
          <div className="dc" onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ height: 80, background: clownCount(modalProfile.aura) > 0 ? 'repeating-linear-gradient(45deg,#fef2f2 0,#fef2f2 10px,#fff 10px,#fff 20px)' : '#f7f7f7', position: 'relative', borderRadius: '20px 20px 0 0' }}>
              <button onClick={() => setModalProfile(null)} style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: '50%', background: '#fff', border: '1px solid #e8e8e8', cursor: 'pointer', fontSize: 13, color: '#666' }}>✕</button>
            </div>
            <div style={{ padding: '0 20px 24px', marginTop: -24 }}>
              <AvatarComp p={modalProfile} size={52} />
              <div className="dt" style={{ marginTop: 10, marginBottom: 4, fontWeight: 600, fontSize: 18, color: '#0a0a0a' }}>
                {modalProfile.username} {clownCount(modalProfile.aura) > 0 && '🤡'.repeat(clownCount(modalProfile.aura))}
              </div>
              {modalProfile.bio && <p className="ds" style={{ fontSize: 13, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>{modalProfile.bio}</p>}
              <div style={{ display: 'flex', gap: 20, margin: '12px 0' }}>
                {[
                  { label: 'AURA', val: fmtAura(modalProfile.aura), color: modalProfile.aura >= 0 ? '#1d4ed8' : '#dc2626' },
                  { label: 'STREAK', val: `🔥${modalProfile.streak}`, color: '#0a0a0a' },
                  { label: 'POSTS', val: posts.filter(p => p.user_id === modalProfile.id).length, color: '#0a0a0a' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="dt" style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 600, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {modalProfile.id !== profile.id && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Vote on their vibe</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {VOTE_OPTS.map(v => {
                      const active = profileVotes[modalProfile.id] === v
                      return (
                        <button key={v} onClick={() => handleProfileVote(modalProfile.id, v)} style={{
                          padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          fontFamily: 'monospace', cursor: 'pointer',
                          border: active ? 'none' : '1px solid #e8e8e8',
                          background: active ? (v < 0 ? '#dc2626' : '#1d4ed8') : '#f7f7f7',
                          color: active ? '#fff' : (v < 0 ? '#dc2626' : '#1d4ed8'),
                        }}>{v > 0 ? `+${v}` : v}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {getBadges(modalProfile).map(b => <span key={b} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f0f0f0', border: '1px solid #e8e8e8', color: '#555' }}>{b}</span>)}
              </div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Posts</div>
              {posts.filter(p => p.user_id === modalProfile.id).map(p => (
                <div key={p.id} className="dc" style={{ background: '#f7f7f7', borderRadius: 10, padding: '10px 12px', marginBottom: 7 }}>
                  <p className="dt" style={{ fontSize: 13, color: '#0a0a0a', marginBottom: 5, lineHeight: 1.5 }}>{p.text}</p>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: p.aura >= 0 ? '#1d4ed8' : '#dc2626' }}>{fmtAura(p.aura)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="dc db" style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #e8e8e8', padding: '0 16px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 20 }}>🔥</span>
          <span className="dt" style={{ fontWeight: 600, fontSize: 17, letterSpacing: -.3, color: '#0a0a0a' }}>aura</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: profile.aura >= 0 ? '#1d4ed8' : '#dc2626' }}>
            {clownCount(profile.aura) > 0 ? '🤡 ' : ''}{fmtAura(profile.aura)}
          </span>
          <button onClick={handleCheckIn} disabled={checkedInToday} style={{ padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid #e8e8e8', cursor: checkedInToday ? 'default' : 'pointer', background: checkedInToday ? '#f7f7f7' : '#0a0a0a', color: checkedInToday ? '#999' : '#fff' }}>
            {checkedInToday ? '✓ Checked in' : '🔥 Check in'}
          </button>
          <button onClick={handleLogout} style={{ fontSize: 12, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}>Out</button>
        </div>
      </div>

      <div className="dc db" style={{ background: '#fff', borderBottom: '1px solid #e8e8e8', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888', flexWrap: 'wrap' }}>
        <span>🏆 Prize pool:</span>
        <span className="dt" style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0a0a0a' }}>{taxBucket.toFixed(1)} aura</span>
        <span style={{ color: '#ddd' }}>·</span>
        <span>Top post wins Sunday</span>
        {topPostUser && <><span style={{ color: '#ddd' }}>·</span><span className="dt" style={{ color: '#0a0a0a' }}>👑 {topPostUser.username} leading</span></>}
      </div>

      <div className="dc db" style={{ background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', overflowX: 'auto' }}>
        {['feed', 'leaderboard', 'bank', 'profile'].map(t => (
          <button key={t} onClick={() => setTab(t)} className="db" style={{ padding: '13px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? '#0a0a0a' : '#999', background: 'transparent', borderBottom: tab === t ? '2px solid #0a0a0a' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
            {t === 'bank' ? '🏦 bank' : t}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 580, margin: '0 auto', padding: 12 }}>

        {tab === 'feed' && <>
          {composing ? (
            <div className="dc" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <AvatarComp p={profile} size={36} />
                <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="what happened today?" rows={3}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: '#0a0a0a', lineHeight: 1.55, resize: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setComposing(false); setDraft('') }} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, border: '1px solid #e8e8e8', background: 'transparent', color: '#666', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handlePost} disabled={!draft.trim()} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: draft.trim() ? '#0a0a0a' : '#e8e8e8', color: draft.trim() ? '#fff' : '#999', cursor: draft.trim() ? 'pointer' : 'default' }}>Post</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setComposing(true)} className="dc" style={{ width: '100%', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '12px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <AvatarComp p={profile} size={32} />
              <span style={{ fontSize: 14, color: '#999' }}>what happened today? 🔥</span>
            </button>
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {['recent', 'trending'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid #e8e8e8', cursor: 'pointer', background: filter === f ? '#0a0a0a' : '#fff', color: filter === f ? '#fff' : '#666' }}>
                {f === 'trending' ? '🔥 Trending' : 'Recent'}
              </button>
            ))}
          </div>
          {sorted.map(p => <PostCard key={p.id} post={p} />)}
        </>}

        {tab === 'leaderboard' && <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {['people', 'posts'].map(t => (
              <button key={t} onClick={() => setLbTab(t)} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid #e8e8e8', cursor: 'pointer', background: lbTab === t ? '#0a0a0a' : '#fff', color: lbTab === t ? '#fff' : '#666' }}>
                {t === 'posts' ? '🔥 Posts' : '👤 People'}
              </button>
            ))}
          </div>
          {lbTab === 'people' && [...profiles].sort((a, b) => b.aura - a.aura).map((u, i) => {
            const rankColor = i === 0 ? '#d97706' : i === 1 ? '#64748b' : i === 2 ? '#c2603c' : '#999'
            const cc = clownCount(u.aura)
            return (
              <div key={u.id} onClick={() => setModalProfile(u)} className="dc" style={{ background: '#fff', border: u.id === profile.id ? '1.5px solid #1d4ed8' : '1px solid #e8e8e8', borderRadius: 12, padding: '11px 14px', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: rankColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: rankColor, flexShrink: 0 }}>{i + 1}</div>
                <AvatarComp p={u} size={36} />
                <div style={{ flex: 1 }}>
                  <div className="dt" style={{ fontWeight: 600, fontSize: 13, color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {u.username}
                    {u.id === profile.id && <span style={{ fontSize: 10, color: '#1d4ed8' }}>you</span>}
                    {cc > 0 && <span style={{ fontSize: 11 }}>{'🤡'.repeat(cc)}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>🔥 {u.streak} day streak</div>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: u.aura >= 0 ? '#1d4ed8' : '#dc2626' }}>{fmtAura(u.aura)}</div>
              </div>
            )
          })}
          {lbTab === 'posts' && [...posts].sort((a, b) => b.aura - a.aura).map((p, i) => {
            const owner = profiles.find(u => u.id === p.user_id)
            if (!owner) return null
            const rankColor = i === 0 ? '#d97706' : i === 1 ? '#64748b' : i === 2 ? '#c2603c' : '#999'
            return (
              <div key={p.id} className="dc" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '11px 14px', marginBottom: 7, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: rankColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: rankColor, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="dt" style={{ fontSize: 13, color: '#0a0a0a', marginBottom: 5, lineHeight: 1.45 }}>{p.text}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AvatarComp p={owner} size={16} />
                    <span style={{ fontSize: 11, color: '#999' }}>{owner.username}</span>
                  </div>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: p.aura >= 0 ? '#1d4ed8' : '#dc2626', flexShrink: 0 }}>{fmtAura(p.aura)}</div>
              </div>
            )
          })}
        </>}

        {tab === 'bank' && <>
          <div className="dc" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 16, padding: 24, marginBottom: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>🏆 Weekly Prize Pool</div>
            <div className="dt" style={{ fontFamily: 'monospace', fontSize: 42, fontWeight: 500, color: '#0a0a0a', margin: '6px 0 2px' }}>{taxBucket.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: '#999' }}>aura points · resets Sunday midnight</div>
            {topPost && topPostUser && (
              <div style={{ background: '#f7f7f7', borderRadius: 10, padding: 12, marginTop: 14, textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>👑 Currently leading</div>
                <p style={{ fontSize: 13, color: '#0a0a0a', marginBottom: 6, lineHeight: 1.5 }}>{topPost.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AvatarComp p={topPostUser} size={18} />
                  <span style={{ fontSize: 12, color: '#666' }}>{topPostUser.username}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginLeft: 'auto' }}>{fmtAura(topPost.aura)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="dc" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Economy</div>
            {[
              ['Total aura in circulation', fmtAura(profiles.reduce((s, u) => s + u.aura, 0))],
              ['Users in clown mode 🤡', profiles.filter(u => u.aura < 0).length],
              ['Negative user tax rate', '25%'],
              ['Daily check-in reward', '+5 🔥'],
              ['Glaze detection limit', '3 max votes / 24h'],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span className="ds" style={{ fontSize: 13, color: '#666' }}>{label}</span>
                <span className="dt" style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 500, color: '#0a0a0a' }}>{val}</span>
              </div>
            ))}
          </div>
          <div className="dc" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>How the tax works</div>
            <p className="ds" style={{ fontSize: 13, color: '#666', lineHeight: 1.65 }}>
              When a user has negative aura, they only keep <strong style={{ color: '#0a0a0a' }}>75%</strong> of points earned. The other <strong style={{ color: '#0a0a0a' }}>25%</strong> goes into this prize pool. Every Sunday at midnight, whoever has the highest-aura post that week wins the entire pool.
            </p>
          </div>
        </>}

        {tab === 'profile' && <>
          <div className="dc" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 16, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: 100, background: clownCount(profile.aura) > 0 ? 'repeating-linear-gradient(45deg,#fef2f2 0,#fef2f2 10px,#fff 10px,#fff 20px)' : 'linear-gradient(135deg,#f0f0f0,#e8e8e8)' }} />
            <div style={{ padding: '0 16px 20px', marginTop: -26 }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 10 }}>
                <AvatarComp p={profile} size={52} />
                <label style={{ position: 'absolute', bottom: 0, right: -2, width: 20, height: 20, borderRadius: '50%', background: '#fff', border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: 'pointer' }}>
                  ✏️<input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                </label>
              </div>
              <div className="dt" style={{ fontWeight: 600, fontSize: 18, color: '#0a0a0a', letterSpacing: -.3 }}>
                {profile.username} {clownCount(profile.aura) > 0 && '🤡'.repeat(clownCount(profile.aura))}
              </div>
              <div style={{ margin: '8px 0 14px' }}>
                {editingBio ? (
                  <div>
                    <textarea value={bioText} onChange={e => setBioText(e.target.value)} placeholder="write something about yourself..." rows={2}
                      style={{ width: '100%', border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={handleSaveBio} style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#0a0a0a', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingBio(false)} style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, border: '1px solid #e8e8e8', background: 'transparent', color: '#666', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <p className="ds" style={{ fontSize: 13, color: profile.bio ? '#555' : '#bbb', flex: 1 }}>{profile.bio || 'No bio yet'}</p>
                    <button onClick={() => { setEditingBio(true); setBioText(profile.bio || '') }} style={{ fontSize: 11, color: '#999', background: 'none', border: '1px solid #e8e8e8', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}>Edit bio</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 22, marginBottom: 14 }}>
                {[
                  { label: 'AURA', val: fmtAura(profile.aura), color: profile.aura >= 0 ? '#1d4ed8' : '#dc2626' },
                  { label: 'STREAK', val: `🔥${profile.streak}`, color: '#0a0a0a' },
                  { label: 'POSTS', val: posts.filter(p => p.user_id === profile.id).length, color: '#0a0a0a' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="dt" style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 500, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {getBadges(profile).map(b => <span key={b} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f0f0f0', border: '1px solid #e8e8e8', color: '#555' }}>{b}</span>)}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Your posts</div>
          {posts.filter(p => p.user_id === profile.id).length === 0
            ? <p style={{ fontSize: 13, color: '#999' }}>No posts yet. Drop something in the feed.</p>
            : posts.filter(p => p.user_id === profile.id).map(p => <PostCard key={p.id} post={p} />)
          }
        </>}

      </div>
    </div>
  )
}