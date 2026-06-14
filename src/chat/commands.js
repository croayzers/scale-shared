/* ===========================================================================
 * Chat cross-app · sistema de comandos /# (JS puro, sin React).
 *
 * Cada app define SUS comandos (L-Scale: /pedido #categoría; E-Scale: /plano…).
 * Al ENVIAR, el comando se serializa con la app de origen embebida:
 *     /OA_00200@lscale        #Cristalería@lscale
 * Al RENDERIZAR:
 *   - si el chip es de TU app  -> ejecuta local (abre el recurso)
 *   - si es de OTRA app        -> click abre esa app con deep-link ?cmd=...
 *     (la URL de la app se resuelve desde apps_registry → ver ../registry)
 *
 * El deep-link de entrada lo lee la app destino al arrancar: leerCmdDeUrl().
 * ======================================================================== */

// ── Definición de un set de comandos por app ────────────────────────────────
// Una app pasa algo como:
//   {
//     appId: "lscale",
//     comandos: [
//       { tipo: "pedido",    trigger: "/", ... , ejecutar: (valor)=>{...} },
//       { tipo: "categoria", trigger: "#", ... },
//     ]
//   }
// Cada comando:
//   tipo:        id único dentro de la app ("pedido", "categoria", "plano")
//   trigger:     "/" o "#"
//   sugerencias: (query) => [{ valor, label, sub? }]   para el autocompletar
//   ejecutar:    (valor, extra?) => void                acción al hacer click local

// ── Serialización del token en el texto del mensaje ─────────────────────────
// Token guardado:  <trigger><valor>@<appId>   ej "/OA_00200@lscale"
// El valor no puede contener "@" ni espacios; categorías con espacio se
// codifican con "~" → "#Cristalería~fina@lscale" (se revierte al mostrar).

export function serializarToken(trigger, valor, appId) {
  const safe = String(valor).trim().replace(/\s+/g, "~");
  return `${trigger}${safe}@${appId}`;
}

// Regex que captura tokens /xxx@app y #xxx@app dentro de un texto.
const TOKEN_RE = /([/#])([^\s@]+)@([a-z]+)/g;

// Parsea un texto en segmentos: {tipo:"text",valor} | {tipo:"cmd",trigger,valor,appId,raw}
export function parsearMensaje(texto) {
  const segs = [];
  let last = 0, m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(texto)) !== null) {
    if (m.index > last) segs.push({ tipo: "text", valor: texto.slice(last, m.index) });
    segs.push({
      tipo: "cmd",
      trigger: m[1],
      valor: m[2].replace(/~/g, " "),
      appId: m[3],
      raw: m[0],
    });
    last = m.index + m[0].length;
  }
  if (last < texto.length) segs.push({ tipo: "text", valor: texto.slice(last) });
  return segs;
}

// ── Deep-link cross-app ─────────────────────────────────────────────────────
// Construye la URL para abrir un comando en su app: <appUrl>?cmd=<trigger><valor>
// trigger se codifica (/ → s, # → h) para que viaje limpio en la query.
export function construirDeepLink(appUrl, trigger, valor) {
  if (!appUrl) return null;
  const sep = appUrl.includes("?") ? "&" : "?";
  const t = trigger === "/" ? "s" : "h";
  const v = encodeURIComponent(String(valor).trim().replace(/\s+/g, "~"));
  return `${appUrl}${sep}cmd=${t}.${v}`;
}

// La app destino llama esto al arrancar para saber si debe ejecutar un comando.
// Devuelve { trigger, valor } o null. Limpia el parámetro de la URL.
export function leerCmdDeUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const cmd = params.get("cmd");
  if (!cmd) return null;
  const dot = cmd.indexOf(".");
  if (dot < 0) return null;
  const trigger = cmd.slice(0, dot) === "h" ? "#" : "/";
  const valor = decodeURIComponent(cmd.slice(dot + 1)).replace(/~/g, " ");
  // Limpiar la query para que no se re-ejecute al recargar.
  params.delete("cmd");
  const qs = params.toString();
  const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
  window.history.replaceState({}, "", url);
  return { trigger, valor };
}

// Dado un texto que el usuario está escribiendo y la posición del cursor,
// detecta si hay un autocompletar activo. Devuelve { tipo, items, startIdx } o null.
// `comandos` es la lista de la app actual; `miembros` para @menciones (siempre).
export function detectarAutocompletar(texto, cursor, comandos, miembros) {
  const before = texto.slice(0, cursor);

  // @menciones — siempre disponibles, en todas las apps
  const mMention = before.match(/@([\w.]*)$/);
  if (mMention) {
    const q = mMention[1].toLowerCase();
    const items = (miembros || []).filter(m =>
      (m.email?.split("@")[0] || "").toLowerCase().includes(q) ||
      (m.nombre || "").toLowerCase().includes(q)
    ).slice(0, 5).map(m => ({ valor: m.email?.split("@")[0] || m.nombre, label: m.nombre || m.email, member: m }));
    if (items.length) return { tipo: "mention", trigger: "@", items, startIdx: cursor - mMention[0].length };
  }

  // Comandos definidos por la app (trigger / o #)
  for (const cmd of comandos || []) {
    const esc = cmd.trigger === "/" ? "\\/" : "#";
    const re = new RegExp(`${esc}([\\wáéíóúüñÁÉÍÓÚÜÑ -]*)$`);
    const mm = before.match(re);
    if (mm) {
      const q = mm[1];
      const items = (cmd.sugerencias?.(q) || []).slice(0, 8);
      if (items.length) return { tipo: cmd.tipo, trigger: cmd.trigger, cmd, items, startIdx: cursor - mm[0].length };
    }
  }
  return null;
}
