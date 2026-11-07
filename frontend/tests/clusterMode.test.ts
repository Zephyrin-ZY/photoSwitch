import test from 'node:test'
import assert from 'node:assert/strict'

import { defaultClusterMode, loadClusterMode, saveClusterMode } from '../src/utils/clusterMode.ts'

test('默认模式按设备类型决定', () => {
  assert.equal(defaultClusterMode(true), 'review')
  assert.equal(defaultClusterMode(false), 'tournament')
})

test('无 localStorage 时回退到默认值', () => {
  assert.equal(loadClusterMode(true), 'review')
  assert.equal(loadClusterMode(false), 'tournament')
  assert.doesNotThrow(() => saveClusterMode('tournament'))
})

test('记忆值可读回，非法值回退默认', () => {
  const store = new Map<string, string>()
  const globals = globalThis as { localStorage?: Storage }
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
  } as Storage

  try {
    saveClusterMode('tournament')
    assert.equal(loadClusterMode(true), 'tournament')
    saveClusterMode('review')
    assert.equal(loadClusterMode(false), 'review')

    store.set('photoswitch.clusterMode', 'garbage')
    assert.equal(loadClusterMode(true), 'review')
    assert.equal(loadClusterMode(false), 'tournament')
  } finally {
    delete globals.localStorage
  }
})
