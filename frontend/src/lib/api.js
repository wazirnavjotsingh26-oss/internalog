const FALLBACK_API_BASE = 'https://intern-alog-012-2.onrender.com'
const rawBase = import.meta.env.VITE_API_BASE || FALLBACK_API_BASE

export const API_BASE = rawBase.replace(/\/+$/, '')

function joinUrl(base, path) {
  if (!base) return path
  if (!path) return base
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/')) return `${base}/${path}`
  return `${base}${path}`
}

export async function apiFetch(path, options = {}) {
  const url = joinUrl(API_BASE, path)
  return fetch(url, options)
}

