import * as React from "react";

export interface FuenteDef {
  id: string;
  label: string;
  labelEn?: string;
  desc?: string;
  descEn?: string;
  color: string;
  ready: boolean;
}

export const DEFAULT_FUENTES: FuenteDef[];

export interface OrigenDatosPanelProps {
  empId: string;
  companyId?: string;
  L?: (es: React.ReactNode, en?: React.ReactNode) => React.ReactNode;
  fuentesDisponibles?: FuenteDef[];
  storageKeyPrefix?: string;
  titulo?: React.ReactNode;
  subtitulo?: React.ReactNode;
  getAccessToken?: () => Promise<string | null>;
  onImportRows?: (rows: any[]) => Promise<{ nuevos: number; act: number }>;
  renderExcelWizard?: (onConfirm: (rows: any[]) => void, onCancel: () => void) => React.ReactNode;
  onSharePointFile?: (file: { contentBase64: string; filename: string }) => void;
  onBusinessCentralReady?: (data: { companies: { id: string; name: string; displayName: string }[] }) => void;
}

export function OrigenDatosPanel(props: OrigenDatosPanelProps): React.JSX.Element;
