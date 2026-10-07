<script setup>
import { computed } from 'vue'
import StatusIcon from './StatusIcon.vue'
import { DEFAULT_STATUS, STATUS_META, STATUS_TONE_CLASS, isKnownStatus } from '../utils/jobStatus'

const props = defineProps({
  status: { type: String, required: true },
  // Rows hide the default status to keep the list quiet; the detail panel shows it.
  showDefault: { type: Boolean, default: false },
})

const visible = computed(
  () => isKnownStatus(props.status) && (props.showDefault || props.status !== DEFAULT_STATUS),
)
</script>

<template>
  <span
    v-if="visible"
    class="inline-flex h-[1.125rem] shrink-0 items-center gap-1 rounded border px-1 text-xs font-medium leading-none"
    :class="STATUS_TONE_CLASS[status]"
  >
    <StatusIcon :status="status" class="h-3 w-3" />
    <span class="sr-only">Estado: </span>{{ STATUS_META[status].badge }}
  </span>
</template>
