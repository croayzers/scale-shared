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
}

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
