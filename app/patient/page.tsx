import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getCurrentStudyWeek, getTimepointForWeek, getTimepointLabel, getTimepointLabelEn } from '@/lib/study'
import PatientForm from './PatientForm'

export default async function PatientPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'patient') redirect('/login')

  const patientId = session.user.patientId!

  // Check study config
  const config = await prisma.studyConfig.findFirst()
  if (!config) {
    return <StudyNotConfigured patientName={session.user.name ?? ''} />
  }

  const studyWeek = getCurrentStudyWeek(config.studyStartDate)
  if (!studyWeek) {
    return <StudyNotActive patientName={session.user.name ?? ''} />
  }

  const timepoint = getTimepointForWeek(studyWeek)
  const timepointLabel = getTimepointLabel(timepoint)
  const timepointLabelEn = getTimepointLabelEn(timepoint)

  // Fetch patient's dry weight
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { dryWeight: true },
  })

  // Check if already submitted today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existing = await prisma.promResponse.findUnique({
    where: { patientId_sessionDate: { patientId, sessionDate: today } },
  })

  return (
    <PatientForm
      patientName={session.user.name ?? ''}
      studyWeek={studyWeek}
      timepoint={timepoint}
      timepointLabel={timepointLabel}
      timepointLabelEn={timepointLabelEn}
      alreadySubmitted={!!existing}
      dryWeight={patient?.dryWeight ? Number(patient.dryWeight) : null}
      existingScores={
        existing
          ? {
              fluidStatusScore: existing.fluidStatusScore,
              thirstScore: existing.thirstScore,
              fluidOverloadScore: existing.fluidOverloadScore,
            }
          : null
      }
    />
  )
}

function StudyNotConfigured({ patientName }: { patientName: string }) {
  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-10 max-w-lg text-center shadow-2xl">
        <div className="text-6xl mb-4">⏳</div>
        <h1 className="text-3xl font-black text-slate-800 mb-3">Hallo, {patientName}!</h1>
        <p className="text-slate-600 text-xl">
          Die Studie wurde noch nicht gestartet. Bitte fragen Sie das Pflegepersonal.
        </p>
      </div>
    </div>
  )
}

function StudyNotActive({ patientName }: { patientName: string }) {
  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-10 max-w-lg text-center shadow-2xl">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-black text-slate-800 mb-3">Hallo, {patientName}!</h1>
        <p className="text-slate-600 text-xl">
          Die 12-wöchige Studie ist abgeschlossen. Vielen Dank für Ihre Teilnahme!
        </p>
      </div>
    </div>
  )
}
