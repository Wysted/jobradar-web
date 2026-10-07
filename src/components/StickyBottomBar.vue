<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Bottom-sticky action bar. While mounted it publishes its height as
// --toast-offset on <html>, so the toast stack (App.vue) floats above it
// instead of covering the primary action. Layout classes come from the caller.
const TOAST_OFFSET_VAR = '--toast-offset'

const bar = ref(null)
let observer = null

function publish(height) {
  document.documentElement.style.setProperty(TOAST_OFFSET_VAR, `${Math.ceil(height)}px`)
}

onMounted(() => {
  publish(bar.value.getBoundingClientRect().height)
  observer = new ResizeObserver(([entry]) => {
    publish(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height)
  })
  observer.observe(bar.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  document.documentElement.style.removeProperty(TOAST_OFFSET_VAR)
})
</script>

<template>
  <div ref="bar" class="sticky bottom-0 z-20 border-t border-border bg-surface">
    <slot />
  </div>
</template>
