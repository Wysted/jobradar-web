// Client-side mirror of the backend rules for search settings (PUT /api/v1/settings/search).

export const MAX_QUERIES = 10
export const QUERY_MIN = 2
export const QUERY_MAX = 100
export const LOCATION_MAX = 100
export const PAGES_MIN = 1
export const PAGES_MAX = 5

export function toForm(data) {
  return {
    queries: [...data.queries],
    location: data.location ?? '',
    max_pages: data.max_pages,
    platforms: [...data.platforms],
  }
}

export function toPayload(form) {
  return {
    queries: form.queries.map((q) => q.trim()),
    location: form.location.trim(),
    max_pages: Number(form.max_pages),
    platforms: [...form.platforms],
  }
}

export function snapshot(form) {
  return JSON.stringify([form.queries, form.location, String(form.max_pages), [...form.platforms].sort()])
}

/** Returns { field: message } for invalid fields. */
export function validate(form) {
  const errors = {}
  const queries = form.queries.map((q) => q.trim())
  if (!queries.length) errors.queries = 'Agrega al menos una consulta.'
  else if (queries.length > MAX_QUERIES) errors.queries = `Máximo ${MAX_QUERIES} consultas.`
  else if (queries.some((q) => q.length < QUERY_MIN)) errors.queries = `Cada consulta necesita al menos ${QUERY_MIN} caracteres.`
  else if (queries.some((q) => q.length > QUERY_MAX)) errors.queries = `Cada consulta admite hasta ${QUERY_MAX} caracteres.`
  else if (new Set(queries.map((q) => q.toLowerCase())).size !== queries.length) errors.queries = 'Hay consultas repetidas.'

  if (form.location.trim().length > LOCATION_MAX) errors.location = `La ubicación admite hasta ${LOCATION_MAX} caracteres.`

  const pages = Number(form.max_pages)
  if (form.max_pages === '' || form.max_pages === null || !Number.isInteger(pages) || pages < PAGES_MIN || pages > PAGES_MAX) {
    errors.max_pages = `Ingresa un número entre ${PAGES_MIN} y ${PAGES_MAX}.`
  }

  if (!form.platforms.length) errors.platforms = 'Selecciona al menos un portal.'
  return errors
}

const FIELDS = ['queries', 'location', 'max_pages', 'platforms']

/** Map FastAPI 422 issues to field messages; unmapped ones come back separately. */
export function mapServerIssues(issues) {
  const mapped = {}
  let unmapped = false
  for (const issue of issues || []) {
    const field = (issue.loc || []).find((part) => FIELDS.includes(part))
    if (!field) {
      unmapped = true
      continue
    }
    if (!mapped[field]) mapped[field] = 'El servidor no aceptó este valor. Revísalo.'
  }
  return { mapped, unmapped }
}
