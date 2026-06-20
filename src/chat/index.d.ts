import * as React from "react";

export interface ChatMember {
  user_id: string;
  email?: string | null;
  nombre?: string | null;
  rol?: string | null;
}

export interface ChatComandoSugerencia {
  valor: string;
  label?: string;
  sub?: string;
  member?: ChatMember;
}

export interface ChatComando {
  tipo: string;
  trigger: "/" | "#";
  sugerencias: (query: string) => ChatComandoSugerencia[];
  ejecutar?: (valor: string) => void;
}

export interface ChatBaseProps {
  sb: any;
  appId: string;
  empresa: { id: string } | null;
  currentUser: { id: string; email?: string } | null;
  miembros?: ChatMember[];
  comandos?: ChatComando[];
  resolveAppUrl?: (appId: string) => string | null;
  onUnreadChange?: (n: number) => void;
  onEventoLocal?: (e: { trigger: string; valor: string; tipo: string; notif: any }) => void;
  ia?: ChatIAConfig;
}

// Config de la IA integrada en el panel (heredada del Portal Scale).
export interface ChatIAConfig {
  enabled?: boolean;                 // false = oculta la pestaña IA
  provider?: "claude" | "gpt" | "gemini" | null;  // habilitada en el Portal (predeterminada)
  keys?: { claude?: string; gpt?: string; gemini?: string };  // heredadas del Portal
  system: string;                    // system prompt de la app
  prompts?: Array<string | { label: string; prompt: string }>;  // prompts predefinidos
  tools?: unknown[];                 // tool specs (opcional, para acciones)
  onTool?: (name: string, input: unknown) => { resumen?: string; error?: string; datos?: unknown };
}

export interface NotificacionInput {
  companyId: string;
  actorId?: string | null;
  actorNombre?: string | null;
  appId: string;
  tipo: string;
  titulo: string;
  recursoLabel?: string | null;
  cmd?: string | null;
}
export function crearNotificacion(sb: any, n: NotificacionInput): Promise<any>;
export function cargarNotificaciones(sb: any, companyId: string, limit?: number): Promise<any[]>;
export function suscribirNotificaciones(sb: any, companyId: string, onNew: (n: any) => void): () => void;
export function cargarUltimaVez(sb: any, companyId: string, userId: string): Promise<string | null>;
export function marcarVistoAhora(sb: any, companyId: string, userId: string): Promise<void>;

export interface ChatBaseHandle {
  openPanel: () => void;
  openConversation: (user: ChatMember) => void;
}

export const ChatBase: React.ForwardRefExoticComponent<
  ChatBaseProps & React.RefAttributes<ChatBaseHandle>
>;

export function BellButton(props: {
  unread?: number;
  onClick?: () => void;
  title?: string;
  size?: number;
}): React.JSX.Element;

export function cargarTodosMensajes(sb: any, companyId: string): Promise<any[]>;
export function enviarMensaje(sb: any, companyId: string, fromUserId: string, toUserId: string, message: string): Promise<any>;
export function marcarLeidos(sb: any, companyId: string, myId: string, fromId: string): Promise<void>;
export function suscribirMensajes(sb: any, companyId: string, onNewMessage: (msg: any) => void): () => void;
export function cargarMiembros(sb: any, companyId: string): Promise<ChatMember[]>;

export function serializarToken(trigger: string, valor: string, appId: string): string;
export function parsearMensaje(texto: string): Array<{ tipo: string; valor: string; trigger?: string; appId?: string; raw?: string }>;
export function construirDeepLink(appUrl: string | null, trigger: string, valor: string): string | null;
export function leerCmdDeUrl(): { trigger: string; valor: string } | null;
export function detectarAutocompletar(texto: string, cursor: number, comandos: ChatComando[], miembros: ChatMember[]): any;

export interface PresenceUser {
  user_id: string;
  email?: string | null;
  nombre?: string | null;
  app_id?: string;
  online_at?: string;
}
export function suscribirPresencia(
  sb: any,
  companyId: string,
  currentUser: { id: string; email?: string },
  appId: string,
  onSync: (users: PresenceUser[]) => void
): () => void;

export function PresenceAvatars(props: {
  sb: any;
  companyId: string;
  currentUser: { id: string; email?: string } | null;
  appId: string;
  max?: number;
  size?: number;
}): React.JSX.Element | null;

export function Avatar(props: { member: ChatMember | PresenceUser; size?: number }): React.JSX.Element;
export function avatarColor(userId: string | null | undefined): string;
export function iniciales(nombre: string | null | undefined): string;
