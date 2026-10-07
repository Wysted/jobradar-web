<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const path = computed(() => route.fullPath)
</script>

<template>
  <section aria-labelledby="nf-heading" class="max-w-xl py-10 sm:py-16">
    <p class="text-meta font-medium tabular-nums text-text-muted">Error 404</p>
    <h1 id="nf-heading" class="mt-1 text-lg font-semibold text-text">Esta página no existe</h1>
    <p class="mt-2 text-sm text-text-muted">
      No hay nada en
      <code class="break-all rounded bg-surface-2 px-1 py-0.5 font-mono text-meta text-text">{{ path }}</code>.
      Puede que el enlace esté incompleto o que la ruta haya cambiado.
    </p>
    <div class="mt-6 flex flex-wrap gap-2">
      <router-link to="/jobs" class="btn btn-primary">Ir a Ofertas</router-link>
      <router-link to="/profile" class="btn btn-secondary">Ir a Perfil</router-link>
    </div>
  </section>
</template>
