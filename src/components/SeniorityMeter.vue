<script setup>
import { computed } from 'vue'

const SENIORITY_STEPS = 5

const props = defineProps({
  name: { type: String, required: true },
  profileSen: { type: Number, required: true },
  jobSen: { type: Number, required: true },
})

// Segment states: 'have' (you cover it), 'gap' (job asks, you don't reach), 'empty'.
const segments = computed(() =>
  Array.from({ length: SENIORITY_STEPS }, (_, i) => {
    const level = i + 1
    if (level <= props.profileSen) return 'have'
    if (level <= props.jobSen) return 'gap'
    return 'empty'
  }),
)

const hasGap = computed(() => props.profileSen < props.jobSen)
const SEGMENT_CLASS = {
  have: 'bg-accent',
  gap: 'border border-warn bg-warn/20',
  empty: 'bg-surface-2 border border-border',
}
</script>

<template>
  <li class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-1">
    <span class="truncate text-sm text-text" :title="name">{{ name }}</span>
    <span
      class="flex gap-0.5"
      role="img"
      :aria-label="`Tú ${profileSen} de ${SENIORITY_STEPS}, la oferta pide ${jobSen}`"
    >
      <span
        v-for="(state, i) in segments"
        :key="i"
        class="h-2.5 w-4 rounded-sm"
        :class="SEGMENT_CLASS[state]"
      ></span>
    </span>
    <span
      class="w-[5.5rem] text-right text-xs tabular-nums"
      :class="hasGap ? 'text-warn' : 'text-text-muted'"
      aria-hidden="true"
    >
      tú {{ profileSen }} / pide {{ jobSen }}
    </span>
  </li>
</template>
