import { useState, useEffect } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend)
import { apiFetch } from '../../lib/api'

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'No activity yet'
  const when = new Date(timestamp)
  if (Number.isNaN(when.getTime())) return 'No activity yet'

  const seconds = Math.max(0, Math.floor((Date.now() - when.getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

function buildRecentActivity(stats, logs) {
  const activity = []

  if (stats?.last_entry_at) {
    const where = [stats.last_entry_state, stats.last_entry_name].filter(Boolean).join(' · ')
    activity.push({
      icon: '✓',
      msg: 'Latest cemetery entry updated',
      sub: where || 'Cemetery record changed',
      time: formatRelativeTime(stats.last_entry_at),
      color: 'text-emerald-400',
      at: stats.last_entry_at,
    })
  }

  for (const log of logs || []) {
    const path = (log.path || '').split('?')[0]
    let item = null
    if (path === '/api/collect' && log.method === 'POST') {
      item = { icon: '⚡', msg: 'Data collection run', color: 'text-amber-400' }
    } else if (path === '/api/cemeteries' && log.method === 'POST') {
      item = { icon: '+', msg: 'Cemetery added', color: 'text-emerald-400' }
    } else if (path.startsWith('/api/cemeteries/') && log.method === 'PUT') {
      item = { icon: '✎', msg: 'Cemetery updated', color: 'text-sky-400' }
    } else if (path.startsWith('/api/cemeteries/') && log.method === 'DELETE') {
      item = { icon: '−', msg: 'Cemetery deleted', color: 'text-red-400' }
    } else if (path === '/api/admin/settings' && log.method === 'PUT') {
      item = { icon: '⚙', msg: 'Settings updated', color: 'text-amber-400' }
    } else if (path === '/admin/login' && log.method === 'POST' && log.status < 400) {
      item = { icon: '🔑', msg: 'Admin signed in', color: 'text-sky-400' }
    }

    if (!item) continue
    activity.push({
      ...item,
      sub: `${log.method} ${path} · ${log.status}`,
      time: formatRelativeTime(log.timestamp),
      at: log.timestamp,
    })
  }

  activity.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
  return activity.slice(0, 6)
}

export default function Overview() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])

  useEffect(() => {
    apiFetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
    apiFetch('/api/admin/logs?limit=50')
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load activity')
        setActivity(data.logs || [])
      })
      .catch(() => setActivity([]))
  }, [])

  const topStates = stats?.top_states?.slice(0, 5) || []

  const barData = {
    labels: topStates.map(s => s.state?.slice(0,2)?.toUpperCase() || ''),
    datasets: [{
      data: topStates.map(s => s.count),
      backgroundColor: '#c9a84c',
      borderRadius: 4,
    }]
  }

  const lineData = {
    labels: ['Records'],
    datasets: [{
      data: [stats?.total ?? 0],
      borderColor: '#c9a84c',
      backgroundColor: 'rgba(201,168,76,0.08)',
      fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#c9a84c',
    }]
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#3a3a3a', font:{size:10} }, grid: { color: '#161616' } },
      y: { ticks: { color: '#3a3a3a', font:{size:10} }, grid: { color: '#161616' } }
    }
  }

  const statCards = [
    { label: 'Total Cemeteries', value: (stats?.total ?? 0).toLocaleString(), delta: 'Live', up: true, icon: '🏛' },
    { label: 'Verified Contacts', value: (stats?.with_phone ?? 0).toLocaleString(), delta: 'Live', up: true, icon: '📞' },
    { label: 'With Website', value: (stats?.with_website ?? 0).toLocaleString(), delta: 'Live', up: true, icon: '🌐' },
    { label: 'With Address', value: (stats?.with_address ?? 0).toLocaleString(), delta: 'Live', up: true, icon: '📍' },
  ]

  const recentActivity = buildRecentActivity(stats, activity)

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-[#e8e4dc]">Dashboard</h1>
        <p className="text-[#5a5550] text-sm mt-0.5">Welcome back. Here's your data overview.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {statCards.map((s, i) => (
          <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#3a3a3a]">{s.icon}</span>
              {s.isRunning
                ? <span className="text-[10px] text-emerald-400 font-medium">Running ►</span>
                : <span className={`text-[10px] font-medium ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>{s.delta}</span>
              }
            </div>
            <div className="font-display text-2xl font-bold text-[#e8e4dc]">{s.value}</div>
            <div className="text-[#3a3a3a] text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold text-[#a09a8e] uppercase tracking-widest mb-4">Top States by Entries</h2>
          <div className="h-44">
            <Bar data={barData} options={chartOpts} />
          </div>
        </div>
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold text-[#a09a8e] uppercase tracking-widest mb-4">Daily Ingestion</h2>
          <div className="h-44">
            <Line data={lineData} options={chartOpts} />
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
        <h2 className="font-display text-sm font-semibold text-[#a09a8e] uppercase tracking-widest mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {recentActivity.length === 0 && (
            <p className="text-sm text-[#5a5550]">No recent activity yet.</p>
          )}
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full bg-[#161616] border border-[#2a2a2a] flex items-center justify-center text-[10px] shrink-0 ${a.color}`}>{a.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#e8e4dc] font-medium">{a.msg}</p>
                <p className="text-xs text-[#5a5550]">{a.sub}</p>
              </div>
              <span className="text-[10px] text-[#3a3a3a] shrink-0 hidden sm:inline">{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
