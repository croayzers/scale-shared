/* Campanita de mensajes para el header. Muestra el badge de no-leídos y al
 * pulsarla abre el panel del chat (vía el ref de ChatBase). */
import React from "react";
import { Bell } from "lucide-react";

export function BellButton({ unread = 0, onClick, title = "Mensajes", size = 16 }) {
  return (
    <button onClick={onClick} title={title}
      style={{ position: "relative", background: "none", border: "none", cursor: "pointer",
        color: "var(--text-2,#6b7280)", padding: 6, borderRadius: 8, display: "flex" }}>
      <Bell size={size} />
      {unread > 0 && (
        <span style={{ position: "absolute", top: 2, right: 2, minWidth: 15, height: 15,
          borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 9.5, fontWeight: 800,
          display: "grid", placeItems: "center", padding: "0 3px", lineHeight: 1 }}>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
