<script setup>
// Decorative glyph per job status; the caller always provides the text label.
// 'applied' is a paper plane ("sent"): a check would read as StatusFilter's selected mark.
defineProps({
  status: { type: String, required: true },
})
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <path
      v-if="status === 'interested'"
      d="M8 2.2 9.7 5.7l3.8.5-2.8 2.7.7 3.8L8 10.9l-3.4 1.8.7-3.8-2.8-2.7 3.8-.5L8 2.2Z"
      stroke-linejoin="round"
    />
    <path v-else-if="status === 'applied'" d="M13.5 2.5 2.5 7l4.5 2 2 4.5 4.5-11ZM7 9l3-3" stroke-linecap="round" stroke-linejoin="round" />
    <path v-else-if="status === 'discarded'" d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" />
    <circle v-else cx="8" cy="8" r="4.5" />
  </svg>
</template>
