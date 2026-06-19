/* @scale/shared/registry — catálogo de apps Scale.
 * Fuente de verdad: public.apps_registry (Supabase). Cada app pasa su cliente
 * `sb` y si está en dev. Fallback local si la tabla no responde. */

export const FALLBACK_APPS = [
  { id: "lscale", nombre: "L-Scale", emoji: "📦", color: "#f97316", url_prod: "https://logistics.thescaleapps.com", url_dev: "http://localhost:5182", activa: true,  orden: 10 },
  { id: "pscale", nombre: "P-Scale", emoji: "👥", color: "#6366f1", url_prod: "https://people.thescaleapps.com",    url_dev: "http://localhost:5181", activa: true,  orden: 20 },
  { id: "sscale", nombre: "S-Scale", emoji: "📱", color: "#8b5cf6", url_prod: "https://social.thescaleapps.com",    url_dev: "http://localhost:3001", activa: true,  orden: 30 },
  { id: "escale", nombre: "E-Scale", emoji: "🏛️", color: "#10b981", url_prod: "https://events.thescaleapps.com",    url_dev: "http://localhost:5173", activa: true,  orden: 40 },
  { id: "ascale", nombre: "A-Scale", emoji: "📋", color: "#d97706", url_prod: "https://appcc.thescaleapps.com",     url_dev: "http://localhost:5183", activa: true,  orden: 50 },
  { id: "nscale", nombre: "N-Scale", emoji: "📋", color: "#0e7490", url_prod: "https://nscale.thescaleapps.com",    url_dev: "http://localhost:5184", activa: true,  orden: 60 },
];

let _cache = null;

// URL efectiva de una app (prod vs dev). null si inactiva o sin URL.
export function appUrl(app, { dev = false } = {}) {
  if (!app?.activa) return null;
  const url = dev ? (app.url_dev ?? app.url_prod) : app.url_prod;
  return url || null;
}

// Carga el catálogo una vez (cacheado). Devuelve siempre un array.
export async function cargarApps(sb) {
  if (_cache) return _cache;
  try {
    if (sb) {
      const { data, error } = await sb
        .from("apps_registry")
        .select("id,nombre,emoji,color,url_prod,url_dev,activa,orden")
        .order("orden", { ascending: true });
      if (!error && Array.isArray(data) && data.length) { _cache = data; return _cache; }
    }
  } catch (e) {
    console.warn("[registry] sin tabla, usando fallback:", e?.message);
  }
  _cache = [...FALLBACK_APPS].sort((a, b) => a.orden - b.orden);
  return _cache;
}

// Helper: devuelve una función resolveAppUrl(appId) usando el catálogo cargado.
export function crearResolveAppUrl(apps, { dev = false } = {}) {
  const map = {};
  for (const a of apps || []) map[a.id] = appUrl(a, { dev });
  return (appId) => map[appId] || null;
}
