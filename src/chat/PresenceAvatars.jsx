/* ===========================================================================
 * Avatares de presencia para el header, junto a BellButton. Muestra quién de
 * la empresa está conectado ahora mismo (cross-app, vía Realtime Presence).
 * ======================================================================== */
import React, { useState, useEffect } from "react";
import { Avatar } from "./avatar.jsx";
import { suscribirPresencia } from "./presence.js";

export function PresenceAvatars({ sb, companyId, currentUser, appId, max = 4, size = 26 }) {
  const [online, setOnline] = useState([]);

  useEffect(() => {
    const unsub = suscribirPresencia(sb, companyId, currentUser, appId, setOnline);
    return unsub;
  }, [sb, companyId, currentUser?.id, appId]);

  const otros = online.filter((u) => u.user_id !== currentUser?.id);
  if (!otros.length) return null;

  const visibles = otros.slice(0, max);
  const resto = otros.length - visibles.length;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {visibles.map((u, i) => (
        <div key={u.user_id} title={u.nombre || u.email || "Usuario"}
          style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: "50%", border: "2px solid var(--surface,#fff)", lineHeight: 0 }}>
          <Avatar member={u} size={size} />
        </div>
      ))}
      {resto > 0 && (
        <div title={`+${resto} más`} style={{
          marginLeft: -8, width: size, height: size, borderRadius: "50%",
          border: "2px solid var(--surface,#fff)", background: "var(--surface-2,#e5e7eb)",
          color: "var(--text-2,#6b7280)", display: "grid", placeItems: "center",
          fontSize: size * 0.34, fontWeight: 700, flexShrink: 0,
        }}>+{resto}</div>
      )}
    </div>
  );
}
