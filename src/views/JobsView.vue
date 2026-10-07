<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import JobDetail from '../components/JobDetail.vue'
import ScoreBadge from '../components/ScoreBadge.vue'
import StatusFilter from '../components/StatusFilter.vue'
import StatusBadge from '../components/StatusBadge.vue'
import StickyBottomBar from '../components/StickyBottomBar.vue'
import { startRefresh, useRefreshRun } from '../composables/useRefreshRun'
import { loadSearchSettings, useSearchSettings } from '../composables/useSearchSettings'
import { pushToast, runToastAction } from '../composables/useToasts'
import { userMessage } from '../utils/errors'
import { decodeEntities, platformLabel } from '../utils/format'
import { DEFAULT_STATUS, JOB_STATUSES, STATUS_META } from '../utils/jobStatus'

// Split view (list + side panel) from Tailwind's lg breakpoint.
const SPLIT_QUERY = '(min-width: 1024px)'
const ROW_TAGS_MAX = 3

// Filter defaults and bounds (mirror GET /jobs/ranked: min_score 0-100, limit 1-200).
const DEFAULT_FILTERS = { only_new: true, min_score: 60, limit: 50 }
const SCORE_RANGE = { min: 0, max: 100 }
const LIMIT_RANGE = { min: 1, max: 200 }

// Toast copy per status the user can set.
const STATUS_TOAST = {
  new: 'Marcada como Pendiente',
  interested: 'Marcada como Me interesa',
  applied: 'Marcada como Postulada',
  discarded: 'Marcada como Descartada',
}
// Single-key shortcut -> status (list focus only).
const STATUS_SHORTCUTS = Object.fromEntries(
  JOB_STATUSES.filter((s) => STATUS_META[s].shortcut).map((s) => [STATUS_META[s].shortcut, s]),
)

const route = useRoute()
const router = useRouter()

const jobs = ref([])
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const selectedId = ref(null)
const activeId = ref(null) // roving tabindex: the single row that is a tab stop
const panel = ref(null)
const filtersFirstInput = ref(null)
const helpOpen = ref(false)
const helpButton = ref(null)
// Stacked layout (<lg): the detail replaces the list; these restore the list on return.
const listScrollY = ref(null)
const returnedId = ref(null) // row just returned from: tinted until the next selection
const stepAnnouncement = ref('')
const loadAnnouncement = ref('')
// Jobs with a status save in flight (disables their StatusActions).
const statusPendingIds = ref([])
const isStatusPending = (jobId) => statusPendingIds.value.includes(jobId)

const clampInt = (raw, { min, max }, fallback) => {
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max)
}

// Known statuses only, in pipeline order (stable URL).
const normalizeStatuses = (raw) => {
  const list = [raw].flat().filter((s) => typeof s === 'string')
  return JOB_STATUSES.filter((s) => list.includes(s))
}

function filtersFromQuery(q) {
  return {
    only_new: q.only_new === undefined ? DEFAULT_FILTERS.only_new : q.only_new !== '0',
    min_score: clampInt(q.min_score, SCORE_RANGE, DEFAULT_FILTERS.min_score),
    limit: clampInt(q.limit, LIMIT_RANGE, DEFAULT_FILTERS.limit),
    status: normalizeStatuses(q.status ?? []),
  }
}

// `filters` is the draft bound to the form; `applied` is what the URL and the request use.
const filters = ref(filtersFromQuery(route.query))
const applied = ref({ ...filters.value, status: [...filters.value.status] })
// Job id requested by the URL; consumed by the first successful load.
let initialJobId = typeof route.query.job === 'string' ? route.query.job : null
// Bumped on every full reload: async work started on an older list must not touch the new one.
let listVersion = 0

const selectedJob = computed(() => jobs.value.find((j) => j.job_id === selectedId.value) || null)

const splitMedia = window.matchMedia(SPLIT_QUERY)
const split = ref(splitMedia.matches)
const onSplitChange = (e) => {
  split.value = e.matches
  // Entering split view with nothing open: show the row the user was on.
  if (e.matches && !selectedId.value) selectedId.value = activeId.value || jobs.value[0]?.job_id || null
}

// Stacked layout: an open job replaces the list (detail lives outside the listbox).
const showMobileDetail = computed(() => !split.value && !!selectedJob.value)
const selectedIndex = computed(() => jobs.value.findIndex((j) => j.job_id === selectedId.value))

// Would the backend still return this job for the applied filters? Used so the
// "Cargar más" offset ignores rows that were changed locally (viewed, discarded, ...).
// "Solo nuevas" is a preference kept in the URL; it is ignored while a status filter is applied
// (any status other than "new" sets viewed_at, so both together would return nothing).
const onlyNewIgnored = computed(() => applied.value.status.length > 0)
const effectiveOnlyNew = computed(() => applied.value.only_new && !onlyNewIgnored.value)

function matchesApplied(job) {
  const a = applied.value
  if (effectiveOnlyNew.value && job.viewed_at) return false
  return a.status.length ? a.status.includes(job.status) : job.status !== 'discarded'
}
const loadedCount = computed(() => jobs.value.filter(matchesApplied).length)
const hasMore = computed(() => loadedCount.value < total.value)

// Mode for the next selectedId -> URL sync: opening the stacked detail pushes a history
// entry so the system Back button closes it.
let nextSyncMode = 'replace'
let mobileEntryPushed = false

function syncQuery(mode = 'replace') {
  const query = {
    only_new: applied.value.only_new ? '1' : '0',
    min_score: String(applied.value.min_score),
    limit: String(applied.value.limit),
  }
  if (applied.value.status.length) query.status = [...applied.value.status]
  if (selectedId.value) query.job = selectedId.value
  return router[mode]({ query })
}

const rankedParams = (offset = 0) => ({
  ...applied.value,
  only_new: effectiveOnlyNew.value,
  offset,
})

async function load() {
  loading.value = true
  error.value = ''
  const version = ++listVersion
  try {
    const data = await api.getRankedJobs(rankedParams())
    if (version !== listVersion) return
    jobs.value = data.jobs
    total.value = data.total
  } catch (e) {
    error.value = userMessage(e, 'Intenta de nuevo en un momento.')
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  const version = listVersion
  try {
    const data = await api.getRankedJobs(rankedParams(loadedCount.value))
    if (version !== listVersion) return
    const seen = new Set(jobs.value.map((j) => j.job_id))
    const fresh = data.jobs.filter((j) => !seen.has(j.job_id))
    jobs.value = [...jobs.value, ...fresh]
    // No new rows although the backend reports more: stop offering the button.
    total.value = fresh.length ? data.total : jobs.value.length
    loadAnnouncement.value = fresh.length
      ? `${fresh.length} ofertas más cargadas.`
      : 'No hay más ofertas para mostrar.'
  } catch (e) {
    pushToast({
      type: 'error',
      message: userMessage(e, 'No se pudieron cargar más ofertas.'),
      action: { label: 'Reintentar', onClick: loadMore },
    })
  } finally {
    loadingMore.value = false
  }
}

function apply() {
  // Inputs can be emptied: fall back to defaults so the URL and the request stay valid.
  filters.value = {
    only_new: !!filters.value.only_new,
    min_score: clampInt(filters.value.min_score, SCORE_RANGE, DEFAULT_FILTERS.min_score),
    limit: clampInt(filters.value.limit, LIMIT_RANGE, DEFAULT_FILTERS.limit),
    status: normalizeStatuses(filters.value.status),
  }
  applied.value = { ...filters.value, status: [...filters.value.status] }
  syncQuery()
  load()
}

function patchJob(jobId, patch) {
  jobs.value = jobs.value.map((j) => (j.job_id === jobId ? { ...j, ...patch } : j))
}

const serverFields = (j) => ({
  status: j.status,
  status_changed_at: j.status_changed_at,
  viewed_at: j.viewed_at,
})

// --- Undo toast bookkeeping: `u` undoes the last action while its toast is alive ---
let lastUndoToastId = null

function pushUndoToast(message, undo) {
  const toastId = pushToast({
    message,
    action: { label: 'Deshacer', onClick: undo },
    onClose: () => {
      if (lastUndoToastId === toastId) lastUndoToastId = null
    },
  })
  lastUndoToastId = toastId
}

function undoLast() {
  if (lastUndoToastId !== null) runToastAction(lastUndoToastId)
}

const failToast = (e, fallback) => {
  if (e.status !== 401) pushToast({ type: 'error', message: userMessage(e, fallback) })
}

// --- Viewed: immediate POST, undo = DELETE ---
const viewedInFlight = new Set()

async function markViewed(job) {
  const id = job.job_id
  if (job.viewed_at || viewedInFlight.has(id)) return
  viewedInFlight.add(id)
  patchJob(id, { viewed_at: new Date().toISOString() })
  try {
    await api.markJobViewed(id)
  } catch (e) {
    patchJob(id, { viewed_at: null })
    failToast(e, 'No se pudo marcar la oferta como vista.')
    return
  } finally {
    viewedInFlight.delete(id)
  }
  pushUndoToast('Oferta marcada como vista.', () => undoViewed(id))
}

async function undoViewed(id) {
  const viewedAt = jobs.value.find((j) => j.job_id === id)?.viewed_at ?? new Date().toISOString()
  patchJob(id, { viewed_at: null })
  try {
    await api.unmarkJobViewed(id)
  } catch (e) {
    patchJob(id, { viewed_at: viewedAt })
    failToast(e, 'No se pudo deshacer.')
  }
}

// --- Status changes ---

// Takes the row out of the list and returns what is needed to put it back.
function removeFromList(jobId) {
  const list = jobs.value
  const index = list.findIndex((j) => j.job_id === jobId)
  const successorId = (list[index + 1] ?? list[index - 1])?.job_id ?? null
  const ctx = {
    version: listVersion,
    index,
    successorId,
    wasSelected: selectedId.value === jobId,
    wasRowFocused: document.activeElement?.getAttribute?.('role') === 'option',
  }
  if (ctx.wasSelected && !split.value && !successorId) closeMobileDetail()
  else if (ctx.wasSelected) selectedId.value = successorId
  if (activeId.value === jobId) activeId.value = successorId
  jobs.value = list.filter((j) => j.job_id !== jobId)
  total.value = Math.max(total.value - 1, 0)
  if (ctx.wasRowFocused && successorId) focusRow(successorId)
  else if (!successorId) nextTick(() => document.getElementById('main')?.focus())
  return ctx
}

function reinsertIntoList(job, ctx) {
  if (ctx.version !== listVersion) return
  if (jobs.value.some((j) => j.job_id === job.job_id)) {
    patchJob(job.job_id, job)
    return
  }
  const at = Math.min(ctx.index, jobs.value.length)
  jobs.value = [...jobs.value.slice(0, at), job, ...jobs.value.slice(at)]
  total.value += 1
  // Restore selection/focus only if the user has not moved on since the removal.
  if (ctx.wasSelected && selectedId.value === ctx.successorId) selectedId.value = job.job_id
  if (activeId.value === ctx.successorId || activeId.value === null) activeId.value = job.job_id
  if (ctx.wasRowFocused && activeId.value === job.job_id) focusRow(job.job_id)
}

function setStatusPending(jobId, on) {
  statusPendingIds.value = on
    ? [...statusPendingIds.value, jobId]
    : statusPendingIds.value.filter((id) => id !== jobId)
}

async function changeStatus({ job, status }) {
  const id = job.job_id
  const current = jobs.value.find((j) => j.job_id === id)
  if (!current || isStatusPending(id) || current.status === status) return

  const before = { ...current }
  // Any status other than "new" makes the backend set viewed_at when it was empty.
  const setsViewed = status !== DEFAULT_STATUS && !before.viewed_at
  // Default filter (no status chosen): a discarded row leaves the list at once.
  const leaves = !applied.value.status.length && status === 'discarded'

  patchJob(id, { status, viewed_at: setsViewed ? new Date().toISOString() : before.viewed_at })
  const ctx = leaves ? removeFromList(id) : null
  setStatusPending(id, true)

  let updated
  try {
    updated = await api.setJobStatus(id, status)
  } catch (e) {
    if (ctx) reinsertIntoList(before, ctx)
    else patchJob(id, serverFields(before))
    failToast(e, 'No se pudo cambiar el estado.')
    return
  } finally {
    setStatusPending(id, false)
  }

  const after = serverFields(updated)
  if (!ctx) patchJob(id, after)
  pushUndoToast(STATUS_TOAST[status], () => undoStatus({ before, after, setsViewed, ctx }))
}

async function undoStatus({ before, after, setsViewed, ctx }) {
  const id = before.job_id
  if (isStatusPending(id)) return
  if (ctx) reinsertIntoList(before, ctx)
  else patchJob(id, serverFields(before))
  setStatusPending(id, true)

  let updated = null
  try {
    updated = await api.setJobStatus(id, before.status)
    if (setsViewed) await api.unmarkJobViewed(id)
    patchJob(id, {
      status: updated.status,
      status_changed_at: updated.status_changed_at,
      viewed_at: setsViewed ? null : updated.viewed_at,
    })
  } catch (e) {
    if (updated) {
      // Status was restored but viewed_at could not be cleared.
      patchJob(id, serverFields(updated))
    } else if (ctx) {
      removeFromList(id)
    } else {
      patchJob(id, serverFields({ ...before, ...after }))
    }
    failToast(e, 'No se pudo deshacer.')
  } finally {
    setStatusPending(id, false)
  }
}

// Opens the row in the detail panel (split) or as a full view replacing the list (stacked).
function select(job) {
  activeId.value = job.job_id
  returnedId.value = null
  if (split.value) {
    selectedId.value = job.job_id
    return
  }
  listScrollY.value = window.scrollY
  mobileEntryPushed = true
  nextSyncMode = 'push'
  selectedId.value = job.job_id
  focusMobileDetail()
}

async function focusMobileDetail() {
  await nextTick()
  window.scrollTo(0, 0)
  document.getElementById(MOBILE_TITLE_ID)?.focus({ preventScroll: true })
}

// Back to the list: restore its scroll position and put focus on the row that was open.
async function finishCloseMobile() {
  const jobId = selectedId.value
  mobileEntryPushed = false
  selectedId.value = null
  returnedId.value = jobId
  stepAnnouncement.value = ''
  if (!jobId) return
  activeId.value = jobId
  await nextTick()
  const row = document.getElementById(optionId(jobId))
  if (listScrollY.value !== null) window.scrollTo(0, listScrollY.value)
  else row?.scrollIntoView({ block: 'center' })
  listScrollY.value = null
  row?.focus({ preventScroll: true })
}

// The detail owns a history entry: closing it = going back, so the system Back button
// and the on-screen controls behave the same (the route watcher finishes the close).
function closeMobileDetail() {
  if (mobileEntryPushed) router.back()
  else finishCloseMobile()
}

// Previous/next without going back to the list. Focus stays on the pressed button.
function stepMobileDetail(delta) {
  const next = jobs.value[selectedIndex.value + delta]
  if (!next) return
  selectedId.value = next.job_id
  activeId.value = next.job_id
  window.scrollTo(0, 0)
  stepAnnouncement.value = `Oferta ${selectedIndex.value + 1} de ${jobs.value.length}: ${decodeEntities(next.title)}`
}

const optionId = (jobId) => `job-opt-${jobId}`
const MOBILE_ID_PREFIX = 'm'
const MOBILE_TITLE_ID = `${MOBILE_ID_PREFIX}-title`

function focusRow(jobId) {
  activeId.value = jobId
  nextTick(() => document.getElementById(optionId(jobId))?.focus())
}

function moveFocus(delta, absolute = null) {
  const list = jobs.value
  if (!list.length) return
  const current = list.findIndex((j) => j.job_id === activeId.value)
  const next = absolute ?? Math.min(Math.max(current + delta, 0), list.length - 1)
  focusRow(list[next].job_id)
}

function onListKeydown(e) {
  // Single-key shortcuts only while focus is on a row (WCAG 2.1.4); never while typing.
  const row = e.target.closest?.('[role="option"]')
  if (!row || e.target !== row) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const job = jobs.value.find((j) => optionId(j.job_id) === row.id)
  if (!job) return

  const key = e.key
  if (key === 'ArrowDown' || key === 'j') moveFocus(1)
  else if (key === 'ArrowUp' || key === 'k') moveFocus(-1)
  else if (key === 'Home') moveFocus(0, 0)
  else if (key === 'End') moveFocus(0, jobs.value.length - 1)
  else if (key === 'Enter' || key === ' ') select(job)
  else if (key === 'o') window.open(job.url, '_blank', 'noopener,noreferrer')
  else if (key === 'e') markViewed(job)
  else if (STATUS_SHORTCUTS[key]) {
    // Same toggle as the buttons: pressing the active status again returns to "new".
    const target = STATUS_SHORTCUTS[key]
    changeStatus({ job, status: job.status === target ? DEFAULT_STATUS : target })
  } else if (key === 'u') undoLast()
  else if (key === '/') filtersFirstInput.value?.focus()
  else if (key === '?') toggleHelp()
  else return
  e.preventDefault()
}

function toggleHelp() {
  helpOpen.value = !helpOpen.value
}

function closeHelp() {
  if (!helpOpen.value) return
  helpOpen.value = false
  helpButton.value?.focus()
}

watch(jobs, (list) => {
  if (initialJobId) {
    const wanted = initialJobId
    initialJobId = null
    if (list.some((j) => j.job_id === wanted)) selectedId.value = wanted
  }
  if (!list.some((j) => j.job_id === selectedId.value)) {
    selectedId.value = list.length && split.value ? list[0].job_id : null
  }
  if (!list.some((j) => j.job_id === activeId.value)) {
    activeId.value = selectedId.value || list[0]?.job_id || null
  }
})

watch(selectedId, async () => {
  const mode = nextSyncMode
  nextSyncMode = 'replace'
  syncQuery(mode)
  await nextTick()
  if (panel.value) panel.value.scrollTop = 0
})

// History navigation in the stacked layout: Back closes the detail, Forward reopens it.
watch(
  () => route.query.job,
  (jobId) => {
    if (split.value) return
    if (!jobId && selectedId.value) finishCloseMobile()
    else if (typeof jobId === 'string' && jobId !== selectedId.value && jobs.value.some((j) => j.job_id === jobId)) {
      mobileEntryPushed = true
      activeId.value = jobId
      selectedId.value = jobId
      focusMobileDetail()
    }
  },
)

const { isRunning: refreshRunning, stageText: refreshStage, elapsedText: refreshElapsed, viewRequest } = useRefreshRun()
const { settings: searchSettings } = useSearchSettings()
const queriesSummary = computed(() => {
  const queries = searchSettings.value?.queries || []
  return queries.length ? `Busca: ${queries.join(', ')}` : ''
})
// A finished refresh asked to see the new results: reload with the current filters.
watch(viewRequest, () => load())

onMounted(() => {
  splitMedia.addEventListener('change', onSplitChange)
  // Summary only: a failure here must not get in the way of the list.
  loadSearchSettings().catch(() => {})
  load()
})

onBeforeUnmount(() => {
  splitMedia.removeEventListener('change', onSplitChange)
})
</script>

<template>
  <section aria-labelledby="jobs-heading">
    <header v-show="!showMobileDetail" class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      <div class="flex items-baseline gap-2">
        <h1 id="jobs-heading" class="text-lg font-semibold text-text">Ofertas</h1>
        <span class="text-meta tabular-nums text-text-muted" aria-live="polite">
          <template v-if="!loading || jobs.length">{{ jobs.length }} de {{ Math.max(total, jobs.length) }}</template>
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="refreshRunning"
          :aria-busy="refreshRunning ? 'true' : 'false'"
          aria-describedby="refresh-progress"
          @click="startRefresh"
        >
          <svg
            v-if="refreshRunning"
            viewBox="0 0 16 16"
            class="h-4 w-4 shrink-0 motion-safe:animate-spin"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6" class="opacity-25" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke-linecap="round" />
          </svg>
          {{ refreshRunning ? 'Buscando...' : 'Buscar nuevas' }}
        </button>
        <router-link to="/ajustes" class="btn btn-ghost px-2">Configurar</router-link>
        <span id="refresh-progress" class="text-meta tabular-nums text-text-muted">
          <template v-if="refreshRunning">{{ refreshStage }}<template v-if="refreshElapsed"> · {{ refreshElapsed }}</template></template>
        </span>
        <span
          v-if="queriesSummary && !refreshRunning"
          class="hidden max-w-[16rem] truncate text-meta text-text-muted md:inline lg:max-w-sm"
          :title="queriesSummary"
        >{{ queriesSummary }}</span>
      </div>

      <div class="relative">
        <button
          ref="helpButton"
          type="button"
          class="btn btn-ghost px-2"
          aria-haspopup="true"
          :aria-expanded="helpOpen ? 'true' : 'false'"
          aria-controls="shortcuts-help"
          @click="toggleHelp"
        >
          Atajos
          <kbd class="rounded border border-border-strong px-1 text-xs" aria-hidden="true">?</kbd>
        </button>
        <div
          v-if="helpOpen"
          id="shortcuts-help"
          role="region"
          aria-label="Atajos de teclado"
          class="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-border-strong bg-surface p-3 text-meta shadow-lg"
          @keydown.esc="closeHelp"
        >
          <p class="mb-2 text-text-muted">Funcionan con el foco en la lista.</p>
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-text">
            <dt><kbd class="rounded border border-border-strong px-1 text-xs">j</kbd> <kbd class="rounded border border-border-strong px-1 text-xs">k</kbd></dt>
            <dd>Siguiente / anterior</dd>
            <dt><kbd class="rounded border border-border-strong px-1 text-xs">Enter</kbd></dt>
            <dd>Abrir detalle</dd>
            <dt><kbd class="rounded border border-border-strong px-1 text-xs">o</kbd></dt>
            <dd>Abrir oferta en otra pestaña</dd>
            <dt><kbd class="rounded border border-border-strong px-1 text-xs">e</kbd></dt>
            <dd>Marcar como vista</dd>
            <dt>
              <kbd class="rounded border border-border-strong px-1 text-xs">i</kbd>
              <kbd class="rounded border border-border-strong px-1 text-xs">a</kbd>
              <kbd class="rounded border border-border-strong px-1 text-xs">x</kbd>
            </dt>
            <dd>Me interesa / Postulé / Descartar (otra vez para quitar)</dd>
            <dt><kbd class="rounded border border-border-strong px-1 text-xs">u</kbd></dt>
            <dd>Deshacer la última acción</dd>
            <dt><kbd class="rounded border border-border-strong px-1 text-xs">/</kbd></dt>
            <dd>Ir a los filtros</dd>
            <dt><kbd class="rounded border border-border-strong px-1 text-xs">?</kbd></dt>
            <dd>Mostrar u ocultar esta ayuda</dd>
          </dl>
          <button type="button" class="btn btn-secondary mt-3 w-full" @click="closeHelp">Cerrar</button>
        </div>
      </div>

      <form
        class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 max-sm:w-full sm:ml-auto"
        aria-label="Filtros"
        @submit.prevent="apply"
      >
        <div class="flex flex-col">
          <label
            class="flex min-h-[2rem] items-center gap-2 text-sm"
            :class="onlyNewIgnored ? 'cursor-not-allowed text-text-muted' : 'cursor-pointer text-text'"
          >
            <input
              v-model="filters.only_new"
              type="checkbox"
              class="h-4 w-4"
              :disabled="onlyNewIgnored"
              :aria-describedby="onlyNewIgnored ? 'f-only-new-hint' : undefined"
            />
            Solo nuevas
          </label>
          <span v-if="onlyNewIgnored" id="f-only-new-hint" class="text-meta text-text-muted">
            No aplica al filtrar por estado
          </span>
        </div>
        <div class="flex items-center gap-2">
          <label for="f-min-score" class="text-sm text-text">Score mín.</label>
          <input
            id="f-min-score"
            ref="filtersFirstInput"
            v-model.number="filters.min_score"
            type="number"
            min="0"
            max="100"
            inputmode="numeric"
            class="input input-num w-16 py-1"
          />
        </div>
        <div class="flex items-center gap-2">
          <label for="f-limit" class="text-sm text-text">Límite</label>
          <input
            id="f-limit"
            v-model.number="filters.limit"
            type="number"
            min="1"
            max="200"
            inputmode="numeric"
            class="input input-num w-16 py-1"
          />
        </div>
        <StatusFilter v-model="filters.status" />
        <button type="submit" :disabled="loading" class="btn btn-primary">
          {{ loading ? 'Cargando...' : 'Aplicar' }}
        </button>
      </form>
    </header>

    <div
      v-if="error"
      role="alert"
      class="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-text"
    >
      <span class="font-semibold text-danger">No se pudieron cargar las ofertas.</span>
      <span class="min-w-0 break-words text-text-muted">{{ error }}</span>
      <button type="button" class="btn btn-secondary ml-auto" @click="load">Reintentar</button>
    </div>

    <div
      v-if="loading && !jobs.length"
      class="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-8 text-sm text-text-muted"
      role="status"
    >
      <svg class="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      Cargando ofertas...
    </div>

    <div
      v-else-if="!jobs.length && !error"
      class="rounded-lg border border-border bg-surface px-4 py-10 text-center"
    >
      <p class="text-sm font-semibold text-text">No hay ofertas con estos filtros.</p>
      <p class="mt-1 text-meta text-text-muted">
        <template v-if="onlyNewIgnored">Baja el score mínimo o cambia los estados para ver más.</template>
        <template v-else>Baja el score mínimo o desactiva «Solo nuevas» para ver más.</template>
      </p>
    </div>

    <div
      v-else-if="jobs.length"
      class="grid items-start gap-4 lg:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]"
    >
      <div v-show="!showMobileDetail" class="min-w-0">
      <ul
        role="listbox"
        class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
        aria-label="Ofertas rankeadas"
        aria-keyshortcuts="j k Enter o e i a x u / ?"
        :aria-busy="loading ? 'true' : undefined"
        @keydown="onListKeydown"
      >
        <li v-for="job in jobs" :key="job.job_id" role="none">
          <div
            :id="optionId(job.job_id)"
            role="option"
            :tabindex="activeId === job.job_id ? 0 : -1"
            :aria-selected="selectedId === job.job_id ? 'true' : 'false'"
            class="flex w-full cursor-pointer items-start gap-3 px-3 py-1.5 text-left transition-colors duration-100 focus-visible:-outline-offset-2"
            :class="
              selectedId === job.job_id
                ? 'bg-accent/10'
                : returnedId === job.job_id
                  ? 'bg-surface-2'
                  : 'hover:bg-surface-2'
            "
            @click="select(job)"
          >
            <ScoreBadge :score="job.llm_score" />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span
                  v-if="!job.viewed_at"
                  class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  aria-hidden="true"
                ></span>
                <span
                  class="truncate text-sm"
                  :class="job.viewed_at || job.status === 'discarded' ? 'text-text-muted' : 'font-semibold text-text'"
                >
                  {{ decodeEntities(job.title) }}
                </span>
                <span class="sr-only">{{ job.viewed_at ? '(vista)' : '(nueva)' }}</span>
              </span>
              <span class="flex items-center gap-1.5 text-meta text-text-muted">
                <StatusBadge v-if="job.status" :status="job.status" />
                <span class="truncate">
                  {{ job.company || 'Empresa no informada' }}<span aria-hidden="true"> · </span><span class="sr-only">, </span>{{ job.location || 'Sin ubicación' }}
                </span>
                <span class="shrink-0" aria-hidden="true">·</span><span class="sr-only">, </span>
                <span class="shrink-0">{{ platformLabel(job.platform) }}</span>
              </span>
              <span v-if="job.tags?.length" class="mt-1 flex gap-1">
                <span v-for="tag in job.tags.slice(0, ROW_TAGS_MAX)" :key="tag" class="chip">{{ tag }}</span>
              </span>
            </span>
            <span v-if="job.red_flags?.length" class="flex shrink-0">
              <span
                class="flex h-5 items-center gap-1 text-meta font-medium tabular-nums text-danger"
                :title="`${job.red_flags.length} alertas`"
              >
                <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                  <path d="M8.9 2.2a1 1 0 0 0-1.8 0L1.4 12.5A1 1 0 0 0 2.3 14h11.4a1 1 0 0 0 .9-1.5L8.9 2.2ZM8.75 12h-1.5v-1.5h1.5V12Zm0-3h-1.5V5.5h1.5V9Z" />
                </svg>
                {{ job.red_flags.length }}
                <span class="sr-only">{{ job.red_flags.length === 1 ? 'alerta' : 'alertas' }}</span>
              </span>
            </span>
          </div>
        </li>
      </ul>

      <div class="mt-3 flex flex-col items-center gap-2 text-meta text-text-muted">
        <p class="tabular-nums">{{ jobs.length }} de {{ Math.max(total, jobs.length) }}</p>
        <button
          v-if="hasMore"
          type="button"
          class="btn btn-secondary"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? 'Cargando...' : 'Cargar más' }}
        </button>
        <span class="sr-only" role="status">{{ loadAnnouncement }}</span>
      </div>
      </div>

      <aside
        ref="panel"
        class="hidden overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface lg:sticky lg:top-[calc(theme(spacing.header)+1.5rem)] lg:block lg:max-h-[calc(100vh-theme(spacing.header)-3rem)]"
        aria-label="Detalle de la oferta"
      >
        <JobDetail
          v-if="selectedJob"
          :job="selectedJob"
          id-prefix="d"
          :status-pending="isStatusPending(selectedJob.job_id)"
          @mark-viewed="markViewed"
          @change-status="changeStatus"
        />
        <p v-else class="px-4 py-10 text-center text-meta text-text-muted">
          Elige una oferta de la lista para ver el análisis.
        </p>
      </aside>

      <!--
        Stacked layout (<lg): the open job replaces the list, outside the listbox.
        Back control first in reading order; the bottom bar repeats it within thumb reach.
      -->
      <section
        v-if="showMobileDetail"
        aria-label="Detalle de la oferta"
        class="-mx-3 -mt-4 sm:-mx-6 sm:-mt-6 lg:hidden"
        @keydown.esc="closeMobileDetail"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border bg-surface px-1.5 py-1">
          <button type="button" class="btn btn-ghost min-h-[2.5rem] px-2" @click="closeMobileDetail">
            <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Volver a la lista
          </button>
          <span class="px-2 text-meta tabular-nums text-text-muted">
            {{ selectedIndex + 1 }} de {{ jobs.length }}
          </span>
        </div>

        <div class="bg-surface">
          <JobDetail
            :job="selectedJob"
            :id-prefix="MOBILE_ID_PREFIX"
            :status-pending="isStatusPending(selectedJob.job_id)"
            @mark-viewed="markViewed"
            @change-status="changeStatus"
          />
        </div>

        <StickyBottomBar class="flex items-center gap-2 px-3 py-2">
          <button type="button" class="btn btn-secondary min-h-[2.75rem]" @click="closeMobileDetail">
            <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke-linecap="round" />
            </svg>
            Lista
          </button>
          <span class="sr-only" aria-live="polite">{{ stepAnnouncement }}</span>
          <div class="ml-auto flex gap-2">
            <button
              type="button"
              class="btn btn-secondary min-h-[2.75rem]"
              :disabled="selectedIndex <= 0"
              @click="stepMobileDetail(-1)"
            >
              <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M10 3.5 5.5 8l4.5 4.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Anterior
            </button>
            <button
              type="button"
              class="btn btn-secondary min-h-[2.75rem]"
              :disabled="selectedIndex >= jobs.length - 1"
              @click="stepMobileDetail(1)"
            >
              Siguiente
              <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="m6 3.5 4.5 4.5L6 12.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </StickyBottomBar>
      </section>
    </div>
  </section>
</template>
