<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearSessionKey, isAuthenticated } from './composables/useSession'
import { useTheme } from './composables/useTheme'
import { useToasts } from './composables/useToasts'
import { useRefreshRun } from './composables/useRefreshRun'

const route = useRoute()
const router = useRouter()
const isAuth = computed(() => isAuthenticated.value && route.path !== '/login')
const { isDark, toggle: toggleTheme } = useTheme()
const { toasts, dismissToast, runToastAction, pauseToast, resumeToast } = useToasts()

const { isRunning, stageText, elapsedText, announcement, viewRequest } = useRefreshRun()

// "Ver" on the completion toast: make sure /jobs is open (JobsView reloads itself when already there).
watch(viewRequest, () => {
  if (route.path !== '/jobs') router.push('/jobs')
})

const NAV = [
  { to: '/jobs', label: 'Ofertas' },
  { to: '/profile', label: 'Perfil' },
  { to: '/ajustes', label: 'Ajustes' },
]

function logout() {
  clearSessionKey()
  router.push('/login')
}
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow"
  >
    Saltar al contenido
  </a>

  <header
    v-if="isAuth"
    class="sticky top-0 z-30 h-header border-b border-border bg-surface"
  >
    <div class="mx-auto flex h-full max-w-screen-2xl items-center gap-1 px-3 sm:gap-2 sm:px-6">
      <router-link
        to="/jobs"
        aria-label="Scraping Jobs, ir a ofertas"
        class="mr-2 flex items-center gap-2 rounded-md text-sm font-semibold text-text sm:mr-4"
      >
        <svg viewBox="0 0 16 16" class="h-5 w-5" aria-hidden="true">
          <rect width="16" height="16" rx="3" class="fill-accent" />
          <path d="M4 5h8M4 8h8M4 11h5" class="stroke-accent-fg" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span class="hidden sm:inline" aria-hidden="true">Scraping Jobs</span>
      </router-link>

      <nav aria-label="Principal" class="flex h-full items-stretch gap-1">
        <router-link
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          custom
          v-slot="{ href, navigate, isActive }"
        >
          <a
            :href="href"
            @click="navigate"
            :aria-current="isActive ? 'page' : undefined"
            class="relative flex items-center rounded-md px-2.5 text-sm transition-colors duration-150"
            :class="isActive ? 'font-semibold text-text' : 'text-text-muted hover:text-text'"
          >
            {{ item.label }}
            <span
              v-if="isActive"
              class="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent"
              aria-hidden="true"
            ></span>
          </a>
        </router-link>
      </nav>

      <div class="ml-auto flex items-center gap-1">
        <router-link
          v-if="isRunning"
          to="/jobs"
          class="btn btn-ghost max-w-[9rem] px-2 text-meta sm:max-w-xs"
          :title="`${stageText} ${elapsedText}`.trim()"
        >
          <svg viewBox="0 0 16 16" class="h-4 w-4 shrink-0 motion-safe:animate-spin" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="8" cy="8" r="6" class="opacity-25" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke-linecap="round" />
          </svg>
          <span class="truncate">{{ stageText }}</span>
          <span class="hidden tabular-nums sm:inline" aria-hidden="true">{{ elapsedText }}</span>
          <span class="sr-only">. Ver ofertas</span>
        </router-link>
        <button
          type="button"
          class="icon-btn"
          :aria-label="isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
          :title="isDark ? 'Tema claro' : 'Tema oscuro'"
          @click="toggleTheme"
        >
          <svg v-if="isDark" viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <circle cx="10" cy="10" r="3.5" />
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" stroke-linecap="round" />
          </svg>
          <svg v-else viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="btn btn-ghost px-2.5" @click="logout">Salir</button>
      </div>
    </div>
  </header>

  <main id="main" tabindex="-1" class="mx-auto max-w-screen-2xl px-3 py-4 focus:outline-none sm:px-6 sm:py-6">
    <router-view />
  </main>

  <!-- Refresh progress: announced only when the stage changes (the composable updates this text then). -->
  <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>

  <!-- Live regions are mounted once, empty, so screen readers announce later insertions. -->
  <!-- --toast-offset is published by StickyBottomBar so toasts never cover a sticky action bar. -->
  <div class="pointer-events-none fixed inset-x-3 bottom-[calc(var(--toast-offset,0px)+0.75rem)] z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-96">
    <div role="status" aria-live="polite" class="flex w-full flex-col items-end gap-2">
      <template v-for="t in toasts" :key="t.id">
        <div
          v-if="t.type !== 'error'"
          class="pointer-events-auto flex w-full items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text shadow-lg"
          @mouseenter="pauseToast(t.id)"
          @mouseleave="resumeToast(t.id)"
          @focusin="pauseToast(t.id)"
          @focusout="resumeToast(t.id)"
        >
          <span class="min-w-0 flex-1 break-words">{{ t.message }}</span>
          <button v-if="t.action" type="button" class="btn btn-secondary" @click="runToastAction(t.id)">
            {{ t.action.label }}
          </button>
          <button type="button" class="icon-btn" aria-label="Cerrar aviso" @click="dismissToast(t.id)">
            <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" /></svg>
          </button>
        </div>
      </template>
    </div>
    <div role="alert" class="flex w-full flex-col items-end gap-2">
      <template v-for="t in toasts" :key="t.id">
        <div
          v-if="t.type === 'error'"
          class="pointer-events-auto flex w-full items-center gap-2 rounded-md border border-danger/50 bg-surface px-3 py-2 text-sm text-text shadow-lg"
          @mouseenter="pauseToast(t.id)"
          @mouseleave="resumeToast(t.id)"
          @focusin="pauseToast(t.id)"
          @focusout="resumeToast(t.id)"
        >
          <span class="min-w-0 flex-1 break-words"><span class="font-semibold text-danger">Error.</span> {{ t.message }}</span>
          <button v-if="t.action" type="button" class="btn btn-secondary" @click="runToastAction(t.id)">
            {{ t.action.label }}
          </button>
          <button type="button" class="icon-btn" aria-label="Cerrar aviso" @click="dismissToast(t.id)">
            <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" /></svg>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
