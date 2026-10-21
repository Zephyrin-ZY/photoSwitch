import { useEffect, useState } from 'react'

/**
 * 触摸模式检测。
 *
 * 为什么用 pointer: coarse 而不是屏幕宽度：
 * 横屏平板（如红米 K Pad 8.8" 3008×1880，横屏 CSS 视口约 1200px）宽度和
 * 小笔记本接近，用宽度无法可靠区分「触屏平板」和「桌面」。触屏设备的
 * 主指针是手指（coarse），桌面是鼠标（fine），用它判断最准确。
 */

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(pointer: coarse)').matches
}

/** 是否为触摸（粗指针）设备，会跟随系统状态实时更新。 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState<boolean>(isCoarsePointer)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(pointer: coarse)')
    const handler = () => setIsTouch(mq.matches)
    // 兼容旧版 Safari：优先 addEventListener，回退 addListener
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])

  return isTouch
}

/** 数值裁剪到 [min, max]。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
