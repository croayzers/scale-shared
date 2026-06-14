# @scale/shared

Código común entre las apps Scale. Repo **privado**, instalado por cada app como
dependencia git (no se publica en npm).

## Qué incluye

- `@scale/shared/chat` — chat cross-app (ChatBase, BellButton, lib de datos, comandos)
- `@scale/shared/registry` — catálogo de apps (apps_registry)

## Cómo lo usa una app (React/Vite o Next)

```bash
npm i github:croayzers/scale-shared
```

```jsx
import { ChatBase, BellButton, cargarMiembros, leerCmdDeUrl } from "@scale/shared/chat";
import { cargarApps, crearResolveAppUrl } from "@scale/shared/registry";
```

Ver `INTEGRACION.md` para el patrón completo por app.

## Comandos /# cross-app

Cada app define sus comandos. Al enviarse, el token guarda la app de origen:
`/OA_00200@lscale`. Si lo recibes en otra app, el chip te lleva a la app correcta
con `?cmd=...`, y esa app lo ejecuta al arrancar (`leerCmdDeUrl`).

## Publicar cambios

Esto NO tiene build. Editas, commit, push. Las apps actualizan con:

```bash
npm update @scale/shared   # y redeploy en Vercel
```

Para forzar versión concreta, usa un tag: `github:croayzers/scale-shared#v0.1.0`.
