// User-facing error copy. Never show raw backend messages.

const HTTP_SERVER_ERROR_MIN = 500

export function userMessage(e, fallback = 'Algo salió mal. Intenta de nuevo.') {
  if (!e) return fallback
  if (e.status === 0) return e.message // already translated by the client
  if (e.status === 401 || e.status === 403) return 'Tu sesión no es válida. Ingresa de nuevo.'
  if (e.status === 404) return 'No encontramos lo que buscabas.'
  if (e.status >= HTTP_SERVER_ERROR_MIN) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.'
  return fallback
}
