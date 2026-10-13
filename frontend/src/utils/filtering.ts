import type { Photo } from '../types'

export type FilterType = 'all' | 'pending' | 'keep' | 'eliminate' | 'favorite'

export function getClusterList(
  clusters: Record<string, Photo[]>,
): [string, Photo[]][] {
  return Object.entries(clusters).filter(([, photos]) => photos.length >= 2)
}

export function getFlatPhotos({
  isFlatMode,
  filter,
  allPhotos,
  filteredPhotos,
}: {
  isFlatMode: boolean
  filter: FilterType
  allPhotos: Photo[]
  filteredPhotos: Photo[]
}): Photo[] {
  if (!isFlatMode) return []
  if (filter === 'all') return allPhotos
  return filteredPhotos
}

export function getIndependentPhotos({
  isFlatMode,
  filteredPhotos,
  clusters,
}: {
  isFlatMode: boolean
  filteredPhotos: Photo[]
  clusters: Record<string, Photo[]>
}): Photo[] {
  if (isFlatMode) return []
  return filteredPhotos.filter(
    (photo) =>
      !photo.cluster_id ||
      !clusters[photo.cluster_id] ||
      clusters[photo.cluster_id].length < 2,
  )
}

export function getTournamentPhotos(
  photos: Photo[],
  clusterId: string,
): Photo[] {
  return photos.filter(
    (photo) => photo.cluster_id === clusterId && photo.status === 'pending',
  )
}

export function findNextUnfilteredCluster(
  photos: Photo[],
  currentClusterId: string | null,
): string | null {
  const clusterIds = [
    ...new Set(photos.filter((photo) => photo.cluster_id).map((photo) => photo.cluster_id!)),
  ]
  const pendingClusters = clusterIds.filter((clusterId) =>
    photos.filter(
      (photo) => photo.cluster_id === clusterId && photo.status === 'pending',
    ).length >= 2,
  )

  if (pendingClusters.length === 0) return null
  if (!currentClusterId) return pendingClusters[0]

  const idx = pendingClusters.indexOf(currentClusterId)
  if (idx === -1) return pendingClusters[0]

  for (let i = 1; i < pendingClusters.length; i++) {
    const nextIdx = (idx + i) % pendingClusters.length
    if (pendingClusters[nextIdx] !== currentClusterId) {
      return pendingClusters[nextIdx]
    }
  }

  return null
}
