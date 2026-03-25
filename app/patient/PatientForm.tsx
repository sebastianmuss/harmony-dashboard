'use client'
import { useState, useEffect } from 'react'
import { signOut } from 'next-auth/react'
import clsx from 'clsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Bar, ReferenceLine,
} from 'recharts'
import type { TimepointReference } from '@/lib/study'
import { loess } from '@/lib/loess'
import { computeBoxplot, groupByRelativeWeek } from '@/lib/boxplot'
import { PROM_QUESTIONS, RECOVERY_OPTIONS, RECOVERY_LABELS, RECOVERY_QUESTION, type Lang } from '@/lib/prom-i18n'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  patientCode: string
  studyWeek: number
  timepoint: TimepointReference
  timepointLabel: string
  timepointLabelEn: string
  alreadySubmitted: boolean
  dryWeight: number | null
  promId: number | null
  existingScores: {
    fluidStatusScore: number
    thirstScore: number
    fluidOverloadScore: number
    recoveryTime: string | null
  } | null
}

interface PromEntry {
  sessionDate: string
  studyWeek: number
  timepointReference: string
  fluidStatusScore: number
  thirstScore: number
  fluidOverloadScore: number
  recoveryTime?: string | null
}

interface ClinicalEntry {
  sessionDate: string
  preDialysisWeight: string | null
  interdialyticWeightGain: string | null
  systolicBp: number | null
  diastolicBp: number | null
}

// ── i18n ──────────────────────────────────────────────────────────────────────
const T = {
  de: {
    hello: (code: string) => `Hallo, ${code}!`,
    studyWeek: (w: number) => `HARMONY-Studie · Woche ${w}/12`,
    logout: 'Abmelden',
    timepointLabel: 'Bewertungszeitraum',
    scaleLabel: 'Skala:',
    grades: { 1: 'Ausgezeichnet', 2: 'Gut', 3: 'Mäßig', 4: 'Schlecht', 5: 'Sehr schlecht' } as Record<number, string>,
    submit: 'Antworten absenden',
    answersRequired: 'Bitte alle Fragen beantworten',
    saving: 'Wird gespeichert…',
    networkError: 'Netzwerkfehler. Bitte das Pflegepersonal informieren.',
    unknownError: 'Unbekannter Fehler. Bitte das Pflegepersonal informieren.',
    confidential: 'Alle Ihre Antworten werden vertraulich behandelt.',
    thankYou: 'Vielen Dank!',
    savedOk: 'Ihre Antworten wurden erfolgreich gespeichert.',
    editAnswers: 'Antworten ändern',
    weekOf: (w: number) => `Woche ${w} von 12`,
    viewProgress: 'Mein Verlauf ansehen',
    backToForm: 'Zurück',
    myProgress: 'Mein Verlauf',
    session: 'Datum',
    week: 'Woche',
    timepoint: 'Zeitpunkt',
    fluidStatus: 'Befinden',
    thirst: 'Durst',
    overload: 'Überwässerung',
    weight: 'Gewicht',
    idwg: 'IDWG',
    bp: 'RR',
    noHistory: 'Noch keine früheren Einträge.',
    timepointMap: { yesterday: 'Gestern', arrival: 'Ankunft', now: 'Jetzt' } as Record<string, string>,
    chartTitle: 'Verlauf meiner Werte',
    fluidStatusLong: 'Wohlbefinden',
    thirstLong: 'Durst',
    overloadLong: 'Überwässerung',
    weightTitle: 'Gewichtsverlauf',
    bpTitle: 'Blutdruckverlauf (nach Woche)',
    bpLegend: 'Systolisch · Rot = IDH (<90 mmHg)',
    noWeightData: 'Keine Gewichtsdaten',
    noBpData: 'Keine Blutdruckdaten',
    preDial: 'Vor Dialyse',
    postDial: 'Nach Dialyse (geschätzt)',
    dryWeightLabel: 'Zielgewicht',
  },
  en: {
    hello: (code: string) => `Hello, ${code}!`,
    studyWeek: (w: number) => `HARMONY Study · Week ${w}/12`,
    logout: 'Log out',
    timepointLabel: 'Reference period',
    scaleLabel: 'Scale:',
    grades: { 1: 'Excellent', 2: 'Good', 3: 'Fair', 4: 'Poor', 5: 'Very poor' } as Record<number, string>,
    questions: [
      {
        label: 'How do you feel today?',
        sublabel: 'General wellbeing regarding your fluid balance (1 = excellent)',
        icon: '💧',
      },
      {
        label: 'How strong is your thirst?',
        sublabel: '1 = no thirst · 5 = extreme thirst',
        icon: '🥤',
      },
      {
        label: 'Do you feel bloated or fluid overloaded?',
        sublabel: '1 = not at all · 5 = very much',
        icon: '⚖️',
      },
    ],
    recovery: {
      label: 'How long did your recovery take after dialysis?',
      sublabel: 'Time until you felt recovered after your last session',
      icon: '⏱️',
      options: { '0-2h': '0–2 h', '3-6h': '3–6 h', '7-12h': '7–12 h', '>12h': '>12 h' } as Record<string, string>,
      optional: '(optional)',
    },
    submit: 'Submit answers',
    answersRequired: 'Please answer all questions',
    saving: 'Saving…',
    networkError: 'Network error. Please inform the nursing staff.',
    unknownError: 'Unknown error. Please inform the nursing staff.',
    confidential: 'All your answers are treated confidentially.',
    thankYou: 'Thank you!',
    savedOk: 'Your answers have been saved successfully.',
    editAnswers: 'Edit answers',
    weekOf: (w: number) => `Week ${w} of 12`,
    viewProgress: 'View my progress',
    backToForm: 'Back',
    myProgress: 'My Progress',
    session: 'Date',
    week: 'Week',
    timepoint: 'Timepoint',
    fluidStatus: 'Wellbeing',
    thirst: 'Thirst',
    overload: 'Overload',
    weight: 'Weight',
    idwg: 'IDWG',
    bp: 'BP',
    noHistory: 'No previous entries yet.',
    timepointMap: { yesterday: 'Yesterday', arrival: 'Arrival', now: 'Now' } as Record<string, string>,
    chartTitle: 'My score history',
    fluidStatusLong: 'Wellbeing',
    thirstLong: 'Thirst',
    overloadLong: 'Overload',
    weightTitle: 'Weight over time',
    bpTitle: 'Blood pressure by week',
    bpLegend: 'Systolic · Red = IDH (<90 mmHg)',
    noWeightData: 'No weight data',
    noBpData: 'No blood pressure data',
    preDial: 'Pre-dialysis',
    postDial: 'Post-dialysis (est.)',
    dryWeightLabel: 'Target weight',
  },
}

// ── Colors ────────────────────────────────────────────────────────────────────
const GRADE_BG: Record<number, string> = {
  1: 'bg-green-600 border-green-700',
  2: 'bg-teal-500 border-teal-700',
  3: 'bg-yellow-500 border-yellow-600',
  4: 'bg-orange-500 border-orange-600',
  5: 'bg-red-600 border-red-700',
}
const GRADE_HOVER: Record<number, string> = {
  1: 'hover:border-green-600 hover:bg-green-50',
  2: 'hover:border-teal-500 hover:bg-teal-50',
  3: 'hover:border-yellow-500 hover:bg-yellow-50',
  4: 'hover:border-orange-500 hover:bg-orange-50',
  5: 'hover:border-red-600 hover:bg-red-50',
}
const SCORE_LINE_COLORS = { fluid: '#3b82f6', thirst: '#f59e0b', overload: '#ef4444' }

type Scores = { fluidStatusScore: number | null; thirstScore: number | null; fluidOverloadScore: number | null; recoveryTime: string | null }
type View = 'form' | 'submitted' | 'history'


// ── Boxplot shape ─────────────────────────────────────────────────────────────
function BoxplotShape(props: any) {
  const { x, y, width, height, payload } = props
  if (!payload || height <= 0) return null
  const { q1, q3, median, whiskerLow, whiskerHigh, hasIDH } = payload
  const rangeVal = whiskerHigh - whiskerLow

  const cx = x + width / 2
  const bw = Math.max(Math.min(width * 0.65, 36), 10)
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
      <line x1={cx - 4} y1={yWH} x2={cx + 4} y2={yWH} stroke={color} strokeWidth={1.5} />
      <line x1={cx - 4} y1={yWL} x2={cx + 4} y2={yWL} stroke={color} strokeWidth={1.5} />
      <rect x={bl} y={yQ3} width={bw} height={Math.max(yQ1 - yQ3, 1)} fill={`${color}30`} stroke={color} strokeWidth={1.5} rx={2} />
      <line x1={bl} y1={yM} x2={br} y2={yM} stroke={color} strokeWidth={2.5} />
    </g>
  )
}

// ── WeightPanel ───────────────────────────────────────────────────────────────
function WeightPanel({ clinical, dryWeight, t }: {
  clinical: ClinicalEntry[]
  dryWeight: number | null
  t: typeof T['de']
}) {
  const sessions = [...clinical]
    .filter((c) => c.preDialysisWeight !== null)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((c) => ({
      date: c.sessionDate.slice(5, 10),
      pre: parseFloat(String(c.preDialysisWeight)),
      post: c.interdialyticWeightGain !== null
        ? parseFloat((parseFloat(String(c.preDialysisWeight)) - parseFloat(String(c.interdialyticWeightGain))).toFixed(1))
        : null,
    }))

  if (!sessions.length) return <p className="text-slate-400 text-sm py-2 text-center">{t.noWeightData}</p>

  const allW = sessions.flatMap((s) => [s.pre, s.post].filter((v): v is number => v !== null))
  if (dryWeight !== null) allW.push(dryWeight)
  const yMin = Math.floor(Math.min(...allW) - 2)
  const yMax = Math.ceil(Math.max(...allW) + 2)

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={sessions} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10 }} unit=" kg" />
        <Tooltip formatter={(v, name) => [`${v} kg`, name === 'pre' ? t.preDial : t.postDial]} />
        <Legend formatter={(v) => v === 'pre' ? t.preDial : t.postDial} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        {dryWeight !== null && (
          <ReferenceLine y={dryWeight} stroke="#f97316" strokeDasharray="5 3" label={{ value: `${t.dryWeightLabel}: ${dryWeight} kg`, position: 'insideTopRight', fontSize: 10, fill: '#f97316' }} />
        )}
        <Line type="monotone" dataKey="pre" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="pre" />
        <Line type="monotone" dataKey="post" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="post" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── BpPanel (boxplot per week) ────────────────────────────────────────────────
function BpPanel({ clinical, t }: { clinical: ClinicalEntry[]; t: typeof T['de'] }) {
  const entries = clinical
    .filter((c) => c.systolicBp !== null)
    .map((c) => ({ date: c.sessionDate, value: c.systolicBp! }))

  const grouped = groupByRelativeWeek(entries)

  const plotData = grouped.map(({ week, values }) => {
    const stats = computeBoxplot(values)
    if (!stats) return null
    const hasIDH = values.some((v) => v < 90)
    return {
      label: `W${week}`,
      base: stats.whiskerLow,
      ...stats,
      hasIDH,
    }
  }).filter(Boolean)

  if (!plotData.length) return <p className="text-slate-400 text-sm py-2 text-center">{t.noBpData}</p>

  const allSys = entries.map((e) => e.value)
  const yMin = Math.max(40, Math.floor(Math.min(...allSys) - 10))
  const yMax = Math.min(220, Math.ceil(Math.max(...allSys) + 10))

  return (
    <ResponsiveContainer width="100%" height={180}>
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
                <p>Max: {d.whiskerHigh?.toFixed(0)}</p>
                <p>Q3: {d.q3?.toFixed(0)}</p>
                <p className="font-bold">Median: {d.median?.toFixed(0)}</p>
                <p>Q1: {d.q1?.toFixed(0)}</p>
                <p>Min: {d.whiskerLow?.toFixed(0)}</p>
                {d.hasIDH && <p className="text-red-600 font-semibold mt-1">IDH event</p>}
              </div>
            )
          }}
        />
        {/* transparent base up to whiskerLow */}
        <Bar dataKey="base" stackId="bp" fill="transparent" isAnimationActive={false} />
        {/* custom boxplot shape for the IQR range */}
        <Bar dataKey="range" stackId="bp" shape={<BoxplotShape />} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── History view ──────────────────────────────────────────────────────────────
function HistoryView({
  lang,
  setLang,
  dryWeight,
  onBack,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  dryWeight: number | null
  onBack: () => void
}) {
  const t = T[lang]
  const [proms, setProms] = useState<PromEntry[]>([])
  const [clinical, setClinical] = useState<ClinicalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/prom').then((r) => r.json()),
      fetch('/api/clinical').then((r) => r.json()),
    ]).then(([p, c]) => {
      setProms(Array.isArray(p) ? p : [])
      setClinical(Array.isArray(c) ? c : [])
    }).finally(() => setLoading(false))
  }, [])

  const bw = proms.length >= 6 ? 0.5 : 1.0
  const fluidSmooth    = proms.length >= 3 ? loess(proms.map((p) => p.fluidStatusScore), bw)    : proms.map((p) => p.fluidStatusScore)
  const thirstSmooth   = proms.length >= 3 ? loess(proms.map((p) => p.thirstScore), bw)         : proms.map((p) => p.thirstScore)
  const overloadSmooth = proms.length >= 3 ? loess(proms.map((p) => p.fluidOverloadScore), bw)  : proms.map((p) => p.fluidOverloadScore)

  const chartData = proms.map((p, i) => ({
    label: `W${p.studyWeek}`,
    fluid: p.fluidStatusScore,
    thirst: p.thirstScore,
    overload: p.fluidOverloadScore,
    fluidL:    parseFloat(fluidSmooth[i].toFixed(2)),
    thirstL:   parseFloat(thirstSmooth[i].toFixed(2)),
    overloadL: parseFloat(overloadSmooth[i].toFixed(2)),
  }))

  return (
    <div className="min-h-screen bg-blue-900 flex flex-col">
      {/* Header with lang toggle */}
      <div className="bg-blue-800 px-6 py-4 flex items-center justify-between shadow">
        <h1 className="text-xl font-black text-white">{t.myProgress}</h1>
        <div className="flex gap-2 items-center">
          <button onClick={onBack} className="text-blue-200 hover:text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 transition">
            ← {t.backToForm}
          </button>
          <button
            onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
            className="text-blue-200 hover:text-white text-sm font-bold px-3 py-2 rounded-xl hover:bg-blue-700 transition border border-blue-600"
          >
            {lang === 'de' ? 'EN' : 'DE'}
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-blue-300 hover:text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 transition">
            {t.logout}
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-5 py-6">
        {loading && <div className="bg-white rounded-2xl p-8 text-center text-slate-400">Loading…</div>}

        {!loading && proms.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-lg">{t.noHistory}</div>
        )}

        {!loading && proms.length > 0 && (
          <>
            {/* PROM chart */}
            <div className="bg-white rounded-2xl p-5 shadow-lg">
              <h3 className="font-bold text-slate-700 mb-4">{t.chartTitle}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(val, key) => {
                      if (String(key).endsWith('L')) return [null, null]
                      const labels: Record<string, string> = { fluid: t.fluidStatusLong, thirst: t.thirstLong, overload: t.overloadLong }
                      return [val, labels[key as string] ?? key]
                    }}
                    labelFormatter={(l) => `Study ${l}`}
                  />
                  <Legend
                    formatter={(key) => {
                      const labels: Record<string, string> = { fluid: t.fluidStatusLong, thirst: t.thirstLong, overload: t.overloadLong }
                      return labels[key] ?? key
                    }}
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="fluid"    stroke={SCORE_LINE_COLORS.fluid}   strokeWidth={0} dot={{ r: 3, fill: SCORE_LINE_COLORS.fluid }}   legendType="circle" name="fluid" />
                  <Line type="monotone" dataKey="thirst"   stroke={SCORE_LINE_COLORS.thirst}  strokeWidth={0} dot={{ r: 3, fill: SCORE_LINE_COLORS.thirst }}  legendType="circle" name="thirst" />
                  <Line type="monotone" dataKey="overload" stroke={SCORE_LINE_COLORS.overload} strokeWidth={0} dot={{ r: 3, fill: SCORE_LINE_COLORS.overload }} legendType="circle" name="overload" />
                  <Line type="monotone" dataKey="fluidL"    stroke={SCORE_LINE_COLORS.fluid}   strokeWidth={2} dot={false} legendType="none" name="fluidL" />
                  <Line type="monotone" dataKey="thirstL"   stroke={SCORE_LINE_COLORS.thirst}  strokeWidth={2} dot={false} legendType="none" name="thirstL" />
                  <Line type="monotone" dataKey="overloadL" stroke={SCORE_LINE_COLORS.overload} strokeWidth={2} dot={false} legendType="none" name="overloadL" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Weight chart */}
            <div className="bg-white rounded-2xl p-5 shadow-lg">
              <h3 className="font-bold text-slate-700 mb-3">{t.weightTitle}</h3>
              <WeightPanel clinical={clinical} dryWeight={dryWeight} t={t} />
            </div>

            {/* BP boxplot chart */}
            <div className="bg-white rounded-2xl p-5 shadow-lg">
              <h3 className="font-bold text-slate-700 mb-1">{t.bpTitle}</h3>
              <p className="text-xs text-slate-400 mb-3">{t.bpLegend}</p>
              <BpPanel clinical={clinical} t={t} />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-left text-slate-500">
                      <th className="py-3 px-4 font-semibold">{t.session}</th>
                      <th className="py-3 px-4 font-semibold">{t.week}</th>
                      <th className="py-3 px-4 font-semibold">{t.timepoint}</th>
                      <th className="py-3 px-4 font-semibold text-center">{t.fluidStatus}</th>
                      <th className="py-3 px-4 font-semibold text-center">{t.thirst}</th>
                      <th className="py-3 px-4 font-semibold text-center">{t.overload}</th>
                      <th className="py-3 px-4 font-semibold text-center">{t.weight}</th>
                      <th className="py-3 px-4 font-semibold text-center">{t.idwg}</th>
                      <th className="py-3 px-4 font-semibold text-center">{t.bp}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...proms].reverse().map((p, i) => {
                      const clin = clinical.find((c) => c.sessionDate?.slice(0, 10) === p.sessionDate?.slice(0, 10))
                      return (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                            {new Date(p.sessionDate).toLocaleDateString(lang === 'de' ? 'de-AT' : 'en-GB')}
                          </td>
                          <td className="py-2.5 px-4 text-center font-semibold">{p.studyWeek}</td>
                          <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                            {t.timepointMap[p.timepointReference] ?? p.timepointReference}
                          </td>
                          <td className="py-2.5 px-4 text-center"><ScoreChip score={p.fluidStatusScore} /></td>
                          <td className="py-2.5 px-4 text-center"><ScoreChip score={p.thirstScore} /></td>
                          <td className="py-2.5 px-4 text-center"><ScoreChip score={p.fluidOverloadScore} /></td>
                          <td className="py-2.5 px-4 text-center text-slate-600">
                            {clin?.preDialysisWeight ? `${clin.preDialysisWeight} kg` : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-center text-slate-600">
                            {clin?.interdialyticWeightGain ? `${clin.interdialyticWeightGain} kg` : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-center text-slate-600 whitespace-nowrap">
                            {clin?.systolicBp ? `${clin.systolicBp}/${clin.diastolicBp}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ScoreChip({ score }: { score: number }) {
  const colors: Record<number, string> = {
    1: 'bg-green-100 text-green-800',
    2: 'bg-teal-100 text-teal-800',
    3: 'bg-yellow-100 text-yellow-800',
    4: 'bg-orange-100 text-orange-800',
    5: 'bg-red-100 text-red-800',
  }
  return (
    <span className={clsx('inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-sm', colors[score])}>
      {score}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PatientForm({
  patientCode,
  studyWeek,
  timepoint,
  timepointLabel,
  timepointLabelEn,
  alreadySubmitted: initiallySubmitted,
  dryWeight,
  promId: initialPromId,
  existingScores,
}: Props) {
  const [lang, setLang] = useState<Lang>('de')
  const [scores, setScores] = useState<Scores>({
    fluidStatusScore: existingScores?.fluidStatusScore ?? null,
    thirstScore: existingScores?.thirstScore ?? null,
    fluidOverloadScore: existingScores?.fluidOverloadScore ?? null,
    recoveryTime: existingScores?.recoveryTime ?? null,
  })
  const [promId, setPromId] = useState<number | null>(initialPromId)
  const [view, setView] = useState<View>(initiallySubmitted ? 'submitted' : 'form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const t = T[lang]
  const allAnswered = scores.fluidStatusScore !== null && scores.thirstScore !== null && scores.fluidOverloadScore !== null

  async function handleSubmit() {
    if (!allAnswered) return
    setLoading(true)
    setError(null)
    try {
      const isEdit = promId !== null
      const res = await fetch('/api/prom', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { id: promId, fluidStatusScore: scores.fluidStatusScore, thirstScore: scores.thirstScore, fluidOverloadScore: scores.fluidOverloadScore, recoveryTime: scores.recoveryTime }
            : { fluidStatusScore: scores.fluidStatusScore, thirstScore: scores.thirstScore, fluidOverloadScore: scores.fluidOverloadScore, recoveryTime: scores.recoveryTime }
        ),
      })
      if (res.status === 409) { setView('submitted'); return }
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t.unknownError)
        return
      }
      if (!isEdit) {
        const data = await res.json()
        setPromId(data.id)
      }
      setView('submitted')
    } catch {
      setError(t.networkError)
    } finally {
      setLoading(false)
    }
  }

  // ── Language + logout header ──────────────────────────────────────────────
  function Header() {
    return (
      <div className="bg-blue-800 px-6 py-4 flex items-center justify-between shadow">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">{t.hello(patientCode)}</h1>
          <p className="text-blue-200 text-base">{t.studyWeek(studyWeek)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang((l) => l === 'de' ? 'en' : 'de')}
            className="text-blue-200 hover:text-white text-sm font-bold px-3 py-2 rounded-xl hover:bg-blue-700 transition border border-blue-600"
          >
            {lang === 'de' ? 'EN' : 'DE'}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-blue-300 hover:text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 transition"
          >
            {t.logout}
          </button>
        </div>
      </div>
    )
  }

  // ── History view ──────────────────────────────────────────────────────────
  if (view === 'history') {
    return <HistoryView lang={lang} setLang={setLang} dryWeight={dryWeight} onBack={() => setView('submitted')} />
  }

  // ── Confirmation screen ───────────────────────────────────────────────────
  if (view === 'submitted') {
    return (
      <div className="min-h-screen bg-green-700 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 sm:p-10 max-w-xl w-full text-center shadow-2xl">
            <h1 className="text-3xl sm:text-4xl font-black text-slate-800 mb-3">{t.thankYou}</h1>
            <p className="text-slate-600 text-xl mb-1">{t.savedOk}</p>
            <p className="text-slate-400 text-lg mb-6">{t.weekOf(studyWeek)}</p>

            {scores.fluidStatusScore !== null && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {PROM_QUESTIONS[lang].map((_q, i) => {
                  const keys = ['fluidStatusScore', 'thirstScore', 'fluidOverloadScore'] as const
                  const score = scores[keys[i]] ?? 0
                  return (
                    <div key={i} className="bg-slate-50 rounded-2xl p-4">
                      <div className={clsx('text-3xl font-black rounded-xl py-1 text-white', GRADE_BG[score])}>
                        {score}
                      </div>
                      <p className="text-slate-500 text-xs mt-1">{t.grades[score]}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {scores.recoveryTime && (
              <div className="bg-slate-50 rounded-2xl px-4 py-3 mb-6 flex items-center justify-center gap-2">
                <span className="text-slate-600 font-semibold">{RECOVERY_LABELS[scores.recoveryTime as keyof typeof RECOVERY_LABELS][lang]}</span>
              </div>
            )}

            <button
              onClick={() => setView('history')}
              className="w-full h-14 rounded-2xl bg-blue-700 text-white text-lg font-bold hover:bg-blue-800 transition-all mb-3"
            >
              {t.viewProgress}
            </button>
            <button
              onClick={() => setView('form')}
              className="w-full h-12 rounded-2xl bg-slate-100 text-slate-600 text-base font-semibold hover:bg-slate-200 transition-all mb-3"
            >
              {t.editAnswers}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full h-12 rounded-2xl bg-slate-100 text-slate-600 text-base font-semibold hover:bg-slate-200 transition-all"
            >
              {t.logout}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Question screen ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-blue-900 flex flex-col">
      <Header />

      <div className="flex-1 p-4 py-6 max-w-5xl mx-auto w-full space-y-5">

        {/* Timepoint banner */}
        <div className="bg-white rounded-2xl px-6 py-4 shadow-lg border-l-8 border-blue-600">
          <p className="text-slate-500 text-sm font-semibold uppercase tracking-wide mb-1">{t.timepointLabel}</p>
          <p className="text-blue-900 text-xl sm:text-2xl font-bold">{lang === 'de' ? timepointLabel : timepointLabelEn}</p>
        </div>

        {/* Questions — 1 col mobile, 3 col desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {PROM_QUESTIONS[lang].map((question, i) => {
            const keys = ['fluidStatusScore', 'thirstScore', 'fluidOverloadScore'] as const
            const key = keys[i]
            return (
              <div key={key} className="bg-white rounded-2xl p-5 shadow-lg flex flex-col gap-4">
                <div>
                  <p className="text-slate-800 text-lg sm:text-xl font-bold leading-tight">{question.label}</p>
                  {question.sublabel && <p className="text-slate-500 text-sm mt-1">{question.sublabel}</p>}
                  <p className="text-slate-400 text-xs mt-1">
                    <span className="font-semibold">1</span> = {t.grades[1]}
                    <span className="mx-1.5">·</span>
                    <span className="font-semibold">5</span> = {t.grades[5]}
                  </p>
                </div>

                <div className="grid grid-cols-5 gap-2 mt-auto">
                  {([1, 2, 3, 4, 5] as const).map((grade) => {
                    const isSelected = scores[key] === grade
                    return (
                      <button
                        key={grade}
                        onClick={() => setScores((prev) => ({ ...prev, [key]: grade }))}
                        aria-label={`${grade}: ${t.grades[grade]}`}
                        className={clsx(
                          'flex items-center justify-center rounded-xl border-4 transition-all duration-150',
                          'py-3 cursor-pointer focus:outline-none focus:ring-4 focus:ring-offset-1 active:scale-95',
                          isSelected
                            ? `${GRADE_BG[grade]} text-white shadow-lg scale-105`
                            : `border-slate-300 bg-white text-slate-700 ${GRADE_HOVER[grade]}`
                        )}
                      >
                        <span className="text-2xl font-black">{grade}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Recovery time — optional 4th question */}
        <div className="bg-white rounded-2xl p-5 shadow-lg">
          <div className="mb-4">
            <p className="text-slate-800 text-lg sm:text-xl font-bold leading-tight">{RECOVERY_QUESTION[lang].label}</p>
            <p className="text-slate-500 text-sm mt-1">{RECOVERY_QUESTION[lang].sublabel} <span className="text-slate-400">{RECOVERY_QUESTION[lang].optional}</span></p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {RECOVERY_OPTIONS.map((opt) => {
              const isSelected = scores.recoveryTime === opt
              return (
                <button
                  key={opt}
                  onClick={() => setScores((prev) => ({ ...prev, recoveryTime: prev.recoveryTime === opt ? null : opt }))}
                  className={clsx(
                    'py-4 sm:py-5 rounded-xl border-4 font-black text-xl transition-all duration-150 active:scale-95',
                    isSelected
                      ? 'bg-blue-600 border-blue-700 text-white shadow-lg scale-105'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50'
                  )}
                >
                  {RECOVERY_LABELS[opt][lang]}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl px-5 py-4">
            <p className="text-red-700 font-semibold text-lg">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!allAnswered || loading}
          className={clsx(
            'w-full py-6 rounded-2xl text-2xl sm:text-3xl font-black shadow-xl transition-all',
            allAnswered && !loading
              ? 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
          )}
        >
          {loading ? t.saving : allAnswered ? t.submit : t.answersRequired}
        </button>

      </div>
    </div>
  )
}
