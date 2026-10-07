import { readonly, ref } from 'vue'

// Must match the inline script in index.html.
const STORAGE_KEY = 'scraping_jobs_theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

const media = window.matchMedia(DARK_QUERY)
// null = follow system preference
const preference = ref(readStored())
const isDark = ref(preference.value ? preference.value === 'dark' : media.matches)

function apply() {
  document.documentElement.classList.toggle('dark', isDark.value)
}

media.addEventListener('change', (e) => {
  if (preference.value) return
  isDark.value = e.matches
  apply()
})

function toggle() {
  isDark.value = !isDark.value
  preference.value = isDark.value ? 'dark' : 'light'
  try {
    // Choosing the same value as the system clears the override.
    if (isDark.value === media.matches) {
      localStorage.removeItem(STORAGE_KEY)
      preference.value = null
    } else {
      localStorage.setItem(STORAGE_KEY, preference.value)
    }
  } catch {
    // Storage unavailable: theme still applies for this session.
  }
  apply()
}

apply()

export function useTheme() {
  return { isDark: readonly(isDark), toggle }
}
