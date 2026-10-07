import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated } from '../composables/useSession'

const routes = [
  { path: '/', redirect: '/jobs' },
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/profile', component: () => import('../views/ProfileView.vue') },
  { path: '/jobs', component: () => import('../views/JobsView.vue') },
  { path: '/ajustes', component: () => import('../views/SettingsView.vue') },
  // Catch-all last. Not public: the guard sends signed-out users to /login first.
  { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (!to.meta.public && !isAuthenticated.value) return { path: '/login' }
  if (to.path === '/login' && isAuthenticated.value) return { path: '/jobs' }
})

export default router
