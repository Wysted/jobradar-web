<script setup>
import { computed } from 'vue'
import ScoreBadge from './ScoreBadge.vue'
import SeniorityMeter from './SeniorityMeter.vue'
import StatusActions from './StatusActions.vue'
import { decodeEntities, formatDate, isLowCertainty, platformLabel } from '../utils/format'

const props = defineProps({
  job: { type: Object, required: true },
  // Unique per rendered instance (desktop panel vs. inline mobile detail).
  idPrefix: { type: String, required: true },
  // True while a status change for this job is being saved.
  statusPending: { type: Boolean, default: false },
})
// change-status payload: { job, status } (status: new|interested|applied|discarded)
const emit = defineEmits(['mark-viewed', 'change-status'])

const title = computed(() => decodeEntities(props.job.title))
const lowCertainty = computed(() => isLowCertainty(props.job))
const vectorPct = computed(() => Math.round((props.job.vector_score || 0) * 100))
const hasMatches = computed(
  () => props.job.matched_areas?.length || props.job.matched_techs?.length,
)
const headingId = computed(() => `${props.idPrefix}-title`)
</script>

<template>
  <article class="text-sm" :aria-labelledby="headingId">
    <header class="space-y-3 border-b border-border p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 :id="headingId" tabindex="-1" class="text-lg font-semibold leading-snug text-text">{{ title }}</h2>
          <p class="mt-1 text-meta text-text-muted">
            {{ job.company || 'Empresa no informada' }}
            <span aria-hidden="true"> · </span><span class="sr-only">, </span>{{ job.location || 'Ubicación no informada' }}
            <span aria-hidden="true"> · </span><span class="sr-only">, </span>{{ platformLabel(job.platform) }}
          </p>
        </div>
        <ScoreBadge :score="job.llm_score" layout="inline" class="shrink-0" />
      </div>

      <p
        v-if="lowCertainty"
        class="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-meta text-text"
      >
        <svg viewBox="0 0 16 16" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" fill="currentColor" aria-hidden="true">
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.75 9.75h-1.5v-1.5h1.5v1.5Zm0-3h-1.5V4.75h1.5v3.5Z" />
        </svg>
        <span>
          <strong class="font-semibold">Baja certeza.</strong>
          La similitud semántica ({{ vectorPct }}) y el score del modelo ({{ job.llm_score }}) no coinciden.
        </span>
      </p>

      <div v-if="job.tags?.length" class="flex flex-wrap gap-1">
        <span v-for="tag in job.tags" :key="tag" class="chip">{{ tag }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <a
          :href="job.url"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-primary"
        >
          Abrir oferta
          <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M6 3H3.5A.5.5 0 0 0 3 3.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V10M9 3h4v4M13 3 7.5 8.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="sr-only">(se abre en una pestaña nueva)</span>
        </a>
        <button
          v-if="!job.viewed_at"
          type="button"
          class="btn btn-secondary"
          @click="emit('mark-viewed', job)"
        >
          Marcar como vista
        </button>
        <span v-else class="inline-flex min-h-[2rem] items-center gap-1.5 px-1 text-meta text-text-muted">
          <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="m3.5 8.5 3 3 6-7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Vista
        </span>
        <!-- Rendered only once the backend exposes `status`. -->
        <template v-if="job.status">
          <span class="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true"></span>
          <StatusActions
            :status="job.status"
            :pending="statusPending"
            @change="(status) => emit('change-status', { job, status })"
          />
        </template>
      </div>
    </header>

    <div class="space-y-5 p-4">
      <section v-if="job.red_flags?.length" :aria-labelledby="`${idPrefix}-rf`">
        <h3 :id="`${idPrefix}-rf`" class="mb-2 text-meta font-semibold text-danger">
          Alertas ({{ job.red_flags.length }})
        </h3>
        <ul class="space-y-1.5 rounded-md border border-danger/30 bg-danger/5 p-2.5">
          <li v-for="(flag, i) in job.red_flags" :key="i" class="flex gap-2 text-text">
            <svg viewBox="0 0 16 16" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" fill="currentColor" aria-hidden="true">
              <path d="M8.9 2.2a1 1 0 0 0-1.8 0L1.4 12.5A1 1 0 0 0 2.3 14h11.4a1 1 0 0 0 .9-1.5L8.9 2.2ZM8.75 12h-1.5v-1.5h1.5V12Zm0-3h-1.5V5.5h1.5V9Z" />
            </svg>
            <span>{{ flag }}</span>
          </li>
        </ul>
      </section>

      <section v-if="job.missing_skills?.length" :aria-labelledby="`${idPrefix}-ms`">
        <h3 :id="`${idPrefix}-ms`" class="mb-2 text-meta font-semibold text-text">Te falta</h3>
        <ul class="flex flex-wrap gap-1.5">
          <li v-for="skill in job.missing_skills" :key="skill" class="chip border-warn/40 bg-warn/10">
            {{ skill }}
          </li>
        </ul>
      </section>

      <section v-if="hasMatches" :aria-labelledby="`${idPrefix}-mt`">
        <div class="mb-1 flex items-baseline justify-between gap-2">
          <h3 :id="`${idPrefix}-mt`" class="text-meta font-semibold text-text">Coincidencias</h3>
          <span class="flex items-center gap-3 text-xs text-text-muted" aria-hidden="true">
            <span class="flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-accent"></span>tú</span>
            <span class="flex items-center gap-1"><span class="h-2 w-3 rounded-sm border border-warn bg-warn/20"></span>brecha</span>
          </span>
        </div>
        <div class="grid gap-x-8 gap-y-3 xl:grid-cols-2">
          <div v-if="job.matched_areas?.length">
            <h4 class="text-xs text-text-muted">Áreas</h4>
            <ul>
              <SeniorityMeter
                v-for="m in job.matched_areas"
                :key="m.name"
                :name="m.name"
                :profile-sen="m.profile_sen"
                :job-sen="m.job_sen"
              />
            </ul>
          </div>
          <div v-if="job.matched_techs?.length">
            <h4 class="text-xs text-text-muted">Tecnologías</h4>
            <ul>
              <SeniorityMeter
                v-for="m in job.matched_techs"
                :key="m.name"
                :name="m.name"
                :profile-sen="m.profile_sen"
                :job-sen="m.job_sen"
              />
            </ul>
          </div>
        </div>
      </section>

      <section v-if="job.pitch_angles?.length" :aria-labelledby="`${idPrefix}-pa`">
        <h3 :id="`${idPrefix}-pa`" class="mb-2 text-meta font-semibold text-text">Ángulos para tu postulación</h3>
        <ol class="max-w-[70ch] list-decimal space-y-1.5 pl-5 text-text marker:text-text-muted marker:tabular-nums">
          <li v-for="(angle, i) in job.pitch_angles" :key="i">{{ angle }}</li>
        </ol>
      </section>

      <details v-if="job.reasoning" class="group rounded-md border border-border">
        <summary
          class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-2 text-meta font-semibold text-text hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
        >
          <svg
            viewBox="0 0 16 16"
            class="h-3.5 w-3.5 text-text-muted transition-transform duration-150 ease-out group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="m6 3.5 4.5 4.5L6 12.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Análisis del modelo
        </summary>
        <div class="space-y-2 border-t border-border px-2.5 py-2.5">
          <p class="max-w-[70ch] leading-relaxed text-text">{{ job.reasoning }}</p>
          <p class="text-xs text-text-muted">
            {{ job.llm_model }} · evaluada el
            <time :datetime="job.scored_at" class="tabular-nums">{{ formatDate(job.scored_at) }}</time>
          </p>
        </div>
      </details>
    </div>
  </article>
</template>
