// Pure helpers for the profile form: stable keys, payload building and
// validation that mirrors backend/models/profile.py. No Vue state in here.

// --- Limits copied from backend/models/profile.py (optional fields use maxlength in the inputs) ---
const MAX_NAME = 100
const MAX_TEXT = 200
const MAX_LEVEL = 20
const SENIORITY_MIN = 1
const SENIORITY_MAX = 5
const CURRENCY_RE = /^[A-Za-z]{3}$/

// Top-level fields ProfilePatch/ProfileIn accept. Whitelist (not blacklist) so any
// new field in ProfileOut can never leak into the payload (ProfilePatch is extra="forbid").
export const PROFILE_FIELDS = [
  'headline', 'total_years', 'rut', 'personal_info', 'links', 'summary', 'methodologies',
  'experiences', 'education', 'areas', 'technologies', 'soft_skills', 'roles_target',
  'roles_excluded', 'industries_preferred', 'industries_excluded', 'location', 'work_mode',
  'salary', 'languages', 'contract_types', 'company_size_pref', 'deal_breakers',
]

// --- Stable keys (client-only, stripped before sending) ---
let keyCounter = 0
export function newKey() {
  keyCounter += 1
  return globalThis.crypto?.randomUUID?.() ?? `k${Date.now().toString(36)}-${keyCounter}`
}

const withKey = (item) => ({ ...item, _key: newKey() })

export function withKeys(form) {
  return {
    ...form,
    areas: form.areas.map(withKey),
    technologies: form.technologies.map(withKey),
    languages: form.languages.map(withKey),
    education: form.education.map(withKey),
    experiences: form.experiences.map((exp) => ({
      ...withKey(exp),
      achievements: (exp.achievements || []).map(withKey),
    })),
  }
}

const stripKeyReplacer = (k, v) => (k === '_key' ? undefined : v)

// Comparable string of the form content, ignoring client-only keys.
export function snapshot(form) {
  return JSON.stringify(form, stripKeyReplacer)
}

// --- Field and error element ids derived from the item key ---
export const fieldId = (path) => `f-${path.replaceAll('.', '-')}`
export const errorId = (path) => `${fieldId(path)}-err`

// aria-describedby value: error message first (if visible), then optional hint id.
export function describedBy(path, errors, hintId = '') {
  const ids = []
  if (errors[path]) ids.push(errorId(path))
  if (hintId) ids.push(hintId)
  return ids.length ? ids.join(' ') : undefined
}

// --- Payload ---
const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const orNull = (v) => (blank(v) ? null : v)

function nullifyBlanks(obj) {
  if (!obj) return obj
  for (const k of Object.keys(obj)) obj[k] = orNull(obj[k])
  return obj
}

export function toPayload(form) {
  const clone = JSON.parse(JSON.stringify(form, stripKeyReplacer))
  const p = {}
  for (const k of PROFILE_FIELDS) p[k] = clone[k]

  p.headline = orNull(p.headline)
  p.summary = orNull(p.summary)
  p.rut = orNull(p.rut)
  nullifyBlanks(p.personal_info)
  nullifyBlanks(p.links)
  p.location.city = orNull(p.location.city)
  p.location.country = orNull(p.location.country)

  if (!p.salary || (!p.salary.min_monthly && !p.salary.expected_monthly)) {
    p.salary = null
  } else {
    p.salary.currency = String(p.salary.currency).trim().toUpperCase()
    if (!p.salary.expected_monthly) p.salary.expected_monthly = null
  }

  for (const exp of p.experiences) {
    exp.location = orNull(exp.location)
    exp.subtitle = orNull(exp.subtitle)
    exp.start = orNull(exp.start)
    exp.end = orNull(exp.end)
    exp.id = orNull(exp.id)
  }
  for (const edu of p.education) {
    edu.location = orNull(edu.location)
    edu.start = orNull(edu.start)
    edu.end = orNull(edu.end)
  }
  return p
}

// --- Validation ---
const MSG_REQUIRED = 'Este campo es obligatorio.'
const msgMax = (n) => `Máximo ${n} caracteres.`

// Same algorithm as _validate_rut_check_digit in the backend.
function validRut(raw) {
  const cleaned = raw.replace(/[^0-9kK]/g, '').toUpperCase()
  if (cleaned.length < 2) return false
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  if (!/^\d+$/.test(body)) return false
  const factors = [2, 3, 4, 5, 6, 7]
  const total = [...body].reverse().reduce((sum, d, i) => sum + Number(d) * factors[i % 6], 0)
  const rem = 11 - (total % 11)
  const expected = rem === 11 ? '0' : rem === 10 ? 'K' : String(rem)
  return expected === dv
}

/** Returns { [path]: message } for every invalid field. Paths use item _key, not indexes. */
export function validate(form) {
  const errors = {}
  const required = (path, value, max) => {
    const s = typeof value === 'string' ? value.trim() : ''
    if (!s) errors[path] = MSG_REQUIRED
    else if (max && value.length > max) errors[path] = msgMax(max)
  }
  const seniority = (path, value) => {
    if (!Number.isInteger(value) || value < SENIORITY_MIN || value > SENIORITY_MAX) {
      errors[path] = `Indica un número entero entre ${SENIORITY_MIN} y ${SENIORITY_MAX}.`
    }
  }

  const years = form.total_years
  if (typeof years !== 'number' || Number.isNaN(years)) errors.total_years = 'Indica tus años de experiencia.'
  else if (years < 0) errors.total_years = 'Debe ser cero o más.'

  if (!blank(form.rut) && !validRut(form.rut)) errors.rut = 'El RUT no es válido. Revisa el dígito verificador.'

  const sal = form.salary
  if (sal && (sal.min_monthly || sal.expected_monthly)) {
    if (!CURRENCY_RE.test(String(sal.currency).trim())) errors['salary.currency'] = 'Usa un código de 3 letras, por ejemplo CLP.'
    const isMoney = (v) => Number.isInteger(v) && v >= 0
    if (!isMoney(sal.min_monthly)) errors['salary.min_monthly'] = 'Indica un monto entero, cero o más.'
    if (!blank(sal.expected_monthly) && !isMoney(sal.expected_monthly)) {
      errors['salary.expected_monthly'] = 'Indica un monto entero, cero o más.'
    }
  }

  for (const a of form.areas) {
    required(`areas.${a._key}.name`, a.name, MAX_NAME)
    seniority(`areas.${a._key}.seniority`, a.seniority)
  }
  for (const t of form.technologies) {
    required(`technologies.${t._key}.name`, t.name, MAX_NAME)
    required(`technologies.${t._key}.area_name`, t.area_name, MAX_NAME)
    seniority(`technologies.${t._key}.seniority`, t.seniority)
  }
  for (const l of form.languages) {
    required(`languages.${l._key}.name`, l.name, MAX_NAME)
    required(`languages.${l._key}.level`, l.level, MAX_LEVEL)
  }
  for (const exp of form.experiences) {
    const base = `experiences.${exp._key}`
    required(`${base}.company`, exp.company, MAX_TEXT)
    required(`${base}.role`, exp.role, MAX_TEXT)
    for (const ach of exp.achievements) required(`${base}.achievements.${ach._key}.text`, ach.text)
  }
  for (const edu of form.education) {
    const base = `education.${edu._key}`
    required(`${base}.institution`, edu.institution, MAX_TEXT)
    required(`${base}.degree`, edu.degree, MAX_TEXT)
  }
  return errors
}

// --- Backend 422 -> field paths ---
const SERVER_MESSAGES = {
  missing: MSG_REQUIRED,
  string_too_short: 'Este campo no puede quedar vacío.',
  string_too_long: 'El texto es demasiado largo.',
  greater_than_equal: 'El valor es demasiado bajo.',
  less_than_equal: 'El valor es demasiado alto.',
}
const SERVER_MESSAGE_DEFAULT = 'El valor no es válido.'

/**
 * Convert FastAPI issues into { path: message } using the form's item keys.
 * Issues that point to a field not present in the form land in `unmapped`.
 */
export function mapServerIssues(issues, form) {
  const mapped = {}
  const unmapped = []
  for (const issue of issues || []) {
    const segments = (issue.loc || []).slice(1) // drop "body"
    const parts = []
    let node = form
    for (const seg of segments) {
      if (Array.isArray(node) && typeof seg === 'number') {
        node = node[seg]
        parts.push(node?._key ?? seg)
      } else {
        node = node?.[seg]
        parts.push(seg)
      }
    }
    const message = SERVER_MESSAGES[issue.type] || SERVER_MESSAGE_DEFAULT
    if (parts.length && typeof document !== 'undefined' && document.getElementById(fieldId(parts.join('.')))) {
      mapped[parts.join('.')] = message
    } else {
      unmapped.push(message)
    }
  }
  return { mapped, unmapped }
}
