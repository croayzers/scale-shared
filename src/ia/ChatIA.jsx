/* ============================================================================
   ChatIA.jsx (@scale/shared/ia) — Asistente IA flotante GENÉRICO.

   Conversa con la IA heredada del Portal (Claude/GPT/Gemini). Sin acciones por
   defecto: responde texto. Una app puede pasarle `tools` + `onTool(name,input)`
   para habilitar tool-calling propio (P-Scale lo hace con su agent.js).

   Props:
     aiProvider  "claude"|"gpt"|"gemini"  — habilitada en el Portal (predeterminada)
     aiKeys      { claude, gpt, gemini }   — heredadas del Portal (companies.flags.ai)
     system      string                    — system prompt de la app
     titulo      string                    — cabecera (def "Asistente IA")
     contexto()  () => string              — texto de contexto vivo por mensaje (opcional)
     tools       []                        — tool specs (opcional); si vacío, solo conversa
     onTool      (name,input) => {resumen,error,datos}  — ejecutor de tools (opcional)
     C, FONT     paleta/fuente de la app
============================================================================ */
import React, { useState, useRef, useEffect } from "react";
import { Sparkles, X, Settings, Send, Bot, Loader } from "lucide-react";
import { PROVEEDORES, cargarKeys, guardarKeys, llamarLLM } from "./llm.js";

export default function ChatIA({ aiProvider, aiKeys, system, titulo = "Asistente IA", contexto, tools = [], onTool, C, FONT }) {
  const [abierto, setAbierto] = useState(false);
  const [proveedor, setProveedor] = useState(aiProvider || "claude");
  const [keysLocal, setKeysLocal] = useState(cargarKeys);
  const [showKeys, setShowKeys] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef(null);

  // Keys efectivas: la empresa (Portal) tiene prioridad sobre las locales.
  const keys = { ...keysLocal, ...(aiKeys || {}) };
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, abierto]);
  const setKey = (id, v) => { const k = { ...keysLocal, [id]: v }; setKeysLocal(k); guardarKeys(k); };
  const prov = PROVEEDORES.find((p) => p.id === proveedor) || PROVEEDORES[0];

  async function enviar() {
    const texto = input.trim();
    if (!texto || cargando) return;
    if (!keys[proveedor]) { setShowKeys(true); return; }
    setInput("");
    setMsgs((m) => [...m, { rol: "user", texto }]);
    setCargando(true);

    const ctx = contexto ? contexto() + "\n\n" : "";
    const hist = [{ role: "user", content: ctx + texto }];
    const acciones = [];
    try {
      for (let paso = 0; paso < (tools.length ? 6 : 1); paso++) {
        const { text, toolCalls } = await llamarLLM(proveedor, { apiKey: keys[proveedor], modelo: prov.modelo, system, messages: hist, tools });
        if (!toolCalls.length || !onTool) { setMsgs((m) => [...m, { rol: "bot", texto: text || "Hecho.", acciones }]); break; }
        hist.push({ role: "assistant", content: [...(text ? [{ type: "text", text }] : []), ...toolCalls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input }))] });
        const results = [];
        for (const tc of toolCalls) {
          const res = onTool(tc.name, tc.input) || {};
          acciones.push(res.resumen || res.error || tc.name);
          results.push({ type: "tool_result", tool_use_id: tc.id, name: tc.name, content: JSON.stringify({ resumen: res.resumen, error: res.error, datos: res.datos }) });
        }
        hist.push({ role: "user", content: results });
        if (paso === 5) setMsgs((m) => [...m, { rol: "bot", texto: "Hecho (límite de pasos).", acciones }]);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      const sinTokens = /\b429\b|quota|insufficient|billing|credit|exhaust|saldo|límite|limit reached|out of/i.test(msg);
      setMsgs((m) => [...m, { rol: "bot", texto: sinTokens
        ? `La IA «${prov.nombre}» no tiene tokens disponibles (sin saldo o límite). Ponte en contacto con tu administrador para revisar la API de la empresa.`
        : "Error: " + msg }]);
    } finally { setCargando(false); }
  }

  if (!abierto) return (
    <button onClick={() => setAbierto(true)} title={titulo}
      style={{ position: "fixed", right: 22, bottom: 22, zIndex: 90, width: 52, height: 52, borderRadius: 999, border: "none", cursor: "pointer", background: C.wine || C.brand || "#7c2d4d", color: "#fff", boxShadow: "var(--shadow-lg)", display: "grid", placeItems: "center" }}>
      <Sparkles size={22} />
    </button>
  );

  const acc = C.wine || C.brand || "#7c2d4d";
  const accSoft = C.wineSoft || C.brandSoft || "rgba(124,45,77,.12)";
  return (
    <div style={{ position: "fixed", right: 22, bottom: 22, zIndex: 90, width: 380, maxWidth: "calc(100vw - 32px)", height: 560, maxHeight: "calc(100vh - 90px)", background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: prov.color + "22", display: "grid", placeItems: "center" }}><Bot size={15} color={prov.color} /></div>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{titulo}</span>
        <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="es-in" style={{ width: 95, fontSize: 12, padding: "4px 6px" }}>
          {PROVEEDORES.map((p) => <option key={p.id} value={p.id}>{p.nombre}{keys[p.id] ? "" : " 🔑"}</option>)}
        </select>
        <button onClick={() => setShowKeys((v) => !v)} title="API keys" className="es-btn" style={{ padding: 6, background: showKeys ? accSoft : "var(--surface-2)", color: showKeys ? acc : C.sub, border: `1px solid ${C.line}` }}><Settings size={15} /></button>
        <button onClick={() => setAbierto(false)} className="es-btn" style={{ padding: 6, background: "var(--surface-2)", color: C.sub, border: `1px solid ${C.line}` }}><X size={15} /></button>
      </div>

      {showKeys && (
        <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, background: "var(--surface-2)", display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.4 }}>Estas keys son solo de este navegador (pruebas). La IA de la empresa se configura en el <b>Portal Scale → Configuración de empresa</b> y la heredan todas las apps; esa tiene prioridad.</div>
          {PROVEEDORES.map((p) => { const empDef = !!(aiKeys || {})[p.id]; return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 52, fontSize: 12, fontWeight: 600, color: p.color }}>{p.nombre}</span>
              {empDef
                ? <span style={{ flex: 1, fontSize: 11.5, color: C.green || "#1f9d4d", display: "flex", alignItems: "center", gap: 5 }}>✓ Configurada por la empresa</span>
                : <input type="password" className="es-in" style={{ flex: 1, fontSize: 12, padding: "5px 8px" }} placeholder={p.id === "claude" ? "sk-ant-..." : p.id === "gpt" ? "sk-..." : "AIza..."} value={keysLocal[p.id] || ""} onChange={(e) => setKey(p.id, e.target.value)} />}
            </div>
          ); })}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {!msgs.length && <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5, textAlign: "center", margin: "auto", padding: "0 10px" }}>Pregúntame lo que necesites sobre esta app.</div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.rol === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div style={{ fontSize: 13, lineHeight: 1.45, padding: "8px 11px", borderRadius: 12, background: m.rol === "user" ? acc : "var(--surface-2)", color: m.rol === "user" ? "#fff" : C.ink, border: m.rol === "user" ? "none" : `1px solid ${C.line}`, whiteSpace: "pre-wrap" }}>{m.texto}</div>
            {m.acciones?.length > 0 && <div style={{ marginTop: 4, display: "grid", gap: 2 }}>{m.acciones.map((a, j) => <div key={j} style={{ fontSize: 10.5, color: C.sub }}>✓ {a}</div>)}</div>}
          </div>
        ))}
        {cargando && <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.sub }}><Loader size={14} className="spin" />Pensando…</div>}
        <div ref={finRef} />
      </div>

      <div style={{ padding: 10, borderTop: `1px solid ${C.line}`, display: "flex", gap: 6 }}>
        <input className="es-in" style={{ flex: 1, fontSize: 13 }} placeholder="Escribe…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} disabled={cargando} />
        <button onClick={enviar} disabled={cargando || !input.trim()} className="es-btn" style={{ background: acc, color: "#fff", padding: "8px 11px", opacity: cargando || !input.trim() ? 0.5 : 1 }}><Send size={15} /></button>
      </div>
    </div>
  );
}
