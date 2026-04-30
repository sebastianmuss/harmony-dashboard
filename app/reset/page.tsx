'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkPassword, PASSWORD_RULES_DE, PASSWORD_RULES_EN } from '@/lib/password'
import clsx from 'clsx'

type Lang = 'de' | 'en'
type Role = 'patient' | 'provider'

const T = {
  de: {
    title: 'Passwort festlegen',
    subtitle: 'Geben Sie Ihren Code und ein neues Passwort ein.',
    rolePatient: 'Patient',
    roleProvider: 'Pflegepersonal / Admin',
    identifier: (r: Role) => r === 'patient' ? 'Patientenkennung' : 'Benutzername',
    identifierPlaceholder: (r: Role) => r === 'patient' ? 'HMY-0001' : 'benutzername',
    token: 'Einmalcode',
    tokenPlaceholder: 'XXXX-XXXX',
    password: 'Neues Passwort',
    confirm: 'Passwort bestätigen',
    submit: 'Passwort setzen',
    saving: 'Wird gespeichert…',
    mismatch: 'Passwörter stimmen nicht überein.',
    success: 'Passwort erfolgreich gesetzt. Sie können sich jetzt anmelden.',
    toLogin: 'Zur Anmeldung',
    backToLogin: '← Zur Anmeldung',
  },
  en: {
    title: 'Set password',
    subtitle: 'Enter your one-time code and choose a new password.',
    rolePatient: 'Patient',
    roleProvider: 'Provider / Admin',
    identifier: (r: Role) => r === 'patient' ? 'Patient code' : 'Username',
    identifierPlaceholder: (r: Role) => r === 'patient' ? 'HMY-0001' : 'username',
    token: 'One-time code',
    tokenPlaceholder: 'XXXX-XXXX',
    password: 'New password',
    confirm: 'Confirm password',
    submit: 'Set password',
    saving: 'Saving…',
    mismatch: 'Passwords do not match.',
    success: 'Password set successfully. You can now log in.',
    toLogin: 'Go to login',
    backToLogin: '← Back to login',
  },
}

export default function ResetPage() {
  const router = useRouter()
  const [lang, setLang] = useState<Lang>('de')
  const [role, setRole] = useState<Role>('patient')
  const [identifier, setIdentifier] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const t = T[lang]
  const checks = checkPassword(password)
  const rules = lang === 'de' ? PASSWORD_RULES_DE : PASSWORD_RULES_EN

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError(t.mismatch); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, identifier: identifier.trim(), token: token.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setDone(true)
    } catch {
      setError(lang === 'de' ? 'Netzwerkfehler. Bitte erneut versuchen.' : 'Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-blue-900 flex flex-col items-center p-4 pt-5">
      {/* Top bar */}
      <div className="w-full max-w-sm mb-6 flex items-center justify-between">
        <a href="/login" className="text-blue-300 hover:text-white text-sm flex items-center gap-1.5 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t.backToLogin.replace('← ', '')}
        </a>
        <div className="flex items-center bg-blue-800 border border-blue-600 rounded-lg overflow-hidden">
          <button onClick={() => setLang('de')} className={`px-3 py-1.5 text-xs font-semibold transition ${lang === 'de' ? 'bg-white text-blue-900' : 'text-blue-300 hover:text-white'}`}>DE</button>
          <button onClick={() => setLang('en')} className={`px-3 py-1.5 text-xs font-semibold transition ${lang === 'en' ? 'bg-white text-blue-900' : 'text-blue-300 hover:text-white'}`}>EN</button>
        </div>
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-white tracking-tight">HARMONY</h1>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center space-y-4">
              <p className="text-green-700 font-semibold">{t.success}</p>
              <button onClick={() => router.push('/login')}
                className="w-full h-12 rounded-xl bg-blue-700 text-white font-bold hover:bg-blue-800 transition">
                {t.toLogin}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">{t.title}</h2>
                <p className="text-slate-500 text-sm">{t.subtitle}</p>
              </div>

              {/* Role toggle */}
              <div className="flex rounded-xl overflow-hidden border border-slate-200">
                {(['patient', 'provider'] as Role[]).map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={`flex-1 py-2 text-sm font-semibold transition ${role === r ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {r === 'patient' ? t.rolePatient : t.roleProvider}
                  </button>
                ))}
              </div>

              {/* Identifier */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">{t.identifier(role)}</label>
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required
                  placeholder={t.identifierPlaceholder(role)}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition" />
              </div>

              {/* Token */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">{t.token}</label>
                <input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} required
                  placeholder={t.tokenPlaceholder} maxLength={9}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg font-mono tracking-widest focus:outline-none focus:border-blue-500 transition" />
              </div>

              {/* New password */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">{t.password}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition" />
                {password.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {rules.map((r) => (
                      <li key={r.key} className={clsx('text-xs flex items-center gap-1.5', checks[r.key] ? 'text-green-600' : 'text-slate-400')}>
                        <span>{checks[r.key] ? '✓' : '○'}</span> {r.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">{t.confirm}</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                  className={clsx('w-full border-2 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 transition',
                    confirm.length > 0 && password !== confirm ? 'border-red-400' : 'border-slate-200')} />
              </div>

              {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

              <button type="submit" disabled={loading}
                className="w-full h-14 rounded-xl bg-blue-700 text-white text-lg font-bold hover:bg-blue-800 transition disabled:opacity-40">
                {loading ? t.saving : t.submit}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
