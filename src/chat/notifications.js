/* ===========================================================================
 * Centro de notificaciones in-app (JS puro). Eventos de las apps que se
 * muestran en la campanita junto al chat. Sobre public.company_notifications
 * + public.notif_last_seen (badge por usuario vía timestamp). Cross-app.
 * ======================================================================== */

// Crea una notificación para los miembros de la empresa.
// El "no notificar al autor" se resuelve en el lado lector (se ignoran las
// propias) — así una sola fila sirve para todos y es barato de insertar.
//   { companyId, actorId, actorNombre, appId, tipo, titulo, recursoLabel, cmd }
export async function crearNotificacion(sb, n) {
  if (!sb || !n?.companyId) return null;
  const { data, error } = await sb
    .from("company_notifications")
    .insert({
      company_id:    n.companyId,
      actor_id:      n.actorId ?? null,
      actor_nombre:  n.actorNombre ?? null,
      app_id:        n.appId,
      tipo:          n.tipo,
      titulo:        n.titulo,
      recurso_label: n.recursoLabel ?? null,
      cmd:           n.cmd ?? null,
    })
    .select()
    .single();
  if (error) { console.error("[notif] crear:", error.message); return null; }
  return data;
}

// Carga las notificaciones recientes de la empresa.
export async function cargarNotificaciones(sb, companyId, limit = 50) {
  if (!sb || !companyId) return [];
  const { data, error } = await sb
    .from("company_notifications")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[notif] cargar:", error.message); return []; }
  return data || [];
}

// Suscribe a nuevas notificaciones vía Realtime. Devuelve cleanup.
export function suscribirNotificaciones(sb, companyId, onNew) {
  if (!sb || !companyId) return () => {};
  const channel = sb
    .channel(`company-notifs-${companyId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "company_notifications",
      filter: `company_id=eq.${companyId}`,
    }, (payload) => { if (payload.new) onNew(payload.new); })
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

// Lee el "última vez visto" del usuario para esta empresa.
export async function cargarUltimaVez(sb, companyId, userId) {
  if (!sb || !companyId || !userId) return null;
  const { data } = await sb
    .from("notif_last_seen")
    .select("last_seen_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.last_seen_at ?? null;
}

// Marca "visto ahora" (al abrir la campanita). Upsert por (user, company).
export async function marcarVistoAhora(sb, companyId, userId) {
  if (!sb || !companyId || !userId) return;
  await sb
    .from("notif_last_seen")
    .upsert({ user_id: userId, company_id: companyId, last_seen_at: new Date().toISOString() },
            { onConflict: "user_id,company_id" });
}
