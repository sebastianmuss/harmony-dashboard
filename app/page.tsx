import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function RootPage() {
  const session = await auth()

  if (session) {
    const role = session.user.role
    if (role === 'patient')  redirect('/patient')
    if (role === 'admin')    redirect('/admin')
    if (role === 'provider') redirect('/provider')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">

      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          <span className="font-semibold text-slate-700 text-lg">HARMONY</span>
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
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-12 pb-10">
        <span className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">
          Feasibility Trial · Medical University of Vienna
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-800 max-w-2xl leading-tight mb-5">
          HARMONY
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl leading-relaxed mb-3">
          A shared decision-making dashboard for fluid management in haemodialysis.
        </p>
        <p className="text-sm text-slate-500 max-w-xl leading-relaxed mb-10">
          A transnational feasibility trial (Austria, Ireland, Scotland) integrating routinely
          collected dialysis data with patient-reported symptoms to enable patient-centred
          fluid management decisions.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition text-base shadow-sm"
        >
          Sign in to the dashboard
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>

      {/* Rationale */}
      <section className="max-w-3xl mx-auto w-full px-6 py-10">
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">Study Rationale</h2>
        <p className="text-slate-600 leading-relaxed text-sm">
          Fluid status in haemodialysis is strongly associated with acute symptoms, hospitalisation,
          and cardiovascular mortality. Despite technological advances, routine fluid management
          practice — target weight estimation and interdialytic weight gain control — has changed
          little in decades. HARMONY frames fluid management as a complex intervention requiring
          systems-level support: integrating routinely collected dialysis data with patient-reported
          symptoms to enable truly shared, patient-centred decisions. The intervention design is
          underpinned by Social Cognitive Theory, drawing on established behaviour-change mechanisms
          related to self-efficacy, feedback, and shared decision-making.
        </p>
      </section>

      {/* Objectives */}
      <section className="max-w-3xl mx-auto w-full px-6 py-4">
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">Study Objectives</h2>
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-1">Primary Objective</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              To assess the feasibility of conducting a pragmatic, multicentre, cluster randomised
              trial of data-enabled shared decision-making for fluid management in haemodialysis.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-2">Secondary Objectives</h3>
            <ul className="text-sm text-slate-500 leading-relaxed space-y-1.5 list-none">
              {[
                'Estimate signals of effect on intradialytic hypotension',
                'Characterise adherence to the platform by patients and clinicians',
                'Describe data completeness and process metrics to refine the intervention and trial procedures',
                'Assess quality of life status',
                'Evaluate shared decision-making (NICE framework survey)',
              ].map((o, i) => (
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
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-2 text-center">Platform Interface</h2>
        <p className="text-sm text-slate-500 text-center mb-8">Patient and clinician views designed for use at the dialysis chair.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Patient view mockup */}
          <div className="rounded-2xl border border-slate-200 shadow-md overflow-hidden bg-white">
            {/* Browser chrome */}
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/></div>
              <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-slate-400 mx-2 border border-slate-200">harmony-app.at/patient</div>
            </div>
            {/* App content */}
            <div className="bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">HARMONY-Studie · Woche 3/12</p>
                  <p className="font-semibold text-slate-700 text-sm mt-0.5">Hallo, HMY-0042!</p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2.5 py-1">Heute: Ankunft</span>
              </div>
              {/* Questions */}
              {[
                { icon: '💧', label: 'Wie fühlen Sie sich heute?', sub: 'Allgemeines Wohlbefinden', selected: 2 },
                { icon: '🥤', label: 'Wie stark ist Ihr Durstgefühl?', sub: '1 = kein Durst · 5 = extremer Durst', selected: 3 },
                { icon: '⚖️', label: 'Fühlen Sie sich aufgeschwemmt?', sub: '1 = gar nicht · 5 = sehr stark', selected: 1 },
              ].map((q) => (
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
              {/* Recovery time */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3 shadow-sm">
                <p className="text-xs font-medium text-slate-700 mb-0.5">⏱️ Erholungszeit nach Dialyse</p>
                <p className="text-xs text-slate-400 mb-2">Zeit bis zur Erholung nach der letzten Sitzung</p>
                <div className="flex gap-1.5">
                  {['0–2 Std.','3–6 Std.','7–12 Std.','>12 Std.'].map((o, i) => (
                    <div key={o} className={`flex-1 rounded-lg py-1.5 text-center text-xs font-medium border ${i === 1 ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{o}</div>
                  ))}
                </div>
              </div>
              <div className="bg-blue-600 text-white text-center rounded-xl py-2.5 text-sm font-semibold">Speichern</div>
            </div>
          </div>

          {/* Provider view mockup */}
          <div className="rounded-2xl border border-slate-200 shadow-md overflow-hidden bg-white">
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/><div className="w-3 h-3 rounded-full bg-slate-300"/></div>
              <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-slate-400 mx-2 border border-slate-200">harmony-app.at/provider</div>
            </div>
            <div className="bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">MWF Morning · Woche 3</p>
                  <p className="font-semibold text-slate-700 text-sm mt-0.5">Shift Dashboard</p>
                </div>
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1">8 / 12 PROMs</span>
              </div>
              {/* Patient cards */}
              {[
                { code: 'HMY-0042', scores: [2,3,1], rt: '3–6h', weight: '74.2', idwg: '1.8', bp: '138/82', submitted: true, stale: false },
                { code: 'HMY-0017', scores: [4,4,3], rt: '>12h', weight: '81.5', idwg: '3.1', bp: '152/90', submitted: true, stale: false },
                { code: 'HMY-0091', scores: null, rt: null, weight: '—', idwg: '—', bp: '—', submitted: false, stale: true },
              ].map((p) => (
                <div key={p.code} className={`bg-white rounded-xl border p-3 mb-2 shadow-sm ${p.stale ? 'border-amber-200' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-slate-700">{p.code}</span>
                    <div className="flex gap-1.5 items-center">
                      {p.submitted
                        ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">PROM ✓</span>
                        : <span className="text-xs bg-slate-100 text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">PROM ausstehend</span>
                      }
                      {p.stale && <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">7 Tage</span>}
                    </div>
                  </div>
                  {p.scores && (
                    <div className="flex gap-3 mb-2">
                      {['💧','🥤','⚖️'].map((icon, i) => (
                        <div key={icon} className="flex items-center gap-1">
                          <span className="text-xs">{icon}</span>
                          <span className={`text-xs font-bold ${p.scores![i] >= 4 ? 'text-red-500' : p.scores![i] === 3 ? 'text-amber-500' : 'text-green-600'}`}>{p.scores![i]}</span>
                        </div>
                      ))}
                      <span className="text-xs text-slate-400">⏱️ {p.rt}</span>
                    </div>
                  )}
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span>⚖ {p.weight} kg</span>
                    <span>IDWG {p.idwg} kg</span>
                    <span>BP {p.bp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Design */}
      <section className="max-w-3xl mx-auto w-full px-6 py-10">
        <h2 className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-4">Study Design</h2>
        <p className="text-slate-600 leading-relaxed text-sm mb-6">
          Prospective, multicentre, cluster randomised, open-label, waitlist-controlled feasibility
          trial. Clusters (dialysis centres) are randomised 1:1 to intervention or waitlist control.
          Centres randomised to intervention receive 12 weeks of exposure to the fluid dashboard web
          application. Control centres receive standard of care for 12 weeks before crossing over to
          the intervention. The waitlist-controlled design minimises contamination between clinicians
          and patients while ensuring all centres ultimately receive the platform.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: 'Patient-Reported Outcomes', body: 'Patients log fluid status, thirst, and recovery time at every session via a simple large-touch interface.' },
            { title: 'Clinical Monitoring', body: 'Nursing staff enter weight, IDWG, and blood pressure. Trend charts support clinical decision-making.' },
            { title: 'Feasibility Tracking', body: 'Study coordinators monitor participation rates, data completeness, and PROM trends across the 12-week period.' },
          ].map((f) => (
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
