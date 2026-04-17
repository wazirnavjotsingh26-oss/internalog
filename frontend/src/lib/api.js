const FALLBACK_API_BASE = 'https://intern-alog-012-2.onrender.com'
const envBase = (import.meta.env.VITE_API_BASE || '').trim()
const normalizedEnvBase = envBase.replace(/\/+$/, '')
const currentHost = (typeof window !== 'undefined' && window.location?.hostname) || ''
const runningOnVercel = currentHost.endsWith('.vercel.app')
const runningLocal = currentHost === 'localhost' || currentHost === '127.0.0.1'

function resolveApiBase() {
  // Prefer same-origin whenever possible to avoid cross-origin/network issues in local dev.
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

export async function apiFetch(path, options = {}) {
  // Always use API_BASE (same-origin on Vercel via vercel.json rewrites). Avoids CORS failures
  // from calling Render directly. Collection uses short 202 + polling, so proxy timeouts are fine.
  const url = joinUrl(API_BASE, path)
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

