<script setup>
import StatusIcon from './StatusIcon.vue'
import { ACTION_STATUSES, DEFAULT_STATUS, STATUS_META } from '../utils/jobStatus'

// Presentational: emits the requested status, never calls the API.
// Pressing the active action again asks to return to DEFAULT_STATUS (toggle off).
const props = defineProps({
  status: { type: String, required: true },
  // True while a change is being saved: the group is inert and announced as busy.
  pending: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])

// Full-strength border when pressed: the state boundary must reach 3:1 (WCAG 1.4.11).
const PRESSED_CLASS = {
  interested: 'border-accent bg-accent/10 text-accent',
  applied: 'border-success bg-success/10 text-success',
  discarded: 'border-text-muted bg-surface-2 text-text',
}

function press(status) {
  if (props.pending) return
  emit('change', props.status === status ? DEFAULT_STATUS : status)
}
</script>

<template>
  <div
    role="group"
    aria-label="Estado de la oferta"
    :aria-busy="pending ? 'true' : undefined"
    class="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:flex-wrap"
  >
    <button
      v-for="s in ACTION_STATUSES"
      :key="s"
      type="button"
      class="btn border max-sm:px-1.5 max-lg:min-h-[2.75rem]"
      :class="status === s ? ['font-semibold', PRESSED_CLASS[s]] : 'border-border-strong bg-surface text-text hover:bg-surface-2'"
      :aria-pressed="status === s ? 'true' : 'false'"
      :aria-keyshortcuts="STATUS_META[s].shortcut"
      :disabled="pending"
      @click="press(s)"
    >
      <StatusIcon :status="s" class="h-3.5 w-3.5" :class="status === s ? '' : 'text-text-muted'" />
      {{ STATUS_META[s].action }}
    </button>
  </div>
</template>
