import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { getOriginalUrl, getThumbnailUrl } from '../services/api'
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
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [originalLoaded, setOriginalLoaded] = useState(false)
  const [displaySrc, setDisplaySrc] = useState<'thumb' | 'original'>('thumb')
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetRef = useRef({ x: 0, y: 0 })

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
      // 给一个短暂延迟让浏览器完成解码，然后切换
      const t = setTimeout(() => setDisplaySrc('original'), 50)
      return () => clearTimeout(t)
    }
  }, [originalLoaded])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(prev => Math.max(0.5, Math.min(5, prev - e.deltaY * 0.002)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetRef.current = offset
  }, [scale, offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setOffset({
      x: offsetRef.current.x + (e.clientX - dragStart.current.x),
      y: offsetRef.current.y + (e.clientY - dragStart.current.y),
    })
  }, [isDragging])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  const resetZoom = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }) }, [])

  useEffect(() => {
    resetZoom()
  }, [photo.hash, resetZoom])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1)
      if (e.key === 'ArrowRight' && currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
      if (e.key === 'ArrowUp') onToggleFavorite(photo.hash, !photo.is_favorite)
      if (e.key === 'ArrowDown') {
        onStatusChange(photo.hash, 'eliminate')
        if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
        else onClose()
      }
      if (e.key === 'k') {
        onStatusChange(photo.hash, 'keep')
        if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1)
        else onClose()
      }
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(5, s + 0.3))
      if (e.key === '-') setScale(s => Math.max(0.5, s - 0.3))
      if (e.key === '0') resetZoom()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [photo, currentIndex, photos, onClose, onNavigate, onStatusChange, resetZoom])

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
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-4">
          <span className="text-white/50 text-sm">{photo.filename}</span>
          <span className="text-white/20 text-xs">{currentIndex + 1} / {photos.length}</span>
        </div>
        <div className="flex gap-2">
          <StatusButton status="keep" label="保留 (K)" color="green" onClick={() => onStatusChange(photo.hash, 'keep')} active={photo.status === 'keep'} />
          <StatusButton status="favorite" label={photo.is_favorite ? '取消收藏 (↑)' : '收藏 (↑)'} color="yellow" onClick={() => onToggleFavorite(photo.hash, !photo.is_favorite)} active={photo.is_favorite} />
          <StatusButton status="eliminate" label="淘汰 (↓)" color="red" onClick={() => onStatusChange(photo.hash, 'eliminate')} active={photo.status === 'eliminate'} />
          <button onClick={resetZoom} className="px-3 py-1.5 text-xs text-white/30 border border-white/10 rounded-md cursor-pointer hover:text-white/60">
            重置缩放
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-white/30 border border-white/10 rounded-md cursor-pointer hover:text-white/60">
            关闭
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <motion.img
          src={displaySrc === 'original' ? getOriginalUrl(photo.hash, projectId) : getThumbnailUrl(photo.hash, 'medium')}
          alt=""
          className="max-h-full max-w-full object-contain select-none"
          style={{
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            cursor: scale > 1 ? 'grab' : 'default',
          }}
          draggable={false}
        />
      </div>

      <div className="flex items-center justify-center gap-6 px-6 py-3 border-t border-white/10">
        <button
          onClick={() => currentIndex > 0 && onNavigate(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="px-4 py-2 text-xs text-white/40 border border-white/10 rounded-md disabled:opacity-20 cursor-pointer"
        >
          ← 上一张
        </button>
        <span className="text-white/20 text-xs">← → 切换 · K 保留 · ↓ 淘汰 · ↑ 收藏 · 滚轮缩放 · 拖拽平移</span>
        <button
          onClick={() => currentIndex < photos.length - 1 && onNavigate(currentIndex + 1)}
          disabled={currentIndex === photos.length - 1}
          className="px-4 py-2 text-xs text-white/40 border border-white/10 rounded-md disabled:opacity-20 cursor-pointer"
        >
          下一张 →
        </button>
      </div>
    </motion.div>
  )
}

function StatusButton({ label, color, onClick, active, status }: {
  status: string
  label: string
  color: string
  onClick: () => void
  active: boolean
}) {
  const colors: Record<string, string> = {
    green: active ? 'bg-green-500/30 text-green-400 border-green-500/40' : 'text-green-400/50 border-green-500/20 hover:bg-green-500/10',
    yellow: active ? 'bg-yellow-500/30 text-yellow-400 border-yellow-500/40' : 'text-yellow-400/50 border-yellow-500/20 hover:bg-yellow-500/10',
    red: active ? 'bg-red-500/30 text-red-400 border-red-500/40' : 'text-red-400/50 border-red-500/20 hover:bg-red-500/10',
  }
  const icons: Record<string, string> = {
    keep: '✓',
    favorite: '★',
    eliminate: '✕',
  }
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs border rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${colors[color]}`}
    >
      <span className="text-sm">{icons[status]}</span>
      {label}
    </button>
  )
}
