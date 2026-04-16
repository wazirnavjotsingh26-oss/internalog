import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/analytics', { credentials: 'include' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load analytics')
        setAnalytics(data)
      })
      .catch(err => setError(err.message))
  }, [])

  const fields = analytics?.field_completion || []
  const healthScore = analytics?.health_score || 0
  const complete = analytics?.completeness_distribution?.complete || 0
  const partial = analytics?.completeness_distribution?.partial || 0
  const minimal = analytics?.completeness_distribution?.minimal || 0

  const healthData = useMemo(() => ({
    datasets: [{
      data: [healthScore, Math.max(100 - healthScore, 0)],
      backgroundColor: ['#c9a84c', '#1e1e1e'],
      borderWidth: 0,
    }]
  }), [healthScore])

  const sourceValues = analytics?.source_distribution || []
  const sourceData = useMemo(() => ({
    labels: sourceValues.map(s => `${s.source || 'Unknown'} - ${s.count}`),
    datasets: [{
      data: sourceValues.length ? sourceValues.map(s => s.count) : [1],
      backgroundColor: ['#c9a84c', '#5a5550', '#3a3a3a', '#2a2a2a', '#7c6a35', '#8d8d8d'],
      borderWidth: 0,
    }]
  }), [sourceValues])

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-[#e8e4dc]">Analytics</h1>
        <p className="text-[#5a5550] text-sm">Data health, completeness, and collection metrics.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Top: Health Score + Field Completion */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Health Score */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5 flex flex-col items-center">
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e] mb-4 self-start">Data Health Score</h2>
          <div className="relative w-36 h-36 my-2">
            <Doughnut
              data={healthData}
              options={{
                cutout: '72%',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
              }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-2xl font-bold text-[#e8e4dc]">{healthScore}%</span>
            </div>
          </div>
          <p className="text-[#5a5550] text-xs mt-2">Overall data quality</p>
        </div>

        {/* Field Completion Rates */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e] mb-4">Field Completion Rates</h2>
          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="text-[10px] text-[#5a5550] w-12 shrink-0">{f.label}</span>
                <div className="flex-1 h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                  <div className="h-full bg-gold rounded-full transition-all duration-700" style={{ width: `${f.pct}%` }}></div>
                </div>
                <span className="text-[10px] text-[#3a3a3a] w-7 text-right">{f.pct}</span>
              </div>
            ))}
            {fields.length === 0 && <p className="text-sm text-[#5a5550]">No analytics data yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {[
          { label: 'Complete Records', value: complete, tone: 'text-emerald-400' },
          { label: 'Partial Records', value: partial, tone: 'text-amber-400' },
          { label: 'Minimal Records', value: minimal, tone: 'text-red-400' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-[#1e1e1e] bg-[#111111] p-5">
            <div className={`font-display text-2xl font-bold ${card.tone}`}>{card.value}</div>
            <p className="mt-1 text-xs text-[#5a5550]">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Source Distribution */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
        <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e] mb-4">Source Distribution</h2>
        <div className="flex items-center gap-8">
          <div className="w-32 h-32 shrink-0">
            <Doughnut
              data={sourceData}
              options={{
                cutout: '60%',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
              }}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            {sourceValues.map((s, idx) => (
              <div key={`${s.source || 'Unknown'}-${idx}`} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sourceData.datasets[0].backgroundColor[idx % sourceData.datasets[0].backgroundColor.length] }}></div>
                <span className="text-[11px] text-[#5a5550]">{`${s.source || 'Unknown'} - ${s.count}`}</span>
              </div>
            ))}
            {sourceValues.length === 0 && <p className="text-sm text-[#5a5550]">No source breakdown available yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
