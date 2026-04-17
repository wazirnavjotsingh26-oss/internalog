import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import Overview from '../components/admin/Overview'
import Cemeteries from '../components/admin/Cemeteries'
import DataCollection from '../components/admin/DataCollection'
import Analytics from '../components/admin/Analytics'
import Settings from '../components/admin/Settings'
import ApiLogs from '../components/admin/ApiLogs'
import AddCemetery from './AddCemetery'
import { apiFetch, setAdminToken } from '../lib/api'

const navItems = [
  { id: 'overview', label: 'Overview', path: '/admin', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
  )},
  { id: 'cemeteries', label: 'Cemeteries', path: '/admin/cemeteries', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
  )},
  { id: 'collect', label: 'Data Collection', path: '/admin/collect', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
  )},
  { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
  )},
  { id: 'logs', label: 'API Logs', path: '/admin/logs', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
  )},
  { id: 'settings', label: 'Settings', path: '/admin/settings', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
  )},
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [authed, setAuthed] = useState(null)
  const logoIsActive = location.pathname === '/admin' || location.pathname === '/admin/'

  useEffect(() => {
    apiFetch('/api/admin/check')
      .then(async r => {
        const data = await r.json()
        setAuthed(Boolean(data.authenticated))
      })
      .catch(() => setAuthed(false))
  }, [])

  async function logout() {
    await apiFetch('/admin/logout')
    setAdminToken('')
    navigate('/admin/login')
  }

  if (authed === null) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#2a2a2a] border-t-gold rounded-full animate-spin"></div>
    </div>
  )

  if (!authed) {
    return <Navigate to="/admin/login" replace />
  }

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin' || location.pathname === '/admin/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'md:w-14' : 'md:w-52'} w-full md:w-auto bg-[#090909] border-b md:border-b-0 md:border-r border-[#161616] flex md:flex-col transition-all duration-200 shrink-0`}>
        {/* Logo */}
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className={`group hidden md:flex items-center gap-2.5 px-4 py-4 border-b border-[#161616] w-full text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
            logoIsActive ? 'bg-gold/5' : 'hover:bg-[#101010]'
          } ${collapsed ? 'justify-center' : ''}`}
          aria-label="Open admin overview"
        >
          <div className="w-7 h-7 rounded-full bg-gold flex items-center justify-center text-[#0a0a0a] font-bold font-display text-xs shrink-0 ring-1 ring-gold/40 transition-all group-hover:shadow-[0_0_12px_rgba(201,168,76,0.35)]">CB</div>
          {!collapsed && (
            <span className={`text-[10px] font-semibold tracking-[0.16em] uppercase transition-colors ${
              logoIsActive ? 'text-gold' : 'text-[#5a5550] group-hover:text-[#a09a8e]'
            }`}>
              CemeteryBase
            </span>
          )}
        </button>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 md:py-3 space-y-0.5 flex md:block overflow-x-auto md:overflow-visible">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`w-auto md:w-full flex items-center gap-2 md:gap-3 px-2.5 py-2 rounded-lg transition-colors text-left whitespace-nowrap ${
                isActive(item.path)
                  ? 'bg-gold/10 text-gold'
                  : 'text-[#3a3a3a] hover:text-[#5a5550] hover:bg-[#111111]'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="text-xs font-medium truncate hidden sm:inline md:inline">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="hidden md:block px-2 py-3 border-t border-[#161616] space-y-0.5">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[#3a3a3a] hover:text-[#5a5550] hover:bg-[#111111] transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            {!collapsed && <span className="text-xs">Back to Site</span>}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[#3a3a3a] hover:text-[#5a5550] hover:bg-[#111111] transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1"/>
            </svg>
            {!collapsed && <span className="text-xs">Logout</span>}
          </button>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[#3a3a3a] hover:text-[#5a5550] hover:bg-[#111111] transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"}/>
            </svg>
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="cemeteries" element={<Cemeteries />} />
            <Route path="cemeteries/add" element={<AddCemetery />} />
            <Route path="cemeteries/:id/edit" element={<AddCemetery />} />
            <Route path="collect" element={<DataCollection />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="logs" element={<ApiLogs />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
