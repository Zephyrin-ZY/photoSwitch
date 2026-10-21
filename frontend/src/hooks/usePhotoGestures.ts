import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from '../utils/touch'

/**
 * 图片查看手势（桌面鼠标 + 移动触摸通用）。
 *
 * - 桌面：滚轮缩放、放大后鼠标拖拽平移
 * - 触摸：横滑切图、双指捏合缩放、双击放大/还原、放大后单指平移
 *
 * 抽成 hook 以便 PhotoViewer 与 ClusterReview（相似组淘汰浏览）共用同一套手势。
 */

const DOUBLE_TAP_GAP = 300 // ms
const SWIPE_THRESHOLD = 60 // px

type TouchMode = 'none' | 'swipe' | 'pan' | 'pinch'

interface TouchState {
  mode: TouchMode
  startX: number
  startY: number
  startOffset: { x: number; y: number }
  startDist: number
  startScale: number
  startTime: number
  moved: boolean
}

const initialTouchState = (): TouchState => ({
  mode: 'none',
  startX: 0,
  startY: 0,
  startOffset: { x: 0, y: 0 },
  startDist: 0,
  startScale: 1,
  startTime: 0,
  moved: false,
})

export interface UsePhotoGesturesOptions {
  onPrev?: () => void
  onNext?: () => void
  /** 变化时重置缩放/位移（如切换照片时传入 hash 或 index） */
  resetKey?: unknown
  minScale?: number
  maxScale?: number
}

export interface PhotoGestureHandlers {
  onWheel: (e: React.WheelEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  onTouchCancel: (e: React.TouchEvent) => void
}

export interface UsePhotoGesturesReturn {
  scale: number
  offset: { x: number; y: number }
  imgStyle: React.CSSProperties
  handlers: PhotoGestureHandlers
  resetZoom: () => void
  toggleZoom: () => void
  zoomIn: () => void
  zoomOut: () => void
}

export function usePhotoGestures({
  onPrev,
  onNext,
  resetKey,
  minScale = 1,
  maxScale = 5,
}: UsePhotoGesturesOptions = {}): UsePhotoGesturesReturn {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetRef = useRef({ x: 0, y: 0 })
  const touchRef = useRef<TouchState>(initialTouchState())
  const lastTapRef = useRef(0)

  const resetZoom = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // 切换照片时重置缩放（与原实现一致，采用 effect）
  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [resetKey])

  const toggleZoom = useCallback(() => {
    setScale(s => (s > 1 ? 1 : 2.5))
    setOffset({ x: 0, y: 0 })
  }, [])

  const zoomIn = useCallback(() => setScale(s => Math.min(maxScale, s + 0.3)), [maxScale])
  const zoomOut = useCallback(() => setScale(s => Math.max(minScale, s - 0.3)), [minScale])

  // ---- 桌面：滚轮 + 鼠标拖拽 ----
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(prev => clamp(prev - e.deltaY * 0.002, minScale, maxScale))
  }, [minScale, maxScale])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    dragRef.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetRef.current = offset
  }, [scale, offset])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    setOffset({
      x: offsetRef.current.x + (e.clientX - dragStart.current.x),
      y: offsetRef.current.y + (e.clientY - dragStart.current.y),
    })
  }, [])

  const onMouseUp = useCallback(() => { dragRef.current = false }, [])

  // ---- 触摸：横滑 / 捏合 / 双击 / 平移 ----
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const s = touchRef.current
    if (e.touches.length === 1) {
      const t = e.touches[0]
      s.mode = scale > 1 ? 'pan' : 'swipe'
      s.startX = t.clientX
      s.startY = t.clientY
      s.startOffset = { ...offset }
      s.startTime = Date.now()
      s.moved = false
    } else if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      s.mode = 'pinch'
      s.startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1
      s.startScale = scale
      s.moved = true
    }
  }, [scale, offset])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = touchRef.current
    if (s.mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault()
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      setScale(clamp(s.startScale * (dist / s.startDist), 1, maxScale))
    } else if (s.mode === 'pan' && e.touches.length === 1) {
      e.preventDefault()
      const t = e.touches[0]
      const dx = t.clientX - s.startX
      const dy = t.clientY - s.startY
      setOffset({
        x: s.startOffset.x + dx,
        y: s.startOffset.y + dy,
      })
      // 仅当移动超过阈值才算“已移动”，避免放大后轻点被误判为平移而无法双击还原
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) s.moved = true
    } else if (s.mode === 'swipe' && e.touches.length === 1) {
      const t = e.touches[0]
      if (Math.abs(t.clientX - s.startX) > 8) s.moved = true
    }
  }, [maxScale])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = touchRef.current
    // 单指结束（swipe=未放大 / pan=已放大）都要检测双击：放大与还原都靠双击切换
    if (s.mode === 'swipe' || s.mode === 'pan') {
      const t = e.changedTouches[0]
      const dx = t.clientX - s.startX
      const dy = t.clientY - s.startY
      const dt = Date.now() - s.startTime
      const isTap = !s.moved && dt < DOUBLE_TAP_GAP && Math.abs(dx) < 10 && Math.abs(dy) < 10
      if (isTap) {
        const now = Date.now()
        if (now - lastTapRef.current < DOUBLE_TAP_GAP) {
          toggleZoom()
          lastTapRef.current = 0
        } else {
          lastTapRef.current = now
        }
      } else if (
        s.mode === 'swipe' &&
        Math.abs(dx) > SWIPE_THRESHOLD &&
        Math.abs(dx) > Math.abs(dy) * 1.5
      ) {
        // 仅在未放大时横滑切图；放大后横滑属于平移
        if (dx < 0) onNext?.()
        else onPrev?.()
      }
    }
    if (e.touches.length === 0) s.mode = 'none'
  }, [toggleZoom, onNext, onPrev])

  const handlers: PhotoGestureHandlers = {
    onWheel,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave: onMouseUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  }

  const imgStyle: React.CSSProperties = {
    transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
    cursor: scale > 1 ? 'grab' : 'default',
  }

  return { scale, offset, imgStyle, handlers, resetZoom, toggleZoom, zoomIn, zoomOut }
}
