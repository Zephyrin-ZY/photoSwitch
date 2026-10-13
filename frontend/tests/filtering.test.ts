import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findNextUnfilteredCluster,
  getClusterList,
  getFlatPhotos,
  getTournamentPhotos,
  type FilterType,
} from '../src/utils/filtering.ts'
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

test('keep and favorite flat views include independent photos', () => {
  const clusteredKeep = makePhoto({
    hash: 'clustered-keep',
    status: 'keep',
    cluster_id: 'cluster-a',
  })
  const independentKeep = makePhoto({
    hash: 'independent-keep',
    status: 'keep',
  })
  const photos = [clusteredKeep, independentKeep]

  const flatPhotos = getFlatPhotos({
    isFlatMode: true,
    filter: 'keep' satisfies FilterType,
    allPhotos: photos,
    filteredPhotos: photos,
  })

  assert.deepEqual(
    flatPhotos.map((photo) => photo.hash),
    ['clustered-keep', 'independent-keep'],
  )
})

test('pending cluster cards only show groups with at least two pending photos', () => {
  const clusterList = getClusterList({
    'cluster-a': [
      makePhoto({ hash: 'a-1', cluster_id: 'cluster-a' }),
    ],
    'cluster-b': [
      makePhoto({ hash: 'b-1', cluster_id: 'cluster-b' }),
      makePhoto({ hash: 'b-2', cluster_id: 'cluster-b' }),
    ],
  })

  assert.deepEqual(clusterList.map(([clusterId]) => clusterId), ['cluster-b'])
})

test('tournament only reopens pending photos in a cluster', () => {
  const photos = [
    makePhoto({ hash: 'pending-1', cluster_id: 'cluster-a', status: 'pending' }),
    makePhoto({ hash: 'kept-1', cluster_id: 'cluster-a', status: 'keep' }),
    makePhoto({ hash: 'eliminated-1', cluster_id: 'cluster-a', status: 'eliminate' }),
  ]

  const tournamentPhotos = getTournamentPhotos(photos, 'cluster-a')

  assert.deepEqual(tournamentPhotos.map((photo) => photo.hash), ['pending-1'])
})

test('next tournament cluster skips clusters with fewer than two pending photos', () => {
  const photos = [
    makePhoto({ hash: 'a-1', cluster_id: 'cluster-a', status: 'pending' }),
    makePhoto({ hash: 'a-2', cluster_id: 'cluster-a', status: 'keep' }),
    makePhoto({ hash: 'b-1', cluster_id: 'cluster-b', status: 'pending' }),
    makePhoto({ hash: 'b-2', cluster_id: 'cluster-b', status: 'pending' }),
  ]

  assert.equal(findNextUnfilteredCluster(photos, null), 'cluster-b')
  assert.equal(findNextUnfilteredCluster(photos, 'cluster-b'), null)
})
