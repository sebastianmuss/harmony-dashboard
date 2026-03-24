'use client'
import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'

type LoginMode = 'pin' | 'provider'

export default function LoginPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [mode, setMode] = useState<LoginMode>('pin')
  const [pin, setPin] = useState('')
  const [patientCode, setPatientCode] = useState('')
  const [isTouchDevice, setIsTouchDevice] = useState(true) // default true avoids numpad→input flash
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  useEffect(() => {
    if (status === 'authenticated' && session) {
      const role = session.user.role
      if (role === 'patient') router.replace('/patient')
      else if (role === 'admin') router.replace('/admin')
      else router.replace('/provider')
    }
  }, [session, status, router])

  // Keyboard capture for numpad (touch devices only — desktop uses a text input directly)
  useEffect(() => {
    if (mode !== 'pin' || !isTouchDevice) return
    function handleKey(e: KeyboardEvent) {
      if (document.activeElement?.tagName === 'INPUT') return
      if (e.key >= '0' && e.key <= '9') setPin((p) => p.length < 6 ? p + e.key : p)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Delete') setPin('')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [mode, isTouchDevice])

  // PIN pad handler
  function appendPin(digit: string) {
    if (pin.length < 6) setPin((p) => p + digit)
  }
  function clearPin() { setPin('') }
  function backspacePin() { setPin((p) => p.slice(0, -1)) }

  async function submitPin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientCode.trim()) { setError('Bitte geben Sie Ihre Patientenkennung ein.'); return }
    if (pin.length < 6) { setError('Bitte geben Sie Ihre vollständige 6-stellige PIN ein.'); return }
    setError(null)
    setLoading(true)
    const result = await signIn('patient-login', { patientCode: patientCode.trim().toUpperCase(), pin, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError('Patientenkennung oder PIN nicht erkannt. Bitte wenden Sie sich an das Pflegepersonal.')
      setPin('')
    }
  }

  async function submitProvider(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!username || !password) { setError('Please enter username and password.'); return }
    setError(null)
    setLoading(true)
    const result = await signIn('provider-login', { username, password, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError('Invalid username or password.')
    }
  }

  return (
    <div className="min-h-screen bg-blue-900 flex flex-col items-center justify-center p-4">
      {/* Back link */}
      <a
        href="/"
        className="absolute top-5 left-6 text-blue-300 hover:text-white text-sm flex items-center gap-1.5 transition"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        About HARMONY
      </a>

      {/* Logo / Title */}
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-black text-white tracking-tight">HARMONY</h1>
        <p className="text-blue-200 text-xl mt-1">Dialyse-Studie · Fluid Management</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode('pin'); setError(null) }}
          className={clsx(
            'px-6 py-3 rounded-xl text-lg font-semibold transition-all',
            mode === 'pin'
              ? 'bg-white text-blue-900 shadow-lg'
              : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
          )}
        >
          Patient (PIN)
        </button>
        <button
          onClick={() => { setMode('provider'); setError(null) }}
          className={clsx(
            'px-6 py-3 rounded-xl text-lg font-semibold transition-all',
            mode === 'provider'
              ? 'bg-white text-blue-900 shadow-lg'
              : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
          )}
        >
          Personal / Admin
        </button>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">

        {/* ── Patient PIN Login ────────────────────────────────────── */}
        {mode === 'pin' && (
          <form onSubmit={submitPin} className="space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-800">Willkommen</h2>
              <p className="text-slate-500 mt-1">Kennung und PIN eingeben</p>
            </div>

            {/* Patient code input */}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Patientenkennung</label>
              <input
                type="text"
                autoComplete="off"
                value={patientCode}
                onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg font-mono tracking-widest focus:outline-none focus:border-blue-500 transition"
                placeholder="HMY-0001"
                maxLength={8}
              />
            </div>

            {isTouchDevice ? (
              <>
                {/* PIN dot display (touch) */}
                <div className="flex justify-center gap-3">
                  {[0,1,2,3,4,5].map((i) => (
                    <div
                      key={i}
                      className={clsx(
                        'w-10 h-12 rounded-lg border-2 flex items-center justify-center text-2xl font-bold',
                        i < pin.length ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 bg-slate-50 text-transparent'
                      )}
                    >
                      {i < pin.length ? '●' : '○'}
                    </div>
                  ))}
                </div>

                {/* Numpad (touch) */}
                <div className="grid grid-cols-3 gap-3">
                  {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={key === ''}
                      onClick={() => {
                        if (key === '⌫') backspacePin()
                        else if (key !== '') appendPin(key)
                      }}
                      className={clsx(
                        'h-16 rounded-2xl text-2xl font-bold transition-all active:scale-95',
                        key === '' ? 'invisible'
                          : key === '⌫' ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          : 'bg-blue-100 text-blue-900 hover:bg-blue-200 active:bg-blue-300'
                      )}
                    >
                      {key}
                    </button>
                  ))}
                </div>

                {error && <p className="text-red-600 text-center font-semibold bg-red-50 rounded-xl p-3">{error}</p>}

                <div className="flex gap-3">
                  <button type="button" onClick={clearPin}
                    className="flex-1 h-14 rounded-2xl bg-slate-200 text-slate-700 text-xl font-bold hover:bg-slate-300 transition-all">
                    Löschen
                  </button>
                  <button type="submit" disabled={!patientCode.trim() || pin.length < 6 || loading}
                    className="flex-[2] h-14 rounded-2xl bg-blue-700 text-white text-xl font-bold hover:bg-blue-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    {loading ? 'Anmeldung…' : 'Anmelden'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* PIN text input (desktop) */}
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg tracking-widest focus:outline-none focus:border-blue-500 transition"
                    placeholder="······"
                  />
                </div>

                {error && <p className="text-red-600 text-center font-semibold bg-red-50 rounded-xl p-3">{error}</p>}

                <button type="submit" disabled={!patientCode.trim() || pin.length < 6 || loading}
                  className="w-full h-14 rounded-2xl bg-blue-700 text-white text-xl font-bold hover:bg-blue-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {loading ? 'Anmeldung…' : 'Anmelden'}
                </button>
              </>
            )}
          </form>
        )}

        {/* ── Provider / Admin Login ───────────────────────────────── */}
        {mode === 'provider' && (
          <form onSubmit={submitProvider} className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-800">Staff Login</h2>
              <p className="text-slate-500 mt-1">Provider / Admin access</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition"
                placeholder="username"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-600 text-center font-semibold bg-red-50 rounded-xl p-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-blue-700 text-white text-xl font-bold hover:bg-blue-800 transition-all disabled:opacity-40"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </div>

    </div>
  )
}
