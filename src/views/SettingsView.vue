<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { api, getApiKey } from '../api/client'
import FieldError from '../components/FieldError.vue'
import StickyBottomBar from '../components/StickyBottomBar.vue'
import TagList from '../components/TagList.vue'
import { useRefreshRun } from '../composables/useRefreshRun'
import { setSearchSettings } from '../composables/useSearchSettings'
import { pushToast } from '../composables/useToasts'
import { userMessage } from '../utils/errors'
import {
  MAX_QUERIES,
  PAGES_MAX,
  PAGES_MIN,
  mapServerIssues,
  snapshot,
  toForm,
  toPayload,
  validate,
} from '../utils/searchSettings'

const HTTP_UNPROCESSABLE = 422
const LEAVE_CONFIRM = 'Tienes cambios sin guardar. ¿Salir de todos modos?'

const { isRunning } = useRefreshRun()

const loading = ref(true)
const loadFailed = ref(false)
const saving = ref(false)
const error = ref('')
const updatedAt = ref(null)
const available = ref([])
const form = ref({ queries: [], location: '', max_pages: 1, platforms: [] })
const baseline = ref(snapshot(form.value))
// Last server payload, used by "Restablecer".
let serverData = null

// --- TagList registry: typed-but-not-added text is flushed on save and counts as dirty ---
const tagFlushers = new Map()
const pendingTags = reactive(new Set())
provide('tagListRegistry', {
  register: (id, flush) => tagFlushers.set(id, flush),
  unregister: (id) => {
    tagFlushers.delete(id)
    pendingTags.delete(id)
  },
  setPending: (id, pending) => (pending ? pendingTags.add(id) : pendingTags.delete(id)),
})

async function flushPendingTags() {
  for (const flush of [...tagFlushers.values()]) {
    flush()
    await nextTick()
  }
}

// --- Validation: shown once touched or after a submit attempt ---
const touched = reactive(new Set())
const submitted = ref(false)
const serverErrors = ref({})
const liveErrors = computed(() => validate(form.value))
const shown = computed(() => {
  const out = { ...serverErrors.value }
  for (const [field, msg] of Object.entries(liveErrors.value)) {
    if (submitted.value || touched.has(field)) out[field] = msg
  }
  return out
})
const touch = (field) => touched.add(field)

watch(form, () => {
  if (Object.keys(serverErrors.value).length) serverErrors.value = {}
}, { deep: true })

const isDirty = computed(() => snapshot(form.value) !== baseline.value || pendingTags.size > 0)

function resetBaseline() {
  baseline.value = snapshot(form.value)
}

function applyServerData(data) {
  serverData = data
  available.value = data.available_platforms || []
  updatedAt.value = data.updated_at
  form.value = toForm(data)
  resetBaseline()
}

async function load() {
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    applyServerData(await api.getSearchSettings())
  } catch (e) {
    loadFailed.value = true
    error.value = userMessage(e, 'Intenta de nuevo en un momento.')
  } finally {
    loading.value = false
  }
}

const summary = computed(() => {
  const q = form.value.queries.length
  const p = form.value.platforms.length
  const pages = Number(form.value.max_pages)
  const n = Number.isInteger(pages) && pages >= PAGES_MIN && pages <= PAGES_MAX ? pages : 0
  return `${q} ${q === 1 ? 'consulta' : 'consultas'} × ${p} ${p === 1 ? 'portal' : 'portales'} × ${n} ${n === 1 ? 'página' : 'páginas'}`
})

function setQueries(next) {
  form.value = { ...form.value, queries: next }
}

function togglePlatform(name, checked) {
  const next = checked ? [...form.value.platforms, name] : form.value.platforms.filter((p) => p !== name)
  form.value = { ...form.value, platforms: next }
  touch('platforms')
}

function discard() {
  form.value = toForm(serverData)
  serverErrors.value = {}
  touched.clear()
  submitted.value = false
  error.value = ''
  pendingTags.clear()
  pushToast({ message: 'Se descartaron los cambios.' })
}

const FIELD_IDS = { queries: 'f-queries', location: 'f-location', max_pages: 'f-pages', platforms: 'f-platforms' }

async function focusFirstInvalid(errors) {
  await nextTick()
  const field = Object.keys(FIELD_IDS).find((f) => errors[f])
  if (!field) return
  const root = document.getElementById(FIELD_IDS[field])
  const target = root?.matches('input, select, textarea') ? root : root?.querySelector('input')
  target?.focus()
}

async function save() {
  error.value = ''
  submitted.value = true
  await flushPendingTags()
  const errors = validate(form.value)
  if (Object.keys(errors).length) {
    focusFirstInvalid(errors)
    return
  }
  saving.value = true
  try {
    const data = await api.updateSearchSettings(toPayload(form.value))
    applyServerData(data)
    setSearchSettings(data)
    submitted.value = false
    touched.clear()
    pushToast({ type: 'success', message: 'Ajustes de búsqueda guardados.' })
  } catch (e) {
    if (e.status === HTTP_UNPROCESSABLE) {
      const { mapped, unmapped } = mapServerIssues(e.issues)
      serverErrors.value = mapped
      error.value = Object.keys(mapped).length || !unmapped
        ? 'El servidor rechazó algunos campos. Revisa los marcados.'
        : 'El servidor rechazó los datos.'
      focusFirstInvalid(mapped)
    } else {
      error.value = userMessage(e, 'No se pudieron guardar los ajustes.')
    }
  } finally {
    saving.value = false
  }
}

// --- Leave guards ---
onBeforeRouteLeave(() => {
  if (!isDirty.value || !getApiKey()) return true
  return window.confirm(LEAVE_CONFIRM)
})

function onBeforeUnload(e) {
  if (!isDirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <section aria-labelledby="settings-heading">
    <h1 id="settings-heading" class="mb-4 text-lg font-semibold text-text">Ajustes</h1>

    <p v-if="loading" role="status" class="text-text-muted">Cargando ajustes...</p>

    <div v-else-if="loadFailed" role="alert" class="text-danger">
      <span class="font-semibold">No se pudieron cargar los ajustes.</span>
      {{ error }}
      <button type="button" class="btn btn-secondary ml-2" @click="load">Reintentar</button>
    </div>

    <form v-else novalidate @submit.prevent="save">
      <section aria-labelledby="h-search" class="profile-section">
        <div>
          <h2 id="h-search" class="section-title">Búsqueda de ofertas</h2>
          <p class="section-desc">Qué se busca cada vez que presionas «Buscar nuevas».</p>
          <p class="section-desc" aria-live="polite">
            <span class="font-medium tabular-nums text-text">{{ summary }}</span>
          </p>
          <p v-if="!updatedAt" class="section-desc">Usando valores por defecto</p>
          <p v-if="isRunning" role="status" class="section-desc text-warn">
            Los cambios aplican a la próxima búsqueda.
          </p>
        </div>

        <div class="grid max-w-2xl gap-5">
          <!-- Consultas -->
          <div @focusout="touch('queries')">
            <TagList
              id="f-queries"
              :model-value="form.queries"
              label="Consultas"
              error-id="err-queries"
              :invalid="!!shown.queries"
              hint="Cada consulta se busca en todos los portales seleccionados"
              @update:model-value="setQueries"
            />
            <p class="field-hint tabular-nums" :class="form.queries.length > MAX_QUERIES ? 'text-danger' : ''">
              {{ form.queries.length }} de {{ MAX_QUERIES }} consultas
            </p>
            <FieldError id="err-queries" :message="shown.queries" />
          </div>

          <!-- Ubicacion -->
          <div>
            <label for="f-location" class="field-label">Ubicación</label>
            <input
              id="f-location"
              v-model="form.location"
              type="text"
              class="input"
              autocomplete="off"
              :aria-invalid="shown.location ? 'true' : 'false'"
              :aria-describedby="shown.location ? 'hint-location err-location' : 'hint-location'"
              @blur="touch('location')"
            />
            <span id="hint-location" class="field-hint">Vacío = sin filtro</span>
            <FieldError id="err-location" :message="shown.location" />
          </div>

          <!-- Paginas -->
          <div>
            <label for="f-pages" class="field-label">Páginas por consulta</label>
            <input
              id="f-pages"
              v-model="form.max_pages"
              type="number"
              inputmode="numeric"
              :min="PAGES_MIN"
              :max="PAGES_MAX"
              step="1"
              class="input input-num w-24"
              :aria-invalid="shown.max_pages ? 'true' : 'false'"
              :aria-describedby="shown.max_pages ? 'hint-pages err-pages' : 'hint-pages'"
              @blur="touch('max_pages')"
            />
            <span id="hint-pages" class="field-hint">De {{ PAGES_MIN }} a {{ PAGES_MAX }}. Más páginas = búsqueda más lenta.</span>
            <FieldError id="err-pages" :message="shown.max_pages" />
          </div>

          <!-- Portales -->
          <fieldset
            id="f-platforms"
            class="min-w-0"
            :aria-describedby="shown.platforms ? 'err-platforms' : undefined"
          >
            <legend class="field-label">Portales</legend>
            <div class="flex flex-wrap gap-x-5 gap-y-1">
              <label
                v-for="p in available"
                :key="p.name"
                class="inline-flex min-h-[2rem] items-center gap-2 text-sm text-text"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border-strong"
                  :checked="form.platforms.includes(p.name)"
                  @change="togglePlatform(p.name, $event.target.checked)"
                />
                {{ p.display_name }}
              </label>
            </div>
            <FieldError id="err-platforms" :message="shown.platforms" />
          </fieldset>
        </div>
      </section>

      <StickyBottomBar
        class="-mx-3 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:-mx-6 sm:px-6"
      >
        <div class="min-w-0 flex-1 text-meta">
          <p v-if="error" role="alert" class="break-words text-danger">
            <span class="font-semibold">No se pudo guardar.</span> {{ error }}
          </p>
          <p v-else-if="isDirty" role="status" class="font-medium text-warn">Cambios sin guardar</p>
          <p v-else class="text-text-muted">Los cambios se guardan al presionar el botón.</p>
        </div>
        <button type="button" class="btn btn-secondary" :disabled="!isDirty || saving" @click="discard">
          Restablecer
        </button>
        <button type="submit" :disabled="saving" class="btn btn-primary">
          <svg v-if="saving" class="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          {{ saving ? 'Guardando...' : 'Guardar cambios' }}
        </button>
      </StickyBottomBar>
    </form>
  </section>
</template>
