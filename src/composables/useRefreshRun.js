import { computed, readonly, ref, watch } from 'vue'
import { api, ApiError } from '../api/client'
import { isAuthenticated } from './useSession'
import { pushToast } from './useToasts'
import { userMessage } from '../utils/errors'

// Module-level state: the refresh run survives navigation between views.

const FAST_POLL_MS = 5000
const SLOW_POLL_MS = 10000
const SLOW_POLL_AFTER_MS = 60000
const TICK_MS = 1000
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const ACTIVE_STATUSES = ['queued', 'running']
const KIND_REFRESH = 'refresh'
const MAX_REQUEST_FAILURES = 6

const STAGE_LABELS = {
  embed: 'Calculando similitud',
  rank: 'Rankeando con IA',
}

const run = ref(null)
const starting = ref(false)
const now = ref(Date.now())
const announcement = ref('')
// Bumped when the user asks to see the new results; JobsView reloads, App navigates to /jobs.
const viewRequest = ref(0)

let pollTimer = null
let tickTimer = null
let pollingRunId = null
let pollStartedAt = 0
let failures = 0
let lastAnnouncedStage = null

export const isRunning = computed(() => starting.value || (!!run.value && ACTIVE_STATUSES.includes(run.value.status)))

function stageOf(r) {
  if (!r) return null
  if (r.status === 'queued') return 'queued'
  return r.stats?.stage || 'scrape'
}

function stageLabel(r) {
  const stage = stageOf(r)
  if (stage === 'queued') return 'En cola'
  if (stage === 'scrape') {
    const stats = r.stats || {}
    const query = stats.current_query
    if (!query) return 'Buscando ofertas'
    const position = Object.keys(stats.per_query || {}).length
    const total = stats.total_queries
    const counter = position ? (total ? `${position}/${total}: ` : `consulta ${position}: `) : ''
    return `Buscando ofertas (${counter}${query})`
  }
  return STAGE_LABELS[stage] || 'Procesando'
}

// Stage text without the per-query detail, used for announcements (only on stage changes).
function stageKey(r) {
  const stage = stageOf(r)
  return stage === 'scrape' ? `scrape:${r.stats?.current_query || ''}` : stage
}

export const stageText = computed(() => (starting.value && !run.value ? 'Iniciando' : stageLabel(run.value)))

export const elapsedText = computed(() => {
  const r = run.value
  if (!r?.started_at) return ''
  const seconds = Math.max(Math.floor((now.value - new Date(r.started_at).getTime()) / 1000), 0)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

function announceStage(r) {
  const key = stageKey(r)
  if (key === lastAnnouncedStage) return
  lastAnnouncedStage = key
  announcement.value = `${stageLabel(r)}`
}

function clearTimers() {
  clearTimeout(pollTimer)
  clearInterval(tickTimer)
  pollTimer = null
  tickTimer = null
}

function stopPolling() {
  clearTimers()
  pollingRunId = null
}

function nextDelay() {
  return Date.now() - pollStartedAt < SLOW_POLL_AFTER_MS ? FAST_POLL_MS : SLOW_POLL_MS
}

function schedulePoll() {
  clearTimeout(pollTimer)
  pollTimer = null
  // Paused while hidden; the visibilitychange listener resumes with an immediate poll.
  if (!pollingRunId || document.hidden) return
  pollTimer = setTimeout(poll, nextDelay())
}

function startPolling(runId) {
  stopPolling()
  pollingRunId = runId
  pollStartedAt = Date.now()
  failures = 0
  now.value = Date.now()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)
  poll()
}

async function poll() {
  const runId = pollingRunId
  if (!runId) return
  let data
  try {
    data = await api.getRefreshRun(runId)
  } catch (e) {
    if (runId !== pollingRunId) return
    // 401 is handled globally (key cleared, redirect); a missing run cannot be recovered.
    if (e instanceof ApiError && (e.status === HTTP_NOT_FOUND || e.status === 401)) {
      stopPolling()
      run.value = null
      lastAnnouncedStage = null
      if (e.status === HTTP_NOT_FOUND) pushToast({ type: 'error', message: 'No encontramos la búsqueda en curso.' })
      return
    }
    failures += 1
    if (failures >= MAX_REQUEST_FAILURES) {
      stopPolling()
      pushToast({ type: 'error', message: `${userMessage(e)} Se detuvo el seguimiento de la búsqueda.` })
      return
    }
    schedulePoll()
    return
  }
  if (runId !== pollingRunId) return
  failures = 0
  run.value = data
  if (ACTIVE_STATUSES.includes(data.status)) {
    announceStage(data)
    schedulePoll()
    return
  }
  stopPolling()
  finish(data)
}

function requestView() {
  viewRequest.value += 1
}

function finish(r) {
  lastAnnouncedStage = null
  const s = r.stats || {}
  if (r.status === 'completed') {
    const inserted = s.total_inserted ?? 0
    const ranked = s.new_scores ?? 0
    const message = `Búsqueda lista: ${inserted} ${inserted === 1 ? 'oferta nueva' : 'ofertas nuevas'}, ${ranked} ${ranked === 1 ? 'rankeada' : 'rankeadas'}`
    pushToast({ type: 'success', message, action: { label: 'Ver', onClick: requestView } })
    return
  }
  const reason = r.error || 'Intenta de nuevo en un momento.'
  const where = STAGE_LABELS[s.stage] ? ` (${STAGE_LABELS[s.stage].toLowerCase()})` : s.stage === 'scrape' ? ' (buscando ofertas)' : ''
  const partial = s.total_inserted ? ` Se guardaron ${s.total_inserted} ofertas nuevas antes del fallo.` : ''
  pushToast({ type: 'error', message: `La búsqueda falló${where}: ${reason}${partial}`, duration: 12000 })
}

/** Start a refresh, or attach to the one already running. */
export async function startRefresh() {
  if (isRunning.value) return
  starting.value = true
  announcement.value = 'Iniciando búsqueda de ofertas nuevas'
  try {
    const res = await api.startRefresh()
    run.value = { id: res.run_id, kind: res.kind, status: res.status, started_at: new Date().toISOString(), stats: {}, error: null }
    startPolling(res.run_id)
  } catch (e) {
    if (e instanceof ApiError && e.status === HTTP_CONFLICT) {
      const body = e.body || {}
      if (body.active_kind === KIND_REFRESH && body.active_run_id) {
        run.value = { id: body.active_run_id, kind: KIND_REFRESH, status: 'running', started_at: null, stats: {}, error: null }
        startPolling(body.active_run_id)
        pushToast({ message: 'Ya había una búsqueda en curso. Seguimos su avance.' })
      } else {
        pushToast({ type: 'error', message: 'Ya hay un proceso del backend en curso, inténtalo en unos minutos' })
      }
    } else if (!(e instanceof ApiError && e.status === 401)) {
      pushToast({ type: 'error', message: userMessage(e, 'No pudimos iniciar la búsqueda. Intenta de nuevo.') })
    }
  } finally {
    starting.value = false
  }
}

/** On app load: resume polling if the latest refresh run is still active. */
export async function resumeIfActive() {
  if (isRunning.value || pollingRunId) return
  try {
    const latest = await api.getLatestRefreshRun()
    if (!ACTIVE_STATUSES.includes(latest.status) || pollingRunId) return
    run.value = latest
    lastAnnouncedStage = stageKey(latest)
    startPolling(latest.id)
  } catch (e) {
    // 404: no runs yet. Anything else is non-critical here: the user can still start one.
    if (!(e instanceof ApiError)) throw e
  }
}

function reset() {
  stopPolling()
  run.value = null
  announcement.value = ''
  lastAnnouncedStage = null
}

document.addEventListener('visibilitychange', () => {
  if (!pollingRunId) return
  if (document.hidden) {
    clearTimeout(pollTimer)
    pollTimer = null
  } else {
    now.value = Date.now()
    poll()
  }
})

// Session lifecycle: resume after login / app load, drop state on logout.
watch(
  isAuthenticated,
  (authed) => {
    if (authed) resumeIfActive()
    else reset()
  },
  { immediate: true },
)

export function useRefreshRun() {
  return {
    run: readonly(run),
    isRunning,
    stageText,
    elapsedText,
    announcement: readonly(announcement),
    viewRequest: readonly(viewRequest),
    startRefresh,
  }
}
