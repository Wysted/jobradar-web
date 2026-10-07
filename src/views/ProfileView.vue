<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { api, getApiKey } from '../api/client'
import EducationEditor from '../components/EducationEditor.vue'
import ExperienceEditor from '../components/ExperienceEditor.vue'
import FieldError from '../components/FieldError.vue'
import StickyBottomBar from '../components/StickyBottomBar.vue'
import TagList from '../components/TagList.vue'
import { pushToast } from '../composables/useToasts'
import { userMessage } from '../utils/errors'
import { offerRestore } from '../utils/undoRemove'
import {
  describedBy,
  errorId,
  fieldId,
  mapServerIssues,
  newKey,
  snapshot,
  toPayload,
  validate,
  withKeys,
} from '../utils/profileForm'

const HTTP_UNPROCESSABLE = 422
const LEAVE_CONFIRM = 'Tienes cambios sin guardar. ¿Salir de todos modos?'

const route = useRoute()

const loading = ref(true)
const saving = ref(false)
const error = ref('')
// Distinguishes a failed load (offer Reintentar) from a failed save in the bottom bar.
const loadFailed = ref(false)
const isNew = ref(false)

function emptyForm() {
  return {
    headline: '',
    total_years: 0,
    rut: '',
    personal_info: { name: '', email: '', phone: '' },
    links: { linkedin: '', github: '', portfolio: '' },
    summary: '',
    methodologies: [],
    experiences: [],
    education: [],
    areas: [],
    technologies: [],
    soft_skills: [],
    roles_target: [],
    roles_excluded: [],
    industries_preferred: [],
    industries_excluded: [],
    location: { city: '', country: '', willing_to_relocate: false },
    work_mode: [],
    salary: { currency: 'CLP', min_monthly: 0, expected_monthly: null },
    languages: [],
    contract_types: [],
    company_size_pref: [],
    deal_breakers: [],
  }
}

const form = ref(emptyForm())
// Content snapshot of the last loaded/saved state; dirty = current differs from it.
const baseline = ref(snapshot(form.value))

// --- Validation state ---
// `errors` is always computed from the form; a field's error is shown once it was
// blurred (touched) or after a submit attempt. Server errors are mapped by path.
const touched = reactive(new Set())
const submitted = ref(false)
const serverErrors = ref({})
const liveErrors = computed(() => validate(form.value))
const shown = computed(() => {
  const out = { ...serverErrors.value }
  for (const [path, msg] of Object.entries(liveErrors.value)) {
    if (submitted.value || touched.has(path)) out[path] = msg
  }
  return out
})
const touch = (path) => touched.add(path)

// Edits invalidate stale server messages.
watch(form, () => {
  if (Object.keys(serverErrors.value).length) serverErrors.value = {}
}, { deep: true })

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

// One flush per tick: nested editors rebuild their arrays from props, so two emits in
// the same tick would overwrite each other.
async function flushPendingTags() {
  for (const flush of [...tagFlushers.values()]) {
    flush()
    await nextTick()
  }
}

const isDirty = computed(() => snapshot(form.value) !== baseline.value || pendingTags.size > 0)

function resetBaseline() {
  baseline.value = snapshot(form.value)
}

async function load() {
  loading.value = true
  error.value = ''
  loadFailed.value = false
  try {
    const data = await api.getProfile()
    form.value = normalize(data)
    isNew.value = false
  } catch (e) {
    if (e.status === 404) {
      isNew.value = true
      form.value = emptyForm()
    } else {
      loadFailed.value = true
      error.value = userMessage(e, 'Intenta de nuevo en un momento.')
    }
  } finally {
    resetBaseline()
    loading.value = false
  }
}

function normalize(data) {
  const base = emptyForm()
  return withKeys({
    ...base,
    ...data,
    rut: data.rut || '',
    personal_info: { ...base.personal_info, ...(data.personal_info || {}) },
    links: { ...base.links, ...(data.links || {}) },
    summary: data.summary || '',
    methodologies: data.methodologies || [],
    experiences: data.experiences || [],
    education: data.education || [],
    areas: data.areas || [],
    technologies: data.technologies || [],
    languages: data.languages || [],
    location: { ...base.location, ...(data.location || {}) },
    salary: data.salary ? { ...base.salary, ...data.salary } : base.salary,
  })
}

// Move focus to the first field marked invalid (DOM order = reading order).
async function focusFirstInvalid() {
  await nextTick()
  document.querySelector('form [aria-invalid="true"]')?.focus()
}

function normalizeCurrency() {
  const cur = form.value.salary.currency
  if (typeof cur === 'string') form.value.salary.currency = cur.trim().toUpperCase()
}

async function save() {
  if (saving.value || loadFailed.value) return
  error.value = ''
  serverErrors.value = {}
  normalizeCurrency()
  await flushPendingTags()
  submitted.value = true

  const count = Object.keys(liveErrors.value).length
  if (count) {
    error.value = count === 1 ? 'Hay 1 campo por corregir.' : `Hay ${count} campos por corregir.`
    focusFirstInvalid()
    return
  }

  saving.value = true
  try {
    const body = toPayload(form.value)
    if (isNew.value) {
      await api.putProfile(body)
    } else {
      await api.patchProfile(body)
    }
    isNew.value = false
    submitted.value = false
    touched.clear()
    resetBaseline()
    pushToast({ type: 'success', message: 'Perfil guardado.' })
  } catch (e) {
    if (e.status === HTTP_UNPROCESSABLE) {
      const { mapped, unmapped } = mapServerIssues(e.issues, form.value)
      serverErrors.value = mapped
      error.value = Object.keys(mapped).length
        ? 'El servidor rechazó algunos campos. Revisa los marcados.'
        : unmapped[0] || 'El servidor rechazó los datos.'
      focusFirstInvalid()
    } else {
      error.value = userMessage(e, 'No se pudo guardar el perfil.')
    }
  } finally {
    saving.value = false
  }
}

// --- Immutable list editing (areas, technologies, languages) ---
function addItem(list, item, focusName) {
  const entry = { _key: newKey(), ...item }
  form.value[list] = [...form.value[list], entry]
  nextTick(() => document.getElementById(fieldId(`${list}.${entry._key}.${focusName}`))?.focus())
}
const REMOVED_COPY = {
  areas: 'Área eliminada.',
  technologies: 'Tecnología eliminada.',
  languages: 'Idioma eliminado.',
}
function removeItem(list, key) {
  const index = form.value[list].findIndex((x) => x._key === key)
  if (index < 0) return
  const item = form.value[list][index]
  form.value[list] = form.value[list].filter((x) => x._key !== key)
  offerRestore({
    message: REMOVED_COPY[list],
    getList: () => form.value[list],
    setList: (next) => { form.value[list] = next },
    index,
    item,
    same: (a, b) => a._key === b._key,
  })
}
const setItem = (list, key, changes) => {
  form.value[list] = form.value[list].map((x) => (x._key === key ? { ...x, ...changes } : x))
}
// Number inputs: '' stays '' (invalid, reported by validation) instead of becoming 0.
const numberOf = (e) => (e.target.value === '' ? '' : e.target.valueAsNumber)

const addArea = () => addItem('areas', { name: '', seniority: 3 }, 'name')
const addTech = () => addItem('technologies', { name: '', area_name: '', seniority: 3 }, 'name')
const addLang = () => addItem('languages', { name: '', level: '' }, 'name')

const fp = (list, item, name) => `${list}.${item._key}.${name}`
const rowIdx = (list, item) => form.value[list].findIndex((x) => x._key === item._key) + 1

// Side index (presentational). Section ids must match the template.
const SECTION_GROUPS = [
  {
    label: 'Matching',
    items: [
      { id: 'basicos', label: 'Datos básicos' },
      { id: 'ubicacion', label: 'Ubicación y salario' },
      { id: 'areas', label: 'Áreas' },
      { id: 'tecnologias', label: 'Tecnologías' },
      { id: 'idiomas', label: 'Idiomas' },
      { id: 'preferencias', label: 'Preferencias' },
      { id: 'industria', label: 'Industria y contrato' },
    ],
  },
  {
    label: 'CV',
    items: [
      { id: 'personales', label: 'Datos personales' },
      { id: 'links', label: 'Links' },
      { id: 'resumen', label: 'Resumen y metodologías' },
      { id: 'experiencia', label: 'Experiencia' },
      { id: 'educacion', label: 'Educación' },
    ],
  },
]

// --- Scrollspy and hash navigation ---
const activeSection = ref('')
let observer = null
const visibleSections = new Set()
// Rows are offset by the sticky header (3rem) + breathing room; only the top band counts.
const SPY_ROOT_MARGIN = '-64px 0px -60% 0px'

function sectionIds() {
  return SECTION_GROUPS.flatMap((g) => g.items.map((i) => `sec-${i.id}`))
}

function setupScrollspy() {
  observer?.disconnect()
  if (typeof IntersectionObserver === 'undefined') return
  const order = sectionIds()
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleSections.add(entry.target.id)
        else visibleSections.delete(entry.target.id)
      }
      const first = order.find((id) => visibleSections.has(id))
      if (first) activeSection.value = first
    },
    { rootMargin: SPY_ROOT_MARGIN },
  )
  for (const id of order) {
    const el = document.getElementById(id)
    if (el) observer.observe(el)
  }
}

function scrollToHash() {
  const id = decodeURIComponent(route.hash.slice(1))
  if (!id) return
  document.getElementById(id)?.scrollIntoView()
  activeSection.value = id
}

// The form only exists once loading ends: set up after it renders.
watch(loading, async (isLoading) => {
  if (isLoading) return
  await nextTick()
  setupScrollspy()
  scrollToHash()
})

// --- Leave guards ---
onBeforeRouteLeave(() => {
  // Without a key (expired session) the data cannot be saved anyway: do not trap the user.
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
  observer?.disconnect()
})
</script>

<template>
  <section aria-labelledby="profile-heading">
    <header class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 id="profile-heading" class="text-lg font-semibold text-text">Perfil</h1>
      <p v-if="isNew && !loading" class="text-meta text-text-muted">
        Aún no tienes perfil. Completa al menos los campos con
        <span class="text-danger" aria-hidden="true">*</span><span class="sr-only">asterisco</span> y créalo.
      </p>
      <p v-else-if="!loading" class="text-meta text-text-muted">
        Los campos con <span class="text-danger" aria-hidden="true">*</span><span class="sr-only">asterisco</span> son obligatorios.
      </p>
    </header>

    <p v-if="loading" role="status" class="flex items-center gap-2 text-sm text-text-muted">
      <svg class="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      Cargando perfil...
    </p>

    <form v-else novalidate @submit.prevent="save">
      <div class="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Secciones del perfil"
          class="hidden lg:block"
        >
          <div class="sticky top-[calc(theme(spacing.header)+1.5rem)] space-y-5">
            <div v-for="group in SECTION_GROUPS" :key="group.label">
              <p class="mb-1 px-2 text-xs font-semibold text-text-muted">{{ group.label }}</p>
              <ul>
                <li v-for="item in group.items" :key="item.id">
                  <a
                    :href="`#sec-${item.id}`"
                    :aria-current="activeSection === `sec-${item.id}` ? 'location' : undefined"
                    class="block rounded-md px-2 py-1 text-meta transition-colors duration-150 hover:bg-surface-2 hover:text-text"
                    :class="activeSection === `sec-${item.id}` ? 'bg-surface-2 font-semibold text-text' : 'text-text-muted'"
                    @click="activeSection = `sec-${item.id}`"
                  >
                    {{ item.label }}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        <div class="min-w-0 max-w-4xl">
          <h2 class="mb-1 text-xs font-semibold text-text-muted">Matching</h2>

          <!-- Datos básicos -->
          <section id="sec-basicos" aria-labelledby="h-basicos" class="profile-section">
            <div class="section-head">
              <h3 id="h-basicos" class="section-title">Datos básicos</h3>
              <p class="section-desc">Contexto para el ranking de ofertas.</p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label for="p-headline" class="field-label">Titular</label>
                <input
                  id="p-headline"
                  v-model="form.headline"
                  placeholder="Senior Full-Stack, Go y React, 8 años"
                  aria-describedby="p-headline-hint"
                  class="input"
                />
                <span id="p-headline-hint" class="field-hint">Una línea, como un título profesional.</span>
              </div>
              <div>
                <label :for="fieldId('total_years')" class="field-label">
                  Años de experiencia <span class="text-danger" aria-hidden="true">*</span>
                </label>
                <input
                  :id="fieldId('total_years')"
                  v-model.number="form.total_years"
                  type="number"
                  step="0.5"
                  min="0"
                  inputmode="decimal"
                  aria-required="true"
                  :aria-invalid="shown.total_years ? 'true' : undefined"
                  :aria-describedby="describedBy('total_years', shown)"
                  class="input input-num"
                  @blur="touch('total_years')"
                />
                <FieldError :id="errorId('total_years')" :message="shown.total_years" />
              </div>
              <div>
                <label :for="fieldId('rut')" class="field-label">RUT</label>
                <input
                  :id="fieldId('rut')"
                  v-model="form.rut"
                  placeholder="12.345.678-9"
                  :aria-invalid="shown.rut ? 'true' : undefined"
                  :aria-describedby="describedBy('rut', shown)"
                  class="input input-num"
                  @blur="touch('rut')"
                />
                <FieldError :id="errorId('rut')" :message="shown.rut" />
              </div>
            </div>
          </section>

          <!-- Ubicacion y salario -->
          <section id="sec-ubicacion" aria-labelledby="h-ubicacion" class="profile-section">
            <div class="section-head">
              <h3 id="h-ubicacion" class="section-title">Ubicación y salario</h3>
              <p class="section-desc">Montos de sueldo mensual.</p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="p-city" class="field-label">Ciudad</label>
                <input id="p-city" v-model="form.location.city" class="input" />
              </div>
              <div>
                <label for="p-country" class="field-label">País</label>
                <input id="p-country" v-model="form.location.country" class="input" />
              </div>
              <label class="flex min-h-[2rem] cursor-pointer items-center gap-2 text-sm text-text sm:col-span-2">
                <input v-model="form.location.willing_to_relocate" type="checkbox" class="h-4 w-4" />
                Acepto cambiarme de ciudad
              </label>
              <div class="grid grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:col-span-2">
                <div>
                  <label :for="fieldId('salary.currency')" class="field-label">Moneda</label>
                  <input
                    :id="fieldId('salary.currency')"
                    v-model="form.salary.currency"
                    maxlength="3"
                    autocapitalize="characters"
                    :aria-invalid="shown['salary.currency'] ? 'true' : undefined"
                    :aria-describedby="describedBy('salary.currency', shown, 'p-currency-hint')"
                    class="input uppercase"
                    @blur="normalizeCurrency(); touch('salary.currency')"
                  />
                </div>
                <div>
                  <label :for="fieldId('salary.min_monthly')" class="field-label">Mínimo</label>
                  <input
                    :id="fieldId('salary.min_monthly')"
                    v-model.number="form.salary.min_monthly"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    :aria-invalid="shown['salary.min_monthly'] ? 'true' : undefined"
                    :aria-describedby="describedBy('salary.min_monthly', shown)"
                    class="input input-num"
                    @blur="touch('salary.min_monthly')"
                  />
                </div>
                <div>
                  <label :for="fieldId('salary.expected_monthly')" class="field-label">Esperado</label>
                  <input
                    :id="fieldId('salary.expected_monthly')"
                    v-model.number="form.salary.expected_monthly"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    :aria-invalid="shown['salary.expected_monthly'] ? 'true' : undefined"
                    :aria-describedby="describedBy('salary.expected_monthly', shown)"
                    class="input input-num"
                    @blur="touch('salary.expected_monthly')"
                  />
                </div>
                <span id="p-currency-hint" class="field-hint col-span-3 mt-0">Código de 3 letras, por ejemplo CLP o USD.</span>
                <div class="col-span-3 space-y-0.5 empty:hidden">
                  <FieldError :id="errorId('salary.currency')" :message="shown['salary.currency']" />
                  <FieldError :id="errorId('salary.min_monthly')" :message="shown['salary.min_monthly']" />
                  <FieldError :id="errorId('salary.expected_monthly')" :message="shown['salary.expected_monthly']" />
                </div>
              </div>
            </div>
          </section>

          <!-- Areas -->
          <section id="sec-areas" aria-labelledby="h-areas" class="profile-section">
            <div class="section-head">
              <h3 id="h-areas" class="section-title">Áreas</h3>
              <p class="section-desc">Seniority de 1 (básico) a 5 (experto).</p>
            </div>
            <div>
              <div
                v-if="form.areas.length"
                class="mb-1 hidden grid-cols-[minmax(0,1fr)_5rem_2rem] gap-2 text-xs font-medium text-text-muted sm:grid"
                aria-hidden="true"
              >
                <span>Nombre</span><span>Seniority</span><span></span>
              </div>
              <ul class="space-y-2">
                <li
                  v-for="a in form.areas"
                  :key="a._key"
                  class="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2"
                >
                  <label :for="fieldId(fp('areas', a, 'name'))" class="sr-only">Nombre del área {{ rowIdx('areas', a) }}</label>
                  <input
                    :id="fieldId(fp('areas', a, 'name'))"
                    :value="a.name"
                    aria-required="true"
                    :aria-invalid="shown[fp('areas', a, 'name')] ? 'true' : undefined"
                    :aria-describedby="describedBy(fp('areas', a, 'name'), shown)"
                    maxlength="100"
                    class="input"
                    @input="setItem('areas', a._key, { name: $event.target.value })"
                    @blur="touch(fp('areas', a, 'name'))"
                  />
                  <label :for="fieldId(fp('areas', a, 'seniority'))" class="sr-only">Seniority de {{ a.name || `área ${rowIdx('areas', a)}` }}</label>
                  <input
                    :id="fieldId(fp('areas', a, 'seniority'))"
                    :value="a.seniority"
                    type="number"
                    min="1"
                    max="5"
                    :aria-invalid="shown[fp('areas', a, 'seniority')] ? 'true' : undefined"
                    :aria-describedby="describedBy(fp('areas', a, 'seniority'), shown)"
                    class="input input-num"
                    @input="setItem('areas', a._key, { seniority: numberOf($event) })"
                    @blur="touch(fp('areas', a, 'seniority'))"
                  />
                  <button
                    type="button"
                    class="icon-btn hover:text-danger"
                    :aria-label="`Eliminar área ${a.name || rowIdx('areas', a)}`"
                    @click="removeItem('areas', a._key)"
                  >
                    <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" /></svg>
                  </button>
                  <div class="col-span-full space-y-0.5 empty:hidden">
                    <FieldError :id="errorId(fp('areas', a, 'name'))" :message="shown[fp('areas', a, 'name')]" />
                    <FieldError :id="errorId(fp('areas', a, 'seniority'))" :message="shown[fp('areas', a, 'seniority')]" />
                  </div>
                </li>
              </ul>
              <p v-if="!form.areas.length" class="text-meta text-text-muted">Sin áreas todavía.</p>
              <button type="button" class="btn btn-ghost mt-2 -ml-2 text-accent hover:text-accent" @click="addArea">
                <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round" /></svg>
                Agregar área
              </button>
            </div>
          </section>

          <!-- Tecnologias -->
          <section id="sec-tecnologias" aria-labelledby="h-tecnologias" class="profile-section">
            <div class="section-head">
              <h3 id="h-tecnologias" class="section-title">Tecnologías</h3>
              <p class="section-desc">Cada tecnología pertenece a un área. Seniority de 1 a 5.</p>
            </div>
            <div>
              <div
                v-if="form.technologies.length"
                class="mb-1 hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_2rem] gap-2 text-xs font-medium text-text-muted sm:grid"
                aria-hidden="true"
              >
                <span>Tecnología</span><span>Área</span><span>Seniority</span><span></span>
              </div>
              <ul class="divide-y divide-border sm:divide-y-0 sm:space-y-2">
                <li
                  v-for="t in form.technologies"
                  :key="t._key"
                  class="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2 py-2 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_2rem] sm:py-0"
                >
                  <label :for="fieldId(fp('technologies', t, 'name'))" class="sr-only">Tecnología {{ rowIdx('technologies', t) }}</label>
                  <input
                    :id="fieldId(fp('technologies', t, 'name'))"
                    :value="t.name"
                    aria-required="true"
                    :aria-invalid="shown[fp('technologies', t, 'name')] ? 'true' : undefined"
                    :aria-describedby="describedBy(fp('technologies', t, 'name'), shown)"
                    maxlength="100"
                    placeholder="Tecnología"
                    class="input col-span-3 sm:col-span-1"
                    @input="setItem('technologies', t._key, { name: $event.target.value })"
                    @blur="touch(fp('technologies', t, 'name'))"
                  />
                  <label :for="fieldId(fp('technologies', t, 'area_name'))" class="sr-only">Área de {{ t.name || `tecnología ${rowIdx('technologies', t)}` }}</label>
                  <input
                    :id="fieldId(fp('technologies', t, 'area_name'))"
                    :value="t.area_name"
                    aria-required="true"
                    :aria-invalid="shown[fp('technologies', t, 'area_name')] ? 'true' : undefined"
                    :aria-describedby="describedBy(fp('technologies', t, 'area_name'), shown)"
                    maxlength="100"
                    placeholder="Área"
                    class="input"
                    @input="setItem('technologies', t._key, { area_name: $event.target.value })"
                    @blur="touch(fp('technologies', t, 'area_name'))"
                  />
                  <label :for="fieldId(fp('technologies', t, 'seniority'))" class="sr-only">Seniority de {{ t.name || `tecnología ${rowIdx('technologies', t)}` }}</label>
                  <input
                    :id="fieldId(fp('technologies', t, 'seniority'))"
                    :value="t.seniority"
                    type="number"
                    min="1"
                    max="5"
                    :aria-invalid="shown[fp('technologies', t, 'seniority')] ? 'true' : undefined"
                    :aria-describedby="describedBy(fp('technologies', t, 'seniority'), shown)"
                    class="input input-num"
                    @input="setItem('technologies', t._key, { seniority: numberOf($event) })"
                    @blur="touch(fp('technologies', t, 'seniority'))"
                  />
                  <button
                    type="button"
                    class="icon-btn hover:text-danger"
                    :aria-label="`Eliminar tecnología ${t.name || rowIdx('technologies', t)}`"
                    @click="removeItem('technologies', t._key)"
                  >
                    <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" /></svg>
                  </button>
                  <div class="col-span-full space-y-0.5 empty:hidden">
                    <FieldError :id="errorId(fp('technologies', t, 'name'))" :message="shown[fp('technologies', t, 'name')]" />
                    <FieldError :id="errorId(fp('technologies', t, 'area_name'))" :message="shown[fp('technologies', t, 'area_name')]" />
                    <FieldError :id="errorId(fp('technologies', t, 'seniority'))" :message="shown[fp('technologies', t, 'seniority')]" />
                  </div>
                </li>
              </ul>
              <p v-if="!form.technologies.length" class="text-meta text-text-muted">Sin tecnologías todavía.</p>
              <button type="button" class="btn btn-ghost mt-2 -ml-2 text-accent hover:text-accent" @click="addTech">
                <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round" /></svg>
                Agregar tecnología
              </button>
            </div>
          </section>

          <!-- Idiomas -->
          <section id="sec-idiomas" aria-labelledby="h-idiomas" class="profile-section">
            <div class="section-head">
              <h3 id="h-idiomas" class="section-title">Idiomas</h3>
              <p class="section-desc">Nivel libre: Nativo, B2, Avanzado...</p>
            </div>
            <div>
              <div
                v-if="form.languages.length"
                class="mb-1 hidden grid-cols-[minmax(0,1fr)_8rem_2rem] gap-2 text-xs font-medium text-text-muted sm:grid"
                aria-hidden="true"
              >
                <span>Idioma</span><span>Nivel</span><span></span>
              </div>
              <ul class="space-y-2">
                <li
                  v-for="l in form.languages"
                  :key="l._key"
                  class="grid grid-cols-[minmax(0,1fr)_8rem_2rem] items-center gap-2"
                >
                  <label :for="fieldId(fp('languages', l, 'name'))" class="sr-only">Idioma {{ rowIdx('languages', l) }}</label>
                  <input
                    :id="fieldId(fp('languages', l, 'name'))"
                    :value="l.name"
                    aria-required="true"
                    :aria-invalid="shown[fp('languages', l, 'name')] ? 'true' : undefined"
                    :aria-describedby="describedBy(fp('languages', l, 'name'), shown)"
                    maxlength="100"
                    class="input"
                    @input="setItem('languages', l._key, { name: $event.target.value })"
                    @blur="touch(fp('languages', l, 'name'))"
                  />
                  <label :for="fieldId(fp('languages', l, 'level'))" class="sr-only">Nivel de {{ l.name || `idioma ${rowIdx('languages', l)}` }}</label>
                  <input
                    :id="fieldId(fp('languages', l, 'level'))"
                    :value="l.level"
                    aria-required="true"
                    :aria-invalid="shown[fp('languages', l, 'level')] ? 'true' : undefined"
                    :aria-describedby="describedBy(fp('languages', l, 'level'), shown)"
                    maxlength="20"
                    class="input"
                    @input="setItem('languages', l._key, { level: $event.target.value })"
                    @blur="touch(fp('languages', l, 'level'))"
                  />
                  <button
                    type="button"
                    class="icon-btn hover:text-danger"
                    :aria-label="`Eliminar idioma ${l.name || rowIdx('languages', l)}`"
                    @click="removeItem('languages', l._key)"
                  >
                    <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" /></svg>
                  </button>
                  <div class="col-span-full space-y-0.5 empty:hidden">
                    <FieldError :id="errorId(fp('languages', l, 'name'))" :message="shown[fp('languages', l, 'name')]" />
                    <FieldError :id="errorId(fp('languages', l, 'level'))" :message="shown[fp('languages', l, 'level')]" />
                  </div>
                </li>
              </ul>
              <p v-if="!form.languages.length" class="text-meta text-text-muted">Sin idiomas todavía.</p>
              <button type="button" class="btn btn-ghost mt-2 -ml-2 text-accent hover:text-accent" @click="addLang">
                <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke-linecap="round" /></svg>
                Agregar idioma
              </button>
            </div>
          </section>

          <!-- Preferencias -->
          <section id="sec-preferencias" aria-labelledby="h-preferencias" class="profile-section">
            <div class="section-head">
              <h3 id="h-preferencias" class="section-title">Preferencias</h3>
              <p class="section-desc">Escribe y presiona Enter para agregar cada valor.</p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <TagList v-model="form.roles_target" label="Roles objetivo" />
              <TagList v-model="form.roles_excluded" label="Roles excluidos" />
              <TagList v-model="form.work_mode" label="Modalidad" hint="remote, hybrid u onsite" />
              <TagList v-model="form.soft_skills" label="Habilidades blandas" />
            </div>
          </section>

          <!-- Industria -->
          <section id="sec-industria" aria-labelledby="h-industria" class="profile-section">
            <div class="section-head">
              <h3 id="h-industria" class="section-title">Industria y contrato</h3>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <TagList v-model="form.industries_preferred" label="Industrias preferidas" />
              <TagList v-model="form.industries_excluded" label="Industrias excluidas" />
              <TagList v-model="form.contract_types" label="Tipos de contrato" />
              <TagList v-model="form.company_size_pref" label="Tamaño de empresa" />
              <div class="sm:col-span-2">
                <TagList v-model="form.deal_breakers" label="Descartes absolutos" hint="Condiciones que hacen inviable una oferta." />
              </div>
            </div>
          </section>

          <h2 class="mb-1 mt-10 text-xs font-semibold text-text-muted">CV</h2>

          <!-- Datos personales -->
          <section id="sec-personales" aria-labelledby="h-personales" class="profile-section">
            <div class="section-head">
              <h3 id="h-personales" class="section-title">Datos personales</h3>
              <p class="section-desc">Para el encabezado del CV.</p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label for="p-name" class="field-label">Nombre completo</label>
                <input id="p-name" v-model="form.personal_info.name" autocomplete="name" maxlength="200" class="input" />
              </div>
              <div>
                <label for="p-email" class="field-label">Email</label>
                <input id="p-email" v-model="form.personal_info.email" type="email" autocomplete="email" maxlength="200" class="input" />
              </div>
              <div>
                <label for="p-phone" class="field-label">Teléfono</label>
                <input
                  id="p-phone"
                  v-model="form.personal_info.phone"
                  type="tel"
                  autocomplete="tel"
                  placeholder="+56 9 1234 5678"
                  maxlength="50"
                  class="input input-num"
                />
              </div>
            </div>
          </section>

          <!-- Links -->
          <section id="sec-links" aria-labelledby="h-links" class="profile-section">
            <div class="section-head">
              <h3 id="h-links" class="section-title">Links</h3>
            </div>
            <div class="grid gap-4">
              <div>
                <label for="p-linkedin" class="field-label">LinkedIn</label>
                <input id="p-linkedin" v-model="form.links.linkedin" type="url" placeholder="https://linkedin.com/in/..." maxlength="500" class="input" />
              </div>
              <div>
                <label for="p-github" class="field-label">GitHub</label>
                <input id="p-github" v-model="form.links.github" type="url" placeholder="https://github.com/..." maxlength="500" class="input" />
              </div>
              <div>
                <label for="p-portfolio" class="field-label">Portafolio</label>
                <input id="p-portfolio" v-model="form.links.portfolio" type="url" placeholder="https://tusitio.com" maxlength="500" class="input" />
              </div>
            </div>
          </section>

          <!-- Resumen -->
          <section id="sec-resumen" aria-labelledby="h-resumen" class="profile-section">
            <div class="section-head">
              <h3 id="h-resumen" class="section-title">Resumen y metodologías</h3>
            </div>
            <div class="grid gap-4">
              <div>
                <label for="p-summary" class="field-label">Resumen profesional</label>
                <textarea
                  id="p-summary"
                  v-model="form.summary"
                  rows="5"
                  aria-describedby="p-summary-hint"
                  class="input leading-relaxed"
                ></textarea>
                <span id="p-summary-hint" class="field-hint">Párrafo breve para el encabezado del CV.</span>
              </div>
              <TagList v-model="form.methodologies" label="Metodologías" />
            </div>
          </section>

          <!-- Experiencia -->
          <section id="sec-experiencia" aria-labelledby="h-experiencia" class="profile-section">
            <div class="section-head">
              <h3 id="h-experiencia" class="section-title">Experiencia</h3>
              <p class="section-desc">Fechas en formato AAAA-MM.</p>
            </div>
            <ExperienceEditor v-model="form.experiences" :errors="shown" @touch="touch" />
          </section>

          <!-- Educacion -->
          <section id="sec-educacion" aria-labelledby="h-educacion" class="profile-section">
            <div class="section-head">
              <h3 id="h-educacion" class="section-title">Educación</h3>
            </div>
            <EducationEditor v-model="form.education" :errors="shown" @touch="touch" />
          </section>
        </div>
      </div>

      <StickyBottomBar
        class="-mx-3 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:-mx-6 sm:px-6"
      >
        <div class="min-w-0 flex-1 text-meta">
          <p v-if="error" role="alert" class="break-words text-danger">
            <span v-if="loadFailed" class="font-semibold">No se pudo cargar el perfil.</span>
            <span v-else class="font-semibold">No se pudo guardar.</span>
            {{ error }}
            <button v-if="loadFailed" type="button" class="btn btn-secondary ml-2" @click="load">Reintentar</button>
          </p>
          <p v-else-if="isDirty" role="status" class="font-medium text-warn">Cambios sin guardar</p>
          <p v-else class="text-text-muted">
            {{ isNew ? 'Perfil nuevo, aún sin guardar.' : 'Los cambios se guardan al presionar el botón.' }}
          </p>
        </div>
        <button type="submit" :disabled="saving || loadFailed" class="btn btn-primary">
          <svg
            v-if="saving"
            class="h-4 w-4 motion-safe:animate-spin"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          {{ saving ? 'Guardando...' : isNew ? 'Crear perfil' : 'Guardar cambios' }}
        </button>
      </StickyBottomBar>
    </form>
  </section>
</template>
