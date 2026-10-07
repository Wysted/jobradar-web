import { readonly, ref } from 'vue'

// Module-level state: one toast stack for the whole app, rendered once in App.vue.

// WCAG 2.2.1: a toast carrying an action must stay long enough to reach it.
const MIN_ACTION_MS = 6000
const DEFAULT_MS = { info: 5000, success: 5000, error: 8000 }

const toasts = ref([])
// id -> { timer, remaining, startedAt }
const timers = new Map()
let nextId = 1

function armTimer(id, ms) {
  const timer = setTimeout(() => close(id, 'expired'), ms)
  timers.set(id, { timer, remaining: ms, startedAt: Date.now() })
}

function disarmTimer(id) {
  const t = timers.get(id)
  if (t) clearTimeout(t.timer)
  return t
}

/**
 * Show a toast.
 * @param {{ message: string, type?: 'info'|'success'|'error', action?: { label: string, onClick: () => void },
 *   duration?: number, onClose?: (reason: 'expired'|'dismissed'|'action') => void }} opts
 * @returns {number} toast id
 */
export function pushToast({ message, type = 'info', action = null, duration, onClose = null }) {
  const id = nextId++
  let ms = duration ?? DEFAULT_MS[type] ?? DEFAULT_MS.info
  if (action) ms = Math.max(ms, MIN_ACTION_MS)
  toasts.value = [...toasts.value, { id, message, type, action, onClose }]
  armTimer(id, ms)
  return id
}

function close(id, reason) {
  const toast = toasts.value.find((t) => t.id === id)
  if (!toast) return
  disarmTimer(id)
  timers.delete(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
  if (toast.onClose) toast.onClose(reason)
}

export function dismissToast(id) {
  close(id, 'dismissed')
}

export function runToastAction(id) {
  const toast = toasts.value.find((t) => t.id === id)
  if (!toast || !toast.action) return
  // Close first so onClose('action') fires before the action's own side effects.
  close(id, 'action')
  toast.action.onClick()
}

// Hover/focus pauses the countdown (WCAG 2.2.1 adjustable timing).
export function pauseToast(id) {
  const t = disarmTimer(id)
  if (!t) return
  t.remaining = Math.max(t.remaining - (Date.now() - t.startedAt), 0)
}

export function resumeToast(id) {
  const t = timers.get(id)
  if (!t) return
  // Always leave a grace period so the pointer leaving does not dismiss instantly.
  armTimer(id, Math.max(t.remaining, 2000))
}

export function useToasts() {
  return {
    toasts: readonly(toasts),
    pushToast,
    dismissToast,
    runToastAction,
    pauseToast,
    resumeToast,
  }
}
