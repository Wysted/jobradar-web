# Frontend — scraping_jobs

SPA para revisar y priorizar ofertas de trabajo que el backend de [scraping_jobs](https://github.com/Wysted/scrappppp) busca en distintos portales y rankea con IA. Permite ver el puntaje de cada oferta, gestionar su estado, editar tu perfil, configurar la búsqueda y lanzar una nueva búsqueda desde la interfaz.

> Este repositorio es solo el frontend. Necesita el backend corriendo (ver [Requisitos](#requisitos)).

## Funcionalidades

Rutas definidas en `src/router/index.js`. Todas, salvo `/login`, requieren API key; sin ella se redirige a `/login`.

### `/login` — Ingreso

Formulario para ingresar la API key del backend. Si ya hay sesión, redirige a `/jobs`. Si el backend responde 401/403, la sesión se cierra y vuelves aquí.

### `/jobs` — Ofertas rankeadas (ruta por defecto)

- **Lista y detalle:** en pantallas anchas (`lg`) se muestra la lista junto a un panel de detalle; en pantallas angostas el detalle reemplaza la lista.
- **Score:** cada oferta muestra un puntaje de 0 a 100 con su banda: **Fuerte** (≥ 75), **Posible** (50–74) y **Débil** (< 50).
- **Estados:** `Pendiente` (por defecto), `Me interesa`, `Postulada` y `Descartada`. Volver a presionar el estado activo devuelve la oferta a `Pendiente`. Cada cambio ofrece «Deshacer».
- **Vistas:** puedes marcar una oferta como vista (y deshacerlo).
- **Filtros:** estado (varios a la vez), «Solo nuevas» (se ignora si hay un filtro de estado), score mínimo (0–100, por defecto 60) y límite (1–200, por defecto 50). Los filtros y la oferta abierta quedan en la URL, así que se pueden compartir o recargar. «Cargar más» pagina los resultados.
- **Detalle de la oferta:** empresa, ubicación, etiquetas, enlace a la oferta original (nueva pestaña), coincidencias y brechas con tu perfil por áreas y tecnologías, razonamiento de la IA y ángulos para tu postulación.
- **Buscar nuevas:** lanza una búsqueda en el backend y muestra el avance (en cola, buscando ofertas, calculando similitud, rankeando con IA) con tiempo transcurrido. El seguimiento continúa si cambias de vista o recargas, y al terminar puedes ir a ver los resultados.
- **Atajos de teclado** (con el foco en la lista; `?` abre la ayuda en pantalla):

| Tecla | Acción |
| --- | --- |
| `j` / `k` o flechas | Siguiente / anterior |
| `Enter` | Abrir detalle |
| `o` | Abrir la oferta en otra pestaña |
| `e` | Marcar como vista |
| `i` / `a` / `x` | Me interesa / Postulé / Descartar |
| `u` | Deshacer la última acción |
| `/` | Ir a los filtros |
| `?` | Mostrar u ocultar la ayuda |

### `/profile` — Perfil

Crear o editar el perfil que el backend usa para rankear las ofertas. Se guarda completo (`PUT`) y avisa si intentas salir con cambios sin guardar. Secciones:

- **Matching:** datos básicos, años de experiencia, ubicación y salario, áreas y tecnologías (seniority de 1 a 5), idiomas, preferencias, industria y contrato.
- **CV:** datos personales, links, resumen profesional, experiencia y educación (datos del encabezado y contenido del CV).

El formulario replica en el cliente las validaciones del backend y muestra los errores por campo.

### `/ajustes` — Ajustes de búsqueda

Configura qué se busca al presionar «Buscar nuevas»: consultas (hasta 10, de 2 a 100 caracteres, sin repetidas), ubicación, páginas por consulta (1–5) y portales disponibles (los entrega el backend).

### Otros

- **Tema:** claro u oscuro; por defecto sigue la preferencia del sistema y se guarda en `localStorage`.
- **Cualquier otra ruta:** página 404.

## Requisitos

- Node.js 18 o superior (Vite 6 lo exige; `package.json` no declara `engines`).
- [pnpm](https://pnpm.io/) (el proyecto fija `pnpm@9.0.0` en `packageManager`).
- Backend de scraping_jobs corriendo y accesible desde el navegador: <https://github.com/Wysted/scrappppp>. Como la SPA hace las peticiones directo desde el navegador, el backend debe permitir el origen del frontend (por defecto `http://localhost:5173`) en su configuración de CORS.

## Instalación y ejecución

```bash
pnpm install
cp .env.example .env   # ajusta VITE_API_BASE_URL si el backend no está en localhost:8000
pnpm dev
```

Abre `http://localhost:5173` e ingresa la API key.

| Script | Descripción |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo (puerto 5173) |
| `pnpm build` | Build de producción en `dist/` |
| `pnpm preview` | Sirve localmente el build de `dist/` |

Al servir `dist/` como sitio estático, el servidor debe redirigir las rutas desconocidas a `index.html` (la SPA usa `history` mode). Recuerda que `VITE_API_BASE_URL` se fija en tiempo de build.

## Autenticación

Al ingresar, la API key (el valor de `API_KEY` del backend) se guarda en `sessionStorage` y se envía en cada petición como cabecera `X-Api-Key`. Se pierde al cerrar la pestaña o con «Salir». No hay usuarios ni cookies.

## Configuración

| Variable | Descripción | Por defecto |
| --- | --- | --- |
| `VITE_API_BASE_URL` | URL base del backend | `http://localhost:8000` |

## Stack

- Vue 3 (`<script setup>`, JavaScript) y Vue Router 4
- Vite 6
- Tailwind CSS 3.4
- Sin librerías de UI, de estado ni de HTTP: se usa `fetch` nativo

## Estructura

```
src/
├── api/client.js        # Único punto de acceso HTTP al backend (X-Api-Key, errores)
├── components/          # Componentes reutilizables (badges, filtros, detalle, editores del perfil)
├── composables/         # Estado compartido: sesión, búsqueda en curso, ajustes, tema, toasts
├── router/index.js      # Rutas y guardia de autenticación
├── utils/               # Funciones puras: formato, estados, validaciones, errores
├── views/               # Una vista por ruta (Jobs, Profile, Settings, Login, NotFound)
├── App.vue              # Layout, navegación y estado global de la búsqueda
├── main.js              # Punto de entrada
└── style.css            # Estilos base de Tailwind
```
