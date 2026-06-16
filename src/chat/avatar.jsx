/* ===========================================================================
 * Avatar de usuario compartido (iniciales + color determinista por user_id).
 * Usado por ChatBase (mensajes/feed) y PresenceAvatars (quién está online).
 * ======================================================================== */
import React from "react";

export const AVATAR_COLORS = ["#6366f1","#0891b2","#be185d","#65a30d","#f59e0b","#ef4444","#10b981","#8b5cf6"];

export function avatarColor(userId) {
  if (!userId) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0x7fffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function iniciales(nombre) {
  if (!nombre) return "?";
  const parts = nombre.trim().split(/[\s.@_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nombre[0].toUpperCase();
}

export function Avatar({ member, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: avatarColor(member?.user_id), color: "#fff",
      display: "grid", placeItems: "center",
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>{iniciales(member?.nombre || member?.email || "?")}</div>
  );
}
