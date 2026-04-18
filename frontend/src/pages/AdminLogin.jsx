import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, setAdminToken } from '../lib/api'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const text = await res.text()
      let data = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        setError(`Server returned non-JSON (HTTP ${res.status}). Check Render URL in src/deployConfig.js and vercel.json.`)
        setLoading(false)
        return
      }
      if (data.success) {
        if (data.token) setAdminToken(data.token)
        navigate('/admin')
      } else {
        setError(data.error || 'Invalid password')
      }
    } catch (err) {
      const msg = (err && err.message) || 'Connection error.'
      setError(
        `${msg} Update RENDER_SERVICE_URL in src/deployConfig.js to match your live Render URL, mirror it in vercel.json, redeploy Vercel, and set CORS_ALLOWED_ORIGINS on Render.`
      )
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center text-[#0a0a0a] font-bold font-display text-sm">CB</div>
          <span className="font-display text-xl font-semibold text-[#e8e4dc]">CemeteryBase</span>
        </div>

        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-8">
          <h1 className="font-display text-2xl font-semibold text-[#e8e4dc] text-center mb-1">Admin Access</h1>
          <p className="text-[#5a5550] text-sm text-center mb-6">Enter your admin password to continue</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[#3a3a3a] block mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-[#e8e4dc] placeholder-[#2a2a2a] focus:outline-none focus:border-gold/50"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold hover:bg-gold-light text-[#0a0a0a] py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <a href="/" className="block text-center text-xs text-[#3a3a3a] hover:text-[#5a5550] mt-4 transition-colors">
          ← Back to public site
        </a>
      </div>
    </div>
  )
}
