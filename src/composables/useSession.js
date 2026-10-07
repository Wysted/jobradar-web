import { computed, ref } from 'vue'

// Module-level reactive session: sessionStorage is the persistence, the ref is
// what components, the router guard and the client read so changes propagate.
export const KEY_STORAGE = 'scraping_jobs_api_key'

const apiKey = ref(sessionStorage.getItem(KEY_STORAGE))

export const isAuthenticated = computed(() => !!apiKey.value)

export function getSessionKey() {
  return apiKey.value
}

export function setSessionKey(key) {
  sessionStorage.setItem(KEY_STORAGE, key)
  apiKey.value = key
}

export function clearSessionKey() {
  sessionStorage.removeItem(KEY_STORAGE)
  apiKey.value = null
}

export function useSession() {
  return { isAuthenticated }
}
