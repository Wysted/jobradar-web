<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, setApiKey, clearApiKey } from '../api/client'

const router = useRouter()
const apiKey = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!apiKey.value.trim()) return
  error.value = ''
  loading.value = true
  setApiKey(apiKey.value.trim())
  try {
    await api.getProfile()
    router.push('/jobs')
  } catch (e) {
    if (e.status === 404) {
      router.push('/profile')
      return
    }
    clearApiKey()
    error.value = e.status === 401 || e.status === 403
      ? 'La API key no es válida. Revísala e intenta de nuevo.'
      : `No pudimos conectar con el servidor: ${e.message}`
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center">
    <div class="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
      <div class="mb-5 flex items-center gap-2">
        <svg viewBox="0 0 16 16" class="h-6 w-6" aria-hidden="true">
          <rect width="16" height="16" rx="3" class="fill-accent" />
          <path d="M4 5h8M4 8h8M4 11h5" class="stroke-accent-fg" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span class="text-sm font-semibold text-text">Scraping Jobs</span>
      </div>
      <h1 class="text-lg font-semibold text-text">Ingresar</h1>
      <p class="mb-5 mt-1 text-meta text-text-muted">
        Usa la API key pública configurada en el backend.
      </p>
      <form class="space-y-4" novalidate @submit.prevent="submit">
        <div>
          <label for="login-key" class="field-label">API key</label>
          <input
            id="login-key"
            v-model="apiKey"
            type="password"
            autocomplete="off"
            spellcheck="false"
            class="input"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? 'login-error' : undefined"
          />
        </div>
        <button type="submit" :disabled="loading || !apiKey.trim()" class="btn btn-primary w-full">
          <svg
            v-if="loading"
            class="h-4 w-4 motion-safe:animate-spin"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity="0.3" stroke-width="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          {{ loading ? 'Verificando...' : 'Entrar' }}
        </button>
        <p v-if="error" id="login-error" role="alert" class="text-meta text-danger">{{ error }}</p>
      </form>
    </div>
  </div>
</template>
