/** Estado de uma dependência no `GET /health` (RF-008). Lista permitida: outro valor vira `UNREACHABLE`. */
export const DOWNSTREAM_STATUSES = ['CONNECTED', 'DEGRADED', 'UNREACHABLE'] as const;
export type DownstreamStatus = (typeof DOWNSTREAM_STATUSES)[number];

export function isDownstreamStatus(value: unknown): value is DownstreamStatus {
  return typeof value === 'string' && (DOWNSTREAM_STATUSES as readonly string[]).includes(value);
}
