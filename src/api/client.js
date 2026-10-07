import { clearSessionKey, getSessionKey, setSessionKey } from '../composables/useSession'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export function getApiKey() {
  return getSessionKey()
}

export function setApiKey(key) {
  setSessionKey(key)
}

export function clearApiKey() {
  clearSessionKey()
}

// Registered once from main.js so this module never imports the router
// (the router imports this module: a direct import would be circular).
let unauthorizedHandler = null

export function onUnauthorized(handler) {
  unauthorizedHandler = handler
}

function handleUnauthorized() {
  clearApiKey()
  if (unauthorizedHandler) unauthorizedHandler()
}

const NETWORK_ERROR_MESSAGE = 'Sin conexión con el backend'

async function request(path, { method = 'GET', body, query } = {}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    handleUnauthorized()
    throw new ApiError(401, 'missing api key')
  }

  const url = new URL(BASE_URL + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      // Arrays repeat the param (`status=a&status=b`), no brackets: FastAPI list query.
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item))
      else if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    }
  }

  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        'X-Api-Key': apiKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (e instanceof TypeError) throw new ApiError(0, NETWORK_ERROR_MESSAGE)
    throw e
  }

  if (res.status === 204) return null
  if (!res.ok) {
    let detail = res.statusText
    let issues = []
    let data = null
    try {
      data = await res.json()
      if (Array.isArray(data.detail)) {
        // Keep loc/msg so views can map 422 errors to form fields.
        issues = data.detail.map((e) => ({ loc: e.loc || [], msg: e.msg, type: e.type }))
        detail = issues.map((e) => `${e.loc.join('.')}: ${e.msg}`).join(' | ')
      } else {
        detail = data.detail || detail
      }
    } catch {}
    if (res.status === 401) handleUnauthorized()
    throw new ApiError(res.status, detail, issues, data)
  }
  return res.json()
}

export class ApiError extends Error {
  constructor(status, message, issues = [], body = null) {
    super(message)
    // Parsed JSON error body (e.g. 409 carries active_run_id / active_kind), or null.
    this.body = body
    this.status = status
    // FastAPI validation issues: [{ loc: ['body', 'experiences', 0, 'company'], msg, type }]
    this.issues = issues
  }
}

export const api = {
  getProfile: () => request('/api/v1/profile'),
  putProfile: (payload) => request('/api/v1/profile', { method: 'PUT', body: payload }),
  patchProfile: (payload) => request('/api/v1/profile', { method: 'PATCH', body: payload }),
  // params: { only_new, min_score, limit, offset, status: string[] } (empty/omitted values are not sent)
  getRankedJobs: (params) => request('/api/v1/jobs/ranked', { query: params }),
  markJobViewed: (jobId) => request(`/api/v1/jobs/${jobId}/view`, { method: 'POST' }),
  unmarkJobViewed: (jobId) => request(`/api/v1/jobs/${jobId}/view`, { method: 'DELETE' }),
  setJobStatus: (jobId, status) =>
    request(`/api/v1/jobs/${jobId}/status`, { method: 'PUT', body: { status } }),
  // 202 { run_id, kind, status } | 409 ApiError with body { active_run_id, active_kind }
  startRefresh: () => request('/api/v1/pipeline/refresh', { method: 'POST' }),
  getRefreshRun: (runId) => request(`/api/v1/pipeline/runs/${runId}`),
  // Throws ApiError(404) when no refresh run exists yet.
  // { queries, location, max_pages, platforms, available_platforms: [{name, display_name}], updated_at|null }
  getSearchSettings: () => request('/api/v1/settings/search'),
  // body: { queries, location, max_pages, platforms }; 422 carries per-field issues
  updateSearchSettings: (body) => request('/api/v1/settings/search', { method: 'PUT', body }),
  getLatestRefreshRun: () => request('/api/v1/pipeline/runs/latest', { query: { kind: 'refresh' } }),
}
