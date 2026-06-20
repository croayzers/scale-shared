import * as React from "react";

export interface ChatIAProps {
  aiProvider?: "claude" | "gpt" | "gemini" | null;
  aiKeys?: { claude?: string; gpt?: string; gemini?: string };
  system: string;
  titulo?: string;
  contexto?: () => string;
  tools?: Array<{ name: string; description?: string; params?: Record<string, unknown> }>;
  onTool?: (name: string, input: unknown) => { resumen?: string; error?: string; datos?: unknown };
  C: Record<string, string>;
  FONT?: string;
}

export const ChatIA: React.FC<ChatIAProps>;

export interface Proveedor { id: string; nombre: string; modelo: string; color: string }
export const PROVEEDORES: Proveedor[];
export function cargarKeys(): Record<string, string>;
export function guardarKeys(k: Record<string, string>): void;
export function llamarLLM(proveedorId: string, opts: {
  apiKey: string; modelo?: string; system: string;
  messages: Array<{ role: string; content: unknown }>;
  tools?: unknown[];
}): Promise<{ text: string; toolCalls: Array<{ id: string; name: string; input: unknown }> }>;
