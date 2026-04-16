import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
]

const EMPTY = {
  name: '', country: 'United States', state: '', city: '', county: '',
  address: '', zip_code: '', latitude: '', longitude: '',
  phone: '', website: '', type: '', opening_hours: '', notes: '',
}

export default function AddCemetery() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    let ignore = false

    async function loadRecord() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/cemeteries/${id}`, { credentials: 'include' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load cemetery')
        if (!ignore) {
          setForm({
            ...EMPTY,
            ...data,
            latitude: data.latitude ?? '',
            longitude: data.longitude ?? '',
          })
        }
      } catch (err) {
        if (!ignore) setError(err.message || 'Failed to load cemetery')
      }
      if (!ignore) setLoading(false)
    }

    loadRecord()
    return () => { ignore = true }
  }, [id, isEdit])

  function set(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Cemetery name is required.'); return }
    if (!form.state)        { setError('State is required.'); return }

    setSaving(true)
    try {
      const res = await fetch(isEdit ? `/api/cemeteries/${id}` : '/api/cemeteries', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save.'); setSaving(false); return }
      setSuccess(true)
      setTimeout(() => navigate('/admin/cemeteries'), 1500)
    } catch {
      setError('Network error — make sure the Flask server is running.')
    }
    setSaving(false)
  }

  // ── style helpers ──
  const inp  = 'w-full bg-[#0d0d0d] border border-[#222] rounded-xl px-4 py-2.5 text-sm text-[#e8e4dc] placeholder-[#333] focus:outline-none focus:border-amber-500/60 focus:bg-[#111] transition-all'
  const lbl  = 'block text-[11px] font-semibold tracking-widest uppercase text-[#5a5550] mb-1.5'
  const sect = 'text-[10px] font-bold tracking-[0.2em] uppercase text-amber-500/60 mb-4 flex items-center gap-3'

  const Field = ({ label, name, required, placeholder, type = 'text', children }) => (
    <div>
      <label htmlFor={`f-${name}`} className={lbl}>
        {label}{required && <span className="text-amber-500 ml-0.5">*</span>}
      </label>
      {children || (
        <input
          id={`f-${name}`}
          name={name}
          type={type}
          value={form[name]}
          onChange={set}
          placeholder={placeholder}
          className={inp}
        />
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2a2a2a] border-t-amber-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080808]">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 bg-[#080808]/95 backdrop-blur border-b border-[#161616] px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/cemeteries')}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#111] border border-[#222] text-[#5a5550] hover:text-[#e8e4dc] hover:border-[#333] transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <p className="text-[10px] text-[#3a3a3a] tracking-widest uppercase">Cemeteries</p>
            <h1 className="text-sm font-semibold text-[#e8e4dc] leading-tight">{isEdit ? 'Edit Cemetery Record' : 'Add New Cemetery Record'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/cemeteries')}
            className="px-4 py-2 text-xs text-[#5a5550] border border-[#222] rounded-lg hover:border-[#333] hover:text-[#a09a8e] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || success}
            className="px-5 py-2 text-xs font-bold bg-amber-500 text-[#080808] rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving to MongoDB…
              </>
            ) : success ? '✓ Saved! Redirecting…' : isEdit ? '✓ Update Cemetery' : '✓ Save Cemetery'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-4xl mx-auto px-8 py-10">

        {/* Success banner */}
        {success && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-3 text-sm text-emerald-400">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
            {isEdit ? 'Cemetery updated successfully! Redirecting to Cemeteries…' : 'Cemetery saved to MongoDB Atlas successfully! Redirecting to Cemeteries…'}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3 text-sm text-red-400">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ───────────────── LEFT (2/3) ───────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Identity */}
            <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl p-6">
              <p className={sect}>
                <span className="w-5 h-[1px] bg-amber-500/40 block"/>
                Identity
              </p>
              <div className="space-y-4">
                <Field label="Cemetery Name" name="name" required placeholder="e.g. Oakwood Cemetery" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Country" name="country" placeholder="United States" />
                  <Field label="Type" name="type">
                    <select id="f-type" name="type" value={form.type} onChange={set} className={inp}>
                      <option value="">— Select type —</option>
                      {['public','private','military','historical','religious'].map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl p-6">
              <p className={sect}>
                <span className="w-5 h-[1px] bg-amber-500/40 block"/>
                Location
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="State" name="state" required>
                    <select id="f-state" name="state" value={form.state} onChange={set} className={inp} required>
                      <option value="">— Select state —</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="City" name="city" placeholder="e.g. Austin" />
                </div>
                <Field label="County" name="county" placeholder="e.g. Travis County" />
                <Field label="Street Address" name="address" placeholder="e.g. 1601 Navasota St" />
                <Field label="ZIP Code" name="zip_code" placeholder="e.g. 78702" />
              </div>
            </div>

            {/* Contact */}
            <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl p-6">
              <p className={sect}>
                <span className="w-5 h-[1px] bg-amber-500/40 block"/>
                Contact &amp; Web
              </p>
              <div className="space-y-4">
                <Field label="Phone" name="phone" placeholder="e.g. (512) 472-5100" />
                <Field label="Website" name="website" placeholder="https://..." />
                <Field label="Opening Hours" name="opening_hours" placeholder="e.g. Mon–Sun 8am–5pm" />
              </div>
            </div>

          </div>

          {/* ───────────────── RIGHT (1/3) ───────────────── */}
          <div className="space-y-6">

            {/* Coordinates */}
            <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl p-6">
              <p className={sect}>
                <span className="w-5 h-[1px] bg-amber-500/40 block"/>
                Coordinates
              </p>
              <div className="space-y-4">
                <Field label="Latitude" name="latitude" type="number" placeholder="e.g. 30.2671" />
                <Field label="Longitude" name="longitude" type="number" placeholder="e.g. -97.7274" />
              </div>
              <a
                href="https://maps.google.com"
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex items-center gap-1.5 text-[11px] text-amber-500/50 hover:text-amber-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Find coordinates on Google Maps
              </a>
            </div>

            {/* Notes */}
            <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl p-6">
              <p className={sect}>
                <span className="w-5 h-[1px] bg-amber-500/40 block"/>
                Notes
              </p>
              <div>
                <label className={lbl}>Additional Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={set}
                  rows={5}
                  placeholder="Historical info, special notes, data quality remarks…"
                  className={inp + ' resize-none'}
                />
              </div>
            </div>

            {/* Data source badge */}
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5">
              <p className="text-[11px] font-semibold text-amber-500/70 mb-1">Data Source</p>
              <p className="text-xs text-[#5a5550]">This record will be tagged as <span className="text-amber-400 font-semibold">Manual</span> and saved directly to <span className="text-amber-400 font-semibold">MongoDB Atlas</span>.</p>
            </div>

          </div>
        </form>
      </div>
    </div>
  )
}
