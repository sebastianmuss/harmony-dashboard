/**
 * Single source of truth for all PROM question wording.
 * Edit here — changes propagate to patient form, provider modal, and homepage mockup.
 */

export type PromScoreKey = 'fluidStatusScore' | 'thirstScore' | 'fluidOverloadScore'
export type RecoveryOption = '0-2h' | '3-6h' | '7-12h' | '>12h'
export type Lang = 'de' | 'en'

export interface PromQuestion {
  key: PromScoreKey
  label: string
  sublabel: string
  icon: string
}

export const PROM_QUESTIONS: Record<Lang, PromQuestion[]> = {
  de: [
    {
      key:      'fluidStatusScore',
      label:    'Wie fühlen Sie sich heute?',
      sublabel: 'Allgemeines Wohlbefinden bezogen auf Ihren Wasserhaushalt',
      icon:     '💧',
    },
    {
      key:      'thirstScore',
      label:    'Wie stark ist Ihr Durstgefühl?',
      sublabel: '',
      icon:     '🥤',
    },
    {
      key:      'fluidOverloadScore',
      label:    'Fühlen Sie sich überwässert?',
      sublabel: '',
      icon:     '⚖️',
    },
  ],
  en: [
    {
      key:      'fluidStatusScore',
      label:    'How do you feel today?',
      sublabel: 'General wellbeing / fluid balance',
      icon:     '💧',
    },
    {
      key:      'thirstScore',
      label:    'How strong is your thirst?',
      sublabel: '',
      icon:     '🥤',
    },
    {
      key:      'fluidOverloadScore',
      label:    'Do you feel fluid overloaded?',
      sublabel: '',
      icon:     '⚖️',
    },
  ],
}

export const RECOVERY_OPTIONS: RecoveryOption[] = ['0-2h', '3-6h', '7-12h', '>12h']

export const RECOVERY_LABELS: Record<RecoveryOption, Record<Lang, string>> = {
  '0-2h':  { de: '0–2 Std.',  en: '0–2 h'   },
  '3-6h':  { de: '3–6 Std.',  en: '3–6 h'   },
  '7-12h': { de: '7–12 Std.', en: '7–12 h'  },
  '>12h':  { de: '>12 Std.',  en: '>12 h'   },
}

export const RECOVERY_QUESTION: Record<Lang, { label: string; sublabel: string; icon: string; optional: string }> = {
  de: {
    label:    'Wie lange hat Ihre Erholung nach der Dialyse gedauert?',
    sublabel: 'Zeit bis Sie sich nach der letzten Sitzung wieder erholt fühlten',
    icon:     '⏱️',
    optional: '(optional)',
  },
  en: {
    label:    'How long did your recovery after dialysis take?',
    sublabel: 'Time until you felt recovered after the last session',
    icon:     '⏱️',
    optional: '(optional)',
  },
}
