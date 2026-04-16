import { useState, useEffect } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend)

export default function Overview() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
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
    labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    datasets: [{
      data: [420, 580, 850, 1250, 1100, 680, 520],
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
    { label: 'Total Cemeteries', value: (stats?.total || 147832).toLocaleString(), delta: '+2.4%', up: true, icon: '🏛' },
    { label: 'Data Completeness', value: '68.2%', delta: '+1.1%', up: true, icon: '📊' },
    { label: 'Missing Fields', value: (stats?.total ? Math.floor(stats.total * 0.16) : 23481).toLocaleString(), delta: '-3.2%', up: false, icon: '⚠️' },
    { label: 'Last Sync', value: '2h ago', delta: 'Running', up: true, icon: '🕒', isRunning: true },
  ]

  const recentActivity = [
    { icon: '✓', msg: 'Data collection completed', sub: 'California · 1,240 records', time: '2 hours ago', color: 'text-emerald-400' },
    { icon: '⚡', msg: 'Duplicate detection run', sub: '67 duplicates flagged', time: '3 hours ago', color: 'text-amber-400' },
    { icon: '🔑', msg: 'API key generated', sub: 'Production key for client #42', time: '1 day ago', color: 'text-sky-400' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-[#e8e4dc]">Dashboard</h1>
        <p className="text-[#5a5550] text-sm mt-0.5">Welcome back. Here's your data overview.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
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
      <div className="grid grid-cols-2 gap-4 mb-4">
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
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full bg-[#161616] border border-[#2a2a2a] flex items-center justify-center text-[10px] shrink-0 ${a.color}`}>{a.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#e8e4dc] font-medium">{a.msg}</p>
                <p className="text-xs text-[#5a5550]">{a.sub}</p>
              </div>
              <span className="text-[10px] text-[#3a3a3a] shrink-0">{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
