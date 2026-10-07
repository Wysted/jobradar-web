<script setup>
import { computed } from 'vue'
import { SCORE_TEXT_CLASS, scoreBand } from '../utils/format'

const props = defineProps({
  score: { type: Number, required: true },
  // 'row': stacked number + band for list rows; 'inline': number and band side by side
  layout: { type: String, default: 'row' },
})

const band = computed(() => scoreBand(props.score))
const colorClass = computed(() => SCORE_TEXT_CLASS[band.value.tone])
const value = computed(() => Math.round(props.score))
</script>

<template>
  <span
    v-if="layout === 'row'"
    class="flex w-10 shrink-0 flex-col items-start"
    :title="`Score ${value} de 100`"
  >
    <span class="text-[0.9375rem] font-semibold leading-5 tabular-nums" :class="colorClass">{{ value }}</span>
    <span class="text-xs leading-4 text-text-muted">{{ band.label }}</span>
  </span>
  <span v-else class="inline-flex items-baseline gap-1.5">
    <span class="text-2xl font-semibold tabular-nums leading-none" :class="colorClass">{{ value }}</span>
    <span class="text-meta font-medium" :class="colorClass">{{ band.label }}</span>
  </span>
</template>
