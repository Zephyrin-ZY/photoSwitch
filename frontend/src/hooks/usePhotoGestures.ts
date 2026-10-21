import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from '../utils/touch'

/**
 * 图片查看手势（桌面鼠标 + 移动触摸通用）。
 *
 * - 桌面：滚轮缩放、放大后鼠标拖拽平移
 * - 触摸：横滑切图、双指捏合缩放、双击放大/还原、放大后单指平移
 * - 平移按 contentSize / viewportSize 计算边界，拖动不会把图片甩出可视区
 *
 * 统一用 Pointer Events 处理，双指变单指时可以立即转成平移；
 * 位移用 rAF 合帧并直接写入 transform，避免高频 setState 造成卡顿。
 */

const DOUBLE_TAP_GAP = 300 // ms
const SWIPE_THRESHOLD = 60 // px
const TAP_SLOP = 10 // px

interface Size {
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

type GestureMode = 'none' | 'swipe' | 'pan' | 'pinch'

interface GestureState {
  pointers: Map<number, Point>
  mode: GestureMode
  startX: number
  startY: number
  lastX: number
  lastY: number
  startTime: number
  moved: boolean
  hadPinch: boolean
  pinchStartScale: number
  pinchStartOffset: Point
  pinchStartDist: number
  pinchStartCentroid: Point
  lastTapTime: number
}

const initialGestureState = (): GestureState => ({
  pointers: new Map(),
  mode: 'none',
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  startTime: 0,
  moved: false,
  hadPinch: false,
  pinchStartScale: 1,
  pinchStartOffset: { x: 0, y: 0 },
  pinchStartDist: 1,
  pinchStartCentroid: { x: 0, y: 0 },
  lastTapTime: 0,
})

export interface UsePhotoGesturesOptions {
  onPrev?: () => void
  onNext?: () => void
  /** 变化时重置缩放/位移（如切换照片时传入 hash 或 index） */
  resetKey?: unknown
  minScale?: number
  maxScale?: number
  /** scale=1 时图片内容的实际渲染尺寸，用于计算平移边界 */
  contentSize?: Size | null
  /** 可见裁剪区域的尺寸，用于计算平移边界 */
  viewportSize?: Size | null
}

export interface PhotoGestureHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onLostPointerCapture: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export interface UsePhotoGesturesReturn {
  scale: number
  offset: Point
  imgStyle: React.CSSProperties
  handlers: PhotoGestureHandlers
  /** 绑定到接收手势的容器（同时用于非 passive 滚轮监听） */
  stageRef: React.RefObject<HTMLDivElement | null>
  resetZoom: () => void
  toggleZoom: (focal?: Point) => void
  zoomIn: () => void
  zoomOut: () => void
}

export function usePhotoGestures({
  onPrev,
  onNext,
  resetKey,
  minScale = 1,
  maxScale = 5,
  contentSize,
  viewportSize,
}: UsePhotoGesturesOptions = {}): UsePhotoGesturesReturn {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })

  const stageRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(1)
  const offsetRef = useRef<Point>({ x: 0, y: 0 })
  const gestureRef = useRef<GestureState>(initialGestureState())
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ scale: number; offset: Point } | null>(null)

  // 手势回调里读 ref，避免闭包拿到旧的尺寸 / 位移
  const contentSizeRef = useRef(contentSize)
  const viewportSizeRef = useRef(viewportSize)

  useEffect(() => {
    contentSizeRef.current = contentSize
    viewportSizeRef.current = viewportSize
  }, [contentSize, viewportSize])

  const getBounds = useCallback((nextScale: number) => {
    const content = contentSizeRef.current
    const viewport = viewportSizeRef.current
    if (!content || !viewport) return null
    return {
      x: Math.max(0, (content.width * nextScale - viewport.width) / 2),
      y: Math.max(0, (content.height * nextScale - viewport.height) / 2),
    }
  }, [])

  const clampOffset = useCallback((nextOffset: Point, nextScale: number): Point => {
    const bounds = getBounds(nextScale)
    if (!bounds) return nextOffset
    return {
      x: clamp(nextOffset.x, -bounds.x, bounds.x),
      y: clamp(nextOffset.y, -bounds.y, bounds.y),
    }
  }, [getBounds])

  const canPanAt = useCallback((nextScale: number): boolean => {
    const bounds = getBounds(nextScale)
    return !!bounds && (bounds.x > 0.5 || bounds.y > 0.5)
  }, [getBounds])

  const flush = useCallback(() => {
    rafRef.current = null
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending) {
      setScale(pending.scale)
      setOffset(pending.offset)
    }
  }, [])

  /** 更新 transform：ref 立即生效，状态更新按帧合并 */
  const commit = useCallback((nextScale: number, nextOffset: Point, immediate = false) => {
    const safeScale = clamp(nextScale, minScale, maxScale)
    const safeOffset = clampOffset(nextOffset, safeScale)
    scaleRef.current = safeScale
    offsetRef.current = safeOffset

    if (immediate) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      pendingRef.current = null
      setScale(safeScale)
      setOffset(safeOffset)
      return
    }

    pendingRef.current = { scale: safeScale, offset: safeOffset }
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush)
    }
  }, [clampOffset, flush, minScale, maxScale])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  const resetZoom = useCallback(() => {
    commit(1, { x: 0, y: 0 }, true)
  }, [commit])

  // 切换照片时重置缩放
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换照片需要同步清空手势状态
    commit(1, { x: 0, y: 0 }, true)
  }, [resetKey, commit])

  // 容器尺寸 / 裁切框尺寸变化时，把位移收回到新边界内
  useEffect(() => {
    commit(scaleRef.current, offsetRef.current, true)
  }, [contentSize?.width, contentSize?.height, viewportSize?.width, viewportSize?.height, commit])

  /** 以 stage 中心为基准的锚点缩放（focal 为视口坐标） */
  const zoomAt = useCallback((targetScale: number, focal?: Point, immediate = false) => {
    const fromScale = scaleRef.current
    const fromOffset = offsetRef.current
    const nextScale = clamp(targetScale, minScale, maxScale)

    let focalRel = { x: 0, y: 0 }
    const el = stageRef.current
    if (focal && el) {
      const rect = el.getBoundingClientRect()
      focalRel = {
        x: focal.x - rect.left - rect.width / 2,
        y: focal.y - rect.top - rect.height / 2,
      }
    }

    const ratio = nextScale / fromScale
    commit(nextScale, {
      x: focalRel.x - (focalRel.x - fromOffset.x) * ratio,
      y: focalRel.y - (focalRel.y - fromOffset.y) * ratio,
    }, immediate)
  }, [commit, minScale, maxScale])

  const zoomIn = useCallback(() => zoomAt(scaleRef.current + 0.5), [zoomAt])
  const zoomOut = useCallback(() => zoomAt(scaleRef.current - 0.5), [zoomAt])
  const toggleZoom = useCallback((focal?: Point) => {
    if (scaleRef.current > 1.01) commit(1, { x: 0, y: 0 }, true)
    else zoomAt(2.5, focal, true)
  }, [commit, zoomAt])

  // 原生 wheel 监听（React 的 onWheel 是 passive，无法阻止页面滚动）
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomAt(scaleRef.current * Math.exp(-delta * 0.0015), { x: e.clientX, y: e.clientY })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [zoomAt])

  const beginPinch = useCallback((g: GestureState) => {
    const points = Array.from(g.pointers.values()).slice(0, 2)
    if (points.length < 2) return
    const centroid = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    }
    const rect = stageRef.current?.getBoundingClientRect()
    g.mode = 'pinch'
    g.hadPinch = true
    g.moved = true
    g.pinchStartScale = scaleRef.current
    g.pinchStartOffset = { ...offsetRef.current }
    g.pinchStartDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1
    g.pinchStartCentroid = rect
      ? { x: centroid.x - rect.left - rect.width / 2, y: centroid.y - rect.top - rect.height / 2 }
      : { x: 0, y: 0 }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // 某些浏览器 / 合成事件不支持 pointer capture，忽略即可
    }

    const g = gestureRef.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (g.pointers.size === 1) {
      g.mode = canPanAt(scaleRef.current) ? 'pan' : 'swipe'
      g.startX = e.clientX
      g.startY = e.clientY
      g.lastX = e.clientX
      g.lastY = e.clientY
      g.startTime = Date.now()
      g.moved = false
      g.hadPinch = false
    } else if (g.pointers.size === 2) {
      beginPinch(g)
    }
  }, [beginPinch, canPanAt])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current
    if (!g.pointers.has(e.pointerId)) return
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (g.pointers.size >= 2) {
      if (g.mode !== 'pinch') beginPinch(g)
      const points = Array.from(g.pointers.values()).slice(0, 2)
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1
      const centroid = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      }
      const rect = stageRef.current?.getBoundingClientRect()
      const centroidRel = rect
        ? { x: centroid.x - rect.left - rect.width / 2, y: centroid.y - rect.top - rect.height / 2 }
        : { x: 0, y: 0 }

      const nextScale = clamp(g.pinchStartScale * (dist / g.pinchStartDist), minScale, maxScale)
      const ratio = nextScale / g.pinchStartScale
      commit(nextScale, {
        x: centroidRel.x - (g.pinchStartCentroid.x - g.pinchStartOffset.x) * ratio,
        y: centroidRel.y - (g.pinchStartCentroid.y - g.pinchStartOffset.y) * ratio,
      })
      return
    }

    if (g.mode !== 'pan' && g.mode !== 'swipe') return
    const dxTotal = e.clientX - g.startX
    const dyTotal = e.clientY - g.startY
    if (!g.moved && (Math.abs(dxTotal) > TAP_SLOP || Math.abs(dyTotal) > TAP_SLOP)) {
      g.moved = true
    }

    if (g.mode === 'pan') {
      // 增量平移：到边界后反向拖动可以立即跟手，不会出现“粘住”的假死感
      const dx = e.clientX - g.lastX
      const dy = e.clientY - g.lastY
      g.lastX = e.clientX
      g.lastY = e.clientY
      if (dx !== 0 || dy !== 0) {
        commit(scaleRef.current, {
          x: offsetRef.current.x + dx,
          y: offsetRef.current.y + dy,
        })
      }
    } else {
      g.lastX = e.clientX
      g.lastY = e.clientY
    }
  }, [beginPinch, commit, maxScale, minScale])

  const finishSingleGesture = useCallback((g: GestureState, end: Point) => {
    if (g.hadPinch) return
    const dx = end.x - g.startX
    const dy = end.y - g.startY

    if (
      g.mode === 'swipe' &&
      Math.abs(dx) > SWIPE_THRESHOLD &&
      Math.abs(dx) > Math.abs(dy) * 1.5
    ) {
      if (dx < 0) onNext?.()
      else onPrev?.()
      g.lastTapTime = 0
      return
    }

    if (!g.moved && Date.now() - g.startTime < DOUBLE_TAP_GAP) {
      const now = Date.now()
      if (now - g.lastTapTime < DOUBLE_TAP_GAP) {
        g.lastTapTime = 0
        toggleZoom(end)
      } else {
        g.lastTapTime = now
      }
    }
  }, [toggleZoom, onNext, onPrev])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current
    if (!g.pointers.has(e.pointerId)) return
    const wasMultiTouch = g.mode === 'pinch' || g.hadPinch
    g.pointers.delete(e.pointerId)

    if (g.pointers.size === 1) {
      // 双指松开一指：立即把剩余手指当作平移起点，避免状态卡在 pinch
      const remaining = Array.from(g.pointers.values())[0]
      g.mode = canPanAt(scaleRef.current) ? 'pan' : 'swipe'
      g.startX = remaining.x
      g.startY = remaining.y
      g.lastX = remaining.x
      g.lastY = remaining.y
      g.startTime = Date.now()
      g.moved = true
      g.hadPinch = true
      return
    }

    if (g.pointers.size === 0) {
      if (!wasMultiTouch) {
        finishSingleGesture(g, { x: e.clientX, y: e.clientY })
      }
      g.mode = 'none'
    }
  }, [canPanAt, finishSingleGesture])

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current
    if (!g.pointers.has(e.pointerId)) return
    g.pointers.delete(e.pointerId)
    if (g.pointers.size === 1) {
      const remaining = Array.from(g.pointers.values())[0]
      g.mode = canPanAt(scaleRef.current) ? 'pan' : 'swipe'
      g.startX = remaining.x
      g.startY = remaining.y
      g.lastX = remaining.x
      g.lastY = remaining.y
      g.startTime = Date.now()
      g.moved = true
      g.hadPinch = true
    } else if (g.pointers.size === 0) {
      g.mode = 'none'
      g.hadPinch = false
    }
  }, [canPanAt])

  const handlers: PhotoGestureHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture: onPointerCancel,
    onContextMenu: e => e.preventDefault(),
  }

  const imgStyle: React.CSSProperties = {
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
    transformOrigin: 'center center',
    willChange: 'transform',
    cursor: scale > 1 ? 'grab' : 'default',
  }

  return { scale, offset, imgStyle, handlers, stageRef, resetZoom, toggleZoom, zoomIn, zoomOut }
}
