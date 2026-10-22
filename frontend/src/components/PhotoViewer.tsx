import { useState, useEffect, useCallback, useMemo } from 'react'
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

const RATIO_OPTIONS = [
  { key: 'original', label: '原图', hint: '原始比例' },
  { key: '1:1', label: '1:1', hint: '方图 · 朋友圈九宫格 / 头像' },
  { key: '4:3', label: '4:3', hint: '横图 · 手机默认 / 小红书横图' },
  { key: '3:2', label: '3:2', hint: '横图 · 相机经典比例' },
  { key: '16:9', label: '16:9', hint: '宽幅 · 朋友圈 / 视频封面' },
  { key: '4:5', label: '4:5', hint: '竖图 · Instagram / 朋友圈' },
  { key: '3:4', label: '3:4', hint: '竖图 · 小红书首图' },
  { key: '2:3', label: '2:3', hint: '竖图 · 人像 / 打印' },
  { key: '9:16', label: '9:16', hint: '全屏竖图 · 抖音 / Story' },
] as const

type RatioKey = typeof RATIO_OPTIONS[number]['key']

function getRatioAspect(key: RatioKey): number | null {
  if (key === 'original') return null
  const [w, h] = key.split(':').map(Number)
  return w / h
}

const FRAME_PADDING = 12

export default function PhotoViewer({ photo, projectId, photos, currentIndex, onClose, onNavigate, onStatusChange, onToggleFavorite }: Props) {
  const { match, label } = useShortcuts()
  const isTouch = useIsTouch()
  const [loadedHash, setLoadedHash] = useState<string | null>(null)
  const [loadedAspect, setLoadedAspect] = useState<{ hash: string; aspect: number } | null>(null)
  const [ratio, setRatio] = useState<RatioKey>('original')
  const [showGrid, setShowGrid] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })

  const ratioAspect = getRatioAspect(ratio)
  // 先用元数据比例，图片加载完成后再用实际渲染尺寸校正（EXIF 旋转）
  const metaAspect = photo.width && photo.height ? photo.width / photo.height : null
  const imgAspect = loadedAspect?.hash === photo.hash ? loadedAspect.aspect : metaAspect
  const displaySrc = loadedHash === photo.hash ? 'original' : 'thumb'

  // ---- 裁切预览几何 ----
  // 裁切框：在可视区域内放下目标比例的最大矩形
  const cropFrame = useMemo(() => {
    if (!ratioAspect || stageSize.width <= 0 || stageSize.height <= 0) return null
    const availW = Math.max(1, stageSize.width - FRAME_PADDING * 2)
    const availH = Math.max(1, stageSize.height - FRAME_PADDING * 2)
    let width = availW
    let height = width / ratioAspect
    if (height > availH) {
      height = availH
      width = height * ratioAspect
    }
    return { width, height }
  }, [ratioAspect, stageSize])

  // 原图模式下的 contain 尺寸
  const containSize = useMemo(() => {
    if (!imgAspect || stageSize.width <= 0 || stageSize.height <= 0) return null
    let width = stageSize.width
    let height = width / imgAspect
    if (height > stageSize.height) {
      height = stageSize.height
      width = height * imgAspect
    }
    return { width, height }
  }, [imgAspect, stageSize])

  // 裁切模式下图片按 cover 铺在裁切框里，基础内容尺寸可能大于裁切框
  const cropContentSize = useMemo(() => {
    if (!cropFrame || !imgAspect) return null
    const frameAspect = cropFrame.width / cropFrame.height
    if (imgAspect >= frameAspect) {
      return { width: cropFrame.height * imgAspect, height: cropFrame.height }
    }
    return { width: cropFrame.width, height: cropFrame.width / imgAspect }
  }, [cropFrame, imgAspect])

  const gestureContentSize = ratio === 'original' ? containSize : (cropContentSize ?? cropFrame)
  const gestureViewportSize = ratio === 'original' ? stageSize : cropFrame

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

  const { imgStyle, handlers, stageRef, scale, resetZoom, zoomIn, zoomOut } = usePhotoGestures({
    onPrev: goPrev,
    onNext: goNext,
    resetKey: photo.hash,
    contentSize: gestureContentSize,
    viewportSize: gestureViewportSize,
  })

  // 监听图片区尺寸（横竖屏切换、工具栏高度变化都会触发）
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setStageSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [stageRef])

  // 切换照片时先用元数据里的比例，图片加载后再以实际渲染尺寸校正（EXIF 旋转）
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth <= 0 || naturalHeight <= 0) return
    const aspect = naturalWidth / naturalHeight
    setLoadedAspect(prev => (
      prev?.hash === photo.hash && Math.abs(prev.aspect - aspect) < 0.001
        ? prev
        : { hash: photo.hash, aspect }
    ))
  }, [photo.hash])

  const selectRatio = (key: RatioKey) => {
    if (key === ratio) return
    setRatio(key)
    resetZoom()
  }

  // 渐进加载：先显示 medium 缩略图，原图加载完成后替换
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.src = getOriginalUrl(photo.hash, projectId)
    img.onload = () => {
      const swap = () => {
        if (!cancelled) setLoadedHash(photo.hash)
      }
      // 等原图解码完成再切换，避免手机端拖动时切到尚未解码的大图而短暂黑屏
      if (typeof img.decode === 'function') img.decode().then(swap, swap)
      else swap()
    }
    return () => { cancelled = true }
  }, [photo.hash, projectId])

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

  const previewSrc = getThumbnailUrl(photo.hash, projectId, 'medium')
  const src = displaySrc === 'original'
    ? getOriginalUrl(photo.hash, projectId)
    : previewSrc

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col"
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
            </>
          )}
          <button onClick={onClose} aria-label="关闭" className={`text-white/40 border border-white/10 rounded-md cursor-pointer hover:text-white/70 flex items-center justify-center ${isTouch ? 'w-11 h-11 text-xl' : 'px-3 py-1.5 text-xs'}`}>
            ✕
          </button>
        </div>
      </div>

      {/* 比例预览工具栏 */}
      <div className="flex items-center gap-2 px-2 sm:px-4 py-2 border-b border-white/10 bg-white/[0.03]">
        <span className="hidden md:inline text-[11px] text-white/25 shrink-0 select-none">比例预览</span>
        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar ratio-scroll">
          <div className="flex items-center gap-1 w-max py-0.5">
            {RATIO_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={e => {
                  e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest' })
                  selectRatio(opt.key)
                }}
                title={opt.hint}
                aria-pressed={ratio === opt.key}
                className={`h-8 px-2.5 rounded-md border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer select-none ${
                  ratio === opt.key
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'text-white/45 border-white/10 hover:text-white/70 hover:border-white/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 border-l border-white/10 pl-2">
          <ToolbarButton
            label={showGrid ? '隐藏九宫格辅助线' : '显示九宫格辅助线'}
            onClick={() => setShowGrid(v => !v)}
            active={showGrid}
          >
            <GridIcon />
          </ToolbarButton>
          <span className="w-px h-5 bg-white/10 mx-0.5" aria-hidden />
          <ToolbarButton label="缩小" onClick={zoomOut} disabled={scale <= 1.001}>−</ToolbarButton>
          <span className="w-10 text-center text-[11px] tabular-nums text-white/50 select-none">{Math.round(scale * 100)}%</span>
          <ToolbarButton label="放大" onClick={zoomIn} disabled={scale >= 4.999}>+</ToolbarButton>
          <ToolbarButton label="重置缩放" onClick={resetZoom}>↺</ToolbarButton>
        </div>
      </div>

      {/* 图片区 */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 relative overflow-hidden flex items-center justify-center select-none"
        style={{ touchAction: 'none' }}
        {...handlers}
      >
        {ratio === 'original' ? (
          <div className="absolute inset-0">
            <img
              src={previewSrc}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-contain select-none"
              style={imgStyle}
              draggable={false}
            />
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-contain select-none"
              style={imgStyle}
              draggable={false}
              onLoad={handleImageLoad}
            />
          </div>
        ) : cropFrame ? (
          <>
            {cropContentSize && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden>
                <img
                  src={previewSrc}
                  alt=""
                  className="max-w-none max-h-none shrink-0 select-none opacity-20"
                  style={{ width: cropContentSize.width, height: cropContentSize.height, ...imgStyle }}
                  draggable={false}
                />
              </div>
            )}
            <div
              className="relative overflow-hidden bg-black"
              style={{ width: cropFrame.width, height: cropFrame.height }}
            >
              {cropContentSize && (
                <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                  <img
                    src={previewSrc}
                    alt=""
                    className="max-w-none max-h-none shrink-0 select-none"
                    style={{ width: cropContentSize.width, height: cropContentSize.height, ...imgStyle }}
                    draggable={false}
                  />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                {cropContentSize ? (
                  <img
                    src={src}
                    alt=""
                    className="max-w-none max-h-none shrink-0 select-none"
                    style={{ width: cropContentSize.width, height: cropContentSize.height, ...imgStyle }}
                    draggable={false}
                    onLoad={handleImageLoad}
                  />
                ) : (
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full object-cover select-none"
                    style={imgStyle}
                    draggable={false}
                    onLoad={handleImageLoad}
                  />
                )}
              </div>
              <div className="pointer-events-none absolute inset-0 border border-white/20" />
              {showGrid && <RuleOfThirdsGrid />}
            </div>
          </>
        ) : null}

        {ratio === 'original' && showGrid && containSize && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: containSize.width, height: containSize.height }}
            aria-hidden
          >
            <RuleOfThirdsGrid />
          </div>
        )}

        {ratio !== 'original' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white/50 backdrop-blur-sm">
              {isTouch ? '双指缩放 · 拖动调整裁切' : '滚轮缩放 · 拖拽调整裁切'}
            </span>
          </div>
        )}
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
            {label('viewer.prev')} / {label('viewer.next')} 切换 · {label('viewer.keep')} 保留 · {label('viewer.eliminate')} 淘汰 · {label('viewer.favorite')} 收藏 · 滚轮/双击缩放 · 拖拽平移
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

function ToolbarButton({ label, onClick, disabled, active, children }: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`h-8 w-8 flex items-center justify-center rounded-md border text-sm cursor-pointer active:bg-white/10 disabled:opacity-20 disabled:cursor-default select-none ${
        active
          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
          : 'border-white/10 text-white/55 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
      <rect x="1.25" y="1.25" width="13.5" height="13.5" rx="1.5" opacity="0.6" />
      <path d="M5.75 1.25v13.5M10.25 1.25v13.5M1.25 5.75h13.5M1.25 10.25h13.5" />
    </svg>
  )
}

function RuleOfThirdsGrid() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <span className="absolute inset-y-0 left-1/3 w-px bg-white/45 shadow-[0_0_3px_rgba(0,0,0,0.5)]" />
      <span className="absolute inset-y-0 left-2/3 w-px bg-white/45 shadow-[0_0_3px_rgba(0,0,0,0.5)]" />
      <span className="absolute inset-x-0 top-1/3 h-px bg-white/45 shadow-[0_0_3px_rgba(0,0,0,0.5)]" />
      <span className="absolute inset-x-0 top-2/3 h-px bg-white/45 shadow-[0_0_3px_rgba(0,0,0,0.5)]" />
    </div>
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
