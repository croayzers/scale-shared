/* ===========================================================================
 * Origen de datos por empresa (genérico, cross-app). Cada empresa conecta SU
 * propia fuente: Excel/CSV local, SharePoint (Lista o archivo Excel) o
 * Business Central — todo vía BYOK (credenciales de Azure de la empresa,
 * verificadas y guardadas en el backend común de S-Scale, app_connections).
 *
 * El componente NO conoce el modelo de datos de cada app (camareros,
 * materiales...): la app decide qué hace con las filas/archivo recibido vía
 * props (renderExcelWizard, onImportRows, onSharePointFile). Estilos vía CSS
 * vars (--brand, --surface, --text...), igual que ChatBase/PresenceAvatars.
 *
 * Props:
 *   empId                 id de la empresa (clave de localStorage)
 *   companyId             id real de empresa para el backend (default: empId)
 *   L                     (es, en) => texto. Si no se pasa, usa "es" siempre.
 *   fuentesDisponibles     [{id,label,labelEn,desc,descEn,color,ready}] — qué
 *                          fuentes mostrar. Si no se pasa, usa DEFAULT_FUENTES.
 *   storageKeyPrefix       prefijo de localStorage, ej. "pscale.origen."
 *   titulo / subtitulo     textos del header (qué se está conectando)
 *   getAccessToken()       => Promise<string|null> token de la sesión actual
 *   onImportRows(rows)     => Promise<{nuevos,act}> — resultado de SharePoint List
 *   renderExcelWizard(onConfirm, onCancel) => ReactNode — wizard de Excel LOCAL
 *   onSharePointFile({contentBase64, filename}) — archivo elegido de SharePoint;
 *                          la app decide qué hacer (normalmente abrirlo con el
 *                          mismo wizard que el Excel local)
 *   onBusinessCentralReady({companies}) — tras conectar BC, antes de elegir compañía
 * ======================================================================== */
import React, { useState } from "react";
import { Cloud, ChevronDown, Link2, RefreshCw, Loader, Check, AlertTriangle, FileSpreadsheet, Search, Building2 } from "lucide-react";

export const DEFAULT_FUENTES = [
  { id: "excel", label: "Excel / CSV", labelEn: "Excel / CSV", desc: "Sube tu archivo (sin configuración)", descEn: "Upload your file (no setup)", color: "#1D6F42", ready: true },
  { id: "sharepoint", label: "SharePoint List", labelEn: "SharePoint List", desc: "Lista de SharePoint de tu empresa", descEn: "Your company's SharePoint list", color: "#038387", ready: true },
  { id: "sharepoint-file", label: "Excel en SharePoint", labelEn: "Excel on SharePoint", desc: "Busca el archivo en tu SharePoint", descEn: "Find the file in your SharePoint", color: "#0078D4", ready: true },
  { id: "businesscentral", label: "Business Central", labelEn: "Business Central", desc: "Conecta tu Dynamics 365", descEn: "Connect your Dynamics 365", color: "#7A1F3D", ready: true },
];

const inStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-strong,#d1d5db)", fontSize: 13, background: "var(--surface,#fff)", color: "var(--text,#111)", boxSizing: "border-box" };
const btnBase = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" };

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--text-2,#6b7280)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

export function OrigenDatosPanel({
  empId, companyId: companyIdProp, L: LProp,
  fuentesDisponibles = DEFAULT_FUENTES, storageKeyPrefix,
  titulo, subtitulo,
  getAccessToken, onImportRows, renderExcelWizard, onSharePointFile, onBusinessCentralReady,
}) {
  const L = LProp || ((es) => es);
  const LS = (storageKeyPrefix || "scale.origen.") + empId;
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(() => { try { return JSON.parse(localStorage.getItem(LS)) || { tipo: fuentesDisponibles[0]?.id }; } catch { return { tipo: fuentesDisponibles[0]?.id }; } });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [files, setFiles] = useState(null);
  const [bcCompanies, setBcCompanies] = useState(null);

  const save = (patch) => { const n = { ...cfg, ...patch }; setCfg(n); try { localStorage.setItem(LS, JSON.stringify(n)); } catch {} };
  const tipo = cfg.tipo || fuentesDisponibles[0]?.id;
  const base = (cfg.backend || "").replace(/\/$/, "");
  const companyId = companyIdProp || cfg.companyId || empId;

  const authHeaders = async () => {
    const token = (await getAccessToken?.()) || null;
    return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
  };

  const onWizardConfirm = async (rows) => {
    setWizard(false);
    setMsg({ type: "ok", text: L("Importando…", "Importing…") });
    try {
      const { nuevos, act } = await onImportRows(rows);
      setMsg({ type: "ok", text: L(`Importados ${rows.length} registros · ${nuevos} nuevos, ${act} actualizados.`, `Imported ${rows.length} records · ${nuevos} new, ${act} updated.`) });
    } catch (e) {
      setMsg({ type: "err", text: L("Error al importar: ", "Import error: ") + (e?.message || e) });
    }
  };

  // --- SharePoint List (BYOK vía S-Scale) ---
  const spCreds = () => ({ tenant: cfg.tenant, clientId: cfg.clientId, clientSecret: cfg.clientSecret, siteUrl: cfg.siteUrl, listId: cfg.listId });
  const spConectar = async () => {
    if (!base) return setMsg({ type: "err", text: L("Indica la URL del backend (S-Scale).", "Enter the backend URL (S-Scale).") });
    if (!cfg.tenant || !cfg.clientId || !cfg.clientSecret) return setMsg({ type: "err", text: L("Faltan tenant, client_id o client_secret.", "Missing tenant, client_id or client_secret.") });
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${base}/api/sharepoint/connect`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ companyId, creds: spCreds() }) });
      const d = await res.json();
      setMsg(res.ok ? { type: "ok", text: d.message || L("SharePoint conectado y verificado.", "SharePoint connected and verified.") } : { type: "err", text: d.message || d.error || L("No se pudo conectar.", "Could not connect.") });
    } catch { setMsg({ type: "err", text: L("No se pudo contactar con el backend.", "Could not reach the backend.") }); }
    finally { setBusy(false); }
  };
  const spImportar = async () => {
    if (!base) return setMsg({ type: "err", text: L("Indica la URL del backend (S-Scale).", "Enter the backend URL (S-Scale).") });
    if (!cfg.siteUrl || !cfg.listId) return setMsg({ type: "err", text: L("Falta la URL del sitio o el List ID.", "Missing the site URL or List ID.") });
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${base}/api/sharepoint/import`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ companyId }) });
      const d = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: d.message || d.error || L("No se pudo importar.", "Could not import.") }); return; }
      const rows = d.camareros || d.rows || [];
      setMsg({ type: "ok", text: L("Importando…", "Importing…") });
      const { nuevos, act } = await onImportRows(rows);
      setMsg({ type: "ok", text: L(`Importados ${rows.length} registros · ${nuevos} nuevos, ${act} actualizados.`, `Imported ${rows.length} records · ${nuevos} new, ${act} updated.`) });
    } catch (e) { setMsg({ type: "err", text: L("No se pudo importar: ", "Could not import: ") + (e?.message || e) }); }
    finally { setBusy(false); }
  };

  // --- Excel en SharePoint (archivo, no lista) ---
  const spBuscarArchivos = async (q) => {
    if (!base) return setMsg({ type: "err", text: L("Indica la URL del backend (S-Scale).", "Enter the backend URL (S-Scale).") });
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${base}/api/sharepoint/files/list`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ companyId, q }) });
      const d = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: d.message || d.error || L("No se pudo listar archivos.", "Could not list files.") }); return; }
      setFiles(d.files || []);
    } catch { setMsg({ type: "err", text: L("No se pudo contactar con el backend.", "Could not reach the backend.") }); }
    finally { setBusy(false); }
  };
  const spElegirArchivo = async (file) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${base}/api/sharepoint/files/content`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ companyId, itemId: file.id }) });
      const d = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: d.message || d.error || L("No se pudo descargar el archivo.", "Could not download the file.") }); return; }
      onSharePointFile?.({ contentBase64: d.contentBase64, filename: file.name });
    } catch { setMsg({ type: "err", text: L("No se pudo descargar el archivo.", "Could not download the file.") }); }
    finally { setBusy(false); }
  };

  // --- Business Central (BYOK vía S-Scale, conector base) ---
  const bcCreds = () => ({ tenant: cfg.tenant, clientId: cfg.clientId, clientSecret: cfg.clientSecret, environment: cfg.environment });
  const bcConectar = async () => {
    if (!base) return setMsg({ type: "err", text: L("Indica la URL del backend (S-Scale).", "Enter the backend URL (S-Scale).") });
    if (!cfg.tenant || !cfg.clientId || !cfg.clientSecret || !cfg.environment) return setMsg({ type: "err", text: L("Faltan tenant, client_id, client_secret o environment.", "Missing tenant, client_id, client_secret or environment.") });
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${base}/api/businesscentral/connect`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ companyId, creds: bcCreds() }) });
      const d = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: d.message || d.error || L("No se pudo conectar.", "Could not connect.") }); return; }
      setBcCompanies(d.companies || []);
      onBusinessCentralReady?.({ companies: d.companies || [] });
      setMsg({ type: "ok", text: d.companies?.length ? L("Conectado. Elige tu compañía.", "Connected. Choose your company.") : L("Conectado, pero no se encontraron compañías.", "Connected, but no companies were found.") });
    } catch { setMsg({ type: "err", text: L("No se pudo contactar con el backend.", "Could not reach the backend.") }); }
    finally { setBusy(false); }
  };
  const bcElegirCompania = async (bcCompanyId) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${base}/api/businesscentral/select-company`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ companyId, bcCompanyId }) });
      const d = await res.json();
      setMsg(res.ok ? { type: "ok", text: L("Compañía seleccionada.", "Company selected.") } : { type: "err", text: d.message || d.error || L("No se pudo guardar.", "Could not save.") });
    } catch { setMsg({ type: "err", text: L("No se pudo contactar con el backend.", "Could not reach the backend.") }); }
    finally { setBusy(false); }
  };

  const fuente = fuentesDisponibles.find((f) => f.id === tipo) || fuentesDisponibles[0];
  const fL = (f) => L(f.label, f.labelEn), fD = (f) => L(f.desc, f.descEn);

  return (
    <div style={{ borderRadius: 14, marginBottom: 14, overflow: "hidden", border: "1px solid var(--border,#e5e7eb)", background: "var(--surface,#fff)" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--surface,#fff)", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: fuente.color + "22", display: "grid", placeItems: "center", flexShrink: 0 }}><Cloud size={18} color={fuente.color} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text,#111)" }}>{titulo || L("Origen de datos", "Data source")}</div>
          <div style={{ fontSize: 12, color: "var(--text-2,#6b7280)" }}>{subtitulo || L("Conecta la fuente de esta empresa", "Connect this company's source")} · {fL(fuente)}</div>
        </div>
        <ChevronDown size={18} color="var(--text-2,#6b7280)" style={{ transform: open ? "rotate(180deg)" : "none", transition: ".15s", flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ padding: 16, borderTop: "1px solid var(--border,#e5e7eb)", background: "var(--surface-2,#f9fafb)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {fuentesDisponibles.map((f) => {
              const on = f.id === tipo;
              return (
                <button key={f.id} onClick={() => f.ready && save({ tipo: f.id })} disabled={!f.ready}
                  style={{ flex: "1 1 150px", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${on ? f.color : "var(--border,#e5e7eb)"}`, background: on ? f.color + "12" : "var(--surface,#fff)", cursor: f.ready ? "pointer" : "not-allowed", opacity: f.ready ? 1 : 0.5 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: "var(--text,#111)" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: f.color, flexShrink: 0 }} />
                    {fL(f)}{!f.ready && <span style={{ fontSize: 10, color: "var(--text-2,#6b7280)", fontWeight: 500 }}>· {L("pronto", "soon")}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-2,#6b7280)", marginTop: 3 }}>{fD(f)}</div>
                </button>
              );
            })}
          </div>

          {tipo === "excel" && (
            <div>
              <button style={{ ...btnBase, background: "var(--brand,#6366f1)", color: "#fff" }} onClick={() => setWizard(true)}>
                <FileSpreadsheet size={15} />{L("Importar Excel", "Import Excel")}
              </button>
              <div style={{ fontSize: 11.5, color: "var(--text-2,#6b7280)", marginTop: 10, lineHeight: 1.5 }}>
                {L("Sube tu .xlsx o .csv y empareja tus columnas con los campos de la app.", "Upload your .xlsx or .csv and match your columns to the app fields.")}
              </div>
            </div>
          )}

          {tipo === "sharepoint" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label={L("URL del backend (S-Scale)", "Backend URL (S-Scale)")}><input style={inStyle} placeholder="https://social.thescaleapps.com" value={cfg.backend || ""} onChange={(e) => save({ backend: e.target.value })} /></Field>
                <Field label={L("Tenant (ID o dominio)", "Tenant (ID or domain)")}><input style={inStyle} placeholder="tuempresa.onmicrosoft.com" value={cfg.tenant || ""} onChange={(e) => save({ tenant: e.target.value })} /></Field>
                <Field label="Client ID"><input style={inStyle} placeholder={L("GUID de la app de Azure", "Azure app GUID")} value={cfg.clientId || ""} onChange={(e) => save({ clientId: e.target.value })} /></Field>
                <Field label="Client Secret"><input style={inStyle} type="password" placeholder="••••••••" value={cfg.clientSecret || ""} onChange={(e) => save({ clientSecret: e.target.value })} /></Field>
                <Field label={L("URL del sitio", "Site URL")}><input style={inStyle} placeholder="https://tuempresa.sharepoint.com/sites/Personal" value={cfg.siteUrl || ""} onChange={(e) => save({ siteUrl: e.target.value })} /></Field>
                <Field label={L("List ID (o nombre)", "List ID (or name)")}><input style={inStyle} placeholder="Camareros" value={cfg.listId || ""} onChange={(e) => save({ listId: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button style={{ ...btnBase, background: "var(--surface,#fff)", color: "var(--text,#111)", border: "1px solid var(--border-strong,#d1d5db)", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={spConectar}><Link2 size={15} />{L("Conectar y verificar", "Connect & verify")}</button>
                <button style={{ ...btnBase, background: "var(--brand,#6366f1)", color: "#fff", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={spImportar}>{busy ? <Loader size={15} className="spin" /> : <RefreshCw size={15} />}{L("Importar", "Import")}</button>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-2,#6b7280)", marginTop: 10, lineHeight: 1.5 }}>
                {L("Cada empresa registra su propia app en su Azure AD (permiso de aplicación Sites.Read.All + consentimiento de admin).", "Each company registers its own app in its Azure AD (application permission Sites.Read.All + admin consent).")}
              </div>
            </div>
          )}

          {tipo === "sharepoint-file" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label={L("URL del backend (S-Scale)", "Backend URL (S-Scale)")}><input style={inStyle} placeholder="https://social.thescaleapps.com" value={cfg.backend || ""} onChange={(e) => save({ backend: e.target.value })} /></Field>
                <Field label={L("Tenant (ID o dominio)", "Tenant (ID or domain)")}><input style={inStyle} placeholder="tuempresa.onmicrosoft.com" value={cfg.tenant || ""} onChange={(e) => save({ tenant: e.target.value })} /></Field>
                <Field label="Client ID"><input style={inStyle} placeholder={L("GUID de la app de Azure", "Azure app GUID")} value={cfg.clientId || ""} onChange={(e) => save({ clientId: e.target.value })} /></Field>
                <Field label="Client Secret"><input style={inStyle} type="password" placeholder="••••••••" value={cfg.clientSecret || ""} onChange={(e) => save({ clientSecret: e.target.value })} /></Field>
                <Field label={L("URL del sitio", "Site URL")}><input style={inStyle} placeholder="https://tuempresa.sharepoint.com/sites/Materiales" value={cfg.siteUrl || ""} onChange={(e) => save({ siteUrl: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button style={{ ...btnBase, background: "var(--surface,#fff)", color: "var(--text,#111)", border: "1px solid var(--border-strong,#d1d5db)", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={spConectar}><Link2 size={15} />{L("Conectar y verificar", "Connect & verify")}</button>
                <button style={{ ...btnBase, background: "var(--brand,#6366f1)", color: "#fff", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => spBuscarArchivos()}>{busy ? <Loader size={15} className="spin" /> : <Search size={15} />}{L("Buscar archivos", "Search files")}</button>
              </div>
              {files && (
                <div style={{ marginTop: 10, border: "1px solid var(--border,#e5e7eb)", borderRadius: 9, overflow: "hidden" }}>
                  {files.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: "var(--text-2,#6b7280)" }}>{L("Sin archivos Excel/CSV en este sitio.", "No Excel/CSV files in this site.")}</div>}
                  {files.map((f) => (
                    <button key={f.id} onClick={() => spElegirArchivo(f)} disabled={busy}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid var(--border,#e5e7eb)", background: "var(--surface,#fff)", cursor: "pointer", textAlign: "left", fontSize: 12.5, color: "var(--text,#111)" }}>
                      <FileSpreadsheet size={14} color="var(--text-2,#6b7280)" />{f.name}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: "var(--text-2,#6b7280)", marginTop: 10, lineHeight: 1.5 }}>
                {L("Elige el archivo directamente desde el SharePoint de tu empresa, sin descargarlo a tu equipo.", "Pick the file straight from your company's SharePoint, no need to download it first.")}
              </div>
            </div>
          )}

          {tipo === "businesscentral" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label={L("URL del backend (S-Scale)", "Backend URL (S-Scale)")}><input style={inStyle} placeholder="https://social.thescaleapps.com" value={cfg.backend || ""} onChange={(e) => save({ backend: e.target.value })} /></Field>
                <Field label={L("Tenant (ID o dominio)", "Tenant (ID or domain)")}><input style={inStyle} placeholder="tuempresa.onmicrosoft.com" value={cfg.tenant || ""} onChange={(e) => save({ tenant: e.target.value })} /></Field>
                <Field label="Client ID"><input style={inStyle} placeholder={L("GUID de la app de Azure", "Azure app GUID")} value={cfg.clientId || ""} onChange={(e) => save({ clientId: e.target.value })} /></Field>
                <Field label="Client Secret"><input style={inStyle} type="password" placeholder="••••••••" value={cfg.clientSecret || ""} onChange={(e) => save({ clientSecret: e.target.value })} /></Field>
                <Field label="Environment"><input style={inStyle} placeholder="Production" value={cfg.environment || ""} onChange={(e) => save({ environment: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button style={{ ...btnBase, background: "var(--brand,#6366f1)", color: "#fff", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={bcConectar}>{busy ? <Loader size={15} className="spin" /> : <Building2 size={15} />}{L("Conectar y verificar", "Connect & verify")}</button>
              </div>
              {bcCompanies && bcCompanies.length > 0 && (
                <div style={{ marginTop: 10, border: "1px solid var(--border,#e5e7eb)", borderRadius: 9, overflow: "hidden" }}>
                  {bcCompanies.map((c) => (
                    <button key={c.id} onClick={() => bcElegirCompania(c.id)} disabled={busy}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid var(--border,#e5e7eb)", background: cfg.bcCompanyId === c.id ? "var(--brand,#6366f1)1a" : "var(--surface,#fff)", cursor: "pointer", textAlign: "left", fontSize: 12.5, color: "var(--text,#111)" }}>
                      <Building2 size={14} color="var(--text-2,#6b7280)" />{c.displayName || c.name}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: "var(--text-2,#6b7280)", marginTop: 10, lineHeight: 1.5 }}>
                {L("Conector base: solo verifica credenciales y deja elegir la compañía. La sincronización de datos concretos llegará más adelante.", "Base connector: only verifies credentials and lets you pick the company. Syncing specific data comes later.")}
              </div>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 9, fontSize: 12.5, background: msg.type === "ok" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: msg.type === "ok" ? "#10b981" : "#ef4444", display: "flex", gap: 7, alignItems: "center" }}>
              {msg.type === "ok" ? <Check size={14} /> : <AlertTriangle size={14} />}{msg.text}
            </div>
          )}
        </div>
      )}

      {wizard && renderExcelWizard && renderExcelWizard(onWizardConfirm, () => setWizard(false))}
    </div>
  );
}
