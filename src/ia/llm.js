/* ============================================================================
   llm.js — Adaptadores de proveedor para el chat IA de P-Scale.

   Tres proveedores: Claude (Anthropic, por defecto), GPT (OpenAI), Gemini
   (Google). Cada uno expone una función que recibe { system, messages, tools }
   en formato neutro y devuelve { text, toolCalls:[{id,name,input}] }.

   Las tools vienen de agent.toolSpecs() (formato neutro: {name,description,
   params:{<n>:{type,description,required}}}). Cada adaptador las traduce al
   esquema de su API.

   Las API keys las pone el usuario en la tuerca; se guardan en localStorage del
   navegador (NO en el servidor). Las llamadas van directas del navegador a cada
   proveedor — pensado para pruebas; en producción real se haría vía backend.
============================================================================ */

export const PROVEEDORES = [
  { id: "claude", nombre: "Claude", modelo: "claude-opus-4-8", color: "#d97757" },
  { id: "gpt", nombre: "GPT", modelo: "gpt-4o", color: "#10a37f" },
  { id: "gemini", nombre: "Gemini", modelo: "gemini-2.0-flash", color: "#4285f4" },
];

const LS_KEY = "pscale.llm.keys";
export const cargarKeys = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
export const guardarKeys = (k) => { try { localStorage.setItem(LS_KEY, JSON.stringify(k)); } catch {} };

// JSON Schema de parámetros a partir del formato neutro de la tool.
function paramsAJsonSchema(params = {}) {
  const properties = {}; const required = [];
  for (const [k, p] of Object.entries(params)) {
    const prop = { type: p.type === "array" ? "array" : p.type === "number" ? "number" : p.type === "boolean" ? "boolean" : p.type === "object" ? "object" : "string" };
    if (p.description) prop.description = p.description;
    if (p.type === "array") prop.items = { type: "string" };
    properties[k] = prop;
    if (p.required) required.push(k);
  }
  return { type: "object", properties, required };
}

/* --- CLAUDE (Anthropic) ----------------------------------------------------- */
async function llamarClaude({ apiKey, modelo, system, messages, tools }) {
  const body = {
    model: modelo || "claude-opus-4-8",
    max_tokens: 2048,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: paramsAJsonSchema(t.params) })),
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  let text = ""; const toolCalls = [];
  for (const b of data.content || []) {
    if (b.type === "text") text += b.text;
    else if (b.type === "tool_use") toolCalls.push({ id: b.id, name: b.name, input: b.input || {} });
  }
  return { text, toolCalls, raw: data };
}

/* --- GPT (OpenAI) ----------------------------------------------------------- */
async function llamarGPT({ apiKey, modelo, system, messages, tools }) {
  const msgs = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") { msgs.push({ role: m.role, content: m.content }); continue; }
    // Reconstruye tool_calls/tool results del formato neutro (ver ChatIA).
    for (const c of m.content) {
      if (c.type === "text") msgs.push({ role: m.role, content: c.text });
      else if (c.type === "tool_use") msgs.push({ role: "assistant", content: null, tool_calls: [{ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input || {}) } }] });
      else if (c.type === "tool_result") msgs.push({ role: "tool", tool_call_id: c.tool_use_id, content: typeof c.content === "string" ? c.content : JSON.stringify(c.content) });
    }
  }
  const body = {
    model: modelo || "gpt-4o",
    messages: msgs,
    tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: paramsAJsonSchema(t.params) } })),
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GPT ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const msg = data.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({ id: tc.id, name: tc.function.name, input: safeParse(tc.function.arguments) }));
  return { text: msg.content || "", toolCalls, raw: data };
}

/* --- GEMINI (Google) -------------------------------------------------------- */
async function llamarGemini({ apiKey, modelo, system, messages, tools }) {
  const contents = [];
  for (const m of messages) {
    if (typeof m.content === "string") { contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }); continue; }
    for (const c of m.content) {
      if (c.type === "text") contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: c.text }] });
      else if (c.type === "tool_use") contents.push({ role: "model", parts: [{ functionCall: { name: c.name, args: c.input || {} } }] });
      else if (c.type === "tool_result") contents.push({ role: "user", parts: [{ functionResponse: { name: c.name || "tool", response: { result: typeof c.content === "string" ? c.content : c.content } } }] });
    }
  }
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: paramsAJsonSchema(t.params) })) }],
  };
  const mdl = modelo || "gemini-2.0-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  let text = ""; const toolCalls = [];
  for (const p of parts) {
    if (p.text) text += p.text;
    else if (p.functionCall) toolCalls.push({ id: "g_" + Math.random().toString(36).slice(2), name: p.functionCall.name, input: p.functionCall.args || {} });
  }
  return { text, toolCalls, raw: data };
}

const safeParse = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// ¿el error indica falta de tokens/saldo/cuota (no un fallo de red o de petición)?
export function esErrorCuota(e) {
  const m = (e?.message || String(e || "")).toLowerCase();
  return /\b429\b|quota|insufficient|billing|credit|exhaust|saldo|limit reached|out of|rate limit|payment|balance/.test(m);
}

// Punto de entrada: enruta al proveedor. Devuelve { text, toolCalls }.
export async function llamarLLM(proveedorId, opts) {
  if (proveedorId === "gpt") return llamarGPT(opts);
  if (proveedorId === "gemini") return llamarGemini(opts);
  return llamarClaude(opts);
}

// Llama con FALLBACK automático: prueba el proveedor preferido y, si se queda
// sin tokens (cuota), pasa al siguiente del `orden` que tenga key, hasta agotar.
//   prefer  proveedor habilitado (predeterminado)
//   orden   ["claude","gpt","gemini"] preferencia configurada por el admin
//   keys    { claude, gpt, gemini }
//   modeloDe(id) -> modelo a usar para ese proveedor
// Devuelve { text, toolCalls, proveedorUsado, cambioDesde|null } o lanza si
// ninguna IA con key responde (o el error no es de cuota -> se propaga).
export async function llamarConFallback({ prefer, orden, keys, modeloDe, system, messages, tools }) {
  // Cadena: el preferido primero, luego el resto del orden, solo los que tienen key.
  const cadena = [prefer, ...(orden || ["claude", "gpt", "gemini"]).filter((p) => p !== prefer)]
    .filter((p, i, a) => p && a.indexOf(p) === i && keys?.[p]);
  if (!cadena.length) { const err = new Error("Sin ninguna IA configurada (faltan API keys)."); err.sinConfig = true; throw err; }
  let cambioDesde = null;
  for (let i = 0; i < cadena.length; i++) {
    const id = cadena[i];
    try {
      const r = await llamarLLM(id, { apiKey: keys[id], modelo: modeloDe ? modeloDe(id) : undefined, system, messages, tools });
      return { ...r, proveedorUsado: id, cambioDesde };
    } catch (e) {
      const ultimo = i === cadena.length - 1;
      if (esErrorCuota(e) && !ultimo) { cambioDesde = cambioDesde || prefer; continue; } // pasa a la siguiente
      e.proveedorUsado = id; e.cambioDesde = cambioDesde; throw e;
    }
  }
}
