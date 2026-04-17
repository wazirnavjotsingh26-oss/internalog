import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../../lib/api'

const US_STATES = [
  'California','Texas','New York','Florida','Pennsylvania',
  'Ohio','Illinois','Georgia','North Carolina','Michigan',
  'New Jersey','Virginia','Washington','Arizona','Tennessee',
  'Massachusetts','Indiana','Missouri','Maryland','Wisconsin',
  'Colorado','Minnesota','South Carolina','Alabama','Louisiana',
  'Kentucky','Oregon','Oklahoma','Connecticut','Iowa',
  'Utah','Nevada','Arkansas','Mississippi','Kansas',
  'New Mexico','Nebraska','West Virginia','Idaho','Hawaii',
  'New Hampshire','Maine','Montana','Rhode Island','Delaware',
  'South Dakota','North Dakota','Alaska','Vermont','Wyoming'
]

export default function DataCollection() {
  const [selectedStates, setSelectedStates] = useState(['California'])
  const [googleEnrich, setGoogleEnrich] = useState(true)
  const [dedup, setDedup] = useState(true)
  const [autoClean, setAutoClean] = useState(false)
  const [limit, setLimit] = useState(200)
  const [settingsNote, setSettingsNote] = useState('')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState(0)
  const [stats, setStats] = useState({ processed: 0, success: 0, failed: 0 })
  const [healthRunning, setHealthRunning] = useState(false)
  const [healthChecks, setHealthChecks] = useState([])
  const [healthAt, setHealthAt] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  useEffect(() => {
    apiFetch('/api/admin/settings')
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load settings')
        setGoogleEnrich(Boolean(data.google_places_enabled))
        setAutoClean(Boolean(data.auto_clean_enabled))
        setLimit(data.default_collection_limit || 200)
        setSettingsNote(data.collection_batch_note || '')
      })
      .catch(() => {})
  }, [])

  function toggleState(s) {
    setSelectedStates(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLogs(prev => [...prev, { time, msg, type }])
  }

  async function readJsonSafe(response) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/json')) {
      return response.json()
    }
    const raw = await response.text()
    return {
      error: `HTTP ${response.status}: ${raw.slice(0, 160) || 'Non-JSON response'}`
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function waitForCollectJob(jobId, onTick) {
    let wait = 400
    const maxWait = 4000
    for (;;) {
      const res = await apiFetch(`/api/collect/jobs/${jobId}`)
      const data = await readJsonSafe(res)
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const job = data.job
      if (onTick) onTick(job)
      const status = job?.status
      if (status === 'completed' || status === 'failed') {
        return job
      }
      await delay(wait)
      wait = Math.min(Math.round(wait * 1.35), maxWait)
    }
  }

  function setCheck(name, ok, details) {
    setHealthChecks(prev => {
      const rest = prev.filter(item => item.name !== name)
      return [...rest, { name, ok, details }]
    })
  }

  async function runHealthChecks() {
    setHealthRunning(true)
    setHealthChecks([])
    const stamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    setHealthAt(stamp)

    try {
      const statsRes = await apiFetch('/api/stats')
      setCheck(
        'API connectivity',
        statsRes.ok,
        statsRes.ok ? 'Backend reachable' : `HTTP ${statsRes.status}`
      )
    } catch (e) {
      setCheck('API connectivity', false, e.message || 'Request failed')
    }

    try {
      const authRes = await apiFetch('/api/admin/check')
      const authData = await authRes.json().catch(() => ({}))
      setCheck(
        'Admin auth',
        authRes.ok && Boolean(authData.authenticated),
        authRes.ok
          ? (authData.authenticated ? 'Authenticated' : 'Not authenticated')
          : `HTTP ${authRes.status}`
      )
    } catch (e) {
      setCheck('Admin auth', false, e.message || 'Request failed')
    }

    try {
      const optionsRes = await apiFetch('/api/collect', { method: 'OPTIONS' })
      setCheck(
        'Collect endpoint',
        optionsRes.ok,
        optionsRes.ok ? 'CORS preflight OK' : `HTTP ${optionsRes.status}`
      )
    } catch (e) {
      setCheck('Collect endpoint', false, e.message || 'Request failed')
    }

    setHealthRunning(false)
  }

  async function startCollection() {
    if (selectedStates.length === 0) { alert('Select at least one state'); return }
    setRunning(true)
    setLogs([])
    setProgress(0)
    setStats({ processed: 0, success: 0, failed: 0 })

    for (let i = 0; i < selectedStates.length; i++) {
      const state = selectedStates[i]
      addLog(`Starting collection for ${state}...`, 'info')
      if (googleEnrich) addLog(`Connecting to Google Places API...`, 'info')

      try {
        const res = await apiFetch('/api/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            enrich: googleEnrich,
            auto_clean: autoClean,
            limit,
            async: true,
          }),
        })
        const data = await readJsonSafe(res)
        if (res.status === 202 && data.job_id) {
          addLog(`Job ${data.job_id} queued — streaming progress…`, 'info')
          const finished = await waitForCollectJob(data.job_id, job => {
            const p = job?.progress
            if (p && p.total > 0) {
              const frac = Math.min(1, p.done / p.total)
              setProgress(Math.round(((i + frac) / selectedStates.length) * 100))
            }
          })
          if (finished.status === 'failed') {
            addLog(`Error: ${finished.error || 'Collection failed'}`, 'error')
            setStats(prev => ({
              ...prev,
              failed: prev.failed + 1,
            }))
          } else {
            const summary = finished.result || {}
            addLog(`Fetched ${summary.fetched ?? 0} records from source providers`, 'info')
            if (dedup) addLog(`Deduplication: ${summary.skipped ?? 0} duplicates removed`, 'success')
            addLog(
              `Saved ${summary.inserted ?? 0} new records and refreshed ${summary.updated || 0} existing records`,
              'success'
            )
            addLog(`Collection finished for ${state}`, 'success')
            setStats(prev => ({
              processed: prev.processed + (summary.fetched || 0),
              success: prev.success + (summary.inserted || 0) + (summary.updated || 0),
              failed: prev.failed + (summary.errors?.length || 0),
            }))
          }
        } else if (!res.ok || data.error) {
          addLog(`Error: ${data.error}`, 'error')
          setStats(prev => ({
            ...prev,
            failed: prev.failed + 1,
          }))
        } else {
          addLog(`Fetched ${data.fetched} records from source providers`, 'info')
          if (dedup) addLog(`Deduplication: ${data.skipped} duplicates removed`, 'success')
          addLog(`Saved ${data.inserted} new records and refreshed ${data.updated || 0} existing records`, 'success')
          addLog(`Collection finished for ${state}`, 'success')
          setStats(prev => ({
            processed: prev.processed + data.fetched,
            success: prev.success + data.inserted + (data.updated || 0),
            failed: prev.failed + (data.errors?.length || 0),
          }))
        }
      } catch (e) {
        addLog(`Connection error: ${e.message}`, 'error')
        setStats(prev => ({
          ...prev,
          failed: prev.failed + 1,
        }))
      }

      setProgress(Math.round(((i + 1) / selectedStates.length) * 100))
    }
    setRunning(false)
  }

  const logColors = { info: 'text-[#a09a8e]', success: 'text-emerald-400', error: 'text-red-400', warn: 'text-amber-400' }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-[#e8e4dc]">Data Collection</h1>
        <p className="text-[#5a5550] text-sm">Auto-collect cemetery data from OpenStreetMap (OSM) by state — no manual entry needed.</p>
      </div>

      <div className="mb-4 bg-[#111111] border border-[#1e1e1e] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e]">System Health</h2>
          <button
            onClick={runHealthChecks}
            disabled={healthRunning}
            className="px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-xs text-[#a09a8e] hover:border-[#3a3a3a] disabled:opacity-50 transition-colors"
          >
            {healthRunning ? 'Checking...' : 'Run Checks'}
          </button>
        </div>
        {healthAt && (
          <p className="text-[10px] text-[#3a3a3a] mb-2">Last run: {healthAt}</p>
        )}
        {healthChecks.length === 0 ? (
          <p className="text-xs text-[#5a5550]">Run checks before collection to validate API, auth, and collect endpoint.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {healthChecks.map(check => (
              <div key={check.name} className={`rounded-lg border px-3 py-2 ${check.ok ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
                <div className={`text-xs font-semibold ${check.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {check.ok ? '✓' : '✗'} {check.name}
                </div>
                <div className="text-[11px] text-[#a09a8e] mt-1">{check.details}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Config Panel */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e] mb-4">Configuration</h2>

          {/* State selection */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#3a3a3a] mb-2">Select States ({selectedStates.length} selected)</p>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
              {US_STATES.map(s => (
                <button
                  key={s}
                  onClick={() => toggleState(s)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    selectedStates.includes(s)
                      ? 'bg-gold text-[#0a0a0a] border-gold font-semibold'
                      : 'bg-transparent text-[#5a5550] border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3 mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#3a3a3a]">Options</p>
            {[
              { label: 'Google Enrichment', value: googleEnrich, set: setGoogleEnrich },
              { label: 'Deduplication', value: dedup, set: setDedup },
              { label: 'Auto-clean', value: autoClean, set: setAutoClean },
            ].map(opt => (
              <div key={opt.label} className="flex items-center justify-between py-2.5 border-b border-[#161616]">
                <span className="text-sm text-[#a09a8e]">{opt.label}</span>
                <label className="toggle">
                  <input type="checkbox" checked={opt.value} onChange={e => opt.set(e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            ))}
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[#3a3a3a]">
              Limit per state
            </label>
            <input
              type="number"
              min="1"
              max="5000"
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2.5 text-sm text-[#e8e4dc] focus:border-gold/40 focus:outline-none"
            />
            {settingsNote && <p className="mt-2 text-xs text-[#5a5550]">{settingsNote}</p>}
          </div>

          <button
            onClick={startCollection}
            disabled={running}
            className="w-full bg-gold hover:bg-gold-light disabled:opacity-60 text-[#0a0a0a] py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            ▶ {running ? 'Running...' : 'Start Intelligent Collection'}
          </button>
        </div>

        {/* Live Logs Panel */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e]">
              &gt;_ Live Logs
            </h2>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-between text-[10px] text-[#3a3a3a] mb-1">
            <span>Progress</span><span>{progress}%</span>
          </div>
          <div className="progress-bar mb-4"><div className="progress-fill bg-gold" style={{ width: `${progress}%` }}></div></div>

          {/* Log output */}
          <div ref={logRef} className="flex-1 bg-[#0a0a0a] rounded-lg p-3 font-mono text-[11px] space-y-1 h-40 overflow-y-auto">
            {logs.length === 0
              ? <p className="text-[#2a2a2a]">Ready. Click "Start Intelligent Collection" to begin.</p>
              : logs.map((l, i) => (
                <div key={i} className={logColors[l.type] || 'text-[#a09a8e]'}>
                  <span className="text-[#3a3a3a]">[{l.time}]</span> {l.type === 'success' ? '✓' : l.type === 'error' ? '✗' : '→'} {l.msg}
                </div>
              ))
            }
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: 'Processed', value: stats.processed, color: 'text-[#e8e4dc]' },
              { label: 'Success', value: stats.success, color: 'text-emerald-400' },
              { label: 'Failed', value: stats.failed, color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="bg-[#0e0e0e] rounded-lg p-3 text-center">
                <div className={`font-display text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-[#3a3a3a] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
