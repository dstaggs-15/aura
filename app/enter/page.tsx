'use client'

import { useState } from 'react'

export default function EnterPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const enter = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Access denied.')
      setLoading(false)
      return
    }
    window.location.href = '/'
  }

  return (
    <main style={{ minHeight:'100vh', background:'#0d0d0d', color:'#f0f0f0', display:'grid', placeItems:'center', padding:20, fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:380, background:'#161616', border:'1px solid #2a2a2a', borderRadius:18, padding:28 }}>
        <div style={{ fontSize:34, marginBottom:8 }}>🔥</div>
        <h1 style={{ fontSize:24, margin:'0 0 8px' }}>Aura is private</h1>
        <p style={{ color:'#888', fontSize:14, lineHeight:1.5, margin:'0 0 20px' }}>Enter the group access code before signing in.</p>
        <input
          type="password"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') enter() }}
          placeholder="Access code"
          autoFocus
          style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:10, border:'1px solid #333', background:'#1e1e1e', color:'#fff', outline:'none', fontSize:15 }}
        />
        {error && <p style={{ color:'#ef4444', fontSize:13, margin:'10px 0 0' }}>{error}</p>}
        <button onClick={enter} disabled={loading || !code} style={{ width:'100%', marginTop:14, padding:12, border:0, borderRadius:10, background:'#3b82f6', color:'#fff', fontWeight:700, cursor:'pointer', opacity:loading || !code ? .6 : 1 }}>
          {loading ? 'Checking…' : 'Enter Aura'}
        </button>
      </div>
    </main>
  )
}
