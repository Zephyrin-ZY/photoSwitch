import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getOriginalUrl, getThumbnailUrl } from '../services/api'
import { useShortcuts } from '../stores/ShortcutStore'
import { useIsTouch } from '../utils/touch'
import { usePhotoGestures } from '../hooks/usePhotoGestures'
import type { Photo } from '../types'

interface Props {
  photo: Photo
  projectId: string
  photos: Photo[]
  currentIndex: number
  onClose: () => void
  onNavigate: (idx: number) => void
  onStatusChange: (hash: string, status: string) => void
  onToggleFavorite: (hash: string, isFavorite: boolean) => void
}

export default function PhotoViewer({ photo, projectId, photos, currentIndex, onClose, onNavigate, onStatusChange, onToggleFavorite }: Props) {
  const { match, label } = useShortcuts()
  const isTouch = useIsTouch()
  const [originalLoaded, setOriginalLoaded] = useState(false)
  const [displaySrc, setDisplaySrc] = useState<'thumb' | 'original'>('thumb')

  // ---- 动作回调（键盘 / 鼠标按钮 / 触摸手势共用）----
  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1)
  }, [currentIndex, onNavigate])

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
  }, [currentIndex, photos.length, onNavigate])

  const advanceOrClose = useCallback(() => {
    if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
    else onClose()
  }, [currentIndex, photos.length, onNavigate, onClose])

  const doKeep = useCallback(() => {
    onStatusChange(photo.hash, 'keep')
    advanceOrClose()
  }, [photo.hash, onStatusChange, advanceOrClose])

  const doEliminate = useCallback(() => {
    onStatusChange(photo.hash, 'eliminate')
    advanceOrClose()
  }, [photo.hash, onStatusChange, advanceOrClose])

  const doFavorite = useCallback(() => {
    onToggleFavorite(photo.hash, !photo.is_favorite)
  }, [photo.hash, photo.is_favorite, onToggleFavorite])

  const { imgStyle, handlers, resetZoom, zoomIn, zoomOut } = usePhotoGestures({
    onPrev: goPrev,
    onNext: goNext,
    resetKey: photo.hash,
  })

  // 渐进加载：先显示 medium 缩略图，再加载原图
  useEffect(() => {
    setOriginalLoaded(false)
    setDisplaySrc('thumb')
    const img = new Image()
    img.src = getOriginalUrl(photo.hash, projectId)
    img.onload = () => setOriginalLoaded(true)
  }, [photo.hash, projectId])

  useEffect(() => {
    if (originalLoaded) {
      const t = setTimeout(() => setDisplaySrc('original'), 50)
      return () => clearTimeout(t)
    }
  }, [originalLoaded])

  // ---- 键盘快捷键（桌面）----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (match(e, 'viewer.close')) onClose()
      if (match(e, 'viewer.prev')) goPrev()
      if (match(e, 'viewer.next')) goNext()
      if (match(e, 'viewer.favorite')) doFavorite()
      if (match(e, 'viewer.eliminate')) doEliminate()
      if (match(e, 'viewer.keep')) doKeep()
      if (match(e, 'viewer.zoomIn')) zoomIn()
      if (match(e, 'viewer.zoomOut')) zoomOut()
      if (match(e, 'viewer.resetZoom')) resetZoom()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goPrev, goNext, doFavorite, doEliminate, doKeep, zoomIn, zoomOut, resetZoom, match])

  // 安全同步：当照片列表变化导致 currentIndex 越界时自动修正
  useEffect(() => {
    if (photos.length === 0) {
      onClose()
      return
    }
    if (currentIndex >= photos.length) {
      onNavigate(photos.length - 1)
    }
  }, [photos, currentIndex, onNavigate, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="text-white/50 text-xs sm:text-sm truncate">{photo.filename}</span>
          <span className="text-white/20 text-xs shrink-0">{currentIndex + 1} / {photos.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isTouch && (
            <>
              <StatusButton status="keep" label={`保留 (${label('viewer.keep')})`} color="green" onClick={doKeep} active={photo.status === 'keep'} />
              <StatusButton status="favorite" label={photo.is_favorite ? `取消收藏 (${label('viewer.favorite')})` : `收藏 (${label('viewer.favorite')})`} color="yellow" onClick={doFavorite} active={photo.is_favorite} />
              <StatusButton status="eliminate" label={`淘汰 (${label('viewer.eliminate')})`} color="red" onClick={doEliminate} active={photo.status === 'eliminate'} />
              <button onClick={resetZoom} className="px-3 py-1.5 text-xs text-white/30 border border-white/10 rounded-md cursor-pointer hover:text-white/60">
                重置缩放
              </button>
            </>
          )}
          <button onClick={onClose} aria-label="关闭" className={`text-white/40 border border-white/10 rounded-md cursor-pointer hover:text-white/70 flex items-center justify-center ${isTouch ? 'w-11 h-11 text-xl' : 'px-3 py-1.5 text-xs'}`}>
            ✕
          </button>
        </div>
      </div>

      {/* 图片区 */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        {...handlers}
      >
        <motion.img
          src={displaySrc === 'original' ? getOriginalUrl(photo.hash, projectId) : getThumbnailUrl(photo.hash, 'medium')}
          alt=""
          className="max-h-full max-w-full object-contain select-none"
          style={imgStyle}
          draggable={false}
        />
      </div>

      {/* 底部栏 */}
      {isTouch ? (
        <div className="flex items-center justify-between gap-2 px-3 py-3 border-t border-white/10">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="上一张"
            className="h-14 w-12 shrink-0 flex items-center justify-center text-2xl text-white/50 border border-white/10 rounded-lg disabled:opacity-20 cursor-pointer active:bg-white/10"
          >
            ‹
          </button>
          <div className="flex-1 flex items-center justify-center gap-2">
            <StatusButton status="eliminate" label="淘汰" color="red" onClick={doEliminate} active={photo.status === 'eliminate'} size="lg" />
            <StatusButton status="favorite" label={photo.is_favorite ? '已收藏' : '收藏'} color="yellow" onClick={doFavorite} active={photo.is_favorite} size="lg" />
            <StatusButton status="keep" label="保留" color="green" onClick={doKeep} active={photo.status === 'keep'} size="lg" />
          </div>
          <button
            onClick={goNext}
            disabled={currentIndex === photos.length - 1}
            aria-label="下一张"
            className="h-14 w-12 shrink-0 flex items-center justify-center text-2xl text-white/50 border border-white/10 rounded-lg disabled:opacity-20 cursor-pointer active:bg-white/10"
          >
            ›
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-6 px-6 py-3 border-t border-white/10">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="px-4 py-2 text-xs text-white/40 border border-white/10 rounded-md disabled:opacity-20 cursor-pointer"
          >
            ← 上一张
          </button>
          <span className="text-white/20 text-xs">
            {label('viewer.prev')} / {label('viewer.next')} 切换 · {label('viewer.keep')} 保留 · {label('viewer.eliminate')} 淘汰 · {label('viewer.favorite')} 收藏 · 滚轮缩放 · 拖拽平移
          </span>
          <button
            onClick={goNext}
            disabled={currentIndex === photos.length - 1}
            className="px-4 py-2 text-xs text-white/40 border border-white/10 rounded-md disabled:opacity-20 cursor-pointer"
          >
            下一张 →
          </button>
        </div>
      )}
    </motion.div>
  )
}

export function StatusButton({ label, color, onClick, active, status, size = 'sm' }: {
  status: string
  label: string
  color: string
  onClick: () => void
  active: boolean
  size?: 'sm' | 'lg'
}) {
  const colors: Record<string, string> = {
    green: active ? 'bg-green-500/30 text-green-400 border-green-500/40' : 'text-green-400/60 border-green-500/20 hover:bg-green-500/10',
    yellow: active ? 'bg-yellow-500/30 text-yellow-400 border-yellow-500/40' : 'text-yellow-400/60 border-yellow-500/20 hover:bg-yellow-500/10',
    red: active ? 'bg-red-500/30 text-red-400 border-red-500/40' : 'text-red-400/60 border-red-500/20 hover:bg-red-500/10',
  }
  const icons: Record<string, string> = {
    keep: '✓',
    favorite: '★',
    eliminate: '✕',
  }
  const sizing = size === 'lg'
    ? 'h-14 flex-1 max-w-[120px] text-base gap-2'
    : 'px-3 py-1.5 text-xs gap-1.5'
  return (
    <button
      onClick={onClick}
      className={`${sizing} border rounded-md transition-colors cursor-pointer flex items-center justify-center ${colors[color]}`}
    >
      <span className={size === 'lg' ? 'text-lg' : 'text-sm'}>{icons[status]}</span>
      {label}
    </button>
  )
}
