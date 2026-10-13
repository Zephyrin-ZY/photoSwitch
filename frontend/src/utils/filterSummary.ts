import type { Photo } from '../types'
import type { FilterType } from './filtering'

export function getFilterCounts(photos: Photo[]): Record<FilterType, number> {
  return {
    all: photos.length,
    pending: photos.filter((photo) => photo.status === 'pending').length,
    keep: photos.filter((photo) => photo.status === 'keep').length,
    eliminate: photos.filter((photo) => photo.status === 'eliminate').length,
    favorite: photos.filter((photo) => photo.is_favorite).length,
  }
}

export function getFilterSummary({
  filter,
  totalPhotos,
  clusterCount,
  independentCount,
}: {
  filter: FilterType
  totalPhotos: number
  clusterCount: number
  independentCount: number
}): string {
  switch (filter) {
    case 'pending':
      return `还有 ${clusterCount} 组相似照片、${independentCount} 张独立照片待筛选，共 ${totalPhotos} 张`
    case 'keep':
      return `当前已保留 ${totalPhotos} 张照片`
    case 'eliminate':
      return `当前已淘汰 ${totalPhotos} 张照片`
    case 'favorite':
      return `当前已收藏 ${totalPhotos} 张精选照片`
    case 'all':
    default:
      return `当前视图共 ${totalPhotos} 张照片`
  }
}
