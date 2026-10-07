import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { onUnauthorized } from './api/client'
import { pushToast } from './composables/useToasts'
import './style.css'

// Any 401 from the API: the key is already cleared by the client; send the user to login.
onUnauthorized(() => {
  if (router.currentRoute.value.path === '/login') return
  pushToast({ type: 'error', message: 'Tu sesión expiró. Ingresa de nuevo.' })
  router.replace('/login')
})

createApp(App).use(router).mount('#app')
