'use client'
import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ComposedChart, Bar,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import clsx from 'clsx'
import { loess } from '@/lib/loess'
import { computeBoxplot, groupByStudyWeek } from '@/lib/boxplot'

type Lang = 'en' | 'de'

interface PromEntry {
  id: number
  sessionDate: string
  studyWeek: number
  timepointReference: string
  fluidStatusScore: number
  thirstScore: number
  fluidOverloadScore: number
  submittedAt: string
}

interface ClinicalEntry {
  sessionDate: string
  preDialysisWeight: number | null
  interdialyticWeightGain: number | null
  systolicBp: number | null
  diastolicBp: number | null
}

interface PatientData {
  id: number
  name: string
  shiftName: string
  schedule: string
  enrollmentDate: string
  dryWeight: number | null
  isLongGapToday: boolean
  submittedToday: boolean
  todayProm: PromEntry | null
  todayClinical: ClinicalEntry | null
  promHistory: PromEntry[]
  clinicalHistory: ClinicalEntry[]
}

interface ShiftData {
  shiftId: number | null
  studyWeek: number | null
  studyStartDate: string | null
  currentTimepoint: string | null
  today: string
  patients: PatientData[]
}

interface ClinicalFormState {
  preDialysisWeight: string
  interdialyticWeightGain: string
  systolicBp: string
  diastolicBp: string
}

const PROM_QUESTIONS = {
  en: [
    { key: 'fluidStatusScore' as const, label: 'How do you feel today?', sub: 'General wellbeing / fluid balance (1 = excellent)' },
    { key: 'thirstScore' as const, label: 'How strong is your thirst?', sub: '1 = none · 5 = extreme' },
    { key: 'fluidOverloadScore' as const, label: 'Do you feel bloated or fluid overloaded?', sub: '1 = not at all · 5 = very much' },
  ],
  de: [
    { key: 'fluidStatusScore' as const, label: 'Wie fühlen Sie sich heute?', sub: 'Allgemeines Wohlbefinden / Wasserhaushalt (1 = ausgezeichnet)' },
    { key: 'thirstScore' as const, label: 'Wie stark ist Ihr Durstgefühl?', sub: '1 = kein Durst · 5 = extremer Durst' },
    { key: 'fluidOverloadScore' as const, label: 'Fühlen Sie sich aufgeschwemmt?', sub: '1 = gar nicht · 5 = sehr stark' },
  ],
}

const TIMEPOINT_LABELS: Record<string, { en: string; de: string }> = {
  yesterday: { en: 'Yesterday (non-dialysis day)', de: 'Gestern (kein Dialysetag)' },
  arrival:   { en: 'At clinic arrival', de: 'Bei Ankunft' },
  now:       { en: 'Right now', de: 'Jetzt gerade' },
}

const SCORE_COLORS = {
  fluidStatusScore: '#3b82f6',
  thirstScore: '#f59e0b',
  fluidOverloadScore: '#ef4444',
}

const GRADE_COLORS: Record<number, string> = {
  1: 'bg-green-600 border-green-700 text-white',
  2: 'bg-teal-500 border-teal-600 text-white',
  3: 'bg-yellow-500 border-yellow-600 text-white',
  4: 'bg-orange-500 border-orange-600 text-white',
  5: 'bg-red-600 border-red-700 text-white',
}
const GRADE_HOVER: Record<number, string> = {
  1: 'hover:border-green-600 hover:bg-green-50',
  2: 'hover:border-teal-500 hover:bg-teal-50',
  3: 'hover:border-yellow-500 hover:bg-yellow-50',
  4: 'hover:border-orange-500 hover:bg-orange-50',
  5: 'hover:border-red-600 hover:bg-red-50',
}

function ScoreBadge({ score }: { score: number }) {
  const colors: Record<number, string> = {
    1: 'bg-green-100 text-green-800 border-green-300',
    2: 'bg-teal-100 text-teal-800 border-teal-300',
    3: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    4: 'bg-orange-100 text-orange-800 border-orange-300',
    5: 'bg-red-100 text-red-800 border-red-300',
  }
  return (
    <span className={clsx('inline-flex items-center justify-center w-8 h-8 rounded-lg border-2 font-bold text-sm', colors[score])}>
      {score}
    </span>
  )
}

// ── Boxplot shape ─────────────────────────────────────────────────────────────
function BoxplotShape(props: any) {
  const { x, y, width, height, payload } = props
  if (!payload || height <= 0) return null
  const { q1, q3, median, whiskerLow, whiskerHigh, hasIDH } = payload
  const rangeVal = whiskerHigh - whiskerLow

  const cx = x + width / 2
  const bw = Math.max(Math.min(width * 0.65, 40), 10)
  const bl = cx - bw / 2
  const br = cx + bw / 2
  const color = hasIDH ? '#ef4444' : '#22c55e'

  if (rangeVal <= 0) {
    return <line x1={bl} y1={y} x2={br} y2={y} stroke={color} strokeWidth={2.5} />
  }
  const py = (v: number) => y + height * (1 - (v - whiskerLow) / rangeVal)
  const yQ1 = py(q1), yQ3 = py(q3), yM = py(median)
  const yWL = py(whiskerLow), yWH = py(whiskerHigh)

  return (
    <g>
      <line x1={cx} y1={yWH} x2={cx} y2={yQ3} stroke={color} strokeWidth={1.5} />
      <line x1={cx} y1={yQ1} x2={cx} y2={yWL} stroke={color} strokeWidth={1.5} />
      <line x1={cx - 5} y1={yWH} x2={cx + 5} y2={yWH} stroke={color} strokeWidth={1.5} />
      <line x1={cx - 5} y1={yWL} x2={cx + 5} y2={yWL} stroke={color} strokeWidth={1.5} />
      <rect x={bl} y={yQ3} width={bw} height={Math.max(yQ1 - yQ3, 1)} fill={`${color}30`} stroke={color} strokeWidth={1.5} rx={2} />
      <line x1={bl} y1={yM} x2={br} y2={yM} stroke={color} strokeWidth={2.5} />
    </g>
  )
}

// ── PromChart ─────────────────────────────────────────────────────────────────
function PromChart({ history, lang }: { history: PromEntry[]; lang: Lang }) {
  if (!history.length) return <p className="text-slate-400 text-sm py-4 text-center">No PROM data yet</p>

  const bw = history.length >= 6 ? 0.5 : 1.0
  const fluidSmooth   = history.length >= 3 ? loess(history.map((e) => e.fluidStatusScore), bw)   : history.map((e) => e.fluidStatusScore)
  const thirstSmooth  = history.length >= 3 ? loess(history.map((e) => e.thirstScore), bw)        : history.map((e) => e.thirstScore)
  const overSmooth    = history.length >= 3 ? loess(history.map((e) => e.fluidOverloadScore), bw) : history.map((e) => e.fluidOverloadScore)

  const data = history.map((e, i) => ({
    week: `W${e.studyWeek}`,
    fluid: e.fluidStatusScore,
    thirst: e.thirstScore,
    overload: e.fluidOverloadScore,
    fluidL:    parseFloat(fluidSmooth[i].toFixed(2)),
    thirstL:   parseFloat(thirstSmooth[i].toFixed(2)),
    overloadL: parseFloat(overSmooth[i].toFixed(2)),
  }))

  const labels = lang === 'de'
    ? { fluid: 'Wohlbefinden', thirst: 'Durst', overload: 'Überwässerung' }
    : { fluid: 'Wellbeing', thirst: 'Thirst', overload: 'Overload' }

  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, name) => {
            if (String(name).endsWith('L')) return [null, null]
            return [typeof value === 'number' ? value.toFixed(2) : value, labels[name as keyof typeof labels] ?? name]
          }}
          labelFormatter={(label) => `Study ${label}`}
        />
        <Legend
          formatter={(value) => labels[value as keyof typeof labels] ?? value}
          iconSize={10}
          wrapperStyle={{ fontSize: 11 }}
        />
        <Line type="monotone" dataKey="fluid"   stroke={SCORE_COLORS.fluidStatusScore} strokeWidth={0} dot={{ r: 3, fill: SCORE_COLORS.fluidStatusScore }} legendType="circle" name="fluid" />
        <Line type="monotone" dataKey="thirst"  stroke={SCORE_COLORS.thirstScore}      strokeWidth={0} dot={{ r: 3, fill: SCORE_COLORS.thirstScore }}      legendType="circle" name="thirst" />
        <Line type="monotone" dataKey="overload" stroke={SCORE_COLORS.fluidOverloadScore} strokeWidth={0} dot={{ r: 3, fill: SCORE_COLORS.fluidOverloadScore }} legendType="circle" name="overload" />
        <Line type="monotone" dataKey="fluidL"    stroke={SCORE_COLORS.fluidStatusScore} strokeWidth={2} dot={false} legendType="none" name="fluidL" />
        <Line type="monotone" dataKey="thirstL"   stroke={SCORE_COLORS.thirstScore}      strokeWidth={2} dot={false} legendType="none" name="thirstL" />
        <Line type="monotone" dataKey="overloadL" stroke={SCORE_COLORS.fluidOverloadScore} strokeWidth={2} dot={false} legendType="none" name="overloadL" />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── WeightPanel ───────────────────────────────────────────────────────────────
function WeightPanel({ clinicalHistory, dryWeight, lang }: { clinicalHistory: ClinicalEntry[]; dryWeight: number | null; lang: Lang }) {
  const sessions = [...clinicalHistory]
    .filter((c) => c.preDialysisWeight !== null)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((c) => ({
      date: c.sessionDate.slice(5, 10),
      pre: Number(c.preDialysisWeight),
      post: c.interdialyticWeightGain !== null
        ? parseFloat((Number(c.preDialysisWeight) - Number(c.interdialyticWeightGain)).toFixed(1))
        : null,
    }))

  if (!sessions.length) return <p className="text-slate-400 text-sm py-2 text-center">{lang === 'de' ? 'Keine Gewichtsdaten' : 'No weight data'}</p>

  const allW = sessions.flatMap((s) => [s.pre, s.post].filter((v): v is number => v !== null))
  if (dryWeight !== null) allW.push(dryWeight)
  const yMin = Math.floor(Math.min(...allW) - 2)
  const yMax = Math.ceil(Math.max(...allW) + 2)

  const lPre  = lang === 'de' ? 'Vor Dialyse' : 'Pre-dialysis'
  const lPost = lang === 'de' ? 'Nach Dialyse (gesch.)' : 'Post-dialysis (est.)'
  const lDry  = lang === 'de' ? 'Zielgewicht' : 'Target dry wt.'

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={sessions} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10 }} unit=" kg" />
        <Tooltip formatter={(v, name) => [`${v} kg`, name === 'pre' ? lPre : lPost]} />
        <Legend formatter={(v) => v === 'pre' ? lPre : lPost} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        {dryWeight !== null && (
          <ReferenceLine y={dryWeight} stroke="#f97316" strokeDasharray="5 3"
            label={{ value: `${lDry}: ${dryWeight} kg`, position: 'insideTopRight', fontSize: 10, fill: '#f97316' }} />
        )}
        <Line type="monotone" dataKey="pre"  stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="pre" />
        <Line type="monotone" dataKey="post" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="post" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── BpPanel (boxplot per study week) ─────────────────────────────────────────
function BpPanel({ clinicalHistory, studyStartDate, lang }: {
  clinicalHistory: ClinicalEntry[]
  studyStartDate: string | null
  lang: Lang
}) {
  const entries = clinicalHistory
    .filter((c) => c.systolicBp !== null)
    .map((c) => ({ date: c.sessionDate, value: c.systolicBp! }))

  if (!entries.length) return <p className="text-slate-400 text-sm py-2 text-center">{lang === 'de' ? 'Keine Blutdruckdaten' : 'No BP data'}</p>

  const grouped = studyStartDate
    ? groupByStudyWeek(entries, studyStartDate)
    : (() => {
        // fallback: group by relative week
        const firstMs = Math.min(...entries.map((e) => new Date(e.date).getTime()))
        const map = new Map<number, number[]>()
        for (const { date, value } of entries) {
          const w = Math.floor((new Date(date).getTime() - firstMs) / (7 * 86400000)) + 1
          if (!map.has(w)) map.set(w, [])
          map.get(w)!.push(value)
        }
        return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([week, values]) => ({ week, values }))
      })()

  const plotData = grouped.map(({ week, values }) => {
    const stats = computeBoxplot(values)
    if (!stats) return null
    return {
      label: `W${week}`,
      base: stats.whiskerLow,
      ...stats,
      hasIDH: values.some((v) => v < 90),
      n: values.length,
    }
  }).filter(Boolean)

  if (!plotData.length) return <p className="text-slate-400 text-sm py-2 text-center">{lang === 'de' ? 'Keine Blutdruckdaten' : 'No BP data'}</p>

  const allSys = entries.map((e) => e.value)
  const yMin = Math.max(40, Math.floor(Math.min(...allSys) - 10))
  const yMax = Math.min(220, Math.ceil(Math.max(...allSys) + 10))

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={plotData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10 }} unit=" mmHg" />
        <Tooltip
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload
            if (!d) return null
            return (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow">
                <p className="font-semibold mb-1">{label} (n={d.n})</p>
                <p>Max: {d.whiskerHigh?.toFixed(0)} mmHg</p>
                <p>Q3:  {d.q3?.toFixed(0)} mmHg</p>
                <p className="font-bold">Median: {d.median?.toFixed(0)} mmHg</p>
                <p>Q1:  {d.q1?.toFixed(0)} mmHg</p>
                <p>Min: {d.whiskerLow?.toFixed(0)} mmHg</p>
                {d.hasIDH && <p className="text-red-600 font-semibold mt-1">⚠ IDH event (systolic &lt;90)</p>}
              </div>
            )
          }}
        />
        <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="4 2"
          label={{ value: 'IDH 90', position: 'insideTopLeft', fontSize: 10, fill: '#ef4444' }} />
        <Bar dataKey="base"  stackId="bp" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="range" stackId="bp" shape={<BoxplotShape />} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── ClinicalDataForm ──────────────────────────────────────────────────────────
function ClinicalDataForm({
  patientId, today, existing, onSaved, lang,
}: {
  patientId: number
  today: string
  existing: ClinicalEntry | null
  onSaved: () => void
  lang: Lang
}) {
  const [form, setForm] = useState<ClinicalFormState>({
    preDialysisWeight: existing?.preDialysisWeight?.toString() ?? '',
    interdialyticWeightGain: existing?.interdialyticWeightGain?.toString() ?? '',
    systolicBp: existing?.systolicBp?.toString() ?? '',
    diastolicBp: existing?.diastolicBp?.toString() ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    await fetch('/api/clinical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId,
        sessionDate: today.slice(0, 10),
        preDialysisWeight: form.preDialysisWeight ? parseFloat(form.preDialysisWeight) : null,
        interdialyticWeightGain: form.interdialyticWeightGain ? parseFloat(form.interdialyticWeightGain) : null,
        systolicBp: form.systolicBp ? parseInt(form.systolicBp) : null,
        diastolicBp: form.diastolicBp ? parseInt(form.diastolicBp) : null,
      }),
    })
    setSaving(false)
    setSaved(true)
    onSaved()
    setTimeout(() => setSaved(false), 2000)
  }

  const L = lang === 'de'
    ? { preW: 'Gewicht vor Dialyse (kg)', idwg: 'IDWG (kg)', sbp: 'Systolisch (mmHg)', dbp: 'Diastolisch (mmHg)', save: 'Speichern', saving: 'Speichert…', saved: 'Gespeichert!' }
    : { preW: 'Pre-dialysis weight (kg)', idwg: 'IDWG (kg)', sbp: 'Systolic BP (mmHg)', dbp: 'Diastolic BP (mmHg)', save: 'Save Clinical Data', saving: 'Saving…', saved: 'Saved!' }

  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {[
        { label: L.preW, key: 'preDialysisWeight' as const, step: '0.1', min: 30, max: 200, placeholder: 'e.g. 72.4' },
        { label: L.idwg, key: 'interdialyticWeightGain' as const, step: '0.1', min: 0, max: 10, placeholder: 'e.g. 2.1' },
        { label: L.sbp, key: 'systolicBp' as const, step: '1', min: 60, max: 250, placeholder: 'e.g. 140' },
        { label: L.dbp, key: 'diastolicBp' as const, step: '1', min: 40, max: 150, placeholder: 'e.g. 85' },
      ].map(({ label, key, step, min, max, placeholder }) => (
        <div key={key}>
          <label className="block text-slate-500 text-xs mb-1">{label}</label>
          <input
            type="number" step={step} min={min} max={max}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            placeholder={placeholder}
          />
        </div>
      ))}
      <div className="col-span-2">
        <button
          onClick={save} disabled={saving}
          className={clsx('w-full py-2 rounded-lg text-sm font-semibold transition-all', saved ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700')}
        >
          {saving ? L.saving : saved ? L.saved : L.save}
        </button>
      </div>
    </div>
  )
}

// ── PromEntryModal ────────────────────────────────────────────────────────────
function PromEntryModal({ patient, timepoint, lang, onClose, onSaved }: {
  patient: PatientData
  timepoint: string | null
  lang: Lang
  onClose: () => void
  onSaved: () => void
}) {
  const [scores, setScores] = useState<{ fluidStatusScore: number | null; thirstScore: number | null; fluidOverloadScore: number | null }>({
    fluidStatusScore: null, thirstScore: null, fluidOverloadScore: null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const questions = PROM_QUESTIONS[lang]
  const allAnswered = scores.fluidStatusScore !== null && scores.thirstScore !== null && scores.fluidOverloadScore !== null

  async function submit() {
    if (!allAnswered) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/prom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: patient.id, ...scores }),
    })
    setSaving(false)
    if (res.status === 409) { onSaved(); onClose(); return }
    if (!res.ok) { const d = await res.json(); setError(d.error); return }
    onSaved(); onClose()
  }

  const tpLabel = timepoint ? (TIMEPOINT_LABELS[timepoint]?.[lang] ?? timepoint) : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {lang === 'de' ? 'PROM erfassen' : 'Enter PROM'} — {patient.name}
            </h3>
            {tpLabel && <p className="text-sm text-slate-500 mt-0.5">{lang === 'de' ? 'Zeitpunkt:' : 'Timepoint:'} <span className="font-semibold">{tpLabel}</span></p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {questions.map((q) => (
            <div key={q.key}>
              <p className="text-sm font-semibold text-slate-700 mb-0.5">{q.label}</p>
              <p className="text-xs text-slate-400 mb-2">{q.sub}</p>
              <div className="flex gap-2">
                {([1, 2, 3, 4, 5] as const).map((grade) => {
                  const selected = scores[q.key] === grade
                  return (
                    <button
                      key={grade}
                      onClick={() => setScores((s) => ({ ...s, [q.key]: grade }))}
                      className={clsx(
                        'flex-1 h-12 rounded-xl border-2 font-black text-lg transition-all',
                        selected ? GRADE_COLORS[grade] : `border-slate-300 bg-white text-slate-600 ${GRADE_HOVER[grade]}`
                      )}
                    >
                      {grade}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50">
              {lang === 'de' ? 'Abbrechen' : 'Cancel'}
            </button>
            <button
              onClick={submit} disabled={!allAnswered || saving}
              className="flex-[2] py-2.5 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-40"
            >
              {saving ? (lang === 'de' ? 'Speichert…' : 'Saving…') : (lang === 'de' ? 'PROM speichern' : 'Save PROM')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PatientCard ───────────────────────────────────────────────────────────────
function PatientCard({ patient, today, currentTimepoint, studyStartDate, lang, onDataSaved }: {
  patient: PatientData
  today: string
  currentTimepoint: string | null
  studyStartDate: string | null
  lang: Lang
  onDataSaved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showClinicalForm, setShowClinicalForm] = useState(false)
  const [showPromEntry, setShowPromEntry] = useState(false)

  const clinicalTodayLabel = lang === 'de' ? 'Klinische Daten heute' : 'Clinical Data Today'
  const enterPromLabel = lang === 'de' ? 'PROM erfassen' : 'Enter PROM'
  const noDataLabel    = lang === 'de' ? 'Keine Daten für heute' : 'No clinical data for today'

  return (
    <div className={clsx('bg-white rounded-xl border-2 shadow-sm overflow-hidden transition-all', patient.submittedToday ? 'border-green-300' : 'border-slate-200')}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition" onClick={() => setExpanded((e) => !e)}>
        <div className={clsx('w-3 h-3 rounded-full flex-shrink-0', patient.submittedToday ? 'bg-green-500' : 'bg-slate-300')} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{patient.name}</p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{patient.promHistory.length} sessions</span>
            {patient.isLongGapToday && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">Long gap</span>}
          </div>
        </div>
        {patient.submittedToday && patient.todayProm && (
          <div className="flex gap-1">
            <ScoreBadge score={patient.todayProm.fluidStatusScore} />
            <ScoreBadge score={patient.todayProm.thirstScore} />
            <ScoreBadge score={patient.todayProm.fluidOverloadScore} />
          </div>
        )}
        {!patient.submittedToday && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowPromEntry(true) }}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 font-semibold transition"
          >
            {enterPromLabel}
          </button>
        )}
        <span className="text-slate-400 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {showPromEntry && (
        <PromEntryModal patient={patient} timepoint={currentTimepoint} lang={lang} onClose={() => setShowPromEntry(false)} onSaved={onDataSaved} />
      )}

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-5">
          {/* PROM trend */}
          <div>
            <h4 className="text-sm font-semibold text-slate-600 mb-2">
              {lang === 'de' ? 'PROM-Verlauf — Punkte + LOESS-Kurve' : 'PROM Trend — dots + LOESS curve'}
            </h4>
            <PromChart history={patient.promHistory} lang={lang} />
          </div>

          {/* Weight panel */}
          <div>
            <h4 className="text-sm font-semibold text-slate-600 mb-2">
              {lang === 'de' ? 'Gewicht' : 'Weight'}
              {patient.dryWeight && (
                <span className="ml-2 text-orange-600 font-normal">
                  ({lang === 'de' ? 'Zielgewicht' : 'Target'}: {patient.dryWeight} kg)
                </span>
              )}
            </h4>
            <WeightPanel clinicalHistory={patient.clinicalHistory} dryWeight={patient.dryWeight} lang={lang} />
          </div>

          {/* BP panel */}
          <div>
            <h4 className="text-sm font-semibold text-slate-600 mb-1">
              {lang === 'de' ? 'Blutdruck (Boxplot je Woche)' : 'Blood Pressure (boxplot per week)'}
              <span className="ml-2 font-normal text-xs text-slate-400">
                <span className="text-red-500 font-semibold">■</span> IDH (&lt;90)
                <span className="ml-1.5 text-green-500 font-semibold">■</span> {lang === 'de' ? 'Normal' : 'Normal'} (≥90)
              </span>
            </h4>
            <BpPanel clinicalHistory={patient.clinicalHistory} studyStartDate={studyStartDate} lang={lang} />
          </div>

          {/* Clinical data today */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-600">{clinicalTodayLabel}</h4>
              <button onClick={() => setShowClinicalForm((v) => !v)} className="text-xs text-blue-600 hover:underline">
                {showClinicalForm
                  ? (lang === 'de' ? 'Ausblenden' : 'Hide form')
                  : patient.todayClinical
                  ? (lang === 'de' ? 'Bearbeiten' : 'Edit')
                  : (lang === 'de' ? 'Daten erfassen' : 'Add data')}
              </button>
            </div>

            {patient.todayClinical && !showClinicalForm && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {patient.todayClinical.preDialysisWeight !== null && (
                  <div className="bg-slate-50 rounded-lg p-2">
                    <span className="text-slate-500 text-xs block">{lang === 'de' ? 'Gewicht vor Dialyse' : 'Pre-dial. weight'}</span>
                    <span className="font-semibold">{patient.todayClinical.preDialysisWeight} kg</span>
                  </div>
                )}
                {patient.todayClinical.interdialyticWeightGain !== null && (
                  <div className="bg-slate-50 rounded-lg p-2">
                    <span className="text-slate-500 text-xs block">IDWG</span>
                    <span className="font-semibold">{patient.todayClinical.interdialyticWeightGain} kg</span>
                  </div>
                )}
                {patient.todayClinical.systolicBp !== null && (
                  <div className="bg-slate-50 rounded-lg p-2 col-span-2">
                    <span className="text-slate-500 text-xs block">{lang === 'de' ? 'Blutdruck' : 'Blood pressure'}</span>
                    <span className="font-semibold">{patient.todayClinical.systolicBp}/{patient.todayClinical.diastolicBp} mmHg</span>
                  </div>
                )}
              </div>
            )}

            {showClinicalForm && (
              <ClinicalDataForm patientId={patient.id} today={today} existing={patient.todayClinical} lang={lang} onSaved={() => { setShowClinicalForm(false); onDataSaved() }} />
            )}

            {!patient.todayClinical && !showClinicalForm && (
              <p className="text-slate-400 text-sm italic">{noDataLabel}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ProviderDashboard ─────────────────────────────────────────────────────────
export default function ProviderDashboard({ providerName, shiftName, role }: {
  providerName: string
  shiftName: string
  role: 'provider' | 'admin'
}) {
  const [data, setData] = useState<ShiftData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'submitted' | 'pending'>('all')
  const [lang, setLang] = useState<Lang>('en')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/provider/shift-data')
      if (!res.ok) throw new Error('Failed to load data')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredPatients = data?.patients.filter((p) => {
    if (filter === 'submitted') return p.submittedToday
    if (filter === 'pending') return !p.submittedToday
    return true
  }) ?? []

  const submittedCount = data?.patients.filter((p) => p.submittedToday).length ?? 0
  const totalCount = data?.patients.length ?? 0
  const tpLabel = data?.currentTimepoint ? (TIMEPOINT_LABELS[data.currentTimepoint]?.[lang] ?? data.currentTimepoint) : '—'

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-blue-800 text-white px-6 py-4 shadow flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">HARMONY · {lang === 'de' ? 'Pflegedashboard' : 'Provider Dashboard'}</h1>
          <p className="text-blue-200 text-sm">{providerName} · {shiftName}</p>
        </div>
        <div className="flex gap-2 items-center">
          {role === 'admin' && (
            <a href="/admin" className="text-blue-200 hover:text-white text-sm border border-blue-500 px-3 py-1.5 rounded-lg transition">
              Admin Panel
            </a>
          )}
          <button
            onClick={() => setLang((l) => l === 'en' ? 'de' : 'en')}
            className="text-blue-200 hover:text-white text-sm font-bold px-3 py-1.5 rounded-lg border border-blue-500 transition"
          >
            {lang === 'en' ? 'DE' : 'EN'}
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-blue-200 hover:text-white text-sm border border-blue-500 px-3 py-1.5 rounded-lg transition">
            {lang === 'de' ? 'Abmelden' : 'Sign Out'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {loading && <div className="bg-white rounded-xl p-8 text-center text-slate-500">{lang === 'de' ? 'Lade Schichtdaten…' : 'Loading shift data…'}</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>}

        {data && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm flex flex-wrap gap-4 items-center">
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase">{lang === 'de' ? 'Studienwoche' : 'Study Week'}</p>
                <p className="text-2xl font-black text-blue-800">{data.studyWeek ? `${data.studyWeek} / 12` : (lang === 'de' ? 'Inaktiv' : 'Not active')}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase">{lang === 'de' ? 'Zeitpunkt' : 'Timepoint'}</p>
                <p className="text-lg font-bold text-slate-700">{tpLabel}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase">{lang === 'de' ? 'Datum' : 'Date'}</p>
                <p className="text-lg font-bold text-slate-700">{data.today ? format(parseISO(data.today), 'dd MMM yyyy') : '—'}</p>
              </div>
              <div className="ml-auto">
                <p className="text-slate-500 text-xs font-semibold uppercase">{lang === 'de' ? 'Eingaben heute' : 'Submitted today'}</p>
                <p className={clsx('text-2xl font-black', submittedCount === totalCount ? 'text-green-600' : 'text-orange-500')}>
                  {submittedCount} / {totalCount}
                </p>
              </div>
              <button onClick={fetchData} className="text-slate-400 hover:text-slate-600 text-sm border border-slate-300 px-3 py-1.5 rounded-lg transition">
                {lang === 'de' ? 'Aktualisieren' : 'Refresh'}
              </button>
            </div>

            <div className="flex gap-2">
              {(['all', 'pending', 'submitted'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={clsx('px-4 py-2 rounded-lg text-sm font-semibold transition', filter === f ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200')}
                >
                  {f === 'all'
                    ? `${lang === 'de' ? 'Alle' : 'All'} (${totalCount})`
                    : f === 'pending'
                    ? `${lang === 'de' ? 'Ausstehend' : 'Pending'} (${totalCount - submittedCount})`
                    : `${lang === 'de' ? 'Eingegeben' : 'Submitted'} (${submittedCount})`}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredPatients.length === 0 && (
                <div className="bg-white rounded-xl p-8 text-center text-slate-400">
                  {filter === 'pending'
                    ? (lang === 'de' ? 'Alle Patienten haben heute eingegeben!' : 'All patients have submitted today!')
                    : (lang === 'de' ? 'Keine Patienten gefunden.' : 'No patients found.')}
                </div>
              )}
              {filteredPatients.map((patient) => (
                <PatientCard
                  key={patient.id}
                  patient={patient}
                  today={data.today}
                  currentTimepoint={data.currentTimepoint}
                  studyStartDate={data.studyStartDate}
                  lang={lang}
                  onDataSaved={fetchData}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
