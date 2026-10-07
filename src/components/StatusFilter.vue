<script setup>
import StatusIcon from './StatusIcon.vue'
import { JOB_STATUSES, STATUS_META } from '../utils/jobStatus'

// Multi-select toggle chips. Presentational: v-model is an array of statuses;
// the parent decides when the selection is applied (Enter / "Aplicar").
const props = defineProps({
  modelValue: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])

function toggle(status) {
  const on = props.modelValue.includes(status)
  // Keep pipeline order so the URL/query string is stable.
  const next = JOB_STATUSES.filter((s) => (s === status ? !on : props.modelValue.includes(s)))
  emit('update:modelValue', next)
}
</script>

<template>
  <!-- Phones: one horizontally scrollable row instead of wrapping into three lines. -->
  <div
    role="group"
    aria-labelledby="status-filter-label"
    class="flex items-center gap-1.5 max-sm:-mx-3 max-sm:w-[calc(100%+1.5rem)] max-sm:overflow-x-auto max-sm:px-3 max-sm:py-0.5 max-sm:[scrollbar-width:none] sm:flex-wrap"
  >
    <span id="status-filter-label" class="mr-0.5 shrink-0 text-sm text-text">Estado</span>
    <button
      v-for="s in JOB_STATUSES"
      :key="s"
      type="button"
      class="inline-flex min-h-[1.75rem] shrink-0 items-center gap-1 rounded-md border px-2 text-meta transition-colors duration-150 max-lg:min-h-[2.25rem]"
      :class="
        modelValue.includes(s)
          ? 'border-accent bg-accent/10 font-medium text-accent'
          : 'border-border-strong bg-surface text-text-muted hover:bg-surface-2 hover:text-text'
      "
      :aria-pressed="modelValue.includes(s) ? 'true' : 'false'"
      @click="toggle(s)"
    >
      <!-- Selected chips swap their glyph for a check: selection is not signalled by color alone. -->
      <svg v-if="modelValue.includes(s)" viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="m3.5 8.5 3 3 6-7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <StatusIcon v-else :status="s" class="h-3 w-3" />
      {{ STATUS_META[s].filter }}
    </button>
  </div>
</template>
