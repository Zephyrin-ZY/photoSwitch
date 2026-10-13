export function resolveApiProxyTarget(
  env: Record<string, string | undefined>,
): string {
  return env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL || 'http://localhost:7001'
}
