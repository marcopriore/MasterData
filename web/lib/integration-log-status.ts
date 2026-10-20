export function integrationStatusTone(statusCode: number | null, success: boolean): 'ok' | 'error' | 'unknown' {
  if (success || (statusCode != null && statusCode >= 200 && statusCode < 300)) return 'ok'
  if (statusCode != null && statusCode >= 400) return 'error'
  if (!success) return 'error'
  return 'unknown'
}
