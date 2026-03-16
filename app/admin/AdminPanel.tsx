'use client'
import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import clsx from 'clsx'
import { format } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Shift {
  id: number
  name: string
  schedule: string
  timeOfDay: string
}

interface Patient {
  id: number
  name: string
  shiftId: number
  enrollmentDate: string
  isActive: boolean
  droppedOutAt: string | null
  dryWeight: number | null
  notes: string | null
  shift: { id: number; name: string; schedule: string }
  _count: { promResponses: number }
}

interface Provider {
  id: number
  name: string
  username: string
  role: string
  shiftId: number | null
  isActive: boolean
  shift: { name: string } | null
}

interface DashboardData {
  recruitment: { total: number; active: number; droppedOut: number }
  currentStudyWeek: number | null
  todaySubmissions: number
  totalResponses: number
  weeklyStats: { week: number; submitted: number; expected: number; rate: number }[]
  shiftStats: { shiftId: number; shiftName: string; schedule: string; patients: number; totalResponses: number }[]
}

type Tab = 'dashboard' | 'patients' | 'providers' | 'config' | 'import'

// ── Small components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'blue' }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  }
  return (
    <div className={clsx('rounded-xl border-2 p-4', colors[color])}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-3xl font-black mt-1">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/dashboard').then((r) => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-slate-400">Loading dashboard…</div>
  if (!data) return <div className="text-center py-12 text-red-400">Failed to load</div>

  const completionData = data.weeklyStats.map((w) => ({
    name: `W${w.week}`,
    rate: w.rate,
    submitted: w.submitted,
  }))

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Patients" value={data.recruitment.total} color="blue" />
        <StatCard label="Active" value={data.recruitment.active} color="green" />
        <StatCard label="Dropped Out" value={data.recruitment.droppedOut} color="red" />
        <StatCard label="Today's Submissions" value={data.todaySubmissions} color="amber" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Current Study Week" value={data.currentStudyWeek ?? 'Not active'} color="blue" />
        <StatCard label="Total PROM Responses" value={data.totalResponses} color="green" />
      </div>

      {/* Completion rate chart by week */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">Completion Rate by Study Week (%)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={completionData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name) => [`${value}${name === 'rate' ? '%' : ''}`, name === 'rate' ? 'Rate' : 'Count']}
            />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {completionData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.rate >= 80 ? '#16a34a' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Shift breakdown */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-3">Response Rates by Shift</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4 font-semibold">Shift</th>
                <th className="py-2 pr-4 font-semibold">Schedule</th>
                <th className="py-2 pr-4 font-semibold">Patients</th>
                <th className="py-2 pr-4 font-semibold">Total Responses</th>
                <th className="py-2 font-semibold">Avg/Patient</th>
              </tr>
            </thead>
            <tbody>
              {data.shiftStats.map((s) => (
                <tr key={s.shiftId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium">{s.shiftName}</td>
                  <td className="py-2 pr-4 text-slate-500">{s.schedule}</td>
                  <td className="py-2 pr-4">{s.patients}</td>
                  <td className="py-2 pr-4">{s.totalResponses}</td>
                  <td className="py-2">
                    {s.patients > 0 ? (s.totalResponses / s.patients).toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Patient Management Tab ────────────────────────────────────────────────────
function PatientsTab({ shifts }: { shifts: Shift[] }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', shiftId: '', enrollmentDate: '', dryWeight: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterActive, setFilterActive] = useState(true)

  const loadPatients = useCallback(async () => {
    const res = await fetch('/api/patients')
    setPatients(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadPatients() }, [loadPatients])

  function openAdd() {
    setForm({ name: '', pin: '', shiftId: shifts[0]?.id.toString() ?? '', enrollmentDate: new Date().toISOString().slice(0, 10), dryWeight: '', notes: '' })
    setEditPatient(null)
    setShowAdd(true)
    setError(null)
  }

  function openEdit(patient: Patient) {
    setForm({
      name: patient.name,
      pin: '',
      shiftId: patient.shiftId.toString(),
      enrollmentDate: patient.enrollmentDate.slice(0, 10),
      dryWeight: patient.dryWeight?.toString() ?? '',
      notes: patient.notes ?? '',
    })
    setEditPatient(patient)
    setShowAdd(true)
    setError(null)
  }

  async function savePatient() {
    setSaving(true)
    setError(null)
    try {
      if (editPatient) {
        const body: Record<string, unknown> = {
          name: form.name,
          shiftId: parseInt(form.shiftId),
          enrollmentDate: form.enrollmentDate,
          dryWeight: form.dryWeight || null,
          notes: form.notes || null,
        }
        if (form.pin) body.pin = form.pin
        const res = await fetch(`/api/patients/${editPatient.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      } else {
        const res = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, pin: form.pin, shiftId: parseInt(form.shiftId), enrollmentDate: form.enrollmentDate, notes: form.notes || null }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      }
      setShowAdd(false)
      loadPatients()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deactivatePatient(id: number) {
    if (!confirm('Mark this patient as dropped out?')) return
    await fetch(`/api/patients/${id}`, { method: 'DELETE' })
    loadPatients()
  }

  const visible = patients.filter((p) => filterActive ? p.isActive : !p.isActive)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setFilterActive(true)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-semibold transition', filterActive ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
            Active ({patients.filter(p => p.isActive).length})
          </button>
          <button onClick={() => setFilterActive(false)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-semibold transition', !filterActive ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
            Dropped Out ({patients.filter(p => !p.isActive).length})
          </button>
        </div>
        <button onClick={openAdd} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition">
          + Add Patient
        </button>
      </div>

      {loading && <div className="text-center py-8 text-slate-400">Loading…</div>}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500 border-b">
              <th className="py-3 px-4 font-semibold">Name</th>
              <th className="py-3 px-4 font-semibold">Shift</th>
              <th className="py-3 px-4 font-semibold">Enrolled</th>
              <th className="py-3 px-4 font-semibold">Sessions</th>
              <th className="py-3 px-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium">{p.name}</td>
                <td className="py-2.5 px-4 text-slate-500">{p.shift.name}</td>
                <td className="py-2.5 px-4 text-slate-500">{p.enrollmentDate.slice(0, 10)}</td>
                <td className="py-2.5 px-4">{p._count.promResponses}</td>
                <td className="py-2.5 px-4 flex gap-2">
                  <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  {p.isActive && (
                    <button onClick={() => deactivatePatient(p.id)} className="text-red-500 hover:underline text-xs">Drop out</button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">No patients found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title={editPatient ? `Edit: ${editPatient.name}` : 'Add New Patient'} onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Full Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" placeholder="Maria Muster" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {editPatient ? 'New PIN (leave blank to keep)' : 'PIN (6 digits) *'}
              </label>
              <input
                type="text" inputMode="numeric" pattern="\d{6}" maxLength={6}
                value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                placeholder="e.g. 123456"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Shift *</label>
              <select value={form.shiftId} onChange={(e) => setForm((f) => ({ ...f, shiftId: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Enrollment Date *</label>
              <input type="date" value={form.enrollmentDate} onChange={(e) => setForm((f) => ({ ...f, enrollmentDate: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Target Dry Weight (kg, optional)</label>
              <input
                type="number" step="0.1" min="30" max="200"
                value={form.dryWeight} onChange={(e) => setForm((f) => ({ ...f, dryWeight: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                placeholder="e.g. 68.5"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Notes (optional)</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none" rows={2} />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-semibold">
                Cancel
              </button>
              <button onClick={savePatient} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:opacity-50">
                {saving ? 'Saving…' : editPatient ? 'Update' : 'Create Patient'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Provider Management Tab ───────────────────────────────────────────────────
function ProvidersTab({ shifts }: { shifts: Shift[] }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editProvider, setEditProvider] = useState<Provider | null>(null)
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'provider', shiftId: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    const res = await fetch('/api/providers')
    setProviders(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadProviders() }, [loadProviders])

  function openAdd() {
    setForm({ name: '', username: '', password: '', role: 'provider', shiftId: shifts[0]?.id.toString() ?? '' })
    setEditProvider(null)
    setShowAdd(true)
    setError(null)
  }

  function openEdit(p: Provider) {
    setForm({ name: p.name, username: p.username, password: '', role: p.role, shiftId: p.shiftId?.toString() ?? '' })
    setEditProvider(p)
    setShowAdd(true)
    setError(null)
  }

  async function saveProvider() {
    setSaving(true)
    setError(null)
    try {
      if (editProvider) {
        const body: Record<string, unknown> = { name: form.name, role: form.role, shiftId: form.shiftId ? parseInt(form.shiftId) : null }
        if (form.password) body.password = form.password
        const res = await fetch(`/api/providers/${editProvider.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      } else {
        const res = await fetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, username: form.username, password: form.password, role: form.role, shiftId: form.shiftId ? parseInt(form.shiftId) : null }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      }
      setShowAdd(false)
      loadProviders()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openAdd} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition">
          + Add Provider
        </button>
      </div>

      {loading && <div className="text-center py-8 text-slate-400">Loading…</div>}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500 border-b">
              <th className="py-3 px-4 font-semibold">Name</th>
              <th className="py-3 px-4 font-semibold">Username</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Shift</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium">{p.name}</td>
                <td className="py-2.5 px-4 text-slate-500 font-mono text-xs">{p.username}</td>
                <td className="py-2.5 px-4">
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', p.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                    {p.role}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-500">{p.shift?.name ?? '—'}</td>
                <td className="py-2.5 px-4">
                  <span className={clsx('text-xs font-semibold', p.isActive ? 'text-green-600' : 'text-slate-400')}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-2.5 px-4">
                  <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title={editProvider ? `Edit: ${editProvider.name}` : 'Add Provider'} onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Full Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" placeholder="Dr. Anna Beispiel" />
            </div>
            {!editProvider && (
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Username *</label>
                <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" placeholder="a.beispiel" />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {editProvider ? 'New Password (leave blank to keep)' : 'Password * (min. 8 chars)'}
              </label>
              <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Role *</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                <option value="provider">Provider (Nurse / Physician)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === 'provider' && (
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Assigned Shift</label>
                <select value={form.shiftId} onChange={(e) => setForm((f) => ({ ...f, shiftId: e.target.value }))}
                  className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                  <option value="">— No shift —</option>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-semibold">Cancel</button>
              <button onClick={saveProvider} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:opacity-50">
                {saving ? 'Saving…' : editProvider ? 'Update' : 'Create Provider'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Config Tab ────────────────────────────────────────────────────────────────
function ConfigTab() {
  const [config, setConfig] = useState<any>(null)
  const [startDate, setStartDate] = useState('')
  const [studyName, setStudyName] = useState('HARMONY')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then((d) => {
      setConfig(d)
      if (d.studyStartDate) setStartDate(d.studyStartDate.slice(0, 10))
      if (d.studyName) setStudyName(d.studyName)
    })
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyStartDate: startDate, studyName }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json()
      setConfig(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">Study Configuration</h3>

        {config?.isActive && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-800 font-semibold">Study is ACTIVE</p>
            <p className="text-green-700 text-sm">Current week: {config.currentStudyWeek} / 12</p>
            <p className="text-green-700 text-sm">Current timepoint: {config.currentTimepoint}</p>
          </div>
        )}

        {config && !config.isActive && config.configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-amber-800 font-semibold">Study is not active</p>
            <p className="text-amber-700 text-sm">Check the start date — study may be in the future or already completed.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Study Name</label>
          <input value={studyName} onChange={(e) => setStudyName(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Study Start Date *</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
          <p className="text-slate-400 text-xs mt-1">
            Week 1 starts on this date. The timepoint cycle (yesterday → arrival → now) repeats every 3 weeks.
          </p>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

        <button onClick={save} disabled={saving || !startDate}
          className={clsx('w-full py-3 rounded-xl font-semibold transition', saved ? 'bg-green-600 text-white' : 'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50')}>
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Configuration'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-3">Timepoint Cycle Reference</h3>
        <div className="space-y-2 text-sm">
          {[1,2,3,4,5,6,7,8,9,10,11,12].map((week) => {
            const cycle = ((week - 1) % 3)
            const tp = cycle === 0 ? 'yesterday' : cycle === 1 ? 'arrival' : 'now'
            const colors: Record<string, string> = { yesterday: 'bg-blue-50 text-blue-700', arrival: 'bg-amber-50 text-amber-700', now: 'bg-green-50 text-green-700' }
            return (
              <div key={week} className="flex items-center gap-3">
                <span className="text-slate-500 w-14">Week {week}</span>
                <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', colors[tp])}>{tp}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── CSV Import Tab ────────────────────────────────────────────────────────────
function ImportTab() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload() {
    if (!file) return
    setUploading(true)
    setResult(null)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/admin/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">Import Clinical / Dialysis Data</h3>
        <p className="text-slate-500 text-sm">
          Upload a CSV file with one row per patient per session date. Patient names must match exactly.
        </p>

        {/* Expected format */}
        <div className="bg-slate-50 rounded-xl p-4 font-mono text-xs text-slate-600 overflow-x-auto">
          <p className="font-semibold text-slate-700 mb-1 font-sans text-xs">Expected CSV columns (header row required):</p>
          <p>patient_name, date, pre_dialysis_weight, idwg, systolic_bp, diastolic_bp</p>
          <p className="mt-2 text-slate-400 font-sans">
            Column names are flexible — e.g. "name", "weight", "sbp" are also accepted.<br />
            Date format: YYYY-MM-DD &nbsp;·&nbsp; All clinical columns are optional.<br />
            Existing rows for the same patient + date are updated (upsert).
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-2">Select CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null) }}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold hover:file:bg-blue-100 cursor-pointer"
          />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

        <button
          onClick={upload}
          disabled={!file || uploading}
          className="w-full py-3 rounded-xl bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:opacity-40 transition"
        >
          {uploading ? 'Importing…' : 'Upload & Import'}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-3">
          <h4 className="font-bold text-slate-800">Import Result</h4>
          <div className="flex gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-green-700">{result.imported}</p>
              <p className="text-xs text-green-600 font-semibold">Imported</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-amber-700">{result.skipped}</p>
              <p className="text-xs text-amber-600 font-semibold">Skipped</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-red-600 mb-2">Errors ({result.errors.length}):</p>
              <div className="bg-red-50 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 font-mono">{e}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────
export default function AdminPanel({ adminName }: { adminName: string }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [shifts, setShifts] = useState<Shift[]>([])

  useEffect(() => {
    fetch('/api/shifts').then((r) => r.json()).then(setShifts)
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Feasibility' },
    { id: 'patients', label: 'Patients' },
    { id: 'providers', label: 'Providers' },
    { id: 'config', label: 'Study Config' },
    { id: 'import', label: 'Import Data' },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-blue-900 text-white px-6 py-4 shadow flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">HARMONY · Admin Panel</h1>
          <p className="text-blue-200 text-sm">{adminName}</p>
        </div>
        <div className="flex gap-3">
          <a href="/provider" className="text-blue-200 hover:text-white text-sm border border-blue-600 px-3 py-1.5 rounded-lg transition">
            Provider View
          </a>
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-blue-200 hover:text-white text-sm border border-blue-600 px-3 py-1.5 rounded-lg transition">
            Sign Out
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b shadow-sm px-4">
        <div className="flex max-w-5xl mx-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'px-5 py-3.5 text-sm font-semibold border-b-2 transition',
                tab === t.id
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto p-4 py-6">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'patients' && <PatientsTab shifts={shifts} />}
        {tab === 'providers' && <ProvidersTab shifts={shifts} />}
        {tab === 'config' && <ConfigTab />}
        {tab === 'import' && <ImportTab />}
      </main>
    </div>
  )
}
