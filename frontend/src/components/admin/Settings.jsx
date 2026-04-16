import { useEffect, useState } from 'react'

export default function Settings() {
  const [form, setForm] = useState({
    google_places_enabled: false,
    auto_clean_enabled: false,
    allow_public_exports: true,
    default_collection_limit: 200,
    collection_batch_note: '',
  })
  const [copied, setCopied] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/settings', { credentials: 'include' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load settings')
        setForm({
          google_places_enabled: Boolean(data.google_places_enabled),
          auto_clean_enabled: Boolean(data.auto_clean_enabled),
          allow_public_exports: Boolean(data.allow_public_exports),
          default_collection_limit: data.default_collection_limit || 200,
          collection_batch_note: data.collection_batch_note || '',
        })
      })
      .catch(err => setError(err.message))
  }, [])

  function copy(key, value) {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  function updateField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function saveSettings() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')
      setForm({
        google_places_enabled: Boolean(data.settings.google_places_enabled),
        auto_clean_enabled: Boolean(data.settings.auto_clean_enabled),
        allow_public_exports: Boolean(data.settings.allow_public_exports),
        default_collection_limit: data.settings.default_collection_limit || 200,
        collection_batch_note: data.settings.collection_batch_note || '',
      })
      setSaved(true)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const dataSources = [
    { name: 'Google Places API', status: form.google_places_enabled ? 'Enabled' : 'Disabled', dot: form.google_places_enabled ? 'bg-emerald-400' : 'bg-[#3a3a3a]' },
    { name: 'OSM / Overpass', status: 'Connected', dot: 'bg-emerald-400' },
    { name: 'CSV Export Service', status: form.allow_public_exports ? 'Public Access' : 'Admin Only', dot: form.allow_public_exports ? 'bg-emerald-400' : 'bg-amber-400' },
  ]

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-[#e8e4dc]">Settings</h1>
        <p className="text-[#5a5550] text-sm">Manage API keys, data sources, and platform configuration.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Settings saved successfully.
        </div>
      )}

      {/* API Keys */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm">🔑</span>
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e]">API Keys</h2>
        </div>
        {[
          { label: 'Admin Password', key: 'admin', val: 'Stored in backend .env' },
          { label: 'Google Places API', key: 'google', val: form.google_places_enabled ? 'Enabled in project environment' : 'Disabled in settings' },
        ].map(k => (
          <div key={k.key} className="flex items-center justify-between py-3 border-b border-[#161616] last:border-0">
            <div>
              <p className="text-sm text-[#e8e4dc] font-medium">{k.label}</p>
              <p className="text-xs text-[#3a3a3a] font-mono mt-0.5">{k.val}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => copy(k.key, k.val)} className="text-[#3a3a3a] hover:text-[#5a5550] transition-colors p-1">
                {copied === k.key
                  ? <span className="text-emerald-400 text-[10px]">✓</span>
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                }
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Data Sources */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm">🗄</span>
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e]">Data Sources</h2>
        </div>
        {dataSources.map(s => (
          <div key={s.name} className="flex items-center justify-between py-3 border-b border-[#161616] last:border-0">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${s.dot}`}></div>
              <div>
                <p className="text-sm text-[#e8e4dc]">{s.name}</p>
                <p className="text-xs text-[#3a3a3a]">{s.status}</p>
              </div>
            </div>
            <span className="text-xs text-[#5a5550]">Live</span>
          </div>
        ))}
      </div>

      {/* Platform Settings */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm">⚙</span>
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-[#a09a8e]">Platform Configuration</h2>
        </div>
        {[
          {
            label: 'Enable Google Places enrichment',
            value: form.google_places_enabled,
            onChange: value => updateField('google_places_enabled', value),
          },
          {
            label: 'Enable auto-clean during collection',
            value: form.auto_clean_enabled,
            onChange: value => updateField('auto_clean_enabled', value),
          },
          {
            label: 'Allow public CSV exports',
            value: form.allow_public_exports,
            onChange: value => updateField('allow_public_exports', value),
          },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between py-3 border-b border-[#161616] last:border-0">
            <p className="text-sm text-[#e8e4dc] font-medium">{item.label}</p>
            <label className="toggle">
              <input type="checkbox" checked={item.value} onChange={e => item.onChange(e.target.checked)} />
              <span className="toggle-slider"></span>
            </label>
          </div>
        ))}

        <div className="py-4 border-b border-[#161616]">
          <label className="mb-2 block text-xs font-medium text-[#a09a8e]">Default collection limit per state</label>
          <input
            type="number"
            min="1"
            max="5000"
            value={form.default_collection_limit}
            onChange={e => updateField('default_collection_limit', Number(e.target.value))}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-sm text-[#e8e4dc] focus:border-gold/40 focus:outline-none"
          />
        </div>

        <div className="py-4">
          <label className="mb-2 block text-xs font-medium text-[#a09a8e]">Collection notes</label>
          <textarea
            rows={4}
            value={form.collection_batch_note}
            onChange={e => updateField('collection_batch_note', e.target.value)}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-sm text-[#e8e4dc] focus:border-gold/40 focus:outline-none"
            placeholder="Notes shown for the collection workflow"
          />
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-[#0a0a0a] transition-colors hover:bg-gold-light disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
