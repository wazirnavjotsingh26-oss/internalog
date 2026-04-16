import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, PointElement, LineElement, Filler, Tooltip, Legend
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Filler, Tooltip, Legend)

const API = ''

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────
function Navbar({ activeTab, setActiveTab }) {
  const navigate = useNavigate()
  const tabs = [
    { id: 'directory', label: 'Directory', badge: null },
    { id: 'insights', label: 'Insights', badge: 'NEW' },
    { id: 'api', label: 'API', badge: 'NEW' },
  ]
  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1e1e1e]">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-[#0a0a0a] text-xs font-bold font-display">CB</div>
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-[#e8e4dc]">CemeteryBase</span>
        </div>

        {/* Center Tabs */}
        <nav className="flex items-center gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative px-4 py-1.5 text-sm font-medium rounded-sm transition-colors flex items-center gap-1.5 ${
                activeTab === t.id
                  ? 'text-[#e8e4dc] border-b-2 border-gold'
                  : 'text-[#5a5550] hover:text-[#a09a8e]'
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="bg-gold text-[#0a0a0a] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-1.5 text-sm font-medium text-[#5a5550] hover:text-[#a09a8e] transition-colors"
          >
            Admin
          </button>
        </nav>

        {/* Right icons */}
        <div className="flex items-center gap-3">
          <button className="text-[#5a5550] hover:text-[#a09a8e] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button className="text-[#5a5550] hover:text-[#a09a8e] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── DIRECTORY TAB ───────────────────────────────────────────────────────────
function DirectoryTab({ setActiveTab }) {
  const [stats, setStats] = useState({ total: 147832, with_phone: 89241, top_states: [] })
  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [counties, setCounties] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('United States')
  const [selectedState, setSelectedState] = useState('')
  const [selectedCounty, setSelectedCounty] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    fetch(`${API}/api/stats`).then(r => r.json()).then(setStats).catch(() => {})
    fetch(`${API}/api/countries`).then(r => r.json()).then(d => setCountries(d.countries || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const p = new URLSearchParams()
    if (selectedCountry) p.set('country', selectedCountry)
    fetch(`${API}/api/states?${p}`)
      .then(r => r.json()).then(d => setStates(d.states || [])).catch(() => {})
  }, [selectedCountry])

  useEffect(() => {
    if (!selectedState) { setCounties([]); setSelectedCounty(''); return }
    const p = new URLSearchParams()
    if (selectedCountry) p.set('country', selectedCountry)
    p.set('state', selectedState)
    fetch(`${API}/api/counties?${p}`)
      .then(r => r.json()).then(d => setCounties(d.counties || [])).catch(() => {})
  }, [selectedCountry, selectedState])

  useEffect(() => {
    setSelectedState('')
    setSelectedCounty('')
  }, [selectedCountry])

  async function doSearch() {
    setLoading(true)
    const p = new URLSearchParams()
    if (selectedCountry) p.set('country', selectedCountry)
    if (selectedState) p.set('state', selectedState)
    if (selectedCounty) p.set('county', selectedCounty)
    if (search.trim()) p.set('search', search.trim())
    p.set('limit', PAGE_SIZE)
    p.set('skip', page * PAGE_SIZE)
    try {
      const r = await fetch(`${API}/api/cemeteries?${p}`)
      const d = await r.json()
      setResults(d.data || [])
      setTotal(d.total || 0)
    } catch { setResults([]) }
    setLoading(false)
  }

  function statusBadge(c) {
    const has = [c.phone, c.website, c.address, c.city, c.state].filter(Boolean).length
    if (has >= 4) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified</span>
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>
  }

  return (
    <div className="max-w-7xl mx-auto px-6">
      {/* Hero */}
      <section className="pt-14 pb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-[#161616] border border-[#2a2a2a] rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-gold"></span>
          <span className="text-xs text-[#a09a8e]">Trusted by 2,000+ organizations nationwide</span>
        </div>
        <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-none mb-6">
          The Most Comprehensive<br />
          <span className="text-gold">Cemetery Intelligence</span><br />
          Platform
        </h1>
        <p className="text-[#a09a8e] text-base max-w-xl mx-auto mb-8 leading-relaxed">
          Verified, structured, nationwide cemetery data — powering research,<br />genealogy, and enterprise operations.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => document.getElementById('search-section').scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center gap-2 px-6 py-2.5 border border-gold/40 text-gold text-sm font-medium rounded hover:bg-gold/5 transition-colors"
          >
            Explore Database <span>→</span>
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className="flex items-center gap-2 px-6 py-2.5 border border-[#2a2a2a] text-[#a09a8e] text-sm font-medium rounded hover:border-[#3a3a3a] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            View Insights
          </button>
        </div>
      </section>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3 mb-12">
        {[
          { icon: '🏛', value: (stats.total || 147832).toLocaleString(), label: 'Cemeteries' },
          { icon: '🌐', value: '50', label: 'States Covered' },
          { icon: '📞', value: (stats.with_phone || 89241).toLocaleString(), label: 'Verified Contacts', color: 'text-pink-400' },
          { icon: '🕒', value: '2 hrs ago', label: 'Last Updated', color: 'text-sky-400' },
        ].map((s, i) => (
          <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-lg p-4 text-center">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className={`font-display text-2xl font-bold ${s.color || 'text-[#e8e4dc]'}`}>{s.value}</div>
            <div className="text-[#5a5550] text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search Section */}
      <section id="search-section" className="mb-8">
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl font-semibold text-gold mb-1">Search the Database</h2>
          <p className="text-[#5a5550] text-sm">Explore 147,000+ verified cemetery records across all 50 states</p>
        </div>
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5 space-y-3">
          {/* Search input */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a3a3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Search by cemetery name, city, or keyword..."
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#e8e4dc] placeholder-[#3a3a3a] focus:outline-none focus:border-gold/40"
            />
          </div>
          {/* Filters row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#a09a8e] focus:outline-none focus:border-gold/40 appearance-none cursor-pointer"
            >
              <option value="">All Countries</option>
              {countries.map(country => <option key={country} value={country}>{country}</option>)}
            </select>
            <select
              value={selectedState}
              onChange={e => { setSelectedState(e.target.value); setSelectedCounty('') }}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#a09a8e] focus:outline-none focus:border-gold/40 appearance-none cursor-pointer"
            >
              <option value="">All States</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={selectedCounty}
              onChange={e => setSelectedCounty(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#a09a8e] focus:outline-none focus:border-gold/40 appearance-none cursor-pointer"
            >
              <option value="">All Counties</option>
              {counties.map(county => <option key={county} value={county}>{county}</option>)}
            </select>
            <div className="flex items-center rounded-lg border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#5a5550]">
              Filter by country, state, and county
            </div>
          </div>
          {/* Search button */}
          <button
            onClick={doSearch}
            disabled={loading}
            className="w-full bg-gold hover:bg-gold-light text-[#0a0a0a] py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {loading ? 'Searching...' : 'Search Cemeteries'}
          </button>
        </div>
      </section>

      {/* Results */}
      {results !== null && (
        <section className="mb-16">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#e8e4dc]">Results</h2>
              <p className="text-[#5a5550] text-xs">{total.toLocaleString()} cemeteries found</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'text-gold' : 'text-[#3a3a3a] hover:text-[#5a5550]'}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 6a1 1 0 000 2h14a1 1 0 100-2H3zm0 6a1 1 0 000 2h14a1 1 0 100-2H3z" clipRule="evenodd"/></svg>
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'text-gold' : 'text-[#3a3a3a] hover:text-[#5a5550]'}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
              </button>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-16 text-[#3a3a3a]">No cemeteries found matching your criteria.</div>
          ) : (
            <div className="border border-[#1e1e1e] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#111111] border-b border-[#1e1e1e]">
                    {['Name','Location','Type','Phone','Status','Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold tracking-widest uppercase text-[#3a3a3a]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((c, i) => (
                    <tr key={c._id || i} className="border-b border-[#111111] hover:bg-[#0e0e0e] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#e8e4dc] max-w-[200px] truncate">{c.name}</td>
                      <td className="px-4 py-3 text-[#a09a8e] text-xs">
                        <div className="flex items-center gap-1">
                          <span className="text-[#3a3a3a]">⊙</span>
                          {[c.county, c.state, c.country || 'United States'].filter(Boolean).join(', ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wide
                          ${c.type === 'public' ? 'bg-sky-500/10 text-sky-400' :
                            c.type === 'military' ? 'bg-purple-500/10 text-purple-400' :
                            c.type === 'private' ? 'bg-indigo-500/10 text-indigo-400' :
                            'bg-amber-500/10 text-amber-400'}`}>
                          {c.type || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#a09a8e] text-xs">{c.phone || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(c)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => window.open(c.website || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.name, c.city, c.state].filter(Boolean).join(', '))}`, '_blank', 'noopener,noreferrer')}
                            className="text-[#3a3a3a] hover:text-[#a09a8e] transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </button>
                          <button onClick={() => navigator.clipboard.writeText([c.name, c.city, c.state].filter(Boolean).join(', '))} className="text-[#3a3a3a] hover:text-[#a09a8e] transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button onClick={() => { setPage(p => p-1); doSearch() }} disabled={page === 0}
                className="text-xs text-[#5a5550] hover:text-[#a09a8e] disabled:opacity-30 transition-colors">← Previous</button>
              <span className="text-xs text-[#3a3a3a]">Page {page+1} of {Math.ceil(total/PAGE_SIZE)}</span>
              <button onClick={() => { setPage(p => p+1); doSearch() }} disabled={(page+1)*PAGE_SIZE >= total}
                className="text-xs text-[#5a5550] hover:text-[#a09a8e] disabled:opacity-30 transition-colors">Next →</button>
            </div>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[#1e1e1e] py-6 text-center text-[#3a3a3a] text-xs mb-0">
        © 2026 CemeteryBase. All rights reserved.
      </footer>
    </div>
  )
}

// ─── INSIGHTS TAB ────────────────────────────────────────────────────────────
function InsightsTab() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    fetch(`${API}/api/stats`).then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  const chartDefaults = {
    plugins: { legend: { labels: { color: '#5a5550', font: { family: 'DM Sans', size: 11 } } } },
    scales: {
      x: { ticks: { color: '#3a3a3a', font: { size: 10 } }, grid: { color: '#111111' } },
      y: { ticks: { color: '#3a3a3a', font: { size: 10 } }, grid: { color: '#111111' } }
    }
  }

  const topStates = stats?.top_states?.slice(0, 8) || []
  const barData = {
    labels: topStates.map(s => s.state?.slice(0,2)?.toUpperCase() || s.state),
    datasets: [{
      data: topStates.map(s => s.count),
      backgroundColor: '#c9a84c',
      borderRadius: 3,
    }]
  }

  const donutData = {
    labels: ['Complete (68%)', 'Partial (22%)', 'Minimal (10%)'],
    datasets: [{ data: [68, 22, 10], backgroundColor: ['#c9a84c', '#3a3a3a', '#2a2a2a'], borderWidth: 0 }]
  }

  const growthData = {
    labels: ['Jan','Feb','Mar','Apr','May','Jun'],
    datasets: [{
      label: 'Total Records',
      data: [100000, 108000, 115000, 122000, 132000, 147832],
      borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,0.08)',
      pointBackgroundColor: '#c9a84c', fill: true, tension: 0.4,
    }]
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-gold mb-1">Data Insights</h1>
        <p className="text-[#5a5550] text-sm">Explore trends and analytics across our national cemetery database.</p>
      </div>

      {/* Two charts */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
          <h3 className="font-display text-sm font-semibold text-[#a09a8e] uppercase tracking-widest mb-1">Cemeteries by State</h3>
          <p className="text-[#3a3a3a] text-xs mb-4">Top 8 states by total records</p>
          <div className="h-52">
            <Bar data={barData} options={{ ...chartDefaults, responsive: true, maintainAspectRatio: false, plugins: { ...chartDefaults.plugins, legend: { display: false } } }} />
          </div>
        </div>
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
          <h3 className="font-display text-sm font-semibold text-[#a09a8e] uppercase tracking-widest mb-1">Data Completeness</h3>
          <p className="text-[#3a3a3a] text-xs mb-4">Quality distribution of records</p>
          <div className="h-52 flex items-center justify-center">
            <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { color: '#5a5550', font: { size: 11 }, padding: 12 } } } }} />
          </div>
        </div>
      </div>

      {/* Growth chart */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
        <h3 className="font-display text-sm font-semibold text-[#a09a8e] uppercase tracking-widest mb-1">Database Growth</h3>
        <p className="text-[#3a3a3a] text-xs mb-4">Total records over the past 6 months</p>
        <div className="h-52">
          <Line data={growthData} options={{ ...chartDefaults, responsive: true, maintainAspectRatio: false, plugins: { ...chartDefaults.plugins, legend: { display: false } } }} />
        </div>
      </div>
    </div>
  )
}

// ─── API TAB ─────────────────────────────────────────────────────────────────
function ApiTab() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-gold mb-2">API Reference</h1>
      <p className="text-[#5a5550] text-sm mb-8">Access cemetery data programmatically via our REST API.</p>
      {[
        { method: 'GET', path: '/api/cemeteries', desc: 'Paginated list with filters (state, city, search, type)' },
        { method: 'GET', path: '/api/cemeteries/:id', desc: 'Single cemetery by ID' },
        { method: 'GET', path: '/api/states', desc: 'All distinct states in database' },
        { method: 'GET', path: '/api/cities?state=X', desc: 'All cities for a given state' },
        { method: 'GET', path: '/api/stats', desc: 'Dashboard statistics' },
        { method: 'POST', path: '/api/collect', desc: 'Trigger data collection for a state' },
      ].map((ep, i) => (
        <div key={i} className="flex items-start gap-4 bg-[#111111] border border-[#1e1e1e] rounded-lg px-5 py-4 mb-2">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5
            ${ep.method === 'GET' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
            {ep.method}
          </span>
          <div>
            <code className="text-gold text-sm font-mono">{ep.path}</code>
            <p className="text-[#5a5550] text-xs mt-1">{ep.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── MAIN PUBLIC SITE ─────────────────────────────────────────────────────────
export default function PublicSite() {
  const [activeTab, setActiveTab] = useState('directory')
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      {activeTab === 'directory' && <DirectoryTab setActiveTab={setActiveTab} />}
      {activeTab === 'insights' && <InsightsTab />}
      {activeTab === 'api' && <ApiTab />}
    </div>
  )
}
