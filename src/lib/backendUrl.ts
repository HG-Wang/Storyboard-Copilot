const DEFAULT_PORT = 3142;

export function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined' && (window as { __BACKEND_URL__?: string }).__BACKEND_URL__) {
    return (window as { __BACKEND_URL__?: string }).__BACKEND_URL__!;
  }
  const host = window.location.hostname;
  return `http://${host}:${DEFAULT_PORT}`;
}
