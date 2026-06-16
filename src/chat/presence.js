/* ===========================================================================
 * Presencia cross-app (JS puro). Quién de la empresa está conectado ahora
 * mismo, en cualquier app Scale, vía Supabase Realtime Presence. Un único
 * canal por empresa (presence-company-{companyId}) — cada app que lo monta
 * trackea a su usuario actual y recibe el sync de todos los presentes.
 * ======================================================================== */

// Suscribe al canal de presencia de la empresa y trackea al usuario actual.
// onSync(users) recibe el array de presentes (incluido uno mismo) cada vez
// que cambia el estado del canal. Devuelve función de limpieza.
export function suscribirPresencia(sb, companyId, currentUser, appId, onSync) {
  if (!sb || !companyId || !currentUser?.id) return () => {};
  const channel = sb.channel(`presence-company-${companyId}`, {
    config: { presence: { key: currentUser.id } },
  });

  const emit = () => {
    const state = channel.presenceState();
    const users = Object.values(state)
      .map((entries) => entries[entries.length - 1])
      .filter(Boolean);
    onSync(users);
  };

  channel
    .on("presence", { event: "sync" }, emit)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: currentUser.id,
          email: currentUser.email ?? null,
          nombre: currentUser.email ? currentUser.email.split("@")[0].replace(/[._]/g, " ") : null,
          app_id: appId,
          online_at: new Date().toISOString(),
        });
      }
    });

  return () => { sb.removeChannel(channel); };
}
