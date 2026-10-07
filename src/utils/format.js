// Pure display helpers. No state, no API access.

// Score bands from _shared/ux.md: Fuerte >= 75, Posible 50-74, Debil < 50.
const BAND_STRONG_MIN = 75
const BAND_MID_MIN = 50
// Flag "baja certeza" when vector and LLM scores disagree by more than this (0-100 scale).
const LOW_CERTAINTY_GAP = 25

const PLATFORM_LABELS = {
  linkedin: 'LinkedIn',
  getonbrd: 'Get on Board',
  chiletrabajos: 'Chiletrabajos',
  bne: 'BNE',
}

export function scoreBand(score) {
  if (score >= BAND_STRONG_MIN) return { label: 'Fuerte', tone: 'strong' }
  if (score >= BAND_MID_MIN) return { label: 'Posible', tone: 'mid' }
  return { label: 'Débil', tone: 'weak' }
}

export const SCORE_TEXT_CLASS = {
  strong: 'text-score-strong',
  mid: 'text-score-mid',
  weak: 'text-score-weak',
}

export function isLowCertainty(job) {
  if (typeof job.vector_score !== 'number' || typeof job.llm_score !== 'number') return false
  return Math.abs(job.vector_score * 100 - job.llm_score) > LOW_CERTAINTY_GAP
}

export function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || platform || 'Sin fuente'
}

// Scraped titles sometimes arrive HTML-escaped ("Node.JS &amp; React").
// Decode via a detached textarea: never injects markup into the DOM.
let decoder = null
export function decodeEntities(text) {
  if (!text || !text.includes('&')) return text || ''
  decoder ||= document.createElement('textarea')
  decoder.innerHTML = text
  return decoder.value
}

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : dateFormatter.format(d)
}
