import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getFilterCounts,
  getFilterSummary,
} from '../src/utils/filterSummary.ts'
import type { Photo } from '../src/types'

function makePhoto(overrides: Partial<Photo>): Photo {
  return {
    hash: overrides.hash ?? crypto.randomUUID(),
    filename: overrides.filename ?? 'photo.jpg',
    original_path: overrides.original_path ?? '/tmp/photo.jpg',
    file_size: overrides.file_size ?? 1,
    format: overrides.format ?? 'jpg',
    status: overrides.status ?? 'pending',
    is_favorite: overrides.is_favorite ?? false,
    cluster_id: overrides.cluster_id ?? null,
    exif: overrides.exif ?? {},
    created_at: overrides.created_at ?? '',
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    orientation: overrides.orientation ?? null,
  }
}

test('getFilterCounts returns counts for all filter tabs', () => {
  const photos = [
    makePhoto({ hash: 'p-1', status: 'pending', cluster_id: 'c-1' }),
    makePhoto({ hash: 'p-2', status: 'pending' }),
    makePhoto({ hash: 'k-1', status: 'keep' }),
    makePhoto({ hash: 'e-1', status: 'eliminate' }),
    makePhoto({ hash: 'f-1', status: 'keep', is_favorite: true }),
  ]

  assert.deepEqual(getFilterCounts(photos), {
    all: 5,
    pending: 2,
    keep: 2,
    eliminate: 1,
    favorite: 1,
  })
})

test('pending summary highlights remaining group and independent work', () => {
  assert.equal(
    getFilterSummary({
      filter: 'pending',
      totalPhotos: 9,
      clusterCount: 3,
      independentCount: 2,
    }),
    '还有 3 组相似照片、2 张独立照片待筛选，共 9 张',
  )
})

test('keep summary highlights retained results', () => {
  assert.equal(
    getFilterSummary({
      filter: 'keep',
      totalPhotos: 12,
      clusterCount: 0,
      independentCount: 0,
    }),
    '当前已保留 12 张照片',
  )
})

test('favorite summary highlights精选结果', () => {
  assert.equal(
    getFilterSummary({
      filter: 'favorite',
      totalPhotos: 4,
      clusterCount: 0,
      independentCount: 0,
    }),
    '当前已收藏 4 张精选照片',
  )
})
