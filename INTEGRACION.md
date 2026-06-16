# Integración por app

## Patrón React (L-Scale, P-Scale, S-Scale)

```jsx
import { useState, useEffect, useRef } from "react";
import { ChatBase, BellButton, PresenceAvatars, cargarMiembros, leerCmdDeUrl } from "@scale/shared/chat";
import { cargarApps, crearResolveAppUrl } from "@scale/shared/registry";
import { sb } from "./lib/supabase";   // cliente de la app

const APP_ID = "lscale";   // el id de ESTA app
const IS_DEV = import.meta.env?.DEV;   // (Next: process.env.NODE_ENV === "development")

function useChat(empresa, currentUser) {
  const chatRef = useRef();
  const [unread, setUnread] = useState(0);
  const [miembros, setMiembros] = useState([]);
  const [resolveAppUrl, setResolveAppUrl] = useState(() => () => null);

  useEffect(() => {
    if (empresa?.id) cargarMiembros(sb(), empresa.id).then(setMiembros);
  }, [empresa?.id]);

  useEffect(() => {
    cargarApps(sb()).then(apps => setResolveAppUrl(() => crearResolveAppUrl(apps, { dev: IS_DEV })));
  }, []);

  return { chatRef, unread, setUnread, miembros, resolveAppUrl };
}
```

En el header:
```jsx
<PresenceAvatars sb={sb()} companyId={empresa?.id} currentUser={currentUser} appId={APP_ID} />
<BellButton unread={unread} onClick={() => chatRef.current?.openPanel()} />
```

`PresenceAvatars` muestra los avatares (iniciales + color) de los compañeros de
empresa conectados ahora mismo, **en cualquier app Scale** (un único canal de
Realtime Presence por empresa: `presence-company-{companyId}`). No requiere
estado ni props adicionales en la app — solo `sb`, `companyId`, `currentUser`
y `appId`. Devuelve `null` si no hay nadie más conectado.

Al final del árbol:
```jsx
<ChatBase
  ref={chatRef}
  sb={sb()}
  appId={APP_ID}
  empresa={empresa}
  currentUser={currentUser}
  miembros={miembros}
  comandos={COMANDOS}          // los de ESTA app (ver abajo)
  resolveAppUrl={resolveAppUrl}
  onUnreadChange={setUnread}
/>
```

## Definir comandos de la app

Cada comando: `{ tipo, trigger, sugerencias(query)->[{valor,label,sub}], ejecutar(valor) }`.

L-Scale (ejemplo):
```js
const COMANDOS = [
  {
    tipo: "pedido", trigger: "/",
    sugerencias: (q) => pedidos
      .filter(p => (p.codigo||p.referencia||"").toUpperCase().startsWith(q.toUpperCase()))
      .slice(0,5)
      .map(p => ({ valor: p.codigo||p.referencia, label: p.codigo||p.referencia, sub: p.nombre||p.destino })),
    ejecutar: (codigo) => abrirPedido(codigo),
  },
  {
    tipo: "categoria", trigger: "#",
    sugerencias: (q) => [...new Set(materiales.map(m=>m.categoria).filter(Boolean))]
      .filter(c => c.toLowerCase().includes(q.toLowerCase()))
      .slice(0,8).map(c => ({ valor: c, label: c })),
    ejecutar: (cat) => filtrarPorCategoria(cat),
  },
];
```

## Deep-link de entrada (ejecutar comando recibido de otra app)

Al arrancar la app:
```js
useEffect(() => {
  const cmd = leerCmdDeUrl();   // {trigger, valor} | null
  if (cmd) {
    const c = COMANDOS.find(x => x.trigger === cmd.trigger);
    c?.ejecutar?.(cmd.valor);
  }
}, []);
```

---

# Pasos GitHub + Vercel (los hace el dueño del proyecto)

1. **Crear repo privado** `croayzers/scale-shared` en GitHub.
2. Desde `x:\SCALE\scale-shared`: `git init && git add . && git commit -m "init @scale/shared" && git branch -M main && git remote add origin https://github.com/croayzers/scale-shared.git && git push -u origin main`
3. **Token para Vercel** (instalar dependencia privada en el build):
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
   - Acceso de solo-lectura al repo `scale-shared`
   - En CADA proyecto Vercel (lscale, pscale, sscale): Settings → Environment Variables
     - Añadir `GITHUB_TOKEN` (o usar la integración de Vercel con GitHub, que ya da acceso a repos privados de la org — en ese caso puede no hacer falta token).
   - Si Vercel ya tiene acceso a los repos privados de croayzers (lo normal si los otros repos son privados y despliegan), **no necesitas token extra**: instalará `github:croayzers/scale-shared` directamente.
4. En cada app: `npm i github:croayzers/scale-shared` → commit del package.json + lockfile → push → Vercel despliega.
