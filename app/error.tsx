'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Ein Fehler ist aufgetreten</h1>
        <p className="text-slate-500 text-sm">
          Bitte versuchen Sie es erneut. Falls das Problem weiterhin besteht, kontaktieren Sie das Studienteam.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  )
}
