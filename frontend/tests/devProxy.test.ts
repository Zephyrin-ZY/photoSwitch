import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveApiProxyTarget } from '../src/utils/devProxy.ts'

test('prefers explicit dev proxy target when provided', () => {
  assert.equal(
    resolveApiProxyTarget({
      VITE_API_PROXY_TARGET: 'http://host.docker.internal:7001',
      VITE_API_BASE_URL: 'http://localhost:7001',
    }),
    'http://host.docker.internal:7001',
  )
})

test('falls back to VITE_API_BASE_URL and then localhost default', () => {
  assert.equal(
    resolveApiProxyTarget({
      VITE_API_BASE_URL: 'http://127.0.0.1:7001',
    }),
    'http://127.0.0.1:7001',
  )

  assert.equal(resolveApiProxyTarget({}), 'http://localhost:7001')
})
