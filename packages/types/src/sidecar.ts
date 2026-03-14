export interface SidecarRequest {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export type SidecarResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

export interface SidecarEvent {
  event: string;
  payload: unknown;
}
