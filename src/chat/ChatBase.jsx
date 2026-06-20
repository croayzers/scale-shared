/* ===========================================================================
 * Chat cross-app · UI React genérica (ChatBase).
 *
 * Funciona en cualquier app Scale (React 18/19). Estilos vía CSS vars
 * (--brand, --surface, --text…) para que cada app aplique su tema.
 *
 * Props:
 *   sb            cliente Supabase de la app (con sesión)
 *   appId         id de ESTA app ("lscale", "escale"…) — para los comandos
 *   empresa       { id }
 *   currentUser   { id, email }
 *   miembros      [{ user_id, email, nombre, rol }]
 *   comandos      [{ tipo, trigger, sugerencias, ejecutar }]  (de esta app)
 *   resolveAppUrl (appId) => url | null     para deep-link a otras apps
 *   onUnreadChange(n)                       conteo no-leídos (para campanita)
 *
 * Ref expone: openPanel(), openConversation(user)
 * ======================================================================== */
import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { X, Send, ArrowLeft, MessageCircle, Check, CheckCheck, Package, Layers, Map, RotateCcw, ShoppingCart, Activity, Sparkles, ChevronDown, Bot, Loader } from "lucide-react";
import { cargarTodosMensajes, enviarMensaje, marcarLeidos, suscribirMensajes } from "./data.js";
import { serializarToken, parsearMensaje, construirDeepLink, detectarAutocompletar } from "./commands.js";
import { cargarNotificaciones, suscribirNotificaciones, cargarUltimaVez, marcarVistoAhora } from "./notifications.js";
import { avatarColor, Avatar } from "./avatar.jsx";
import { PROVEEDORES, cargarKeys, guardarKeys, llamarLLM, llamarConFallback, esErrorCuota } from "../ia/llm.js";

function formatHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// Renderiza el texto de un mensaje resolviendo chips /cmd@app y #cmd@app.
function MsgText({ texto, appId, miembros, comandos, resolveAppUrl, esPropio }) {
  const segs = parsearMensaje(texto);
  return segs.map((s, i) => {
    if (s.tipo === "text") {
      // Dentro del texto plano, resaltar @menciones simples
      return <MentionText key={i} texto={s.valor} miembros={miembros} esPropio={esPropio} />;
    }
    const esLocal = s.appId === appId;
    const color = "#6366f1";
    const onClick = (e) => {
      e.stopPropagation();
      if (esLocal) {
        const cmd = (comandos || []).find(c => c.trigger === s.trigger);
        cmd?.ejecutar?.(s.valor);
      } else {
        const url = resolveAppUrl?.(s.appId);
        const link = construirDeepLink(url, s.trigger, s.valor);
        if (link) window.open(link, "_blank", "noreferrer");
      }
    };
    const label = `${s.trigger}${s.valor}${esLocal ? "" : ` · ${s.appId}`}`;
    return (
      <span key={i} onClick={onClick} title={esLocal ? "Abrir aquí" : `Abrir en ${s.appId}`}
        style={{
          background: esPropio ? "rgba(255,255,255,0.22)" : color + "1a",
          color: esPropio ? "#fff" : color,
          borderRadius: 4, padding: "1px 6px", fontWeight: 700, fontSize: 12,
          cursor: "pointer", textDecoration: esLocal ? "none" : "underline dotted",
        }}>{label}</span>
    );
  });
}

function MentionText({ texto, miembros, esPropio }) {
  const parts = [];
  const re = /@([\w.]+)/g;
  let last = 0, m;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > last) parts.push(texto.slice(last, m.index));
    const handle = m[1];
    const member = (miembros || []).find(mb => mb.email?.split("@")[0] === handle);
    const color = member ? avatarColor(member.user_id) : "#6366f1";
    parts.push(
      <span key={m.index} style={{
        background: esPropio ? "rgba(255,255,255,0.22)" : color + "1a",
        color: esPropio ? "#fff" : color,
        borderRadius: 4, padding: "1px 5px", fontWeight: 700, fontSize: 12,
      }}>@{handle}</span>
    );
    last = m.index + m[0].length;
  }
  if (last < texto.length) parts.push(texto.slice(last));
  return <>{parts.length ? parts : texto}</>;
}

// Icono por tipo de evento de app.
const EVENT_ICONS = { pedido: Package, compra: ShoppingCart, retorno: RotateCcw, planning: Layers, plano: Map };
function EventIcon({ tipo, size = 18 }) {
  const Ic = EVENT_ICONS[tipo] || Activity;
  return <Ic size={size} />;
}

// ── Feed mezclado: eventos de apps + conversaciones de chat, por fecha ───────
function FeedView({ otros, allMessages, notifs, myId, myEmail, appId, onSelectConv, onEvent }) {
  const lastMsg = (uid) => {
    const msgs = allMessages.filter(m =>
      (m.from_user_id === myId && m.to_user_id === uid) ||
      (m.from_user_id === uid && m.to_user_id === myId));
    return msgs[msgs.length - 1] ?? null;
  };
  const unreadFrom = (uid) => allMessages.filter(m => m.from_user_id === uid && m.to_user_id === myId && !m.is_read).length;

  // Items de conversación: uno por miembro con el que hay mensajes.
  const convItems = otros
    .map(m => ({ kind: "conv", member: m, last: lastMsg(m.user_id), unread: unreadFrom(m.user_id) }))
    .filter(it => it.last);

  // Items de evento: notificaciones de apps (ignorar las propias del usuario).
  const eventItems = (notifs || [])
    .filter(n => n.actor_id !== myId)
    .map(n => ({ kind: "event", notif: n }));

  // Mezclar y ordenar por fecha descendente.
  const items = [...convItems, ...eventItems].sort((a, b) => {
    const ta = a.kind === "conv" ? a.last.created_at : a.notif.created_at;
    const tb = b.kind === "conv" ? b.last.created_at : b.notif.created_at;
    return new Date(tb) - new Date(ta);
  });

  if (!items.length) return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-2,#6b7280)", fontSize: 13, padding: 20, textAlign: "center" }}>
      Sin actividad todavía.<br />Los mensajes y eventos de tu equipo aparecerán aquí.
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {items.map((it, i) => {
        if (it.kind === "conv") {
          const { member, last, unread } = it;
          return (
            <button key={`c-${member.user_id}`} onClick={() => onSelectConv(member)}
              style={feedRowStyle}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2,#f3f4f6)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <Avatar member={member} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: unread ? 700 : 500, color: "var(--text,#111)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                    {member.nombre || member.email || "Usuario"}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--text-2,#6b7280)", flexShrink: 0 }}>{formatHora(last.created_at)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: unread ? "var(--brand,#6366f1)" : "var(--text-2,#6b7280)", fontWeight: unread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                    {(last.from_user_id === myId ? "Tú: " : "") + last.message}
                  </span>
                  {unread > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: "var(--brand,#6366f1)", color: "#fff", fontSize: 10.5, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px", flexShrink: 0 }}>{unread}</span>}
                </div>
              </div>
            </button>
          );
        }
        // Evento de app
        const n = it.notif;
        const esOtraApp = n.app_id !== appId;
        return (
          <button key={`e-${n.id}`} onClick={() => onEvent(n)}
            style={feedRowStyle}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2,#f3f4f6)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Avatar member={{ user_id: n.actor_id, nombre: n.actor_nombre }} size={34} />
              <div style={{ position: "absolute", bottom: -3, right: -3, width: 18, height: 18, borderRadius: 999, background: "var(--surface,#fff)", border: "1px solid var(--border,#e5e7eb)", display: "grid", placeItems: "center", color: "var(--text-2,#6b7280)" }}>
                <EventIcon tipo={n.tipo} size={11} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--text,#111)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>
                  {n.titulo}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-2,#6b7280)", flexShrink: 0 }}>{formatHora(n.created_at)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-2,#6b7280)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                  {n.recurso_label || ""}{esOtraApp ? ` · ${n.app_id}` : ""}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const feedRowStyle = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px",
  border: "none", background: "none", cursor: "pointer",
  borderBottom: "1px solid var(--border,#e5e7eb)", textAlign: "left",
};

// ── Vista lista de conversaciones (solo chat, accesible desde "Nuevo") ──────
function ListView({ otros, allMessages, myId, myEmail, onSelect }) {
  const lastMsg = (uid) => {
    const msgs = allMessages.filter(m =>
      (m.from_user_id === myId && m.to_user_id === uid) ||
      (m.from_user_id === uid && m.to_user_id === myId));
    return msgs[msgs.length - 1] ?? null;
  };
  const unreadFrom = (uid) => allMessages.filter(m => m.from_user_id === uid && m.to_user_id === myId && !m.is_read).length;
  const myHandle = myEmail?.split("@")[0]?.toLowerCase();
  const hasMention = (uid) => myHandle && allMessages.some(m =>
    m.from_user_id === uid && m.to_user_id === myId && !m.is_read &&
    m.message?.toLowerCase().includes(`@${myHandle}`));

  if (!otros.length) return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-2,#6b7280)", fontSize: 13 }}>
      Sin otros miembros en la empresa
    </div>
  );

  const sorted = [...otros].sort((a, b) => {
    const la = lastMsg(a.user_id), lb = lastMsg(b.user_id);
    if (la && lb) return new Date(lb.created_at) - new Date(la.created_at);
    if (la) return -1; if (lb) return 1;
    return (a.nombre || "").localeCompare(b.nombre || "");
  });

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {sorted.map((m) => {
        const last = lastMsg(m.user_id), unread = unreadFrom(m.user_id), mention = hasMention(m.user_id);
        return (
          <button key={m.user_id} onClick={() => onSelect(m)}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px",
              border: "none", background: "none", cursor: "pointer",
              borderBottom: "1px solid var(--border,#e5e7eb)", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2,#f3f4f6)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <Avatar member={m} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5, fontWeight: unread ? 700 : 500, color: "var(--text,#111)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {m.nombre || m.email || "Usuario"}
                </span>
                {last && <span style={{ fontSize: 11, color: "var(--text-2,#6b7280)", marginLeft: 6 }}>{formatHora(last.created_at)}</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: unread ? "var(--brand,#6366f1)" : "var(--text-2,#6b7280)",
                  fontWeight: unread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", maxWidth: 180 }}>
                  {last ? (last.from_user_id === myId ? "Tú: " : "") + last.message
                        : <span style={{ fontStyle: "italic" }}>Escribe un mensaje...</span>}
                </span>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                  {mention && <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: "#7c3aed",
                    color: "#fff", fontSize: 10.5, fontWeight: 800, display: "grid", placeItems: "center", padding: "0 5px" }}>@</span>}
                  {unread > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: "var(--brand,#6366f1)",
                    color: "#fff", fontSize: 10.5, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px" }}>{unread}</span>}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Vista conversación ──────────────────────────────────────────────────────
function ConvView({ partner, messages, myId, onBack, onSend, miembros, appId, comandos, resolveAppUrl }) {
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [ac, setAc] = useState(null);
  const [acIdx, setAcIdx] = useState(0);
  const endRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const handleChange = (e) => {
    setTexto(e.target.value);
    setAc(detectarAutocompletar(e.target.value, e.target.selectionStart, comandos, miembros));
    setAcIdx(0);
  };

  const applyAc = (item) => {
    const cursor = taRef.current?.selectionStart ?? texto.length;
    let insert;
    if (ac.tipo === "mention") insert = `@${item.valor} `;
    else insert = `${serializarToken(ac.trigger, item.valor, appId)} `;
    const newText = texto.slice(0, ac.startIdx) + insert + texto.slice(cursor);
    setTexto(newText);
    setAc(null);
    setTimeout(() => {
      const ta = taRef.current;
      if (ta) { ta.focus(); const p = ac.startIdx + insert.length; ta.setSelectionRange(p, p); }
    }, 0);
  };

  const onKey = (e) => {
    if (ac) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAcIdx(i => Math.min(i + 1, ac.items.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setAcIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyAc(ac.items[acIdx]); return; }
      if (e.key === "Escape") { setAc(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
  };

  const enviar = async (e) => {
    e?.preventDefault();
    const msg = texto.trim();
    if (!msg || sending) return;
    setTexto(""); setSendErr(null); setAc(null); setSending(true);
    try { await onSend(msg); }
    catch (err) { setTexto(msg); setSendErr(err?.message || "Error al enviar"); }
    finally { setSending(false); }
  };

  const groupDate = (iso) => {
    const d = new Date(iso), hoy = new Date();
    if (d.toDateString() === hoy.toDateString()) return "Hoy";
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    if (d.toDateString() === ayer.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };
  const groups = [];
  let lastDate = null;
  for (const msg of messages) {
    const dLabel = groupDate(msg.created_at);
    if (dLabel !== lastDate) { groups.push({ type: "date", label: dLabel }); lastDate = dLabel; }
    groups.push({ type: "msg", msg });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border,#e5e7eb)", flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2,#6b7280)", padding: 4, display: "flex", borderRadius: 6 }}>
          <ArrowLeft size={16} />
        </button>
        <Avatar member={partner} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text,#111)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {partner.nombre || partner.email || "Usuario"}
          </div>
          {partner.rol && <div style={{ fontSize: 11, color: "var(--text-2,#6b7280)", textTransform: "capitalize" }}>{partner.rol}</div>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        {messages.length === 0 && <div style={{ textAlign: "center", color: "var(--text-2,#6b7280)", fontSize: 12.5, marginTop: 32 }}>Empieza la conversación</div>}
        {groups.map((g, i) => {
          if (g.type === "date") return <div key={`d-${i}`} style={{ textAlign: "center", fontSize: 11, color: "var(--text-2,#6b7280)", margin: "8px 0 4px" }}>{g.label}</div>;
          const { msg } = g;
          const esPropio = msg.from_user_id === myId;
          return (
            <div key={msg.id || i} style={{ display: "flex", flexDirection: esPropio ? "row-reverse" : "row", alignItems: "flex-end", gap: 6 }}>
              {!esPropio && <Avatar member={partner} size={22} />}
              <div style={{ maxWidth: "72%", padding: "7px 11px",
                borderRadius: esPropio ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: esPropio ? "var(--brand,#6366f1)" : "var(--surface-2,#f3f4f6)",
                color: esPropio ? "#fff" : "var(--text,#111)", fontSize: 13, lineHeight: 1.45, wordBreak: "break-word" }}>
                <span><MsgText texto={msg.message} appId={appId} miembros={miembros} comandos={comandos} resolveAppUrl={resolveAppUrl} esPropio={esPropio} /></span>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3, marginTop: 2 }}>
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{formatHora(msg.created_at)}</span>
                  {esPropio && (msg.is_read ? <CheckCheck size={11} style={{ opacity: 0.85 }} /> : <Check size={11} style={{ opacity: 0.6 }} />)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {ac && (
        <div style={{ borderTop: "1px solid var(--border,#e5e7eb)", background: "var(--surface,#fff)", flexShrink: 0, maxHeight: 160, overflowY: "auto" }}>
          <div style={{ padding: "4px 10px 2px", fontSize: 10.5, fontWeight: 700, color: "var(--text-2,#6b7280)", letterSpacing: 0.5 }}>
            {ac.tipo === "mention" ? "@ Mencionar usuario" : `${ac.trigger} ${ac.tipo}`}
          </div>
          {ac.items.map((item, idx) => (
            <button key={idx} onMouseDown={e => { e.preventDefault(); applyAc(item); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px",
                border: "none", background: idx === acIdx ? "var(--brand-soft,#eef2ff)" : "none",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              {ac.tipo === "mention"
                ? <><Avatar member={item.member} size={22} />
                    <div><div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text,#111)" }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-2,#6b7280)" }}>@{item.valor}</div></div></>
                : <><div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(99,102,241,0.12)", color: "#6366f1",
                    display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{ac.trigger}</div>
                    <div><div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text,#111)" }}>{item.label || item.valor}</div>
                    {item.sub && <div style={{ fontSize: 11, color: "var(--text-2,#6b7280)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{item.sub}</div>}</div></>}
            </button>
          ))}
        </div>
      )}

      {sendErr && <div style={{ padding: "4px 14px", fontSize: 11.5, color: "#ef4444", background: "#fef2f2", borderTop: "1px solid #fecaca" }}>{sendErr}</div>}

      <form onSubmit={enviar} style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--border,#e5e7eb)", flexShrink: 0 }}>
        <textarea ref={taRef} value={texto} onChange={handleChange} onKeyDown={onKey}
          placeholder="Escribe… @ para mencionar" rows={1}
          style={{ flex: 1, padding: "8px 11px", borderRadius: 10, border: "1px solid var(--border-strong,#d1d5db)",
            resize: "none", outline: "none", fontFamily: "inherit", fontSize: 13,
            background: "var(--surface-2,#f3f4f6)", color: "var(--text,#111)", lineHeight: 1.4,
            maxHeight: 80, overflowY: "auto", boxSizing: "border-box" }} />
        <button type="submit" disabled={!texto.trim() || sending}
          style={{ background: texto.trim() && !sending ? "var(--brand,#6366f1)" : "var(--border-strong,#d1d5db)",
            color: "#fff", border: "none", borderRadius: 10, padding: "0 13px",
            cursor: texto.trim() && !sending ? "pointer" : "not-allowed", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

// ── Vista IA ─────────────────────────────────────────────────────────────────
// Asistente integrado en el panel. Conoce el feed (notifs + mensajes recientes)
// como contexto, ofrece prompts predefinidos por app y permite elegir proveedor.
function IAView({ aiProvider, aiKeys, aiOrden, system, prompts = [], feedTexto, appId, onTool, tools = [], onFallback }) {
  const [proveedor, setProveedor] = useState(aiProvider || "claude");
  const [keysLocal, setKeysLocal] = useState(cargarKeys);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const endRef = useRef(null);
  const keys = { ...keysLocal, ...(aiKeys || {}) };
  const prov = PROVEEDORES.find((p) => p.id === proveedor) || PROVEEDORES[0];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, cargando]);
  const setKey = (id, v) => { const k = { ...keysLocal, [id]: v }; setKeysLocal(k); guardarKeys(k); };

  async function enviar(textoArg) {
    const texto = (textoArg ?? input).trim();
    if (!texto || cargando) return;
    if (!keys[proveedor]) { setShowKeys(true); return; }
    setInput(""); setShowPrompts(false);
    setMsgs((m) => [...m, { rol: "user", texto }]);
    setCargando(true);
    // Contexto: feed de notificaciones/mensajes que recibió el usuario.
    const ctx = feedTexto ? `Actividad reciente que ha recibido el usuario (mensajes y eventos del equipo):\n${feedTexto}\n\n` : "";
    const hist = [{ role: "user", content: ctx + "Petición: " + texto }];
    const acciones = [];
    const orden = aiOrden && aiOrden.length ? aiOrden : ["claude", "gpt", "gemini"];
    const modeloDe = (id) => (PROVEEDORES.find((p) => p.id === id) || {}).modelo;
    let activo = proveedor; // puede cambiar por fallback dentro del bucle
    try {
      for (let paso = 0; paso < (tools.length ? 6 : 1); paso++) {
        const r = await llamarConFallback({ prefer: activo, orden, keys, modeloDe, system, messages: hist, tools });
        // Fallback aplicado: avisa al usuario y reporta al admin (temporal, no persiste).
        if (r.cambioDesde && r.proveedorUsado !== activo) {
          const nDe = (PROVEEDORES.find((p) => p.id === r.cambioDesde) || {}).nombre || r.cambioDesde;
          const nA = (PROVEEDORES.find((p) => p.id === r.proveedorUsado) || {}).nombre || r.proveedorUsado;
          setProveedor(r.proveedorUsado); activo = r.proveedorUsado;
          setMsgs((m) => [...m, { rol: "sys", texto: `La IA «${nDe}» necesita ser revisada por el admin (sin tokens). Se cambió a «${nA}» para continuar con el servicio.` }]);
          onFallback?.({ desde: r.cambioDesde, a: r.proveedorUsado, motivo: "sin_tokens" });
        }
        const { text, toolCalls } = r;
        if (!toolCalls.length || !onTool) { setMsgs((m) => [...m, { rol: "bot", texto: text || "Hecho.", acciones }]); break; }
        hist.push({ role: "assistant", content: [...(text ? [{ type: "text", text }] : []), ...toolCalls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input }))] });
        const results = [];
        for (const tc of toolCalls) { const res = onTool(tc.name, tc.input) || {}; acciones.push(res.resumen || res.error || tc.name); results.push({ type: "tool_result", tool_use_id: tc.id, name: tc.name, content: JSON.stringify({ resumen: res.resumen, error: res.error, datos: res.datos }) }); }
        hist.push({ role: "user", content: results });
        if (paso === 5) setMsgs((m) => [...m, { rol: "bot", texto: "Hecho (límite de pasos).", acciones }]);
      }
    } catch (e) {
      if (e?.sinConfig) { setMsgs((m) => [...m, { rol: "bot", texto: "No hay ninguna IA configurada. El administrador debe añadir una API key en el Portal." }]); }
      else if (esErrorCuota(e)) { onFallback?.({ desde: e.proveedorUsado || activo, a: null, motivo: "sin_tokens_todas" }); setMsgs((m) => [...m, { rol: "bot", texto: "Ninguna IA tiene tokens disponibles. Ponte en contacto con tu administrador para revisar las APIs de la empresa." }]); }
      else setMsgs((m) => [...m, { rol: "bot", texto: "Error: " + (e?.message || e) }]);
    } finally { setCargando(false); }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Barra de herramientas: proveedor + prompts + keys */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--border,#e5e7eb)", flexShrink: 0, flexWrap: "wrap" }}>
        <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}
          style={{ fontSize: 12, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--border-strong,#d1d5db)", background: "var(--surface,#fff)", color: "var(--text,#111)" }}>
          {PROVEEDORES.map((p) => <option key={p.id} value={p.id}>{p.nombre}{keys[p.id] ? "" : " 🔑"}</option>)}
        </select>
        {prompts.length > 0 && (
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowPrompts((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "5px 9px", borderRadius: 7, border: "1px solid var(--border-strong,#d1d5db)", background: "var(--surface,#fff)", color: "var(--text-2,#6b7280)", cursor: "pointer" }}>
              Prompts <ChevronDown size={13} />
            </button>
            {showPrompts && (<>
              <div onClick={() => setShowPrompts(false)} style={{ position: "fixed", inset: 0, zIndex: 5 }} />
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 6, width: 240, maxHeight: 240, overflowY: "auto", background: "var(--surface,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.18)", padding: 5 }}>
                {prompts.map((p, i) => (
                  <button key={i} onClick={() => enviar(typeof p === "string" ? p : p.prompt)} style={{ display: "block", width: "100%", textAlign: "left", fontSize: 12.5, padding: "7px 9px", border: "none", borderRadius: 7, background: "none", color: "var(--text,#111)", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2,#f3f4f6)"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                    {typeof p === "string" ? p : p.label || p.prompt}
                  </button>
                ))}
              </div>
            </>)}
          </div>
        )}
        <button onClick={() => setShowKeys((v) => !v)} title="API keys" style={{ marginLeft: "auto", fontSize: 12, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border-strong,#d1d5db)", background: showKeys ? "var(--brand-soft,#eef2ff)" : "var(--surface,#fff)", color: "var(--text-2,#6b7280)", cursor: "pointer", display: "flex" }}>🔑</button>
      </div>

      {showKeys && (
        <div style={{ padding: 10, borderBottom: "1px solid var(--border,#e5e7eb)", background: "var(--surface-2,#f3f4f6)", display: "grid", gap: 7, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-2,#6b7280)", lineHeight: 1.4 }}>Keys locales de pruebas (este navegador). La IA de la empresa se configura en el <b>Portal Scale</b> y tiene prioridad.</div>
          {PROVEEDORES.map((p) => { const empDef = !!(aiKeys || {})[p.id]; return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 48, fontSize: 11.5, fontWeight: 600, color: p.color }}>{p.nombre}</span>
              {empDef ? <span style={{ flex: 1, fontSize: 11, color: "#1f9d4d" }}>✓ Configurada por la empresa</span>
                : <input type="password" placeholder={p.id === "claude" ? "sk-ant-..." : p.id === "gpt" ? "sk-..." : "AIza..."} value={keysLocal[p.id] || ""} onChange={(e) => setKey(p.id, e.target.value)} style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border-strong,#d1d5db)", background: "var(--surface,#fff)", color: "var(--text,#111)" }} />}
            </div>
          ); })}
        </div>
      )}

      {/* Conversación */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
        {!msgs.length && <div style={{ fontSize: 12.5, color: "var(--text-2,#6b7280)", lineHeight: 1.5, textAlign: "center", margin: "auto", padding: "0 8px" }}>
          <Sparkles size={22} style={{ opacity: 0.5, marginBottom: 6 }} /><br />
          Pregúntame o usa un <b>prompt</b>. Conozco la actividad reciente de tu equipo.
        </div>}
        {msgs.map((m, i) => m.rol === "sys" ? (
          <div key={i} style={{ alignSelf: "center", maxWidth: "92%", fontSize: 11.5, lineHeight: 1.4, padding: "7px 10px", borderRadius: 9, background: "var(--warn-soft,#fff7ed)", color: "var(--warn,#b45309)", border: "1px solid var(--warn,#f59e0b)", display: "flex", gap: 6, alignItems: "flex-start" }}>⚠️ <span>{m.texto}</span></div>
        ) : (
          <div key={i} style={{ alignSelf: m.rol === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div style={{ fontSize: 13, lineHeight: 1.45, padding: "8px 11px", borderRadius: 12, background: m.rol === "user" ? "var(--brand,#6366f1)" : "var(--surface-2,#f3f4f6)", color: m.rol === "user" ? "#fff" : "var(--text,#111)", border: m.rol === "user" ? "none" : "1px solid var(--border,#e5e7eb)", whiteSpace: "pre-wrap" }}>{m.texto}</div>
            {m.acciones?.length > 0 && <div style={{ marginTop: 4, display: "grid", gap: 2 }}>{m.acciones.map((a, j) => <div key={j} style={{ fontSize: 10.5, color: "var(--text-2,#6b7280)" }}>✓ {a}</div>)}</div>}
          </div>
        ))}
        {cargando && <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-2,#6b7280)" }}><Loader size={14} className="spin" />Pensando…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--border,#e5e7eb)", flexShrink: 0 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} placeholder="Escribe a la IA…" disabled={cargando}
          style={{ flex: 1, padding: "8px 11px", borderRadius: 10, border: "1px solid var(--border-strong,#d1d5db)", outline: "none", fontFamily: "inherit", fontSize: 13, background: "var(--surface-2,#f3f4f6)", color: "var(--text,#111)" }} />
        <button onClick={() => enviar()} disabled={cargando || !input.trim()} style={{ background: input.trim() && !cargando ? "var(--brand,#6366f1)" : "var(--border-strong,#d1d5db)", color: "#fff", border: "none", borderRadius: 10, padding: "0 13px", cursor: input.trim() && !cargando ? "pointer" : "not-allowed", display: "flex", alignItems: "center" }}><Send size={15} /></button>
      </div>
    </div>
  );
}

// ── ChatBase (componente principal) ─────────────────────────────────────────
// Es el "centro de notificaciones": feed mezclado de chat + eventos de apps.
// onEventoLocal(cmd): la app ejecuta un evento de SÍ MISMA (navegar al recurso).
export const ChatBase = forwardRef(function ChatBase({
  sb, appId, empresa, currentUser, miembros = [],
  comandos = [], resolveAppUrl, onUnreadChange, onEventoLocal,
  // IA integrada (opcional): heredada del Portal. Si `ia` falta o ia.enabled===false, no se muestra.
  ia,
}, ref) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("feed");
  const [partner, setPartner] = useState(null);
  const [allMessages, setAllMessages] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [lastSeen, setLastSeen] = useState(null);

  const myId = currentUser?.id;
  const myEmail = currentUser?.email;
  const companyId = empresa?.id;

  useImperativeHandle(ref, () => ({
    openConversation: (user) => { setPartner(user); setView("conv"); setOpen(true); },
    openPanel: () => setOpen(true),
  }));

  // Chat: carga + realtime
  useEffect(() => {
    if (!companyId || !myId || !sb) return;
    cargarTodosMensajes(sb, companyId).then(setAllMessages);
    const unsub = suscribirMensajes(sb, companyId, (msg) => {
      setAllMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    });
    return unsub;
  }, [companyId, myId, sb]);

  // Notificaciones de eventos: carga + realtime + última vez visto
  useEffect(() => {
    if (!companyId || !myId || !sb) return;
    cargarNotificaciones(sb, companyId).then(setNotifs);
    cargarUltimaVez(sb, companyId, myId).then(setLastSeen);
    const unsub = suscribirNotificaciones(sb, companyId, (n) => {
      setNotifs(prev => prev.some(x => x.id === n.id) ? prev : [n, ...prev]);
    });
    return unsub;
  }, [companyId, myId, sb]);

  // Marcar leído al entrar en una conversación de chat
  useEffect(() => {
    if (partner && companyId && myId && open && view === "conv") {
      marcarLeidos(sb, companyId, myId, partner.user_id);
      setAllMessages(prev => prev.map(m =>
        m.from_user_id === partner.user_id && m.to_user_id === myId ? { ...m, is_read: true } : m));
    }
  }, [partner?.user_id, view, open]);

  // Al ABRIR la campanita: marcar todos los eventos como vistos (badge a 0 para notifs)
  useEffect(() => {
    if (open && companyId && myId) {
      const now = new Date().toISOString();
      marcarVistoAhora(sb, companyId, myId);
      setLastSeen(now);
    }
  }, [open]);

  const convMessages = useMemo(() => {
    if (!partner) return [];
    return allMessages.filter(m =>
      (m.from_user_id === myId && m.to_user_id === partner.user_id) ||
      (m.from_user_id === partner.user_id && m.to_user_id === myId));
  }, [allMessages, partner?.user_id, myId]);

  // Badge combinado: chat no leído + eventos (de otros) más nuevos que lastSeen
  const chatUnread = useMemo(() =>
    allMessages.filter(m => m.to_user_id === myId && !m.is_read).length, [allMessages, myId]);
  const notifUnread = useMemo(() => {
    if (!lastSeen) return notifs.filter(n => n.actor_id !== myId).length;
    return notifs.filter(n => n.actor_id !== myId && new Date(n.created_at) > new Date(lastSeen)).length;
  }, [notifs, lastSeen, myId]);
  const totalUnread = chatUnread + notifUnread;
  useEffect(() => { onUnreadChange?.(totalUnread); }, [totalUnread]);

  const otros = useMemo(() => miembros.filter(m => m.user_id !== myId), [miembros, myId]);

  // Resumen del feed (notifs + últimos mensajes recibidos) como contexto para la IA.
  const iaHabilitada = !!ia && ia.enabled !== false;
  const feedTexto = useMemo(() => {
    if (!iaHabilitada) return "";
    const líneas = [];
    (notifs || []).filter(n => n.actor_id !== myId).slice(0, 15).forEach(n =>
      líneas.push(`• [${n.app_id}] ${n.titulo}${n.recurso_label ? " — " + n.recurso_label : ""} (${formatHora(n.created_at)})`));
    allMessages.filter(m => m.to_user_id === myId).slice(-10).forEach(m => {
      const de = otros.find(o => o.user_id === m.from_user_id);
      líneas.push(`• Mensaje de ${de?.nombre || de?.email || "alguien"}: ${m.message}`);
    });
    return líneas.join("\n") || "Sin actividad reciente.";
  }, [iaHabilitada, notifs, allMessages, myId, otros]);

  const handleSend = async (msg) => {
    const sent = await enviarMensaje(sb, companyId, myId, partner.user_id, msg);
    setAllMessages(prev => [...prev, { ...sent, is_read: false }]);
    const handles = [...msg.matchAll(/@([\w.]+)/g)].map(m => m[1].toLowerCase());
    if (handles.length) {
      for (const mb of otros) {
        if (mb.user_id === partner.user_id) continue;
        const h = mb.email?.split("@")[0]?.toLowerCase();
        if (h && handles.includes(h)) await enviarMensaje(sb, companyId, myId, mb.user_id, msg);
      }
    }
  };

  // Click en un evento del feed: misma app → ejecutar local; otra app → deep-link.
  const handleEvent = (n) => {
    if (n.app_id === appId) {
      if (n.cmd) {
        // cmd serializado tipo "s.OA_00200" → {trigger, valor}
        const dot = n.cmd.indexOf(".");
        const trigger = dot >= 0 && n.cmd.slice(0, dot) === "h" ? "#" : "/";
        const valor = dot >= 0 ? n.cmd.slice(dot + 1).replace(/~/g, " ") : n.cmd;
        onEventoLocal?.({ trigger, valor, tipo: n.tipo, notif: n });
      }
      setOpen(false);
    } else {
      const url = resolveAppUrl?.(n.app_id);
      if (url && n.cmd) {
        const sep = url.includes("?") ? "&" : "?";
        window.open(`${url}${sep}cmd=${encodeURIComponent(n.cmd)}`, "_blank", "noreferrer");
      } else if (url) {
        window.open(url, "_blank", "noreferrer");
      }
    }
  };

  if (!companyId || !myId) return null;

  const headerTitle = view === "conv" && partner
    ? (partner.nombre || partner.email || "Conversación")
    : view === "list" ? "Nuevo mensaje" : view === "ia" ? "Asistente IA" : "Notificaciones";

  return (
    <>
      {open && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, width: 340, height: 500,
          background: "var(--surface,#fff)", border: "1px solid var(--border-strong,#d1d5db)",
          borderRadius: 16, boxShadow: "0 8px 48px rgba(0,0,0,0.22)",
          display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px",
            borderBottom: "1px solid var(--border,#e5e7eb)", flexShrink: 0, background: "var(--brand,#6366f1)" }}>
            {view === "feed"
              ? <Activity size={18} color="#fff" />
              : <button onClick={() => { setView("feed"); setPartner(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 0, display: "flex" }}><ArrowLeft size={18} /></button>}
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#fff" }}>{headerTitle}</span>
            {view === "feed" && iaHabilitada && (
              <button onClick={() => setView("ia")} title="Asistente IA"
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", padding: "4px 6px", display: "flex" }}>
                <Sparkles size={15} />
              </button>
            )}
            {view === "feed" && (
              <button onClick={() => setView("list")} title="Nuevo mensaje"
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", padding: "4px 6px", display: "flex" }}>
                <MessageCircle size={15} />
              </button>
            )}
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none",
              borderRadius: 8, cursor: "pointer", color: "#fff", padding: 5, display: "flex" }}>
              <X size={15} />
            </button>
          </div>
          {view === "feed" && (
            <FeedView otros={otros} allMessages={allMessages} notifs={notifs} myId={myId} myEmail={myEmail}
              appId={appId} onSelectConv={(m) => { setPartner(m); setView("conv"); }} onEvent={handleEvent} />
          )}
          {view === "list" && (
            <ListView otros={otros} allMessages={allMessages} myId={myId} myEmail={myEmail}
              onSelect={(m) => { setPartner(m); setView("conv"); }} />
          )}
          {view === "conv" && (
            <ConvView partner={partner} messages={convMessages} myId={myId}
              onBack={() => { setView("feed"); setPartner(null); }} onSend={handleSend}
              miembros={otros} appId={appId} comandos={comandos} resolveAppUrl={resolveAppUrl} />
          )}
          {view === "ia" && iaHabilitada && (
            <IAView aiProvider={ia.provider} aiKeys={ia.keys} aiOrden={ia.orden} system={ia.system}
              prompts={ia.prompts || []} feedTexto={feedTexto} appId={appId}
              tools={ia.tools || []} onTool={ia.onTool} onFallback={ia.onFallback} />
          )}
        </div>
      )}

      {!open && (
        <button onClick={() => setOpen(true)} title="Notificaciones"
          style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, width: 50, height: 50,
            borderRadius: "50%", background: "var(--brand,#6366f1)", color: "#fff", border: "none",
            cursor: "pointer", boxShadow: "0 4px 20px rgba(99,102,241,0.4)", display: "grid", placeItems: "center" }}>
          <MessageCircle size={21} />
          {totalUnread > 0 && (
            <span style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 999,
              background: "#ef4444", color: "#fff", fontSize: 10.5, fontWeight: 800, display: "grid",
              placeItems: "center", padding: "0 4px", border: "2px solid var(--surface,#fff)" }}>
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      )}
    </>
  );
});
