import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { usePhotoStore } from '../stores/PhotoStore'
import { getAnalysisProgress, getThumbnailUrl, regenerateThumbnails } from '../services/api'
import type { Photo } from '../types'
import { motion, AnimatePresence } from 'framer-motion'
import Tournament from '../components/Tournament'
import PhotoViewer from '../components/PhotoViewer'
import ExportPanel from '../components/ExportPanel'
import { useToast } from '../components/Toast'
import {
  type FilterType,
  getClusterList,
  getFlatPhotos,
  getIndependentPhotos,
} from '../utils/filtering'
import {
  getFilterCounts,
  getFilterSummary,
} from '../utils/filterSummary'

export default function FilterPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePhotoStore()
  const { state, init, updateStatus, toggleFav, getPhotosByFilter, getClustersByFilter, getClusterPhotos, findNextUnfilteredCluster } = store
  const { showError, showInfo, showSuccess } = useToast()

  const [filter, setFilter] = useState<FilterType>('pending')
  const [mode, setMode] = useState<'grid' | 'tournament' | 'viewer'>('grid')
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [viewerPhoto, setViewerPhoto] = useState<Photo | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showExport, setShowExport] = useState(false)
  const [thumbRegen, setThumbRegen] = useState<{ running: boolean; current: number; total: number; done: boolean }>({
    running: false,
    current: 0,
    total: 0,
    done: false,
  })

  // 初始化：加载全量数据（切换项目时重新加载）
  useEffect(() => {
    if (id && (!state.loaded || state.projectId !== id)) {
      init(id)
    }
  }, [id, state.loaded, state.projectId, init])

  // 从 store 实时计算派生数据
  const isFlatMode = filter === 'keep' || filter === 'favorite' || filter === 'all'
  const clusters = useMemo(() => getClustersByFilter(filter), [getClustersByFilter, filter])
  const filteredPhotos = useMemo(() => getPhotosByFilter(filter), [getPhotosByFilter, filter])
  const clusterList = useMemo(() => getClusterList(clusters), [clusters])

  const allPhotosFlat = useMemo(() => {
    return getFlatPhotos({
      isFlatMode,
      filter,
      allPhotos: state.allPhotos,
      filteredPhotos,
    })
  }, [isFlatMode, filter, filteredPhotos, state.allPhotos])

  const independentPhotos = useMemo(() => {
    return getIndependentPhotos({
      isFlatMode,
      filteredPhotos,
      clusters,
    })
  }, [isFlatMode, filteredPhotos, clusters])

  const filterCounts = useMemo(
    () => getFilterCounts(state.allPhotos),
    [state.allPhotos],
  )
  const filterSummary = useMemo(
    () => getFilterSummary({
      filter,
      totalPhotos: filteredPhotos.length,
      clusterCount: clusterList.length,
      independentCount: independentPhotos.length,
    }),
    [filter, filteredPhotos.length, clusterList.length, independentPhotos.length],
  )

  const handleStatusChange = async (hash: string, status: string) => {
    await updateStatus(hash, status)
    setViewerPhoto(prev => prev && prev.hash === hash ? { ...prev, status: status as Photo['status'] } : prev)
  }

  const handleToggleFavorite = async (hash: string, isFavorite: boolean) => {
    await toggleFav(hash, isFavorite)
    setViewerPhoto(prev => prev && prev.hash === hash ? { ...prev, is_favorite: isFavorite } : prev)
  }

  const handleRegenerateThumbnails = async () => {
    if (!id) return
    try {
      const result = await regenerateThumbnails(id)
      if (result.status === 'already_running') {
        showInfo('缩略图重新生成已在进行中')
        return
      }
      setThumbRegen({ running: true, current: 0, total: state.allPhotos.length, done: false })
      showInfo('已开始重新生成缩略图')
    } catch {
      showError('启动缩略图重新生成失败')
    }
  }

  // 轮询缩略图重新生成进度
  useEffect(() => {
    if (!id || !thumbRegen.running) return
    let cancelled = false
    const poll = async () => {
      try {
        const prog = await getAnalysisProgress(id)
        if (cancelled) return
        const thumb = prog.thumbnail
        if (thumb.total > 0) {
          setThumbRegen(prev => ({
            ...prev,
            current: thumb.current,
            total: thumb.total,
            running: !prog.done,
            done: prog.done,
          }))
        }
        if (prog.done) {
          showSuccess('缩略图重新生成完成')
        }
      } catch {
        // ignore
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [id, thumbRegen.running, showSuccess])

  const openViewer = (photo: Photo, idx: number) => {
    setViewerPhoto(photo)
    setCurrentIdx(idx)
    setMode('viewer')
  }

  if (!state.loaded) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <span className="text-white/40 text-sm">加载中...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/10 bg-white/[0.02] flex-wrap">
        <div className="flex gap-1">
          {(['all', 'pending', 'keep', 'eliminate', 'favorite'] as FilterType[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                filter === s ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-white/40 hover:text-white/60 border border-transparent'
              }`}
            >
              {{ all: '全部', pending: '待筛选', keep: '保留', eliminate: '淘汰', favorite: '★ 收藏' }[s]} ({filterCounts[s]})
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex gap-1 flex-wrap">
          {!thumbRegen.running && !thumbRegen.done && (
            <button
              onClick={handleRegenerateThumbnails}
              className="px-2.5 py-1 rounded-md text-xs text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/20 cursor-pointer"
              title="修复缩略图方向等问题"
            >
              重新生成缩略图
            </button>
          )}
          {thumbRegen.running && (
            <span className="px-2.5 py-1 rounded-md text-xs text-cyan-400 bg-cyan-500/10">
              重新生成缩略图 {thumbRegen.current}/{thumbRegen.total}
            </span>
          )}
          {thumbRegen.done && (
            <span className="px-2.5 py-1 rounded-md text-xs text-green-400 bg-green-500/10">
              缩略图已重新生成 ✓
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium text-white/70">
                当前任务
              </div>
              <div className="text-xs text-white/35 mt-1">
                {filterSummary}
              </div>
            </div>
            {filter === 'pending' && clusterList.length > 0 && (
              <button
                onClick={() => {
                  setSelectedCluster(clusterList[0][0])
                  setMode('tournament')
                }}
                className="px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/10 transition-colors cursor-pointer"
              >
                从下一组相似照片开始
              </button>
            )}
            {(filterCounts['keep'] > 0 || filterCounts['favorite'] > 0) && (
              <button
                onClick={() => setShowExport(true)}
                className="px-3 py-2 rounded-lg border border-purple-500/20 text-purple-400 text-xs hover:bg-purple-500/10 transition-colors cursor-pointer"
              >
                导出照片
              </button>
            )}
          </div>
        </div>

        {isFlatMode ? (
          <div>
            <h3 className="text-sm font-medium text-white/50 mb-4">
              {{ all: '全部照片', keep: '保留', favorite: '★ 收藏' }[filter]} ({allPhotosFlat.length} 张)
            </h3>
            <div className="columns-3 md:columns-5 lg:columns-6 xl:columns-8 gap-2 space-y-2">
              {allPhotosFlat.map((p, i) => (
                <motion.div
                  key={p.hash}
                  whileHover={{ scale: 1.03 }}
                  className="break-inside-avoid rounded-lg overflow-hidden border border-white/5 bg-white/5 cursor-pointer relative group"
                  onClick={() => {
                    setViewerPhoto(p)
                    setCurrentIdx(i)
                    setMode('viewer')
                  }}
                >
                  <img
                    src={getThumbnailUrl(p.hash)}
                    alt=""
                    className="w-full h-auto block"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                    <span className="text-[10px] text-white/70 truncate">{p.filename}</span>
                  </div>
                  {p.is_favorite && (
                    <svg className="absolute top-1 right-1" width="16" height="16" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {clusterList.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-medium text-white/50 mb-4">
                  相似照片组 ({clusterList.length} 组)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {clusterList.map(([clusterId, clusterPhotos]) => (
                    <motion.div
                      key={clusterId}
                      whileHover={{ scale: 1.02 }}
                      className="rounded-xl border border-white/10 bg-white/5 overflow-hidden cursor-pointer"
                      onClick={() => { setSelectedCluster(clusterId); setMode('tournament') }}
                    >
                      <div className="grid grid-cols-2 gap-0.5 aspect-square">
                        {clusterPhotos.slice(0, 4).map((p) => (
                          <div key={p.hash} className="bg-white/5 overflow-hidden">
                            <img
                              src={getThumbnailUrl(p.hash)}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 text-xs text-white/40">
                        {clusterPhotos.length} 张相似照片
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-white/50 mb-4">
                独立照片 ({independentPhotos.length} 张)
              </h3>
              <div className="columns-3 md:columns-5 lg:columns-6 xl:columns-8 gap-2 space-y-2">
                {independentPhotos.map((p, i) => (
                  <motion.div
                    key={p.hash}
                    whileHover={{ scale: 1.03 }}
                    className="break-inside-avoid rounded-lg overflow-hidden border border-white/5 bg-white/5 cursor-pointer relative group"
                    onClick={() => openViewer(p, i)}
                  >
                    <img
                      src={getThumbnailUrl(p.hash)}
                      alt=""
                      className="w-full h-auto block"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                      <span className="text-[10px] text-white/70 truncate">{p.filename}</span>
                    </div>
                    {p.status === 'keep' && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400" />}
                    {p.status === 'eliminate' && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-400" />}
                    {p.is_favorite && (
                      <svg className="absolute bottom-1 right-1" width="14" height="14" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {mode === 'tournament' && selectedCluster && (
          <Tournament
            key={selectedCluster}
            photos={getClusterPhotos(selectedCluster)}
            projectId={id!}
            onClose={() => {
              setMode('grid')
              setSelectedCluster(null)
            }}
            onComplete={() => {
              const nextCluster = findNextUnfilteredCluster(selectedCluster)
              if (nextCluster) {
                setSelectedCluster(nextCluster)
              } else {
                setMode('grid')
                setSelectedCluster(null)
              }
            }}
            onStatusChange={handleStatusChange}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode === 'viewer' && viewerPhoto && (
          <PhotoViewer
            photo={viewerPhoto}
            projectId={id!}
            photos={isFlatMode ? allPhotosFlat : independentPhotos}
            currentIndex={currentIdx}
            onClose={() => setMode('grid')}
            onNavigate={(idx) => {
              setCurrentIdx(idx)
              setViewerPhoto((isFlatMode ? allPhotosFlat : independentPhotos)[idx])
            }}
            onStatusChange={handleStatusChange}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExport && (
          <ExportPanel
            projectId={id!}
            keptCount={filterCounts['keep']}
            favoriteCount={filterCounts['favorite']}
            onClose={() => setShowExport(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
