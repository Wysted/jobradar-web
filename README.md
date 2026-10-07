# Frontend — scraping_jobs

Vue 3 + Vite + Tailwind v3. Consume el backend en `VITE_API_BASE_URL` (default `http://localhost:8000`) con auth por `X-Api-Key`.

## Uso

```bash
pnpm install
cp .env.example .env   # editá VITE_API_BASE_URL si hace falta
pnpm dev
```

Abrí `http://localhost:5173`, ingresá la API key (valor de `API_KEY` del backend). Se guarda en `sessionStorage` — se pierde al cerrar el tab.

## Rutas

- `/login` — form de API key
- `/jobs` — ofertas rankeadas con filtros + link externo + marcar visto
- `/profile` — crear/editar perfil (PUT full replace)

## Stack

- Vue 3 + Vue Router 4
- Vite 6
- Tailwind 3.4 (v4 falla en este entorno)
- pnpm
