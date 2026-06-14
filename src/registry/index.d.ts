export interface AppRow {
  id: string;
  nombre: string;
  emoji: string | null;
  color: string | null;
  url_prod: string | null;
  url_dev: string | null;
  activa: boolean;
  orden: number;
}

export const FALLBACK_APPS: AppRow[];
export function appUrl(app: AppRow, opts?: { dev?: boolean }): string | null;
export function cargarApps(sb: any): Promise<AppRow[]>;
export function crearResolveAppUrl(apps: AppRow[], opts?: { dev?: boolean }): (appId: string) => string | null;
