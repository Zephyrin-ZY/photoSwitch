import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveDisplayAspect } from '../src/utils/aspect.ts'

test('未加载比例且没有当前照片时回退，不因 undefined 相等而崩溃', () => {
  assert.equal(resolveDisplayAspect(null, undefined, null), null)
  assert.equal(resolveDisplayAspect(undefined, undefined, 1.5), 1.5)
})

test('未加载比例时回退到元数据比例', () => {
  assert.equal(resolveDisplayAspect(null, 'a', 1.5), 1.5)
})

test('比例属于其他照片时回退', () => {
  assert.equal(resolveDisplayAspect({ hash: 'b', aspect: 2 }, 'a', 1.5), 1.5)
})

test('比例与当前照片匹配时使用实际加载比例', () => {
  assert.equal(resolveDisplayAspect({ hash: 'a', aspect: 2 }, 'a', 1.5), 2)
})

test('当前照片缺失时不会误用已加载比例', () => {
  assert.equal(resolveDisplayAspect({ hash: 'a', aspect: 2 }, undefined, 1.5), 1.5)
})
