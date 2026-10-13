import { createContext, useContext, useReducer, useCallback, useRef, type ReactNode } from 'react'
import { getPhotos, updatePhotoStatus, toggleFavorite } from '../services/api'
import type { Photo } from '../types'
import {
  type FilterType,
  findNextUnfilteredCluster as findNextTournamentCluster,
  getTournamentPhotos,
} from '../utils/filtering'

interface PhotoState {
  allPhotos: Photo[]
  loaded: boolean
  loading: boolean
  projectId: string | null
}

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; photos: Photo[]; projectId: string }
  | { type: 'UPDATE_PHOTO'; hash: string; changes: Partial<Photo> }

function photoReducer(state: PhotoState, action: Action): PhotoState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true }
    case 'LOAD_SUCCESS':
      return {
        allPhotos: action.photos,
        loaded: true,
        loading: false,
        projectId: action.projectId,
      }
    case 'UPDATE_PHOTO':
      return {
        ...state,
        allPhotos: state.allPhotos.map(p =>
          p.hash === action.hash ? { ...p, ...action.changes } : p
        ),
      }
  }
}

interface PhotoStoreValue {
  state: PhotoState
  init: (projectId: string) => Promise<void>
  refresh: () => Promise<void>
  updateStatus: (hash: string, status: string) => Promise<void>
  toggleFav: (hash: string, isFavorite: boolean) => Promise<void>
  getPhotosByFilter: (filter: FilterType) => Photo[]
  getClustersByFilter: (filter: FilterType) => Record<string, Photo[]>
  getClusterPhotos: (clusterId: string) => Photo[]
  findNextUnfilteredCluster: (currentClusterId: string | null) => string | null
}

const PhotoStoreContext = createContext<PhotoStoreValue | null>(null)

export function PhotoStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(photoReducer, {
    allPhotos: [],
    loaded: false,
    loading: false,
    projectId: null,
  })

  const projectIdRef = useRef<string | null>(null)

  const init = useCallback(async (projectId: string) => {
    projectIdRef.current = projectId
    dispatch({ type: 'LOAD_START' })
    // 分页加载全部照片，每次 500 张
    const PAGE_SIZE = 500
    const allFiles: Photo[] = []
    let offset = 0
    let total = 0
    do {
      const res = await getPhotos(projectId, { offset, limit: PAGE_SIZE })
      total = res.total
      allFiles.push(...res.files)
      offset += res.files.length
      if (res.files.length < PAGE_SIZE) break
    } while (offset < total)
    dispatch({
      type: 'LOAD_SUCCESS',
      photos: allFiles,
      projectId,
    })
  }, [])

  const refresh = useCallback(async () => {
    const pid = projectIdRef.current
    if (!pid) return
    await init(pid)
  }, [init])

  const updateStatus = useCallback(async (hash: string, status: string) => {
    const pid = projectIdRef.current
    if (!pid) return
    await updatePhotoStatus(pid, hash, status)
    dispatch({ type: 'UPDATE_PHOTO', hash, changes: { status: status as Photo['status'] } })
  }, [])

  const toggleFav = useCallback(async (hash: string, isFavorite: boolean) => {
    const pid = projectIdRef.current
    if (!pid) return
    await toggleFavorite(pid, hash, isFavorite)
    dispatch({ type: 'UPDATE_PHOTO', hash, changes: { is_favorite: isFavorite } })
  }, [])

  // 从 allPhotos 实时计算过滤结果
  const getPhotosByFilter = useCallback((filter: FilterType): Photo[] => {
    let result = state.allPhotos
    if (filter === 'pending') result = result.filter(p => p.status === 'pending')
    else if (filter === 'keep') result = result.filter(p => p.status === 'keep')
    else if (filter === 'eliminate') result = result.filter(p => p.status === 'eliminate')
    else if (filter === 'favorite') result = result.filter(p => p.is_favorite)
    return result
  }, [state.allPhotos])

  // 从 allPhotos 实时计算分组
  const getClustersByFilter = useCallback((filter: FilterType): Record<string, Photo[]> => {
    const filtered = getPhotosByFilter(filter)
    const clusters: Record<string, Photo[]> = {}
    for (const p of filtered) {
      if (p.cluster_id) {
        if (!clusters[p.cluster_id]) clusters[p.cluster_id] = []
        clusters[p.cluster_id].push(p)
      }
    }
    return clusters
  }, [getPhotosByFilter])

  // 获取单个 cluster 的所有照片（不过滤）
  const getClusterPhotos = useCallback((clusterId: string): Photo[] => {
    return getTournamentPhotos(state.allPhotos, clusterId)
  }, [state.allPhotos])

  // 查找下一个有待筛选照片的 cluster
  const findNextUnfilteredCluster = useCallback((currentClusterId: string | null): string | null => {
    return findNextTournamentCluster(state.allPhotos, currentClusterId)
  }, [state.allPhotos])

  return (
    <PhotoStoreContext.Provider value={{
      state,
      init,
      refresh,
      updateStatus,
      toggleFav,
      getPhotosByFilter,
      getClustersByFilter,
      getClusterPhotos,
      findNextUnfilteredCluster,
    }}>
      {children}
    </PhotoStoreContext.Provider>
  )
}

export function usePhotoStore() {
  const ctx = useContext(PhotoStoreContext)
  if (!ctx) throw new Error('usePhotoStore must be used within PhotoStoreProvider')
  return ctx
}
