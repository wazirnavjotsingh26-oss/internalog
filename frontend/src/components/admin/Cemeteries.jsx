import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Cemeteries() {
  const navigate = useNavigate()
  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [counties, setCounties] = useState([])
  const [selectedCountry, setSelectedCountry] = useState('United States')
  const [selectedState, setSelectedState] = useState('')
  const [selectedCounty, setSelectedCounty] = useState('')
  const [rows, setRows]       = useState([])
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [busyId, setBusyId] = useState('')
  const [page, setPage]       = useState(0)
  const [total, setTotal]     = useState(0)
  const PAGE = 50

  useEffect(() => { load() }, [page, selectedCountry, selectedState, selectedCounty])
  useEffect(() => {
    fetch('/api/countries')
      .then(r => r.json())
      .then(d => setCountries(d.countries || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const p = new URLSearchParams()
    if (selectedCountry) p.set('country', selectedCountry)
    fetch(`/api/states?${p}`)
      .then(r => r.json())
      .then(d => setStates(d.states || []))
      .catch(() => {})
  }, [selectedCountry])

  useEffect(() => {
    if (!selectedState) { setCounties([]); setSelectedCounty(''); return }
    const p = new URLSearchParams()
    if (selectedCountry) p.set('country', selectedCountry)
    p.set('state', selectedState)
    fetch(`/api/counties?${p}`)
      .then(r => r.json())
      .then(d => setCounties(d.counties || []))
      .catch(() => {})
  }, [selectedCountry, selectedState])

  useEffect(() => {
    setSelectedState('')
    setSelectedCounty('')
  }, [selectedCountry])

  useEffect(() => {
    if (!actionSuccess) return
    const timer = setTimeout(() => setActionSuccess(''), 2500)
    return () => clearTimeout(timer)
  }, [actionSuccess])

  async function load() {
    setLoading(true)
    setActionError('')
    const p = new URLSearchParams({ limit: PAGE, skip: page * PAGE })
    if (selectedCountry) p.set('country', selectedCountry)
    if (selectedState) p.set('state', selectedState)
    if (selectedCounty) p.set('county', selectedCounty)
    if (search.trim()) p.set('search', search.trim())
    try {
      const r = await fetch(`/api/cemeteries?${p}`, { credentials: 'include' })
      const d = await r.json()
      setRows(d.data || [])
      setTotal(d.total || 0)
    } catch {
      setActionError('Failed to load cemetery records.')
    }
    setLoading(false)
  }

  function completeness(c) {
    const fields = ['name','address','city','county','state','zip_code','phone','website','opening_hours','type']
    const filled = fields.filter(f => c[f] && c[f] !== '').length
    return Math.round((filled / fields.length) * 100)
  }

  function statusBadge(pct) {
    if (pct >= 80) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified</span>
    if (pct >= 50) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Incomplete</span>
  }

  function typeBadge(type) {
    const map = {
      public:     'bg-sky-500/10 text-sky-400',
      private:    'bg-indigo-500/10 text-indigo-400',
      military:   'bg-purple-500/10 text-purple-400',
      historical: 'bg-amber-500/10 text-amber-400',
      religious:  'bg-pink-500/10 text-pink-400',
    }
    return <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${map[type] || 'bg-[#2a2a2a] text-[#5a5550]'}`}>{type || 'Unknown'}</span>
  }

  async function deleteRow(id, name) {
    if (!confirm(`Delete "${name}"?`)) return
    const isLastRowOnPage = rows.length === 1
    setBusyId(id)
    setActionError('')
    setActionSuccess('')
    const res = await fetch(`/api/cemeteries/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setActionError(data.error || 'Delete failed.')
      setBusyId('')
      return
    }
    setRows(prev => prev.filter(row => row._id !== id))
    setTotal(prev => Math.max(prev - 1, 0))
    setActionSuccess(`Deleted "${name}" successfully.`)
    setBusyId('')
    if (isLastRowOnPage && page > 0) {
      setPage(prev => prev - 1)
    }
  }

  function exportFile(kind) {
    const p = new URLSearchParams()
    if (search.trim()) p.set('search', search.trim())
    const query = p.toString()
    const path = kind === 'counties' ? '/api/export/counties.csv' : '/api/export/cemeteries.csv'
    window.open(`${path}${query ? `?${query}` : ''}`, '_blank', 'noopener,noreferrer')
    setActionSuccess(kind === 'counties' ? 'County export started.' : 'Full cemetery export started.')
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#e8e4dc]">Cemeteries</h1>
          <p className="text-[#5a5550] text-sm">Auto-collected cemetery records via OSM pipeline → saved to MongoDB Atlas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportFile('counties')}
            className="flex items-center gap-1.5 bg-[#111111] border border-[#2a2a2a] text-[#a09a8e] text-xs px-3 py-2 rounded-lg hover:border-[#3a3a3a] transition-colors"
          >
            🗺 County Export
          </button>
          <button
            onClick={() => exportFile('all')}
            className="flex items-center gap-1.5 bg-[#111111] border border-[#2a2a2a] text-[#a09a8e] text-xs px-3 py-2 rounded-lg hover:border-[#3a3a3a] transition-colors"
          >
            ↑ Export All
          </button>
          <button
            onClick={() => navigate('/admin/cemeteries/add')}
            className="flex items-center gap-1.5 bg-[#111111] border border-[#2a2a2a] text-[#a09a8e] text-xs px-3 py-2 rounded-lg hover:border-[#3a3a3a] transition-colors"
          >
            + Add Record
          </button>
          <button
            onClick={() => navigate('/admin/collect')}
            className="flex items-center gap-1.5 bg-amber-500 text-[#0a0a0a] text-xs font-bold px-4 py-2 rounded-lg hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
          >
            ▶ Run Collection
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {actionSuccess}
        </div>
      )}

      {/* ── Search ── */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3a3a3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Search cemeteries..."
          className="w-full bg-[#111111] border border-[#1e1e1e] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#e8e4dc] placeholder-[#3a3a3a] focus:outline-none focus:border-amber-500/40"
        />
      </div>
      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2">
        <select
          value={selectedCountry}
          onChange={e => setSelectedCountry(e.target.value)}
          className="rounded-lg border border-[#1e1e1e] bg-[#111111] px-3 py-2.5 text-sm text-[#e8e4dc] focus:border-amber-500/40 focus:outline-none"
        >
          <option value="">All Countries</option>
          {countries.map(country => <option key={country} value={country}>{country}</option>)}
        </select>
        <select
          value={selectedState}
          onChange={e => { setSelectedState(e.target.value); setSelectedCounty('') }}
          className="rounded-lg border border-[#1e1e1e] bg-[#111111] px-3 py-2.5 text-sm text-[#e8e4dc] focus:border-amber-500/40 focus:outline-none"
        >
          <option value="">All States</option>
          {states.map(state => <option key={state} value={state}>{state}</option>)}
        </select>
        <select
          value={selectedCounty}
          onChange={e => setSelectedCounty(e.target.value)}
          className="rounded-lg border border-[#1e1e1e] bg-[#111111] px-3 py-2.5 text-sm text-[#e8e4dc] focus:border-amber-500/40 focus:outline-none"
        >
          <option value="">All Counties</option>
          {counties.map(county => <option key={county} value={county}>{county}</option>)}
        </select>
      </div>
      <div className="mb-4 flex items-center justify-between text-xs text-[#5a5550]">
        <span>{total.toLocaleString()} records available</span>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-[#a09a8e] transition-colors hover:border-[#3a3a3a] disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* ── Table ── */}
      <div className="border border-[#1e1e1e] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0e0e0e] border-b border-[#1e1e1e]">
              <th className="w-8 px-4 py-3"><input type="checkbox" className="accent-amber-500 w-3 h-3" /></th>
              {['Name','Location','County','Type','Completeness','Status','Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold tracking-widest uppercase text-[#3a3a3a]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-[#3a3a3a]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[#3a3a3a]">
                  <div className="text-4xl mb-3">🪦</div>
                  <p className="mb-1 text-[#5a5550] font-medium">No records yet</p>
                  <p className="text-[11px] mb-4 text-[#3a3a3a]">Use the Data Collection pipeline to auto-import cemeteries via OSM → saves to MongoDB Atlas.</p>
                  <button
                    onClick={() => navigate('/admin/collect')}
                    className="inline-flex items-center gap-1.5 bg-amber-500 text-[#0a0a0a] text-xs font-bold px-4 py-2 rounded-lg hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    ▶ Go to Data Collection
                  </button>
                </td>
              </tr>
            ) : rows.map((c, i) => {
              const pct = completeness(c)
              return (
                <tr key={c._id || i} className="border-b border-[#0e0e0e] hover:bg-[#0e0e0e] transition-colors">
                  <td className="px-4 py-2.5"><input type="checkbox" className="accent-amber-500 w-3 h-3" /></td>
                  <td className="px-3 py-2.5 font-medium text-[#e8e4dc] max-w-[160px] truncate">{c.name}</td>
                  <td className="px-3 py-2.5 text-[#5a5550]">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2.5 text-[#5a5550]">{c.county || '—'}</td>
                  <td className="px-3 py-2.5">{typeBadge(c.type)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="comp-bar w-16"><div className="comp-fill" style={{width:`${pct}%`}}></div></div>
                      <span className="text-[#5a5550] text-[10px] w-7">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{statusBadge(pct)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/admin/cemeteries/${c._id}/edit`)}
                        disabled={busyId === c._id}
                        className="text-[#3a3a3a] hover:text-[#a09a8e] transition-colors disabled:opacity-40"
                        title="Edit"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button
                        onClick={() => deleteRow(c._id, c.name)}
                        disabled={busyId === c._id}
                        className="text-[#3a3a3a] hover:text-red-400 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        {busyId === c._id ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {total > PAGE && (
        <div className="flex items-center justify-between mt-4 text-xs text-[#3a3a3a]">
          <span>{total.toLocaleString()} total records</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setPage(p=>p-1)} disabled={page===0} className="disabled:opacity-30 hover:text-[#5a5550] transition-colors">← Prev</button>
            <span>Page {page+1} of {Math.ceil(total/PAGE)}</span>
            <button onClick={() => setPage(p=>p+1)} disabled={(page+1)*PAGE>=total} className="disabled:opacity-30 hover:text-[#5a5550] transition-colors">Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
