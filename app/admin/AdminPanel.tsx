'use client'
import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from 'recharts'
import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { loess } from '@/lib/loess'

// ── Types ─────────────────────────────────────────────────────────────────────
type Lang = 'en' | 'de'

interface Shift {
  id: number
  name: string
  schedule: string
  timeOfDay: string
}

interface Patient {
  id: number
  patientCode: string
  shiftId: number
  center: string
  dialysisSchedule: string
  customDialysisDays: string | null
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
  center: string | null
  isActive: boolean
  shift: { name: string } | null
}

const CENTERS = ['Feldbach', 'Vienna']
const SCHEDULE_OPTIONS = {
  en: [
    { value: 'MWF',    label: 'MWF (Mon-Wed-Fri)' },
    { value: 'TThS',   label: 'TThS (Tue-Thu-Sat)' },
    { value: 'custom', label: 'Custom' },
  ],
  de: [
    { value: 'MWF',    label: 'MWF (Mo-Mi-Fr)' },
    { value: 'TThS',   label: 'TThS (Di-Do-Sa)' },
    { value: 'custom', label: 'Individuell' },
  ],
}
const DAY_LABELS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  de: ['So',  'Mo',  'Di',  'Mi',  'Do',  'Fr',  'Sa'],
}

interface DashboardData {
  recruitment: { total: number; active: number; droppedOut: number }
  currentStudyWeek: number | null
  todaySubmissions: number
  totalResponses: number
  weeklyStats: { week: number; submitted: number; expected: number; rate: number }[]
  shiftStats: { shiftId: number; shiftName: string; schedule: string; patients: number; totalResponses: number; uniqueSubmitters: number; completionPct: number }[]
}

type Tab = 'dashboard' | 'patients' | 'providers' | 'config' | 'import' | 'usage' | 'verlauf' | 'sessions'

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
function DashboardTab({ lang, siteFilter }: { lang: Lang; siteFilter: string }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const q = siteFilter !== 'all' ? `?center=${encodeURIComponent(siteFilter)}` : ''
    fetch(`/api/admin/dashboard${q}`).then((r) => r.json()).then(setData).finally(() => setLoading(false))
  }, [siteFilter])

  if (loading) return <div className="text-center py-12 text-slate-400">{lang === 'de' ? 'Lade Dashboard…' : 'Loading dashboard…'}</div>
  if (!data) return <div className="text-center py-12 text-red-400">{lang === 'de' ? 'Laden fehlgeschlagen' : 'Failed to load'}</div>

  const completionData = data.weeklyStats.map((w) => ({
    name: `W${w.week}`,
    rate: w.rate,
    submitted: w.submitted,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={lang === 'de' ? 'Patienten gesamt' : 'Total Patients'} value={data.recruitment.total} color="blue" />
        <StatCard label={lang === 'de' ? 'Aktiv' : 'Active'} value={data.recruitment.active} color="green" />
        <StatCard label={lang === 'de' ? 'Ausgeschieden' : 'Dropped Out'} value={data.recruitment.droppedOut} color="red" />
        <StatCard label={lang === 'de' ? 'Eingaben heute' : "Today's Submissions"} value={data.todaySubmissions} color="amber" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label={lang === 'de' ? 'Aktuelle Studienwoche' : 'Current Study Week'} value={data.currentStudyWeek ?? (lang === 'de' ? 'Nicht aktiv' : 'Not active')} color="blue" />
        <StatCard label={lang === 'de' ? 'PROM-Antworten gesamt' : 'Total PROM Responses'} value={data.totalResponses} color="green" />
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">
          {lang === 'de' ? 'Abschlussrate je Studienwoche (%)' : 'Completion Rate by Study Week (%)'}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={completionData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name) => [`${value}${name === 'rate' ? '%' : ''}`, name === 'rate' ? (lang === 'de' ? 'Rate' : 'Rate') : (lang === 'de' ? 'Anzahl' : 'Count')]}
            />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {completionData.map((entry, i) => (
                <Cell key={i} fill={entry.rate >= 80 ? '#16a34a' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-3">
          {lang === 'de' ? 'Antwortrate je Schicht' : 'Response Rates by Shift'}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Schicht' : 'Shift'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Turnus' : 'Schedule'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Patienten' : 'Patients'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Antworten gesamt' : 'Total Responses'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Teilnehmer' : 'Submitters'}</th>
                <th className="py-2 font-semibold">{lang === 'de' ? 'Abschlussrate' : 'Completion %'}</th>
              </tr>
            </thead>
            <tbody>
              {data.shiftStats.map((s) => (
                <tr key={s.shiftId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium">{s.shiftName}</td>
                  <td className="py-2 pr-4 text-slate-500">{s.schedule}</td>
                  <td className="py-2 pr-4">{s.patients}</td>
                  <td className="py-2 pr-4">{s.totalResponses}</td>
                  <td className="py-2 pr-4">{s.uniqueSubmitters ?? '—'}</td>
                  <td className="py-2">
                    <span className={clsx('font-semibold', (s.completionPct ?? 0) >= 80 ? 'text-green-600' : (s.completionPct ?? 0) >= 50 ? 'text-amber-600' : 'text-red-500')}>
                      {s.completionPct != null ? `${s.completionPct}%` : '—'}
                    </span>
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
function PatientsTab({ shifts, lang }: { shifts: Shift[]; lang: Lang }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [form, setForm] = useState({
    patientCode: '', pin: '', shiftId: '', center: 'Feldbach',
    dialysisSchedule: 'MWF', customDialysisDays: '',
    enrollmentDate: '', dryWeight: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterActive, setFilterActive] = useState(true)
  const [centerFilter, setCenterFilter] = useState<string>('all')

  const loadPatients = useCallback(async () => {
    const res = await fetch('/api/patients')
    setPatients(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadPatients() }, [loadPatients])

  function openAdd() {
    setForm({ patientCode: '', pin: '', shiftId: shifts[0]?.id.toString() ?? '', center: 'Feldbach', dialysisSchedule: 'MWF', customDialysisDays: '', enrollmentDate: new Date().toISOString().slice(0, 10), dryWeight: '', notes: '' })
    setEditPatient(null)
    setShowAdd(true)
    setError(null)
  }

  function openEdit(patient: Patient) {
    setForm({
      patientCode: patient.patientCode,
      pin: '',
      shiftId: patient.shiftId.toString(),
      center: patient.center,
      dialysisSchedule: patient.dialysisSchedule,
      customDialysisDays: patient.customDialysisDays ?? '',
      enrollmentDate: patient.enrollmentDate.slice(0, 10),
      dryWeight: patient.dryWeight?.toString() ?? '',
      notes: patient.notes ?? '',
    })
    setEditPatient(patient)
    setShowAdd(true)
    setError(null)
  }

  function toggleCustomDay(day: number) {
    const current = form.customDialysisDays ? form.customDialysisDays.split(',').map(Number).filter(Boolean) : []
    const updated = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    setForm((f) => ({ ...f, customDialysisDays: updated.join(',') }))
  }

  async function savePatient() {
    setSaving(true)
    setError(null)
    try {
      const schedulePayload = {
        dialysisSchedule: form.dialysisSchedule,
        customDialysisDays: form.dialysisSchedule === 'custom' ? (form.customDialysisDays || null) : null,
      }
      if (editPatient) {
        const body: Record<string, unknown> = {
          patientCode: form.patientCode.toUpperCase(),
          shiftId: parseInt(form.shiftId),
          center: form.center,
          ...schedulePayload,
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
          body: JSON.stringify({ patientCode: form.patientCode.toUpperCase(), pin: form.pin, shiftId: parseInt(form.shiftId), center: form.center, ...schedulePayload, enrollmentDate: form.enrollmentDate, notes: form.notes || null }),
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
    if (!confirm(lang === 'de' ? 'Patient als ausgeschieden markieren?' : 'Mark this patient as dropped out?')) return
    await fetch(`/api/patients/${id}`, { method: 'DELETE' })
    loadPatients()
  }

  const days = DAY_LABELS[lang]
  const scheduleLabel = (p: Patient) => {
    if (p.dialysisSchedule === 'MWF') return 'MWF'
    if (p.dialysisSchedule === 'TThS') return 'TThS'
    if (p.dialysisSchedule === 'custom' && p.customDialysisDays) {
      return p.customDialysisDays.split(',').map(Number).map((d) => days[d]).join('-')
    }
    return p.dialysisSchedule
  }

  const customDaysArr = form.customDialysisDays ? form.customDialysisDays.split(',').map(Number).filter(Boolean) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterActive(true)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-semibold transition', filterActive ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
            {lang === 'de' ? 'Aktiv' : 'Active'} ({patients.filter(p => p.isActive).length})
          </button>
          <button onClick={() => setFilterActive(false)} className={clsx('px-3 py-1.5 rounded-lg text-sm font-semibold transition', !filterActive ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
            {lang === 'de' ? 'Ausgeschieden' : 'Dropped Out'} ({patients.filter(p => !p.isActive).length})
          </button>
          <select value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-600 bg-white">
            <option value="all">{lang === 'de' ? 'Alle Zentren' : 'All Centers'}</option>
            {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={openAdd} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition">
          {lang === 'de' ? '+ Patient hinzufügen' : '+ Add Patient'}
        </button>
      </div>

      {loading && <div className="text-center py-8 text-slate-400">{lang === 'de' ? 'Lade…' : 'Loading…'}</div>}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500 border-b">
              <th className="py-3 px-4 font-semibold">Code</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Zentrum' : 'Center'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Turnus' : 'Schedule'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Schicht' : 'Shift'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Einschr.' : 'Enrolled'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Sitzungen' : 'Sessions'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Aktionen' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {patients.filter((p) => {
              if (filterActive ? !p.isActive : p.isActive) return false
              if (centerFilter !== 'all' && p.center !== centerFilter) return false
              return true
            }).map((p) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono font-semibold text-blue-700">{p.patientCode}</td>
                <td className="py-2.5 px-4 text-slate-600">{p.center}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs">{scheduleLabel(p)}</td>
                <td className="py-2.5 px-4 text-slate-500">{p.shift.name}</td>
                <td className="py-2.5 px-4 text-slate-500">{p.enrollmentDate.slice(0, 10)}</td>
                <td className="py-2.5 px-4">{p._count.promResponses}</td>
                <td className="py-2.5 px-4 flex gap-2">
                  <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs">
                    {lang === 'de' ? 'Bearbeiten' : 'Edit'}
                  </button>
                  {p.isActive && (
                    <button onClick={() => deactivatePatient(p.id)} className="text-red-500 hover:underline text-xs">
                      {lang === 'de' ? 'Ausscheiden' : 'Drop out'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {patients.filter((p) => filterActive ? p.isActive : !p.isActive).length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">
                {lang === 'de' ? 'Keine Patienten gefunden' : 'No patients found'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal
          title={editPatient
            ? `${lang === 'de' ? 'Bearbeiten' : 'Edit'}: ${editPatient.patientCode}`
            : (lang === 'de' ? 'Neuen Patienten hinzufügen' : 'Add New Patient')}
          onClose={() => setShowAdd(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Patientencode * (HMY-XXXX)' : 'Patient Code * (HMY-XXXX)'}
              </label>
              <input value={form.patientCode} onChange={(e) => setForm((f) => ({ ...f, patientCode: e.target.value.toUpperCase() }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-blue-500" placeholder="HMY-0001" maxLength={8} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {editPatient
                  ? (lang === 'de' ? 'Neue PIN (leer lassen = unverändert)' : 'New PIN (leave blank to keep)')
                  : (lang === 'de' ? 'PIN (6 Stellen) *' : 'PIN (6 digits) *')}
              </label>
              <input
                type="text" inputMode="numeric" pattern="\d{6}" maxLength={6}
                value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                placeholder={lang === 'de' ? 'z.B. 123456' : 'e.g. 123456'}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Zentrum *' : 'Center *'}
              </label>
              <select value={form.center} onChange={(e) => setForm((f) => ({ ...f, center: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Dialyseturnus *' : 'Dialysis Schedule *'}
              </label>
              <select value={form.dialysisSchedule} onChange={(e) => setForm((f) => ({ ...f, dialysisSchedule: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                {SCHEDULE_OPTIONS[lang].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {form.dialysisSchedule === 'custom' && (
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">
                  {lang === 'de' ? 'Dialysetage auswählen' : 'Select dialysis days'}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleCustomDay(day)}
                      className={clsx(
                        'w-10 h-10 rounded-lg text-sm font-semibold border-2 transition',
                        customDaysArr.includes(day)
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                      )}
                    >
                      {days[day]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Schicht *' : 'Shift *'}
              </label>
              <select value={form.shiftId} onChange={(e) => setForm((f) => ({ ...f, shiftId: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Einschreibedatum *' : 'Enrollment Date *'}
              </label>
              <input type="date" value={form.enrollmentDate} onChange={(e) => setForm((f) => ({ ...f, enrollmentDate: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Zielgewicht (kg, optional)' : 'Target Dry Weight (kg, optional)'}
              </label>
              <input
                type="number" step="0.1" min="30" max="200"
                value={form.dryWeight} onChange={(e) => setForm((f) => ({ ...f, dryWeight: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                placeholder={lang === 'de' ? 'z.B. 68,5' : 'e.g. 68.5'}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Notizen (optional)' : 'Notes (optional)'}
              </label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none" rows={2} />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-semibold">
                {lang === 'de' ? 'Abbrechen' : 'Cancel'}
              </button>
              <button onClick={savePatient} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:opacity-50">
                {saving
                  ? (lang === 'de' ? 'Speichert…' : 'Saving…')
                  : editPatient
                  ? (lang === 'de' ? 'Aktualisieren' : 'Update')
                  : (lang === 'de' ? 'Patient anlegen' : 'Create Patient')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Provider Management Tab ───────────────────────────────────────────────────
function ProvidersTab({ shifts, lang }: { shifts: Shift[]; lang: Lang }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editProvider, setEditProvider] = useState<Provider | null>(null)
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'provider', shiftId: '', center: 'Feldbach' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    const res = await fetch('/api/providers')
    setProviders(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadProviders() }, [loadProviders])

  function openAdd() {
    setForm({ name: '', username: '', password: '', role: 'provider', shiftId: shifts[0]?.id.toString() ?? '', center: 'Feldbach' })
    setEditProvider(null)
    setShowAdd(true)
    setError(null)
  }

  function openEdit(p: Provider) {
    setForm({ name: p.name, username: p.username, password: '', role: p.role, shiftId: p.shiftId?.toString() ?? '', center: p.center ?? 'Feldbach' })
    setEditProvider(p)
    setShowAdd(true)
    setError(null)
  }

  async function saveProvider() {
    setSaving(true)
    setError(null)
    try {
      if (editProvider) {
        const body: Record<string, unknown> = { name: form.name, role: form.role, shiftId: form.shiftId ? parseInt(form.shiftId) : null, center: form.role === 'provider' ? form.center : null }
        if (form.password) body.password = form.password
        const res = await fetch(`/api/providers/${editProvider.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      } else {
        const res = await fetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, username: form.username, password: form.password, role: form.role, shiftId: form.shiftId ? parseInt(form.shiftId) : null, center: form.role === 'provider' ? form.center : null }),
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
          {lang === 'de' ? '+ Mitarbeiter hinzufügen' : '+ Add Provider'}
        </button>
      </div>

      {loading && <div className="text-center py-8 text-slate-400">{lang === 'de' ? 'Lade…' : 'Loading…'}</div>}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500 border-b">
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Name' : 'Name'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Benutzername' : 'Username'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Rolle' : 'Role'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Zentrum' : 'Center'}</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Schicht' : 'Shift'}</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">{lang === 'de' ? 'Aktionen' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium">{p.name}</td>
                <td className="py-2.5 px-4 text-slate-500 font-mono text-xs">{p.username}</td>
                <td className="py-2.5 px-4">
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', p.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                    {p.role === 'admin' ? 'Admin' : (lang === 'de' ? 'Mitarbeiter' : 'Provider')}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-500">{p.center ?? '—'}</td>
                <td className="py-2.5 px-4 text-slate-500">{p.shift?.name ?? '—'}</td>
                <td className="py-2.5 px-4">
                  <span className={clsx('text-xs font-semibold', p.isActive ? 'text-green-600' : 'text-slate-400')}>
                    {p.isActive ? (lang === 'de' ? 'Aktiv' : 'Active') : (lang === 'de' ? 'Inaktiv' : 'Inactive')}
                  </span>
                </td>
                <td className="py-2.5 px-4">
                  <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs">
                    {lang === 'de' ? 'Bearbeiten' : 'Edit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal
          title={editProvider
            ? `${lang === 'de' ? 'Bearbeiten' : 'Edit'}: ${editProvider.name}`
            : (lang === 'de' ? 'Mitarbeiter hinzufügen' : 'Add Provider')}
          onClose={() => setShowAdd(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Vollständiger Name *' : 'Full Name *'}
              </label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" placeholder="Dr. Anna Beispiel" />
            </div>
            {!editProvider && (
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  {lang === 'de' ? 'Benutzername *' : 'Username *'}
                </label>
                <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" placeholder="a.beispiel" />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {editProvider
                  ? (lang === 'de' ? 'Neues Passwort (leer lassen = unverändert)' : 'New Password (leave blank to keep)')
                  : (lang === 'de' ? 'Passwort * (mind. 8 Zeichen)' : 'Password * (min. 8 chars)')}
              </label>
              <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Rolle *' : 'Role *'}
              </label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                <option value="provider">{lang === 'de' ? 'Pflegepersonal / Arzt' : 'Provider (Nurse / Physician)'}</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === 'provider' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    {lang === 'de' ? 'Zentrum *' : 'Center *'}
                  </label>
                  <select value={form.center} onChange={(e) => setForm((f) => ({ ...f, center: e.target.value }))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                    {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    {lang === 'de' ? 'Zugewiesene Schicht' : 'Assigned Shift'}
                  </label>
                  <select value={form.shiftId} onChange={(e) => setForm((f) => ({ ...f, shiftId: e.target.value }))}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                    <option value="">{lang === 'de' ? '— Keine Schicht —' : '— No shift —'}</option>
                    {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </>
            )}
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-semibold">
                {lang === 'de' ? 'Abbrechen' : 'Cancel'}
              </button>
              <button onClick={saveProvider} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:opacity-50">
                {saving
                  ? (lang === 'de' ? 'Speichert…' : 'Saving…')
                  : editProvider
                  ? (lang === 'de' ? 'Aktualisieren' : 'Update')
                  : (lang === 'de' ? 'Mitarbeiter anlegen' : 'Create Provider')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Config Tab ────────────────────────────────────────────────────────────────
function ConfigTab({ lang }: { lang: Lang }) {
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

  const TP_LABELS: Record<string, { en: string; de: string }> = {
    yesterday: { en: 'yesterday', de: 'gestern' },
    arrival:   { en: 'arrival',   de: 'Ankunft' },
    now:       { en: 'now',       de: 'jetzt' },
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">
          {lang === 'de' ? 'Studien-Konfiguration' : 'Study Configuration'}
        </h3>

        {config?.isActive && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-800 font-semibold">{lang === 'de' ? 'Studie AKTIV' : 'Study is ACTIVE'}</p>
            <p className="text-green-700 text-sm">{lang === 'de' ? 'Aktuelle Woche' : 'Current week'}: {config.currentStudyWeek} / 12</p>
            <p className="text-green-700 text-sm">{lang === 'de' ? 'Aktueller Zeitpunkt' : 'Current timepoint'}: {config.currentTimepoint}</p>
          </div>
        )}

        {config && !config.isActive && config.configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-amber-800 font-semibold">{lang === 'de' ? 'Studie nicht aktiv' : 'Study is not active'}</p>
            <p className="text-amber-700 text-sm">
              {lang === 'de'
                ? 'Startdatum prüfen — Studie liegt in der Zukunft oder ist bereits abgeschlossen.'
                : 'Check the start date — study may be in the future or already completed.'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">
            {lang === 'de' ? 'Studienname' : 'Study Name'}
          </label>
          <input value={studyName} onChange={(e) => setStudyName(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">
            {lang === 'de' ? 'Studienstartdatum *' : 'Study Start Date *'}
          </label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
          <p className="text-slate-400 text-xs mt-1">
            {lang === 'de'
              ? 'Woche 1 beginnt an diesem Datum. Der Zeitpunktzyklus (gestern → Ankunft → jetzt) wiederholt sich alle 3 Wochen.'
              : 'Week 1 starts on this date. The timepoint cycle (yesterday → arrival → now) repeats every 3 weeks.'}
          </p>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

        <button onClick={save} disabled={saving || !startDate}
          className={clsx('w-full py-3 rounded-xl font-semibold transition', saved ? 'bg-green-600 text-white' : 'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50')}>
          {saving
            ? (lang === 'de' ? 'Speichert…' : 'Saving…')
            : saved
            ? (lang === 'de' ? 'Gespeichert!' : 'Saved!')
            : (lang === 'de' ? 'Konfiguration speichern' : 'Save Configuration')}
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-3">
          {lang === 'de' ? 'Zeitpunktzyklus-Referenz' : 'Timepoint Cycle Reference'}
        </h3>
        <div className="space-y-2 text-sm">
          {[1,2,3,4,5,6,7,8,9,10,11,12].map((week) => {
            const cycle = ((week - 1) % 3)
            const tp = cycle === 0 ? 'yesterday' : cycle === 1 ? 'arrival' : 'now'
            const colors: Record<string, string> = { yesterday: 'bg-blue-50 text-blue-700', arrival: 'bg-amber-50 text-amber-700', now: 'bg-green-50 text-green-700' }
            return (
              <div key={week} className="flex items-center gap-3">
                <span className="text-slate-500 w-16">{lang === 'de' ? 'Woche' : 'Week'} {week}</span>
                <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', colors[tp])}>
                  {TP_LABELS[tp][lang]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── CSV Import Tab ────────────────────────────────────────────────────────────
function ImportTab({ lang }: { lang: Lang }) {
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
        <h3 className="font-bold text-slate-800 text-lg">
          {lang === 'de' ? 'Klinische / Dialysedaten importieren' : 'Import Clinical / Dialysis Data'}
        </h3>
        <p className="text-slate-500 text-sm">
          {lang === 'de'
            ? 'CSV-Datei hochladen mit einer Zeile pro Patient und Sitzungsdatum. Patientencodes (HMY-XXXX) müssen exakt übereinstimmen.'
            : 'Upload a CSV file with one row per patient per session date. Patient codes (HMY-XXXX) must match exactly.'}
        </p>

        <div className="bg-slate-50 rounded-xl p-4 font-mono text-xs text-slate-600 overflow-x-auto">
          <p className="font-semibold text-slate-700 mb-1 font-sans text-xs">
            {lang === 'de' ? 'Erwartete CSV-Spalten (Kopfzeile erforderlich):' : 'Expected CSV columns (header row required):'}
          </p>
          <p>patient_code, date, pre_dialysis_weight, idwg, systolic_bp, diastolic_bp</p>
          <p className="mt-2 text-slate-400 font-sans">
            {lang === 'de'
              ? <>Spaltennamen sind flexibel — z.B. „code", „weight", „sbp" werden ebenfalls akzeptiert.<br />Datumsformat: JJJJ-MM-TT &nbsp;·&nbsp; Alle klinischen Spalten sind optional.<br />Bestehende Zeilen für denselben Patienten + Datum werden aktualisiert (Upsert).</>
              : <>Column names are flexible — e.g. "code", "weight", "sbp" are also accepted.<br />Date format: YYYY-MM-DD &nbsp;·&nbsp; All clinical columns are optional.<br />Existing rows for the same patient + date are updated (upsert).</>}
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-2">
            {lang === 'de' ? 'CSV-Datei auswählen' : 'Select CSV file'}
          </label>
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
          {uploading
            ? (lang === 'de' ? 'Importiert…' : 'Importing…')
            : (lang === 'de' ? 'Hochladen & Importieren' : 'Upload & Import')}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-3">
          <h4 className="font-bold text-slate-800">
            {lang === 'de' ? 'Importergebnis' : 'Import Result'}
          </h4>
          <div className="flex gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-green-700">{result.imported}</p>
              <p className="text-xs text-green-600 font-semibold">{lang === 'de' ? 'Importiert' : 'Imported'}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-amber-700">{result.skipped}</p>
              <p className="text-xs text-amber-600 font-semibold">{lang === 'de' ? 'Übersprungen' : 'Skipped'}</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-red-600 mb-2">
                {lang === 'de' ? `Fehler (${result.errors.length}):` : `Errors (${result.errors.length}):`}
              </p>
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

// ── Usage / Activity Tab ──────────────────────────────────────────────────────
interface PatientActivity { patientId: number; patientCode: string; center: string; isActive: boolean; loginCount: number; promCount: number; lastLogin: string | null; lastProm: string | null }
interface ProviderActivity { providerId: number; name: string; center: string | null; role: string; isActive: boolean; loginCount: number; viewCount: number; promCount: number; lastLogin: string | null; lastView: string | null }
interface CenterActivity { center: string; patientLogins: number; providerLogins: number; promSubmits: number; dataViews: number }
interface DailyActivity { date: string; logins: number; proms: number; views: number }
interface ActivityData { patientActivity: PatientActivity[]; providerActivity: ProviderActivity[]; centerActivity: CenterActivity[]; dailyActivity: DailyActivity[] }

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return format(parseISO(iso), 'dd.MM.yy HH:mm')
}

function UsageTab({ lang, siteFilter }: { lang: Lang; siteFilter: string }) {
  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [patientSort, setPatientSort] = useState<'loginCount' | 'promCount'>('loginCount')
  const [centerFilter, setCenterFilter] = useState<string>(siteFilter)
  useEffect(() => { setCenterFilter(siteFilter) }, [siteFilter])

  useEffect(() => {
    fetch('/api/admin/activity').then((r) => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-slate-400">{lang === 'de' ? 'Lade Nutzungsdaten…' : 'Loading usage data…'}</div>
  if (!data) return <div className="text-center py-12 text-red-400">{lang === 'de' ? 'Laden fehlgeschlagen' : 'Failed to load'}</div>

  const maxDaily = Math.max(...data.dailyActivity.map((d) => d.logins + d.proms + d.views), 1)

  const filteredPatients = data.patientActivity
    .filter((p) => centerFilter === 'all' || p.center === centerFilter)
    .sort((a, b) => b[patientSort] - a[patientSort])

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={lang === 'de' ? 'Logins gesamt' : 'Total Logins'}
          value={data.patientActivity.reduce((s, p) => s + p.loginCount, 0) + data.providerActivity.reduce((s, p) => s + p.loginCount, 0)}
          color="blue"
        />
        <StatCard
          label={lang === 'de' ? 'Patienten-Logins' : 'Patient Logins'}
          value={data.patientActivity.reduce((s, p) => s + p.loginCount, 0)}
          color="blue"
        />
        <StatCard
          label={lang === 'de' ? 'PROM-Eingaben' : 'PROM Submits'}
          value={data.patientActivity.reduce((s, p) => s + p.promCount, 0)}
          color="green"
        />
        <StatCard
          label={lang === 'de' ? 'Datenanzeigen' : 'Data Views'}
          value={data.providerActivity.reduce((s, p) => s + p.viewCount, 0)}
          color="amber"
        />
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-slate-500 self-center font-semibold uppercase tracking-wide">{lang === 'de' ? 'Export:' : 'Export:'}</span>
        {[
          { label: lang === 'de' ? 'PROM-Daten (CSV)' : 'PROM Data (CSV)', href: '/api/admin/export?type=prom' },
          { label: lang === 'de' ? 'Klinische Daten (CSV)' : 'Clinical Data (CSV)', href: '/api/admin/export?type=clinical' },
          { label: lang === 'de' ? 'Nutzung Patienten (CSV)' : 'Usage Patients (CSV)', href: '/api/admin/export-usage?type=patients' },
          { label: lang === 'de' ? 'Nutzung Personal (CSV)' : 'Usage Providers (CSV)', href: '/api/admin/export-usage?type=providers' },
        ].map(({ label, href }) => (
          <a key={href} href={href} download
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold transition border border-slate-200">
            ↓ {label}
          </a>
        ))}
      </div>

      {/* Daily activity chart (last 30d) */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">
          {lang === 'de' ? 'Tägliche Aktivität (letzte 30 Tage)' : 'Daily Activity (last 30 days)'}
        </h3>
        <div className="flex items-end gap-0.5 h-24 w-full">
          {data.dailyActivity.map((d) => {
            const total = d.logins + d.proms + d.views
            const loginH = Math.round((d.logins / maxDaily) * 100)
            const promH  = Math.round((d.proms  / maxDaily) * 100)
            const viewH  = Math.round((d.views  / maxDaily) * 100)
            return (
              <div key={d.date} className="flex-1 flex flex-col justify-end gap-0" title={`${d.date}\n${lang === 'de' ? 'Logins' : 'Logins'}: ${d.logins}\nPROMs: ${d.proms}\n${lang === 'de' ? 'Ansichten' : 'Views'}: ${d.views}`}>
                {viewH > 0  && <div style={{ height: `${viewH}%` }}  className="bg-amber-400 rounded-sm" />}
                {promH > 0  && <div style={{ height: `${promH}%` }}  className="bg-green-500 rounded-sm" />}
                {loginH > 0 && <div style={{ height: `${loginH}%` }} className="bg-blue-500 rounded-sm" />}
                {total === 0 && <div className="h-0.5 bg-slate-100 rounded-sm" />}
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span><span className="inline-block w-3 h-3 rounded bg-blue-500 mr-1 align-middle" />{lang === 'de' ? 'Logins' : 'Logins'}</span>
          <span><span className="inline-block w-3 h-3 rounded bg-green-500 mr-1 align-middle" />PROMs</span>
          <span><span className="inline-block w-3 h-3 rounded bg-amber-400 mr-1 align-middle" />{lang === 'de' ? 'Ansichten' : 'Views'}</span>
        </div>
      </div>

      {/* Per-center summary */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">{lang === 'de' ? 'Nutzung je Zentrum (gesamt)' : 'Usage by Center (all-time)'}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b text-xs uppercase tracking-wide">
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Zentrum' : 'Center'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Pat.-Logins' : 'Pat. Logins'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'MA-Logins' : 'Staff Logins'}</th>
                <th className="py-2 pr-4 font-semibold">PROMs</th>
                <th className="py-2 font-semibold">{lang === 'de' ? 'Ansichten' : 'Views'}</th>
              </tr>
            </thead>
            <tbody>
              {data.centerActivity.map((c) => (
                <tr key={c.center} className="border-b border-slate-50">
                  <td className="py-2 pr-4 font-medium">{c.center}</td>
                  <td className="py-2 pr-4">{c.patientLogins}</td>
                  <td className="py-2 pr-4">{c.providerLogins}</td>
                  <td className="py-2 pr-4">{c.promSubmits}</td>
                  <td className="py-2">{c.dataViews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-provider activity */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">{lang === 'de' ? 'Mitarbeiter-Aktivität (gesamt)' : 'Provider Activity (all-time)'}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b text-xs uppercase tracking-wide">
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Name' : 'Name'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Rolle' : 'Role'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Zentrum' : 'Center'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Logins' : 'Logins'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Ansichten' : 'Views'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'PROMs erfasst' : 'PROMs entered'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Letzter Login' : 'Last Login'}</th>
                <th className="py-2 font-semibold">{lang === 'de' ? 'Letzte Ansicht' : 'Last View'}</th>
              </tr>
            </thead>
            <tbody>
              {data.providerActivity.map((p) => (
                <tr key={p.providerId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium">{p.name}</td>
                  <td className="py-2 pr-4">
                    <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', p.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                      {p.role === 'admin' ? 'Admin' : (lang === 'de' ? 'Mitarbeiter' : 'Provider')}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{p.center ?? '—'}</td>
                  <td className="py-2 pr-4 font-semibold">{p.loginCount}</td>
                  <td className="py-2 pr-4 font-semibold">{p.viewCount}</td>
                  <td className="py-2 pr-4 font-semibold">{p.promCount ?? 0}</td>
                  <td className="py-2 pr-4 text-slate-500 text-xs">{fmt(p.lastLogin)}</td>
                  <td className="py-2 text-slate-500 text-xs">{fmt(p.lastView)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-patient activity */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h3 className="font-semibold text-slate-700 text-sm">{lang === 'de' ? 'Patienten-Aktivität (gesamt)' : 'Patient Activity (all-time)'}</h3>
          <select value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}
            className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white">
            <option value="all">{lang === 'de' ? 'Alle Zentren' : 'All Centers'}</option>
            {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-1">
            <button onClick={() => setPatientSort('loginCount')}
              className={clsx('text-xs px-2 py-1 rounded-lg border transition', patientSort === 'loginCount' ? 'bg-blue-700 text-white border-blue-700' : 'border-slate-200 text-slate-600')}>
              {lang === 'de' ? 'Logins' : 'Logins'}
            </button>
            <button onClick={() => setPatientSort('promCount')}
              className={clsx('text-xs px-2 py-1 rounded-lg border transition', patientSort === 'promCount' ? 'bg-blue-700 text-white border-blue-700' : 'border-slate-200 text-slate-600')}>
              PROMs
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b text-xs uppercase tracking-wide">
                <th className="py-2 pr-4 font-semibold">Code</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Zentrum' : 'Center'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Logins' : 'Logins'}</th>
                <th className="py-2 pr-4 font-semibold">PROMs</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Letzter Login' : 'Last Login'}</th>
                <th className="py-2 font-semibold">{lang === 'de' ? 'Letztes PROM' : 'Last PROM'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((p) => (
                <tr key={p.patientId} className={clsx('border-b border-slate-50 hover:bg-slate-50', !p.isActive && 'opacity-50')}>
                  <td className="py-2 pr-4 font-mono font-semibold text-blue-700">{p.patientCode}</td>
                  <td className="py-2 pr-4 text-slate-500">{p.center}</td>
                  <td className="py-2 pr-4">
                    <span className={clsx('font-semibold', p.loginCount === 0 ? 'text-red-500' : p.loginCount >= 3 ? 'text-green-600' : 'text-amber-600')}>
                      {p.loginCount}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={clsx('font-semibold', p.promCount === 0 ? 'text-red-500' : p.promCount >= 3 ? 'text-green-600' : 'text-amber-600')}>
                      {p.promCount}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-500 text-xs">{fmt(p.lastLogin)}</td>
                  <td className="py-2 text-slate-500 text-xs">{fmt(p.lastProm)}</td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">{lang === 'de' ? 'Keine Daten' : 'No data'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Trend interfaces + helpers ────────────────────────────────────────────────
interface PromTrendWeek {
  week: number
  fluidStatus: number | null
  thirst: number | null
  overload: number | null
  n: number
}
interface ClinicalTrendWeek {
  week: number
  preWeight: number | null
  idwg: number | null
  systolic: number | null
  diastolic: number | null
  n: number
}
interface TrendsData {
  promTrends: PromTrendWeek[]
  clinicalTrends: ClinicalTrendWeek[]
  center: string | null
}

function smoothTrendLine(weeks: { week: number; value: number | null }[]): Map<number, number> {
  const withData = weeks.filter((w) => w.value !== null) as { week: number; value: number }[]
  if (withData.length < 3) return new Map(withData.map((w) => [w.week, w.value]))
  const smoothed = loess(withData.map((w) => w.value), 0.5)
  const m = new Map<number, number>()
  withData.forEach((w, i) => m.set(w.week, parseFloat(smoothed[i].toFixed(2))))
  return m
}

// ── Verlauf Tab ────────────────────────────────────────────────────────────────
function VerlaufTab({ lang, siteFilter }: { lang: Lang; siteFilter: string }) {
  const [data, setData] = useState<TrendsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    const q = siteFilter !== 'all' ? `?center=${encodeURIComponent(siteFilter)}` : ''
    fetch(`/api/trends${q}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [siteFilter])

  if (loading) return <div className="text-center py-12 text-slate-400">{lang === 'de' ? 'Lade Verlaufsdaten…' : 'Loading trend data…'}</div>
  if (!data) return <div className="text-center py-12 text-red-400">{lang === 'de' ? 'Laden fehlgeschlagen' : 'Failed to load'}</div>

  const fluidSmooth    = smoothTrendLine(data.promTrends.map((w) => ({ week: w.week, value: w.fluidStatus })))
  const thirstSmooth   = smoothTrendLine(data.promTrends.map((w) => ({ week: w.week, value: w.thirst })))
  const overSmooth     = smoothTrendLine(data.promTrends.map((w) => ({ week: w.week, value: w.overload })))
  const weightSmooth   = smoothTrendLine(data.clinicalTrends.map((w) => ({ week: w.week, value: w.preWeight })))
  const idwgSmooth     = smoothTrendLine(data.clinicalTrends.map((w) => ({ week: w.week, value: w.idwg })))
  const systolicSmooth = smoothTrendLine(data.clinicalTrends.map((w) => ({ week: w.week, value: w.systolic })))

  const promChartData = data.promTrends.map((w) => ({
    name: `W${w.week}`,
    fluid: w.fluidStatus, thirst: w.thirst, overload: w.overload,
    fluidL:    fluidSmooth.has(w.week)  ? fluidSmooth.get(w.week)  : null,
    thirstL:   thirstSmooth.has(w.week) ? thirstSmooth.get(w.week) : null,
    overloadL: overSmooth.has(w.week)   ? overSmooth.get(w.week)   : null,
    n: w.n,
  }))

  const clinChartData = data.clinicalTrends.map((w) => ({
    name: `W${w.week}`,
    weight: w.preWeight, idwg: w.idwg, systolic: w.systolic,
    weightL:    weightSmooth.has(w.week)   ? weightSmooth.get(w.week)   : null,
    idwgL:      idwgSmooth.has(w.week)     ? idwgSmooth.get(w.week)     : null,
    systolicL:  systolicSmooth.has(w.week) ? systolicSmooth.get(w.week) : null,
    n: w.n,
  }))

  const pL = lang === 'de'
    ? { fluid: 'Wohlbefinden', thirst: 'Durst', overload: 'Überwässerung' }
    : { fluid: 'Wellbeing', thirst: 'Thirst', overload: 'Overload' }

  const cL = lang === 'de'
    ? { weight: 'Gewicht vor Dialyse (kg)', idwg: 'IDWG (kg)', systolic: 'Systolisch (mmHg)' }
    : { weight: 'Pre-dialysis weight (kg)', idwg: 'IDWG (kg)', systolic: 'Systolic BP (mmHg)' }

  const hasPromData = data.promTrends.some((w) => w.n > 0)
  const hasClinData = data.clinicalTrends.some((w) => w.n > 0)

  const legendFmt = (labels: Record<string, string>) => (value: string) => {
    if (value.endsWith('L')) return ''
    return labels[value] ?? value
  }
  const tooltipFmt = (labels: Record<string, string>, unit = '') => (value: number | string, name: string) => {
    if (name.endsWith('L')) return [null, null]
    const label = labels[name] ?? name
    return [typeof value === 'number' ? `${value.toFixed(2)}${unit}` : value, label]
  }
  const labelFmt = (label: string, payload: any[]) => {
    const n = payload?.[0]?.payload?.n
    return `${label}${n ? ` (n=${n})` : ''}`
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        {lang === 'de' ? 'Punkte = Wochenmittel · Kurve = LOESS-Glättung' : 'Dots = weekly mean · Curve = LOESS smoothing'}
      </p>

      {/* PROM trends */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">
          {lang === 'de' ? 'PROM-Verlauf (Studienwochenmittel)' : 'PROM Trends (weekly means)'}
        </h3>
        {!hasPromData ? (
          <p className="text-slate-400 text-sm py-8 text-center">{lang === 'de' ? 'Keine PROM-Daten vorhanden' : 'No PROM data available'}</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={promChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={tooltipFmt(pL)} labelFormatter={labelFmt} />
              <Legend formatter={legendFmt(pL)} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="fluid"     stroke="#3b82f6" strokeWidth={0} dot={{ r: 4, fill: '#3b82f6' }} legendType="circle" name="fluid"    connectNulls />
              <Line type="monotone" dataKey="thirst"    stroke="#f59e0b" strokeWidth={0} dot={{ r: 4, fill: '#f59e0b' }} legendType="circle" name="thirst"   connectNulls />
              <Line type="monotone" dataKey="overload"  stroke="#ef4444" strokeWidth={0} dot={{ r: 4, fill: '#ef4444' }} legendType="circle" name="overload" connectNulls />
              <Line type="monotone" dataKey="fluidL"    stroke="#3b82f6" strokeWidth={2.5} dot={false} legendType="none" name="fluidL"    connectNulls />
              <Line type="monotone" dataKey="thirstL"   stroke="#f59e0b" strokeWidth={2.5} dot={false} legendType="none" name="thirstL"   connectNulls />
              <Line type="monotone" dataKey="overloadL" stroke="#ef4444" strokeWidth={2.5} dot={false} legendType="none" name="overloadL" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Clinical trends: weight + IDWG */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">
          {lang === 'de' ? 'Klinischer Verlauf — Gewicht & IDWG' : 'Clinical Trends — Weight & IDWG'}
        </h3>
        {!hasClinData ? (
          <p className="text-slate-400 text-sm py-8 text-center">{lang === 'de' ? 'Keine klinischen Daten vorhanden' : 'No clinical data available'}</p>
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={clinChartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={tooltipFmt({ weight: cL.weight, idwg: cL.idwg })} labelFormatter={labelFmt} />
              <Legend formatter={legendFmt({ weight: cL.weight, idwg: cL.idwg })} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="weight"  stroke="#3b82f6" strokeWidth={0} dot={{ r: 4, fill: '#3b82f6' }} legendType="circle" name="weight" connectNulls />
              <Line type="monotone" dataKey="idwg"    stroke="#10b981" strokeWidth={0} dot={{ r: 4, fill: '#10b981' }} legendType="circle" name="idwg"   connectNulls />
              <Line type="monotone" dataKey="weightL" stroke="#3b82f6" strokeWidth={2.5} dot={false} legendType="none" name="weightL" connectNulls />
              <Line type="monotone" dataKey="idwgL"   stroke="#10b981" strokeWidth={2.5} dot={false} legendType="none" name="idwgL"   connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Clinical trends: systolic BP */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">
          {lang === 'de' ? 'Klinischer Verlauf — Blutdruck (systolisch)' : 'Clinical Trends — Blood Pressure (systolic)'}
        </h3>
        {!hasClinData ? null : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={clinChartData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" mmHg" />
              <Tooltip formatter={tooltipFmt({ systolic: cL.systolic }, ' mmHg')} labelFormatter={labelFmt} />
              <Legend formatter={legendFmt({ systolic: cL.systolic })} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="systolic"  stroke="#8b5cf6" strokeWidth={0} dot={{ r: 4, fill: '#8b5cf6' }} legendType="circle" name="systolic"  connectNulls />
              <Line type="monotone" dataKey="systolicL" stroke="#8b5cf6" strokeWidth={2.5} dot={false} legendType="none" name="systolicL" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────
interface ActiveSession {
  userId: string
  name: string | null
  role: string
  center: string | null
  patientCode: string | null
  loginAt: string
  kickedAt: string | null
}

function SessionsTab({ lang, adminUserId }: { lang: Lang; adminUserId: string }) {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [kicking, setKicking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/sessions')
    if (res.ok) setSessions(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function kick(userId: string) {
    setKicking(userId)
    await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    await load()
    setKicking(null)
  }

  async function kickAllPatients() {
    const patients = sessions.filter((s) => s.role === 'patient' && s.userId !== adminUserId && !s.kickedAt)
    for (const s of patients) {
      await fetch('/api/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: s.userId }),
      })
    }
    await load()
  }

  if (loading) return <div className="text-center py-12 text-slate-400">{lang === 'de' ? 'Lade Sitzungen…' : 'Loading sessions…'}</div>

  const patientCount = sessions.filter((s) => s.role === 'patient' && !s.kickedAt).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-700">
            {lang === 'de' ? `Aktive Sitzungen (${sessions.length})` : `Active Sessions (${sessions.length})`}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {lang === 'de' ? 'Logins der letzten 8 Stunden' : 'Logins in the past 8 hours'}
          </p>
        </div>
        {patientCount > 0 && (
          <button
            onClick={kickAllPatients}
            className="text-xs font-semibold bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition"
          >
            {lang === 'de' ? `Alle Patienten abmelden (${patientCount})` : `Kick all patients (${patientCount})`}
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">{lang === 'de' ? 'Keine aktiven Sitzungen.' : 'No active sessions.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Benutzer' : 'User'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Rolle' : 'Role'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Zentrum' : 'Center'}</th>
                <th className="py-2 pr-4 font-semibold">{lang === 'de' ? 'Login' : 'Login'}</th>
                <th className="py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const isSelf = s.userId === adminUserId
                const isKicked = !!s.kickedAt
                return (
                  <tr key={s.userId} className={clsx('border-b border-slate-50', isSelf ? 'bg-blue-50' : isKicked ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50')}>
                    <td className="py-2 pr-4 font-medium">
                      {s.patientCode ?? s.name ?? s.userId}
                      {isSelf && <span className="ml-1.5 text-xs text-blue-500 font-semibold">{lang === 'de' ? '(Sie)' : '(you)'}</span>}
                      {isKicked && <span className="ml-1.5 text-xs text-orange-500 font-semibold">{lang === 'de' ? 'abgemeldet' : 'kicked'}</span>}
                    </td>
                    <td className="py-2 pr-4 capitalize text-slate-500">{s.role}</td>
                    <td className="py-2 pr-4 text-slate-500">{s.center ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-400 text-xs">{new Date(s.loginAt).toLocaleTimeString()}</td>
                    <td className="py-2">
                      {isSelf ? (
                        <span className="text-xs text-slate-400">{lang === 'de' ? 'Eigene Sitzung' : 'Own session'}</span>
                      ) : isKicked ? (
                        <span className="text-xs text-slate-400">{lang === 'de' ? 'Abgemeldet' : 'Revoked'}</span>
                      ) : (
                        <button
                          onClick={() => kick(s.userId)}
                          disabled={kicking === s.userId}
                          className="text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                        >
                          {kicking === s.userId ? '…' : (lang === 'de' ? 'Abmelden' : 'Kick')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────
export default function AdminPanel({ adminName, adminUserId }: { adminName: string; adminUserId: string }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [lang, setLang] = useState<Lang>('de')
  const [siteFilter, setSiteFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/shifts').then((r) => r.json()).then(setShifts)
  }, [])

  const tabs: { id: Tab; label: { en: string; de: string } }[] = [
    { id: 'dashboard', label: { en: 'Feasibility',   de: 'Machbarkeit' } },
    { id: 'patients',  label: { en: 'Patients',      de: 'Patienten' } },
    { id: 'providers', label: { en: 'Providers',     de: 'Mitarbeiter' } },
    { id: 'config',    label: { en: 'Study Config',  de: 'Studien-Konfig' } },
    { id: 'import',    label: { en: 'Import Data',   de: 'Datenimport' } },
    { id: 'usage',     label: { en: 'Usage',         de: 'Nutzung' } },
    { id: 'verlauf',   label: { en: 'Trends',        de: 'Verlauf' } },
    { id: 'sessions',  label: { en: 'Sessions',      de: 'Sitzungen' } },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-blue-900 text-white px-4 py-3 shadow">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-black leading-tight">HARMONY · {lang === 'de' ? 'Admin' : 'Admin'}</h1>
            <p className="text-blue-200 text-xs truncate">{adminName}</p>
          </div>
          <div className="flex gap-1.5 items-center flex-wrap">
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="bg-blue-800 text-blue-100 border border-blue-600 text-xs px-2 py-1.5 rounded-lg focus:outline-none"
            >
              <option value="all">{lang === 'de' ? 'Alle' : 'All'}</option>
              {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <a href="/provider" className="text-blue-200 hover:text-white text-xs border border-blue-600 px-2 py-1.5 rounded-lg transition whitespace-nowrap">
              {lang === 'de' ? 'Pflege' : 'Providers'}
            </a>
            <button
              onClick={() => setLang((l) => l === 'de' ? 'en' : 'de')}
              className="text-blue-200 hover:text-white text-xs font-bold px-2 py-1.5 rounded-lg border border-blue-600 transition"
            >
              {lang === 'de' ? 'EN' : 'DE'}
            </button>
            <button onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-blue-200 hover:text-white text-xs border border-blue-600 px-2 py-1.5 rounded-lg transition">
              {lang === 'de' ? 'Abmelden' : 'Sign Out'}
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white border-b shadow-sm px-4">
        <div className="flex max-w-5xl mx-auto overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'px-5 py-3.5 text-sm font-semibold border-b-2 transition whitespace-nowrap',
                tab === t.id
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              )}
            >
              {t.label[lang]}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto p-4 py-6">
        {tab === 'dashboard' && <DashboardTab lang={lang} siteFilter={siteFilter} />}
        {tab === 'patients'  && <PatientsTab shifts={shifts} lang={lang} />}
        {tab === 'providers' && <ProvidersTab shifts={shifts} lang={lang} />}
        {tab === 'config'    && <ConfigTab lang={lang} />}
        {tab === 'import'    && <ImportTab lang={lang} />}
        {tab === 'usage'     && <UsageTab lang={lang} siteFilter={siteFilter} />}
        {tab === 'verlauf'   && <VerlaufTab lang={lang} siteFilter={siteFilter} />}
        {tab === 'sessions'  && <SessionsTab lang={lang} adminUserId={adminUserId} />}
      </main>
    </div>
  )
}
