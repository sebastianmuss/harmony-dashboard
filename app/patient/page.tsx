import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getCurrentStudyWeek, getTimepointForWeek, getTimepointLabel, getTimepointLabelEn, isDialysisDay } from '@/lib/study'
import PatientForm from './PatientForm'

export default async function PatientPage() {
  const session = await auth()
  if (!session || session.user.role !== 'patient') redirect('/login')

  const patientId = session.user.patientId!
  const patientCode = session.user.patientCode ?? session.user.name ?? ''

  // Check study config
  const config = await prisma.studyConfig.findFirst()
  if (!config) {
    return <StudyNotConfigured patientCode={patientCode} />
  }

  const studyWeek = getCurrentStudyWeek(config.studyStartDate)
  if (!studyWeek) {
    return <StudyNotActive patientCode={patientCode} />
  }

  const timepoint = getTimepointForWeek(studyWeek)

  // Determine if today is a dialysis day for this patient
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dialysisSchedule = session.user.dialysisSchedule ?? 'MWF'
  const customDialysisDays = session.user.customDialysisDays ?? null
  const onHDToday = isDialysisDay(today, dialysisSchedule, customDialysisDays)

  const timepointLabel = getTimepointLabel(timepoint, onHDToday)
  const timepointLabelEn = getTimepointLabelEn(timepoint, onHDToday)

  // Fetch patient's dry weight
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { dryWeight: true },
  })

  const existing = await prisma.promResponse.findUnique({
    where: { patientId_sessionDate: { patientId, sessionDate: today } },
  })

  return (
    <PatientForm
      patientCode={patientCode}
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

function StudyNotConfigured({ patientCode }: { patientCode: string }) {
  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-10 max-w-lg text-center shadow-2xl">
        <div className="text-6xl mb-4">⏳</div>
        <h1 className="text-3xl font-black text-slate-800 mb-3">Hallo, {patientCode}!</h1>
        <p className="text-slate-600 text-xl">
          Die Studie wurde noch nicht gestartet. Bitte fragen Sie das Pflegepersonal.
        </p>
      </div>
    </div>
  )
}

function StudyNotActive({ patientCode }: { patientCode: string }) {
  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-10 max-w-lg text-center shadow-2xl">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-black text-slate-800 mb-3">Hallo, {patientCode}!</h1>
        <p className="text-slate-600 text-xl">
          Die 12-wöchige Studie ist abgeschlossen. Vielen Dank für Ihre Teilnahme!
        </p>
      </div>
    </div>
  )
}
