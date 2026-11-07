import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { usePhotoStore } from '../stores/PhotoStore'
import { getAnalysisProgress, getThumbnailUrl, regenerateThumbnails } from '../services/api'
import { downloadOriginal, downloadDecisions, hasRaw, formatBytes, type DownloadFormat } from '../utils/download'
import type { Photo } from '../types'
import { motion, AnimatePresence } from 'framer-motion'
import Tournament from '../components/Tournament'
import ClusterReview from '../components/ClusterReview'
import PhotoViewer from '../components/PhotoViewer'
import ExportPanel from '../components/ExportPanel'
import DecisionImportPanel from '../components/DecisionImportPanel'
import { useToast } from '../components/Toast'
import { useIsTouch } from '../utils/touch'
import { loadClusterMode, saveClusterMode, type ClusterMode } from '../utils/clusterMode'
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

interface BatchProgress {
  total: number
  current: number
  succeeded: number
  skippedRaw: number
  failed: number
}

export default function FilterPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePhotoStore()
  const { state, init, refresh, updateStatus, toggleFav, getPhotosByFilter, getClustersByFilter, getClusterPhotos, findNextUnfilteredCluster } = store
  const { showError, showInfo, showSuccess } = useToast()
  const isTouch = useIsTouch()

  const [filter, setFilter] = useState<FilterType>('pending')
  const [pendingFlat, setPendingFlat] = useState(false)
  const [mode, setMode] = useState<'grid' | 'tournament' | 'review' | 'viewer'>('grid')
  // 点开相似组后用哪种模式筛：记住上次选择，触屏首次默认逐张、鼠标设备默认 PK
  const [clusterMode, setClusterMode] = useState<ClusterMode>(() => loadClusterMode(isTouch))
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [viewerPhoto, setViewerPhoto] = useState<Photo | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showExport, setShowExport] = useState(false)
  const [showDecisionImport, setShowDecisionImport] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set())
  const [showDownloadDialog, setShowDownloadDialog] = useState(false)
  const [downloadJpg, setDownloadJpg] = useState(true)
  const [downloadRaw, setDownloadRaw] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const batchAbortRef = useRef<AbortController | null>(null)
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
  const isFlatMode =
    filter === 'keep' ||
    filter === 'favorite' ||
    filter === 'all' ||
    (filter === 'pending' && pendingFlat)
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

  const selectedPhotos = useMemo(
    () => allPhotosFlat.filter(p => selectedHashes.has(p.hash)),
    [allPhotosFlat, selectedHashes],
  )
  const rawAvailableCount = useMemo(
    () => selectedPhotos.filter(hasRaw).length,
    [selectedPhotos],
  )
  const downloadFileCount =
    (downloadJpg ? selectedPhotos.length : 0) +
    (downloadRaw ? rawAvailableCount : 0)
  const downloadTotalBytes = useMemo(
    () => selectedPhotos.reduce((sum, p) => {
      let bytes = downloadJpg ? p.file_size : 0
      if (downloadRaw && hasRaw(p)) bytes += p.raw_size ?? 0
      return sum + bytes
    }, 0),
    [selectedPhotos, downloadJpg, downloadRaw],
  )

  useEffect(() => {
    batchAbortRef.current?.abort()
    batchAbortRef.current = null
    setSelectMode(false)
    setSelectedHashes(new Set())
    setShowDownloadDialog(false)
  }, [filter, pendingFlat])

  useEffect(() => () => batchAbortRef.current?.abort(), [])

  const toggleSelect = (hash: string) => {
    setSelectedHashes(prev => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })
  }

  const exitSelectMode = () => {
    batchAbortRef.current?.abort()
    setSelectMode(false)
    setSelectedHashes(new Set())
    setShowDownloadDialog(false)
  }

  const openDownloadDialog = () => {
    if (rawAvailableCount === 0) setDownloadRaw(false)
    setShowDownloadDialog(true)
  }

  const startBatchDownload = async () => {
    if (!id || !selectedPhotos.length) return
    const formats: DownloadFormat[] = []
    if (downloadJpg) formats.push('jpg')
    if (downloadRaw) formats.push('raw')
    if (!formats.length) return

    const photos = selectedPhotos
    const controller = new AbortController()
    batchAbortRef.current = controller
    setShowDownloadDialog(false)

    const stats = { total: photos.length, current: 0, succeeded: 0, skippedRaw: 0, failed: 0 }
    let firstError = ''
    setBatchProgress({ ...stats })

    for (const photo of photos) {
      if (controller.signal.aborted) break
      for (const format of formats) {
        if (controller.signal.aborted) break
        if (format === 'raw' && !hasRaw(photo)) {
          stats.skippedRaw += 1
          continue
        }
        try {
          await downloadOriginal(id, photo, format, controller.signal)
          stats.succeeded += 1
        } catch (err) {
          if ((err as Error).name === 'AbortError') break
          stats.failed += 1
          if (!firstError) firstError = err instanceof Error ? err.message : '下载失败'
        }
      }
      stats.current += 1
      setBatchProgress({ ...stats })
    }

    batchAbortRef.current = null
    setBatchProgress(null)
    setSelectMode(false)
    setSelectedHashes(new Set())

    if (controller.signal.aborted) {
      showInfo(`已停止下载，共下载 ${stats.succeeded} 个文件`)
      return
    }

    const parts = [`已下载 ${stats.succeeded} 个文件`]
    if (stats.skippedRaw) parts.push(`跳过 ${stats.skippedRaw} 张无 RAW`)
    if (stats.failed) parts.push(`${stats.failed} 个失败${firstError ? `：${firstError}` : ''}`)
    if (stats.failed) showError(parts.join('，'))
    else if (stats.succeeded === 0) showInfo(parts.join('，'))
    else showSuccess(parts.join('，'))
  }

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

  const handleExportDecisions = async () => {
    if (!id) return
    try {
      await downloadDecisions(id)
      showSuccess('筛选结果已导出')
    } catch (err) {
      showError(err instanceof Error ? err.message : '导出筛选结果失败')
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

  // 按记忆的偏好进入组内筛选；不足 2 张待筛选时 PK 无从对决，退回逐张浏览
  const openCluster = (clusterId: string) => {
    const pending = getClusterPhotos(clusterId)
    setSelectedCluster(clusterId)
    setMode(pending.length >= 2 ? clusterMode : 'review')
  }

  const goNextCluster = (nextMode: ClusterMode) => {
    const nextCluster = findNextUnfilteredCluster(selectedCluster)
    if (nextCluster) {
      setSelectedCluster(nextCluster)
      setMode(nextMode)
    } else {
      setMode('grid')
      setSelectedCluster(null)
    }
  }

  const switchClusterMode = (next: ClusterMode) => {
    if (!selectedCluster) return
    setClusterMode(next)
    saveClusterMode(next)

    // 切换后两个组件都用当前的 pending 照片重新挂载：已淘汰的不复活，
    // PK 中途切换时对阵表重新编排
    if (next === 'tournament') {
      const pending = getClusterPhotos(selectedCluster)
      if (pending.length < 2) {
        if (pending.length === 1) {
          void updateStatus(pending[0].hash, 'keep')
          showInfo('只剩最后一张，已自动保留')
        } else {
          showInfo('本组已没有待筛选的照片')
        }
        goNextCluster(next)
        return
      }
    }
    setMode(next)
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
        {filter === 'pending' && (
          <>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex gap-1">
              {([false, true] as const).map(flat => (
                <button
                  key={String(flat)}
                  onClick={() => setPendingFlat(flat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    pendingFlat === flat ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-white/40 hover:text-white/60 border border-transparent'
                  }`}
                >
                  {flat ? '平铺' : '分组'}
                </button>
              ))}
            </div>
          </>
        )}
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
            {filter === 'pending' && !pendingFlat && clusterList.length > 0 && (
              <button
                onClick={() => openCluster(clusterList[0][0])}
                className="px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/10 transition-colors cursor-pointer"
              >
                从下一组相似照片开始
              </button>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportDecisions}
                className="px-3 py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
                title="导出保留/淘汰/收藏状态,用于换设备或备份"
              >
                导出筛选结果
              </button>
              <button
                onClick={() => setShowDecisionImport(true)}
                className="px-3 py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
                title="导入之前导出的筛选结果"
              >
                导入筛选结果
              </button>
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
        </div>

        {isFlatMode ? (
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-medium text-white/50">
                {{ all: '全部照片', pending: '待筛选', keep: '保留', favorite: '★ 收藏' }[filter]} ({allPhotosFlat.length} 张)
              </h3>
              {!selectMode ? (
                <button
                  onClick={() => setSelectMode(true)}
                  disabled={!allPhotosFlat.length}
                  className="px-3 py-1.5 rounded-md border border-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  选择
                </button>
              ) : (
                <span className="text-xs text-white/35">已选 {selectedHashes.size} 张</span>
              )}
            </div>
            <div className="columns-3 md:columns-5 lg:columns-6 xl:columns-8 gap-2 space-y-2">
              {allPhotosFlat.map((p, i) => (
                <motion.div
                  key={p.hash}
                  whileHover={{ scale: 1.03 }}
                  className={`break-inside-avoid rounded-lg overflow-hidden border bg-white/5 cursor-pointer relative group ${
                    selectMode && selectedHashes.has(p.hash)
                      ? 'border-cyan-400 ring-2 ring-cyan-400/60'
                      : 'border-white/5'
                  }`}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelect(p.hash)
                      return
                    }
                    setViewerPhoto(p)
                    setCurrentIdx(i)
                    setMode('viewer')
                  }}
                >
                  {selectMode && (
                    <div className={`absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                      selectedHashes.has(p.hash)
                        ? 'bg-cyan-500 border-cyan-400 text-white'
                        : 'bg-black/50 border-white/60 text-transparent'
                    }`}>
                      ✓
                    </div>
                  )}
                  <img
                    src={getThumbnailUrl(p.hash, id ?? '')}
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
                      onClick={() => openCluster(clusterId)}
                    >
                      <div className="grid grid-cols-2 gap-0.5 aspect-square">
                        {clusterPhotos.slice(0, 4).map((p) => (
                          <div key={p.hash} className="bg-white/5 overflow-hidden">
                            <img
                              src={getThumbnailUrl(p.hash, id ?? '')}
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
                      src={getThumbnailUrl(p.hash, id ?? '')}
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
            key={`${selectedCluster}-tournament`}
            photos={getClusterPhotos(selectedCluster)}
            projectId={id!}
            onClose={() => {
              setMode('grid')
              setSelectedCluster(null)
            }}
            onComplete={() => goNextCluster(clusterMode)}
            onSwitchMode={() => switchClusterMode('review')}
            onStatusChange={handleStatusChange}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode === 'review' && selectedCluster && (
          <ClusterReview
            key={`${selectedCluster}-review`}
            photos={getClusterPhotos(selectedCluster)}
            projectId={id!}
            onClose={() => {
              setMode('grid')
              setSelectedCluster(null)
            }}
            onComplete={() => goNextCluster(clusterMode)}
            onSwitchMode={() => switchClusterMode('tournament')}
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

      <AnimatePresence>
        {showDecisionImport && (
          <DecisionImportPanel
            projectId={id!}
            onClose={() => setShowDecisionImport(false)}
            onImported={async () => {
              await refresh()
              showSuccess('筛选结果已导入')
            }}
          />
        )}
      </AnimatePresence>

      {/* 批量选择操作栏 */}
      {selectMode && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(680px,calc(100vw-24px))] rounded-xl border border-white/10 bg-[#12121f]/95 backdrop-blur px-4 py-3 shadow-2xl">
          {batchProgress ? (
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/60">
                  正在逐张下载 {batchProgress.current}/{batchProgress.total}
                </div>
                <div className="text-[11px] text-white/30 mt-1">
                  成功 {batchProgress.succeeded} 个文件 · 跳过 {batchProgress.skippedRaw} 张无 RAW · 失败 {batchProgress.failed}
                </div>
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all"
                    style={{ width: `${batchProgress.total ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <button
                onClick={() => batchAbortRef.current?.abort()}
                className="px-3 py-1.5 rounded-md border border-white/10 text-white/50 text-xs hover:text-white/70 cursor-pointer"
              >
                停止
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-white/60 mr-auto">
                已选 <span className="text-cyan-400 font-medium">{selectedHashes.size}</span> 张
              </span>
              <button
                onClick={() => setSelectedHashes(new Set(allPhotosFlat.map(p => p.hash)))}
                className="px-3 py-1.5 rounded-md border border-white/10 text-white/50 text-xs hover:text-white/70 cursor-pointer"
              >
                全选
              </button>
              <button
                onClick={() => setSelectedHashes(new Set())}
                className="px-3 py-1.5 rounded-md border border-white/10 text-white/50 text-xs hover:text-white/70 cursor-pointer"
              >
                清空
              </button>
              <button
                onClick={exitSelectMode}
                className="px-3 py-1.5 rounded-md border border-white/10 text-white/50 text-xs hover:text-white/70 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={openDownloadDialog}
                disabled={!selectedHashes.size}
                className="px-4 py-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下载
              </button>
            </div>
          )}
        </div>
      )}

      {/* 批量下载格式选择 */}
      <AnimatePresence>
        {showDownloadDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDownloadDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="w-full max-w-md bg-[#12121f] border border-white/10 rounded-2xl p-6 pointer-events-auto space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-white">下载原图</h3>
                  <button
                    onClick={() => setShowDownloadDialog(false)}
                    className="text-white/30 hover:text-white/60 text-xl cursor-pointer"
                  >
                    ×
                  </button>
                </div>

                <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/60">
                  逐张下载 {downloadFileCount} 个文件
                  <span className="text-white/35">（约 {formatBytes(downloadTotalBytes)}）</span>
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={downloadJpg}
                      onChange={(e) => setDownloadJpg(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500"
                    />
                    <div>
                      <span className="text-white/70 text-sm">JPG / 普通原图</span>
                      <div className="text-white/30 text-xs">{selectedPhotos.length} 个文件，保持原文件名</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 ${rawAvailableCount ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      checked={downloadRaw}
                      disabled={!rawAvailableCount}
                      onChange={(e) => setDownloadRaw(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500"
                    />
                    <div>
                      <span className="text-white/70 text-sm">RAW 原始文件</span>
                      <div className="text-white/30 text-xs">
                        {rawAvailableCount
                          ? `${rawAvailableCount} 个文件${rawAvailableCount < selectedPhotos.length ? `，${selectedPhotos.length - rawAvailableCount} 张无 RAW 将跳过` : ''}`
                          : '所选照片都没有 RAW'}
                      </div>
                    </div>
                  </label>
                </div>

                <p className="text-[11px] text-white/30 leading-relaxed">
                  首次批量下载时，浏览器会询问是否允许下载多个文件，请选择「允许」。下载的是磁盘原始文件，不是缩略图。
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDownloadDialog(false)}
                    className="flex-1 py-3 rounded-lg border border-white/10 text-white/40 hover:text-white/60 transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={startBatchDownload}
                    disabled={!downloadJpg && !downloadRaw}
                    className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium disabled:opacity-50 cursor-pointer"
                  >
                    开始下载
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
