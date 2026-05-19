'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else window.location.href = '/'
    } else {
      if (!username.trim()) { setError('Username is required'); setLoading(false); return }
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          username: username.trim().toLowerCase().replace(/\s+/g, '_'),
          aura: 100,
          streak: 0,
        })
        if (profileError) setError(profileError.message)
        else { setIsLogin(true); setMessage('Account created! Please log in.') }
      }
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f7f7f7', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'DM Sans', sans-serif"
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{
        background: '#fff', border: '1px solid #e8e8e8', borderRadius: 20,
        padding: 32, width: '100%', maxWidth: 400,
        boxShadow: '0 4px 24px rgba(0,0,0,.06)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>🔥</div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -.5 }}>aura</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
            {isLogin ? 'welcome back' : 'create your account'}
          </div>
        </div>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#16a34a', marginBottom: 16 }}>
            {message}
          </div>
        )}
        {!isLogin && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 6 }}>Username</div>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="jake_energy"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: '#fafafa' }} />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 6 }}>Email</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: '#fafafa' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 6 }}>Password</div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: '#fafafa' }} />
        </div>
        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', padding: '12px', borderRadius: 12, border: 'none',
          background: loading ? '#ccc' : '#0a0a0a', color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer', marginBottom: 16
        }}>
          {loading ? 'Please wait...' : isLogin ? 'Log in' : 'Create account'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#999' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setIsLogin(!isLogin); setError(''); setMessage('') }}
            style={{ color: '#0a0a0a', fontWeight: 500, cursor: 'pointer' }}>
            {isLogin ? 'Sign up' : 'Log in'}
          </span>
        </div>
      </div>
    </div>
  )
}