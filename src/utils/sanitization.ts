// Helper functions for URL and logging
export function sanitizeRoomName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100)
}

export function getRoomNameFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const room = params.get('room')
  return room ? sanitizeRoomName(room) : null
}

export function getReturnUrl(): string {
  const params = new URLSearchParams(window.location.search)
  const returnUrl = params.get('returnUrl')
  return returnUrl || import.meta.env.VITE_MAIN_APP_URL || 'https://vmtb.in'
}

export function debugLog(message: string, data?: unknown): void {
  if (import.meta.env.VITE_DEBUG === 'true') {
    console.log(`[JITSI-FRONTEND] ${message}`, data || '')
  }
}
