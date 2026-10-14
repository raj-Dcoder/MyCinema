// Electron IPC failures arrive as "Error invoking remote method 'x': Error: ..."
// — strip the machinery so users only see the human message.
export function cleanIpcError(err: unknown, fallback: string): string {
  const raw =
    (err as any)?.message ||
    (typeof err === 'string' ? err : '') ||
    fallback
  return String(raw)
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || fallback
}
