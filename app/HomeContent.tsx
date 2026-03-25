'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PROM_QUESTIONS, RECOVERY_OPTIONS, RECOVERY_LABELS, RECOVERY_QUESTION, type Lang } from '@/lib/prom-i18n'

const T = {
  en: {
    trial:        'Feasibility Trial',
    subtitle:     'A shared decision-making dashboard for fluid management in haemodialysis.',
    tagline:      'A transnational feasibility trial (Austria, Ireland, Scotland) integrating routinely collected dialysis data with patient-reported symptoms to enable patient-centred fluid management decisions.',
    signin:       'Sign in to the dashboard',
    rationale:    'Study Rationale',
    rationaleBody: 'Fluid status in haemodialysis is strongly associated with acute symptoms, hospitalisation, and cardiovascular mortality. Despite technological advances, routine fluid management practice — target weight estimation and interdialytic weight gain control — has changed little in decades. HARMONY frames fluid management as a complex intervention requiring systems-level support: integrating routinely collected dialysis data with patient-reported symptoms to enable truly shared, patient-centred decisions. The intervention design is underpinned by Social Cognitive Theory, drawing on established behaviour-change mechanisms related to self-efficacy, feedback, and shared decision-making.',
    objectives:   'Study Objectives',
    primary:      'Primary Objective',
    primaryBody:  'To assess the feasibility of conducting a pragmatic, multicentre, cluster randomised trial of data-enabled shared decision-making for fluid management in haemodialysis.',
    secondary:    'Secondary Objectives',
    secondaryList: [
      'Estimate signals of effect on intradialytic hypotension',
      'Characterise adherence to the platform by patients and clinicians',
      'Describe data completeness and process metrics to refine the intervention and trial procedures',
      'Assess quality of life status',
      'Evaluate shared decision-making (NICE framework survey)',
    ],
    interface:    'Platform Interface',
    interfaceSub: 'Patient and clinician views designed for use at the dialysis chair.',
    design:       'Study Design',
    designBody:   'Prospective, multicentre, cluster randomised, open-label, waitlist-controlled feasibility trial. Clusters (dialysis centres) are randomised 1:1 to intervention or waitlist control. Centres randomised to intervention receive 12 weeks of exposure to the fluid dashboard web application. Control centres receive standard of care for 12 weeks before crossing over to the intervention. The waitlist-controlled design minimises contamination between clinicians and patients while ensuring all centres ultimately receive the platform.',
    features: [
      { title: 'Patient-Reported Outcomes', body: 'Patients log fluid status, thirst, and recovery time at every session via a simple large-touch interface.' },
      { title: 'Clinical Monitoring',       body: 'Nursing staff enter weight, IDWG, and blood pressure. Trend charts support clinical decision-making.' },
      { title: 'Feasibility Tracking',      body: 'Study coordinators monitor participation rates, data completeness, and PROM trends across the 12-week period.' },
    ],
    // mockup labels
    patientWeek:   'HARMONY Study · Week 3/12',
    patientHello:  'Hello, HMY-0042!',
    patientTP:     'Today: Arrival',
    save:     'Save',
    shiftLabel: 'MWF Morning · Week 3',
    shiftTitle: 'Shift Dashboard',
    promCount:  '8 / 12 PROMs',
    promEdit:   'Edit PROM',
    promEnter:  'Enter PROM',
    staleLabel: 'Last PROM: 9d',
    sessions:   'sessions',
  },
  de: {
    trial:        'Machbarkeitsstudie',
    subtitle:     'Ein Shared-Decision-Making-Dashboard für das Flüssigkeitsmanagement in der Hämodialyse.',
    tagline:      'Eine transnationale Machbarkeitsstudie (Österreich, Irland, Schottland), die routinemäßig erhobene Dialysedaten mit patientenberichteten Symptomen verbindet, um patientenzentrierte Entscheidungen im Flüssigkeitsmanagement zu ermöglichen.',
    signin:       'Zum Dashboard anmelden',
    rationale:    'Studienbegründung',
    rationaleBody: 'Der Flüssigkeitsstatus in der Hämodialyse ist eng mit akuten Symptomen, Krankenhausaufenthalten und kardiovaskulärer Mortalität verbunden. Trotz technologischer Fortschritte hat sich die Routinepraxis des Flüssigkeitsmanagements – Zielgewichtschätzung und Kontrolle der interdialytischen Gewichtszunahme – seit Jahrzehnten kaum verändert. HARMONY betrachtet das Flüssigkeitsmanagement als komplexe Intervention, die systemische Unterstützung erfordert: Die Integration routinemäßig erhobener Dialysedaten mit patientenberichteten Symptomen soll echte, patientenzentrierte gemeinsame Entscheidungen ermöglichen. Das Interventionsdesign basiert auf der Sozialen Kognitiven Theorie und nutzt Mechanismen der Verhaltensänderung in Bezug auf Selbstwirksamkeit, Feedback und gemeinsame Entscheidungsfindung.',
    objectives:   'Studienziele',
    primary:      'Primäres Ziel',
    primaryBody:  'Beurteilung der Machbarkeit einer pragmatischen, multizentrischen, cluster-randomisierten Studie zur datengestützten gemeinsamen Entscheidungsfindung beim Flüssigkeitsmanagement in der Hämodialyse.',
    secondary:    'Sekundäre Ziele',
    secondaryList: [
      'Abschätzung von Effektsignalen auf intradialytische Hypotonie',
      'Charakterisierung der Plattform-Adhärenz bei Patienten und Klinikern',
      'Beschreibung der Datenvollständigkeit und Prozessmetriken zur Verfeinerung der Intervention',
      'Erfassung des Lebensqualitätsstatus',
      'Bewertung der gemeinsamen Entscheidungsfindung (NICE-Framework-Fragebogen)',
    ],
    interface:    'Plattform-Oberfläche',
    interfaceSub: 'Patienten- und Klinikansichten für den Einsatz am Dialyseplatz.',
    design:       'Studiendesign',
    designBody:   'Prospektive, multizentrische, cluster-randomisierte, offene, wartelisten-kontrollierte Machbarkeitsstudie. Cluster (Dialysezentren) werden im Verhältnis 1:1 auf Intervention oder Warteliste randomisiert. Interventionszentren erhalten 12 Wochen Zugang zur Fluid-Dashboard-Webanwendung. Kontrollzentren erhalten 12 Wochen Standardversorgung und wechseln danach in den Interventionsarm. Das Wartelisten-Design minimiert Kontamination zwischen Klinikern und Patienten und stellt sicher, dass alle Zentren die Plattform erhalten.',
    features: [
      { title: 'Patientenberichtete Ergebnisse', body: 'Patienten erfassen Flüssigkeitsstatus, Durstgefühl und Erholungszeit bei jeder Sitzung über eine einfache, großflächige Oberfläche.' },
      { title: 'Klinisches Monitoring',          body: 'Pflegepersonal erfasst Gewicht, IDWG und Blutdruck. Verlaufsdiagramme unterstützen klinische Entscheidungen.' },
      { title: 'Machbarkeitsverfolgung',         body: 'Studienkoordinatoren überwachen Teilnahmequoten, Datenvollständigkeit und PROM-Verläufe über den 12-Wochen-Zeitraum.' },
    ],
    patientWeek:   'HARMONY-Studie · Woche 3/12',
    patientHello:  'Hallo, HMY-0042!',
    patientTP:     'Heute: Ankunft',
    save:     'Speichern',
    shiftLabel: 'MWF Morning · Woche 3',
    shiftTitle: 'Shift Dashboard',
    promCount:  '8 / 12 PROMs',
    promEdit:   'PROM bearbeiten',
    promEnter:  'PROM erfassen',
    staleLabel: 'Letzte PROM: 9d',
    sessions:   'Sitzungen',
  },
}

const scoreBg: Record<number, string> = {
  1: 'bg-green-100 text-green-800 border-green-300',
  2: 'bg-teal-100 text-teal-800 border-teal-300',
  3: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  4: 'bg-orange-100 text-orange-800 border-orange-300',
  5: 'bg-red-100 text-red-800 border-red-300',
}

export default function HomeContent() {
  const [lang, setLang] = useState<Lang>('en')
  const t = T[lang]

  const patients = [
    { code: 'HMY-0042', scores: [2, 3, 1] as [number, number, number], submitted: true,  onHD: true,  stale: false, sessions: 14 },
    { code: 'HMY-0017', scores: [4, 4, 3] as [number, number, number], submitted: true,  onHD: true,  stale: false, sessions: 13 },
    { code: 'HMY-0091', scores: null,                                   submitted: false, onHD: true,  stale: true,  sessions: 11 },
    { code: 'HMY-0055', scores: null,                                   submitted: false, onHD: false, stale: false, sessions: 12 },
  ]

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">

      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c-5.33 8.55-8 13.8-8 17a8 8 0 0 0 16 0c0-3.2-2.67-8.45-8-17z"/>
            </svg>
          </div>
          <span className="font-semibold text-slate-700 text-lg">HARMONY</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Language toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 text-xs font-semibold transition ${lang === 'en' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >EN</button>
            <button
              onClick={() => setLang('de')}
              className={`px-3 py-1.5 text-xs font-semibold transition ${lang === 'de' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >DE</button>
          </div>
          <a
            href="https://github.com/sebastianmuss/harmony-dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-500 hover:text-slate-700 transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            GitHub
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-12 pb-10">
        <span className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">{t.trial}</span>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-800 max-w-2xl leading-tight mb-5">HARMONY</h1>
        <p className="text-lg text-slate-600 max-w-2xl leading-relaxed mb-3">{t.subtitle}</p>
        <p className="text-sm text-slate-500 max-w-xl leading-relaxed mb-10">{t.tagline}</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition text-base shadow-sm"
        >
          {t.signin}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>

      {/* Rationale */}
      <section className="max-w-3xl mx-auto w-full px-6 py-10">
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">{t.rationale}</h2>
        <p className="text-slate-600 leading-relaxed text-sm">{t.rationaleBody}</p>
      </section>

      {/* Objectives */}
      <section className="max-w-3xl mx-auto w-full px-6 py-4">
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">{t.objectives}</h2>
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-1">{t.primary}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{t.primaryBody}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-2">{t.secondary}</h3>
            <ul className="text-sm text-slate-500 leading-relaxed space-y-1.5 list-none">
              {t.secondaryList.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-blue-400 font-semibold flex-shrink-0">{['i','ii','iii','iv','v'][i]}.</span>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Interface previews */}
      <section className="max-w-5xl mx-auto w-full px-6 py-10">
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-2 text-center">{t.interface}</h2>
        <p className="text-sm text-slate-500 text-center mb-8">{t.interfaceSub}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Patient mockup */}
          <div className="rounded-2xl border border-slate-200 shadow-md overflow-hidden bg-white">
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/></div>
              <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-slate-400 mx-2 border border-slate-200">harmony.study/patient</div>
            </div>
            <div className="bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">{t.patientWeek}</p>
                  <p className="font-semibold text-slate-700 text-sm mt-0.5">{t.patientHello}</p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2.5 py-1">{t.patientTP}</span>
              </div>
              {PROM_QUESTIONS[lang].map((q, idx) => ({
                icon: q.icon, label: q.label, sub: q.sublabel, selected: [2, 3, 1][idx],
              })).map((q) => (
                <div key={q.label} className="bg-white rounded-xl border border-slate-200 p-3 mb-2 shadow-sm">
                  <p className="text-xs font-medium text-slate-700 mb-0.5">{q.icon} {q.label}</p>
                  <p className="text-xs text-slate-400 mb-2">{q.sub}</p>
                  <div className="flex gap-1.5">
                    {[1,2,3,4,5].map((n) => (
                      <div key={n} className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold border ${n === q.selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{n}</div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3 shadow-sm">
                <p className="text-xs font-medium text-slate-700 mb-0.5">{RECOVERY_QUESTION[lang].icon} {RECOVERY_QUESTION[lang].label}</p>
                <p className="text-xs text-slate-400 mb-2">{RECOVERY_QUESTION[lang].sublabel}</p>
                <div className="flex gap-1.5">
                  {RECOVERY_OPTIONS.map((o, i) => (
                    <div key={o} className={`flex-1 rounded-lg py-1.5 text-center text-xs font-medium border ${i === 1 ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{RECOVERY_LABELS[o][lang]}</div>
                  ))}
                </div>
              </div>
              <div className="bg-blue-600 text-white text-center rounded-xl py-2.5 text-sm font-semibold">{t.save}</div>
            </div>
          </div>

          {/* Provider mockup */}
          <div className="rounded-2xl border border-slate-200 shadow-md overflow-hidden bg-white">
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/></div>
              <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-slate-400 mx-2 border border-slate-200">harmony.study/provider</div>
            </div>
            <div className="bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">{t.shiftLabel}</p>
                  <p className="font-semibold text-slate-700 text-sm mt-0.5">{t.shiftTitle}</p>
                </div>
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1">{t.promCount}</span>
              </div>
              {patients.map((p) => {
                const borderColor = p.submitted ? 'border-green-300' : p.onHD ? 'border-yellow-300' : 'border-slate-200'
                const dotColor    = p.submitted ? 'bg-green-500'     : p.onHD ? 'bg-yellow-400'     : 'bg-slate-300'
                return (
                  <div key={p.code} className={`bg-white rounded-xl border-2 shadow-sm mb-2 overflow-hidden ${borderColor}`}>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono font-bold text-blue-700 flex-1 text-sm">{p.code}</p>
                          {p.scores && (
                            <div className="flex gap-1 flex-shrink-0">
                              {p.scores.map((s, i) => (
                                <span key={i} className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border-2 font-bold text-xs ${scoreBg[s]}`}>{s}</span>
                              ))}
                            </div>
                          )}
                          <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold flex-shrink-0 ${p.submitted ? 'bg-slate-100 text-slate-600' : 'bg-blue-600 text-white'}`}>
                            {p.submitted ? t.promEdit : t.promEnter}
                          </span>
                          <span className="text-slate-400 text-xs flex-shrink-0">▼</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                          <span>Feldbach</span>
                          <span>·</span>
                          <span>{p.sessions} {t.sessions}</span>
                          {p.stale && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{t.staleLabel}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </section>

      {/* Design */}
      <section className="max-w-3xl mx-auto w-full px-6 py-10">
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">{t.design}</h2>
        <p className="text-slate-600 leading-relaxed text-sm mb-6">{t.designBody}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {t.features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-1.5">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

    </main>
  )
}
