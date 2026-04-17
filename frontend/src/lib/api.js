const FALLBACK_API_BASE = 'https://intern-alog-012-2.onrender.com'
const envBase = (import.meta.env.VITE_API_BASE || '').trim()
const normalizedEnvBase = envBase.replace(/\/+$/, '')

function resolveApiBase() {
  // Prefer same-origin whenever possible to avoid cross-origin/network issues in local dev.
  const host = (typeof window !== 'undefined' && window.location?.hostname) || ''
  const runningOnVercel = host.endsWith('.vercel.app')
  const runningLocal = host === 'localhost' || host === '127.0.0.1'

  if (normalizedEnvBase && normalizedEnvBase !== '/') return normalizedEnvBase
  if (runningLocal) return ''
  if (runningOnVercel) return ''
  return FALLBACK_API_BASE
}

export const API_BASE = resolveApiBase()
const ADMIN_TOKEN_KEY = 'cemetery_admin_token'

function joinUrl(base, path) {
  if (!base) return path
  if (!path) return base
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/')) return `${base}/${path}`
  return `${base}${path}`
}

function shouldBypassProxy(path) {
  // Long-running collection calls can hit Vercel proxy timeout; send directly to Render.
  return path === '/api/collect' || path.startsWith('/api/collect?')
}

export async function apiFetch(path, options = {}) {
  const baseForRequest = shouldBypassProxy(path) && API_BASE ? FALLBACK_API_BASE : API_BASE
  const url = joinUrl(baseForRequest, path)
  const headers = new Headers(options.headers || {})
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : ''
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const requestOptions = {
    ...options,
    headers,
  }
  if (!requestOptions.credentials) {
    requestOptions.credentials = 'include'
  }

  return fetch(url, requestOptions)
}

export function setAdminToken(token) {
  if (typeof window === 'undefined') return
  if (!token) {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    return
  }
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

