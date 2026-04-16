import { useEffect, useState } from 'react'

export default function ApiLogs() {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadLogs() {
    setLoading(true)
    setError('')
    fetch('/api/admin/logs?limit=100', { credentials: 'include' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load API logs')
        setLogs(data.logs || [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const methodColor = { GET: 'text-emerald-400', POST: 'text-blue-400', PUT: 'text-amber-400', DELETE: 'text-red-400' }
  const statusColor = s => s < 300 ? 'text-emerald-400' : s < 400 ? 'text-amber-400' : 'text-red-400'

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-[#e8e4dc]">API Logs</h1>
        <p className="text-[#5a5550] text-sm">Recent API request history.</p>
      </div>
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={loadLogs}
          disabled={loading}
          className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#a09a8e] transition-colors hover:border-[#3a3a3a] disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Logs'}
        </button>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0e0e0e] border-b border-[#1e1e1e]">
              {['Time','Method','Path','Status','Latency'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold tracking-widest uppercase text-[#3a3a3a]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i} className="border-b border-[#0e0e0e] hover:bg-[#0e0e0e] transition-colors">
                <td className="px-4 py-2.5 font-mono text-[#3a3a3a]">{l.time}</td>
                <td className={`px-4 py-2.5 font-bold font-mono ${methodColor[l.method]}`}>{l.method}</td>
                <td className="px-4 py-2.5 font-mono text-[#a09a8e] max-w-[300px] truncate">{l.path}</td>
                <td className={`px-4 py-2.5 font-mono font-bold ${statusColor(l.status)}`}>{l.status}</td>
                <td className="px-4 py-2.5 text-[#5a5550]">{l.ms}ms</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#5a5550]">
                  No API traffic recorded yet. Use the dashboard or Postman and refresh this page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
