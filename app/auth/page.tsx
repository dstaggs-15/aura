'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (!data.user) throw new Error('Login failed.')

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_member')
          .eq('id', data.user.id)
          .maybeSingle()

        if (!profile?.is_member) {
          await supabase.auth.signOut()
          throw new Error('This account does not have access to Aura.')
        }
        window.location.href = '/'
      } else {
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, username, inviteCode }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not create account.')
        setIsLogin(true)
        setPassword('')
        setInviteCode('')
        setMessage('Account created. You can log in now.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0d0d0d', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0'
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{
        background: '#161616', border: '1px solid #2a2a2a', borderRadius: 20,
        padding: 32, width: '100%', maxWidth: 400,
        boxShadow: '0 8px 40px rgba(0,0,0,.25)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>🔥</div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -.5 }}>aura</div>
          <div style={{ fontSize: 13, color: '#777', marginTop: 4 }}>
            {isLogin ? 'members only' : 'invite required'}
          </div>
        </div>

        {error && <div style={{ background: '#3b1515', border: '1px solid #6b2020', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ff9b9b', marginBottom: 16 }}>{error}</div>}
        {message && <div style={{ background: '#12351d', border: '1px solid #205f34', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#98e8ae', marginBottom: 16 }}>{message}</div>}

        {!isLogin && (
          <>
            <Field label="Username" value={username} onChange={setUsername} placeholder="jake_energy" />
            <Field label="Invite code" value={inviteCode} onChange={setInviteCode} placeholder="your private invite code" />
          </>
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@email.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', padding: '12px', borderRadius: 12, border: 'none',
          background: loading ? '#333' : '#3b82f6', color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer', marginBottom: 16
        }}>
          {loading ? 'Please wait...' : isLogin ? 'Log in' : 'Create invited account'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 13, color: '#777' }}>
          {isLogin ? 'Have an invite? ' : 'Already a member? '}
          <span onClick={() => { setIsLogin(!isLogin); setError(''); setMessage('') }}
            style={{ color: '#60a5fa', fontWeight: 500, cursor: 'pointer' }}>
            {isLogin ? 'Create account' : 'Log in'}
          </span>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#aaa', marginBottom: 6 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget.form as any)?.requestSubmit?.() }}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #333', fontSize: 14, outline: 'none', background: '#1e1e1e', color: '#f0f0f0' }} />
    </div>
  )
}
