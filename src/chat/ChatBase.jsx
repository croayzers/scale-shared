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
import { X, Send, ArrowLeft, MessageCircle, Check, CheckCheck } from "lucide-react";
import { cargarTodosMensajes, enviarMensaje, marcarLeidos, suscribirMensajes } from "./data.js";
import { serializarToken, parsearMensaje, construirDeepLink, detectarAutocompletar } from "./commands.js";

const AVATAR_COLORS = ["#6366f1","#0891b2","#be185d","#65a30d","#f59e0b","#ef4444","#10b981","#8b5cf6"];
function avatarColor(userId) {
  if (!userId) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0x7fffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function iniciales(nombre) {
  if (!nombre) return "?";
  const parts = nombre.trim().split(/[\s.@_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nombre[0].toUpperCase();
}
function formatHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ member, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: avatarColor(member?.user_id), color: "#fff",
      display: "grid", placeItems: "center",
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>{iniciales(member?.nombre || member?.email || "?")}</div>
  );
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

// ── Vista lista de conversaciones ───────────────────────────────────────────
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

// ── ChatBase (componente principal) ─────────────────────────────────────────
export const ChatBase = forwardRef(function ChatBase({
  sb, appId, empresa, currentUser, miembros = [],
  comandos = [], resolveAppUrl, onUnreadChange,
}, ref) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("list");
  const [partner, setPartner] = useState(null);
  const [allMessages, setAllMessages] = useState([]);

  const myId = currentUser?.id;
  const myEmail = currentUser?.email;
  const companyId = empresa?.id;

  useImperativeHandle(ref, () => ({
    openConversation: (user) => { setPartner(user); setView("conv"); setOpen(true); },
    openPanel: () => setOpen(true),
  }));

  useEffect(() => {
    if (!companyId || !myId || !sb) return;
    cargarTodosMensajes(sb, companyId).then(setAllMessages);
    const unsub = suscribirMensajes(sb, companyId, (msg) => {
      setAllMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    });
    return unsub;
  }, [companyId, myId, sb]);

  useEffect(() => {
    if (partner && companyId && myId && open && view === "conv") {
      marcarLeidos(sb, companyId, myId, partner.user_id);
      setAllMessages(prev => prev.map(m =>
        m.from_user_id === partner.user_id && m.to_user_id === myId ? { ...m, is_read: true } : m));
    }
  }, [partner?.user_id, view, open]);

  const convMessages = useMemo(() => {
    if (!partner) return [];
    return allMessages.filter(m =>
      (m.from_user_id === myId && m.to_user_id === partner.user_id) ||
      (m.from_user_id === partner.user_id && m.to_user_id === myId));
  }, [allMessages, partner?.user_id, myId]);

  const totalUnread = useMemo(() =>
    allMessages.filter(m => m.to_user_id === myId && !m.is_read).length, [allMessages, myId]);
  useEffect(() => { onUnreadChange?.(totalUnread); }, [totalUnread]);

  const otros = useMemo(() => miembros.filter(m => m.user_id !== myId), [miembros, myId]);

  const handleSend = async (msg) => {
    const sent = await enviarMensaje(sb, companyId, myId, partner.user_id, msg);
    setAllMessages(prev => [...prev, { ...sent, is_read: false }]);
    // Fanout a @mencionados distintos del interlocutor
    const handles = [...msg.matchAll(/@([\w.]+)/g)].map(m => m[1].toLowerCase());
    if (handles.length) {
      for (const mb of otros) {
        if (mb.user_id === partner.user_id) continue;
        const h = mb.email?.split("@")[0]?.toLowerCase();
        if (h && handles.includes(h)) await enviarMensaje(sb, companyId, myId, mb.user_id, msg);
      }
    }
  };

  if (!companyId || !myId) return null;

  return (
    <>
      {open && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, width: 340, height: 500,
          background: "var(--surface,#fff)", border: "1px solid var(--border-strong,#d1d5db)",
          borderRadius: 16, boxShadow: "0 8px 48px rgba(0,0,0,0.22)",
          display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px",
            borderBottom: "1px solid var(--border,#e5e7eb)", flexShrink: 0, background: "var(--brand,#6366f1)" }}>
            <MessageCircle size={18} color="#fff" />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#fff" }}>
              {view === "conv" && partner ? (partner.nombre || partner.email || "Conversación") : "Mensajes"}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none",
              borderRadius: 8, cursor: "pointer", color: "#fff", padding: 5, display: "flex" }}>
              <X size={15} />
            </button>
          </div>
          {view === "list"
            ? <ListView otros={otros} allMessages={allMessages} myId={myId} myEmail={myEmail} onSelect={(m) => { setPartner(m); setView("conv"); }} />
            : <ConvView partner={partner} messages={convMessages} myId={myId}
                onBack={() => { setView("list"); setPartner(null); }} onSend={handleSend}
                miembros={otros} appId={appId} comandos={comandos} resolveAppUrl={resolveAppUrl} />}
        </div>
      )}

      {!open && (
        <button onClick={() => setOpen(true)} title="Mensajes"
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
