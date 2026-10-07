import { readonly, ref } from 'vue'
import { api } from '../api/client'

// Module-level state: /jobs shows a summary of the queries, /ajustes edits them.
const settings = ref(null)
const loadFailed = ref(false)
let inflight = null

/** Fetch once (or force a refresh). Failures are non-critical for consumers: check loadFailed. */
export function loadSearchSettings({ force = false } = {}) {
  if (settings.value && !force) return Promise.resolve(settings.value)
  if (inflight) return inflight
  inflight = api
    .getSearchSettings()
    .then((data) => {
      settings.value = data
      loadFailed.value = false
      return data
    })
    .catch((e) => {
      loadFailed.value = true
      throw e
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function setSearchSettings(data) {
  settings.value = data
  loadFailed.value = false
}

export function useSearchSettings() {
  return { settings: readonly(settings), loadFailed: readonly(loadFailed), loadSearchSettings }
}
