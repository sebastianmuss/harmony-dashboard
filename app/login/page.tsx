'use client'
import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type LoginMode = 'patient' | 'provider'
type Lang = 'de' | 'en'

export default function LoginPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [mode, setMode] = useState<LoginMode>('patient')
  const [lang, setLang] = useState<Lang>('de')
  const [patientCode, setPatientCode] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [providerPassword, setProviderPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && session) {
      const role = session.user.role
      if (role === 'patient') router.replace('/patient')
      else if (role === 'admin') router.replace('/admin')
      else router.replace('/provider')
    }
  }, [session, status, router])

  async function submitPatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientCode.trim()) { setError(lang === 'de' ? 'Bitte geben Sie Ihre Patientenkennung ein.' : 'Please enter your patient code.'); return }
    if (!password) { setError(lang === 'de' ? 'Bitte geben Sie Ihr Passwort ein.' : 'Please enter your password.'); return }
    setError(null)
    setLoading(true)
    const result = await signIn('patient-login', { patientCode: patientCode.trim().toUpperCase(), password, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError(lang === 'de'
        ? 'Patientenkennung oder Passwort nicht erkannt. Bitte wenden Sie sich an das Pflegepersonal.'
        : 'Patient code or password not recognised. Please contact nursing staff.')
      setPassword('')
    }
  }

  async function submitProvider(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!username || !providerPassword) { setError(lang === 'de' ? 'Bitte Benutzername und Passwort eingeben.' : 'Please enter username and password.'); return }
    setError(null)
    setLoading(true)
    const result = await signIn('provider-login', { username, password: providerPassword, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError(lang === 'de' ? 'Ungültiger Benutzername oder Passwort.' : 'Invalid username or password.')
    }
  }

  return (
    <div className="min-h-screen bg-blue-900 flex flex-col items-center p-4 pt-5">
      {/* Top bar: back link + language toggle */}
      <div className="w-full max-w-sm mb-6 flex items-center justify-between">
        <a href="/" className="text-blue-300 hover:text-white text-sm flex items-center gap-1.5 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {lang === 'de' ? 'Über HARMONY' : 'About HARMONY'}
        </a>
        <div className="flex items-center bg-blue-800 border border-blue-600 rounded-lg overflow-hidden">
          <button onClick={() => setLang('de')} className={`px-3 py-1.5 text-xs font-semibold transition ${lang === 'de' ? 'bg-white text-blue-900' : 'text-blue-300 hover:text-white'}`}>DE</button>
          <button onClick={() => setLang('en')} className={`px-3 py-1.5 text-xs font-semibold transition ${lang === 'en' ? 'bg-white text-blue-900' : 'text-blue-300 hover:text-white'}`}>EN</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full">

      {/* Logo / Title */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black text-white tracking-tight">HARMONY</h1>
        <p className="text-blue-200 text-lg mt-1">
          {lang === 'de' ? 'Flüssigkeits-Dashboard' : 'Fluid Dashboard'}
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode('patient'); setError(null) }}
          className={`px-6 py-3 rounded-xl text-lg font-semibold transition-all ${mode === 'patient' ? 'bg-white text-blue-900 shadow-lg' : 'bg-blue-800 text-blue-200 hover:bg-blue-700'}`}
        >
          Patient
        </button>
        <button
          onClick={() => { setMode('provider'); setError(null) }}
          className={`px-6 py-3 rounded-xl text-lg font-semibold transition-all ${mode === 'provider' ? 'bg-white text-blue-900 shadow-lg' : 'bg-blue-800 text-blue-200 hover:bg-blue-700'}`}
        >
          {lang === 'de' ? 'Pflegepersonal / Admin' : 'Provider / Admin'}
        </button>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">

        {/* ── Patient Login ────────────────────────────────────────── */}
        {mode === 'patient' && (
          <form onSubmit={submitPatient} className="space-y-5">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-800">{lang === 'de' ? 'Willkommen' : 'Welcome'}</h2>
              <p className="text-slate-500 mt-1">{lang === 'de' ? 'Kennung und Passwort eingeben' : 'Enter your code and password'}</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Patientenkennung' : 'Patient Code'}
              </label>
              <input
                type="text"
                autoComplete="username"
                value={patientCode}
                onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg font-mono tracking-widest focus:outline-none focus:border-blue-500 transition"
                placeholder="HMY-0001"
                maxLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Passwort' : 'Password'}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition"
                placeholder="••••••••••••"
              />
            </div>

            {error && <p className="text-red-600 text-center font-semibold bg-red-50 rounded-xl p-3 text-sm">{error}</p>}

            <button type="submit" disabled={!patientCode.trim() || !password || loading}
              className="w-full h-14 rounded-2xl bg-blue-700 text-white text-xl font-bold hover:bg-blue-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? (lang === 'de' ? 'Anmeldung…' : 'Signing in…') : (lang === 'de' ? 'Anmelden' : 'Sign In')}
            </button>
          </form>
        )}

        {/* ── Provider / Admin Login ───────────────────────────────── */}
        {mode === 'provider' && (
          <form onSubmit={submitProvider} className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-800">
                {lang === 'de' ? 'Mitarbeiter-Login' : 'Staff Login'}
              </h2>
              <p className="text-slate-500 mt-1">
                {lang === 'de' ? 'Pflege / Admin' : 'Provider / Admin'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Benutzername' : 'Username'}
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition"
                placeholder={lang === 'de' ? 'benutzername' : 'username'}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">
                {lang === 'de' ? 'Passwort' : 'Password'}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={providerPassword}
                onChange={(e) => setProviderPassword(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-600 text-center font-semibold bg-red-50 rounded-xl p-3 text-sm">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-14 rounded-2xl bg-blue-700 text-white text-xl font-bold hover:bg-blue-800 transition-all disabled:opacity-40">
              {loading ? (lang === 'de' ? 'Anmeldung…' : 'Signing in…') : (lang === 'de' ? 'Anmelden' : 'Sign In')}
            </button>
          </form>
        )}
      </div>

      </div>
    </div>
  )
}
