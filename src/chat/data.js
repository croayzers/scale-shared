/* ===========================================================================
 * Chat cross-app · capa de datos (JS puro, sin React).
 * Funciona sobre public.company_messages (schema público, RLS por empresa,
 * Realtime). Cada app pasa SU cliente Supabase (sb) porque la config de
 * cookies/cliente difiere entre apps; la tabla y la lógica son las mismas.
 * ======================================================================== */

// Carga el historial de mensajes de la empresa (RLS limita a los del usuario).
export async function cargarTodosMensajes(sb, companyId) {
  if (!sb || !companyId) return [];
  const { data, error } = await sb
    .from("company_messages")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) { console.error("[chat] cargarTodosMensajes:", error.message); return []; }
  return data || [];
}

// Envía un DM de un usuario a otro.
export async function enviarMensaje(sb, companyId, fromUserId, toUserId, message) {
  if (!sb) throw new Error("Supabase no configurado");
  const { data, error } = await sb
    .from("company_messages")
    .insert({ company_id: companyId, from_user_id: fromUserId, to_user_id: toUserId, message })
    .select()
    .single();
  if (error) { console.error("[chat] enviarMensaje:", error); throw error; }
  return data;
}

// Marca como leídos los mensajes de fromId hacia myId.
export async function marcarLeidos(sb, companyId, myId, fromId) {
  if (!sb) return;
  await sb
    .from("company_messages")
    .update({ is_read: true })
    .eq("company_id", companyId)
    .eq("to_user_id", myId)
    .eq("from_user_id", fromId)
    .eq("is_read", false);
}

// Suscribe a nuevos mensajes vía Realtime. Devuelve función de limpieza.
export function suscribirMensajes(sb, companyId, onNewMessage) {
  if (!sb || !companyId) return () => {};
  const channel = sb
    .channel(`company-chat-${companyId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "company_messages",
      filter: `company_id=eq.${companyId}`,
    }, (payload) => { if (payload.new) onNewMessage(payload.new); })
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

// Carga los miembros de la empresa (id, rol, email, nombre) vía RPC compartido.
export async function cargarMiembros(sb, companyId) {
  if (!sb || !companyId) return [];
  const [{ data: members, error }, { data: rpcEmails }] = await Promise.all([
    sb.from("company_members").select("user_id, rol").eq("company_id", companyId),
    sb.rpc("get_company_member_emails", { p_company_id: companyId }),
  ]);
  if (error) { console.error("[chat] cargarMiembros:", error.message); return []; }
  const emailMap = {};
  (rpcEmails || []).forEach(r => { if (r.user_id) emailMap[r.user_id] = r.email; });
  return (members || []).map(m => {
    const email = emailMap[m.user_id] ?? null;
    const nombre = email ? email.split("@")[0].replace(/[._]/g, " ") : "Usuario";
    return { user_id: m.user_id, rol: m.rol, email, nombre };
  });
}
