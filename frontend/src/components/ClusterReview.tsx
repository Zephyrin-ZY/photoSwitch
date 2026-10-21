import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getOriginalUrl, getThumbnailUrl } from '../services/api'
import { usePhotoGestures } from '../hooks/usePhotoGestures'
import type { Photo } from '../types'

interface Props {
  /** 进入时的组内待筛选照片快照（浏览过程中不随 store 变化，避免列表被打乱） */
  photos: Photo[]
  projectId: string
  onClose: () => void
  /** 确认保留后：跳到下一个未筛选的组，或回到网格 */
  onComplete: () => void
  onStatusChange: (hash: string, status: string) => Promise<void>
  onToggleFavorite: (hash: string, isFavorite: boolean) => Promise<void>
}

interface HistoryEntry {
  index: number
  hash: string
}

/**
 * 相似组内淘汰浏览（移动端 PK 替代方案）。
 *
 * 交互：全屏逐张浏览，横滑切换、捏合/双击缩放；点 ✕ 淘汰当前张（自动下一张）；
 * 浏览完点「确认保留」，把组内所有未被淘汰的照片一次性标记为保留。
 */
export default function ClusterReview({ photos, projectId, onClose, onComplete, onStatusChange, onToggleFavorite }: Props) {
  // 快照到本地状态：淘汰只改本地 + 逐张写回后端，列表顺序保持稳定
  const [items, setItems] = useState<Photo[]>(() => photos.map(p => ({ ...p })))
  const [index, setIndex] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [confirming, setConfirming] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [originalLoaded, setOriginalLoaded] = useState(false)
  const [displaySrc, setDisplaySrc] = useState<'thumb' | 'original'>('thumb')

  const current = items[index]

  const goPrev = useCallback(() => setIndex(i => Math.max(0, i - 1)), [])
  const goNext = useCallback(() => setIndex(i => Math.min(items.length - 1, i + 1)), [items.length])

  const { imgStyle, handlers } = usePhotoGestures({
    onPrev: goPrev,
    onNext: goNext,
    resetKey: current?.hash ?? index,
  })

  // 渐进加载原图
  useEffect(() => {
    if (!current) return
    setOriginalLoaded(false)
    setDisplaySrc('thumb')
    const img = new Image()
    img.src = getOriginalUrl(current.hash, projectId)
    img.onload = () => setOriginalLoaded(true)
  }, [current?.hash, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (originalLoaded) {
      const t = setTimeout(() => setDisplaySrc('original'), 50)
      return () => clearTimeout(t)
    }
  }, [originalLoaded])

  // 空组直接关闭
  useEffect(() => {
    if (items.length === 0) onClose()
  }, [items.length, onClose])

  const eliminatedCount = useMemo(() => items.filter(p => p.status === 'eliminate').length, [items])
  const keepCount = items.length - eliminatedCount

  const setLocalStatus = useCallback((hash: string, status: Photo['status']) => {
    setItems(prev => prev.map(p => (p.hash === hash ? { ...p, status } : p)))
  }, [])

  const toggleEliminate = useCallback(() => {
    if (!current) return
    const willEliminate = current.status !== 'eliminate'
    const nextStatus: Photo['status'] = willEliminate ? 'eliminate' : 'pending'
    // 本地状态 + 跳转在同一批渲染里立即完成，不等网络，避免当前张闪「已淘汰」再跳的卡顿感
    setLocalStatus(current.hash, nextStatus)
    if (willEliminate) {
      setHistory(prev => [...prev, { index, hash: current.hash }])
      if (index < items.length - 1) setIndex(index + 1)
    } else {
      setHistory(prev => prev.filter(h => h.hash !== current.hash))
    }
    // 网络写回后台进行，失败也不阻塞交互
    void Promise.resolve(onStatusChange(current.hash, nextStatus)).catch(e =>
      console.error('状态更新失败:', e),
    )
  }, [current, index, items.length, setLocalStatus, onStatusChange])

  const toggleFavorite = useCallback(async () => {
    if (!current) return
    const newVal = !current.is_favorite
    setItems(prev => prev.map(p => (p.hash === current.hash ? { ...p, is_favorite: newVal } : p)))
    try {
      await onToggleFavorite(current.hash, newVal)
    } catch (e) {
      console.error('收藏失败:', e)
    }
  }, [current, onToggleFavorite])

  const undo = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last) return
    setLocalStatus(last.hash, 'pending')
    setHistory(prev => prev.slice(0, -1))
    setIndex(last.index)
    try {
      await onStatusChange(last.hash, 'pending')
    } catch (e) {
      console.error('撤销失败:', e)
    }
  }, [history, setLocalStatus, onStatusChange])

  const confirmKeep = useCallback(async () => {
    if (confirming) return
    setConfirming(true)
    const survivors = items.filter(p => p.status !== 'eliminate')
    try {
      // 组内照片数量有限，并发写回可接受
      await Promise.all(survivors.map(p => onStatusChange(p.hash, 'keep')))
      onComplete()
    } catch (e) {
      console.error('批量保留失败:', e)
      setConfirming(false)
    }
  }, [confirming, items, onStatusChange, onComplete])

  if (!current) return null

  const isEliminated = current.status === 'eliminate'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <div className="text-white/50 text-xs sm:text-sm truncate">
            相似组 · {index + 1} / {items.length}
          </div>
          <div className="text-[11px] text-white/30 mt-0.5">
            已淘汰 {eliminatedCount} · 将保留 {keepCount}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="h-11 px-3 text-sm text-white/50 border border-white/10 rounded-lg disabled:opacity-20 cursor-pointer active:bg-white/10"
          >
            ↩ 撤销
          </button>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="h-11 w-11 flex items-center justify-center text-xl text-white/40 border border-white/10 rounded-lg cursor-pointer active:bg-white/10"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 图片区 */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center relative"
        style={{ touchAction: 'none' }}
        {...handlers}
      >
        <img
          src={displaySrc === 'original' ? getOriginalUrl(current.hash, projectId) : getThumbnailUrl(current.hash, 'medium')}
          alt=""
          className={`max-h-full max-w-full object-contain select-none transition-opacity ${isEliminated ? 'opacity-40' : ''}`}
          style={imgStyle}
          draggable={false}
        />
        {isEliminated && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs">
            已淘汰
          </div>
        )}
        {current.is_favorite && (
          <svg className="absolute top-3 right-3" width="22" height="22" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10">
        <button
          onClick={goPrev}
          disabled={index === 0}
          aria-label="上一张"
          className="h-14 w-11 shrink-0 flex items-center justify-center text-2xl text-white/50 border border-white/10 rounded-lg disabled:opacity-20 cursor-pointer active:bg-white/10"
        >
          ‹
        </button>

        <button
          onClick={toggleEliminate}
          className={`h-14 flex-1 min-w-0 rounded-lg border text-base flex items-center justify-center gap-2 cursor-pointer transition-colors ${
            isEliminated
              ? 'text-white/70 border-white/20 bg-white/5 active:bg-white/10'
              : 'text-red-400 border-red-500/30 bg-red-500/10 active:bg-red-500/20'
          }`}
        >
          <span className="text-lg">{isEliminated ? '↩' : '✕'}</span>
          <span className="truncate">{isEliminated ? '恢复' : '淘汰'}</span>
        </button>

        <button
          onClick={toggleFavorite}
          className={`h-14 w-14 shrink-0 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
            current.is_favorite
              ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/20'
              : 'text-yellow-400/60 border-yellow-500/20 active:bg-yellow-500/10'
          }`}
          aria-label="收藏"
        >
          <span className="text-xl">★</span>
        </button>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={confirming}
          className="h-14 flex-1 min-w-0 rounded-lg border border-green-500/40 bg-green-500/20 text-green-300 text-base flex items-center justify-center gap-2 cursor-pointer active:bg-green-500/30 disabled:opacity-50"
        >
          <span className="text-lg">✓</span>
          <span className="truncate">{confirming ? '处理中…' : `确认保留 ${keepCount}`}</span>
        </button>

        <button
          onClick={goNext}
          disabled={index === items.length - 1}
          aria-label="下一张"
          className="h-14 w-11 shrink-0 flex items-center justify-center text-2xl text-white/50 border border-white/10 rounded-lg disabled:opacity-20 cursor-pointer active:bg-white/10"
        >
          ›
        </button>
      </div>

      {/* 二次确认弹窗 */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
            onClick={() => !confirming && setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16162a] p-5 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-white">确认保留这一组？</h3>
              <p className="mt-2 text-sm text-white/50 leading-relaxed">
                本组共 <span className="text-white/80">{items.length}</span> 张，已淘汰{' '}
                <span className="text-red-400">{eliminatedCount}</span> 张，将把剩余{' '}
                <span className="text-green-400">{keepCount}</span> 张标记为保留。
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={confirming}
                  className="h-12 flex-1 rounded-lg border border-white/15 text-white/60 text-sm cursor-pointer active:bg-white/5 disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  onClick={confirmKeep}
                  disabled={confirming}
                  className="h-12 flex-1 rounded-lg border border-green-500/40 bg-green-500/25 text-green-300 text-sm font-medium cursor-pointer active:bg-green-500/35 disabled:opacity-50"
                >
                  {confirming ? '处理中…' : `确认保留 ${keepCount}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
