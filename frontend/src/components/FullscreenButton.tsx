import { useEffect, useState } from 'react'
import { useIsTouch } from '../utils/touch'

/**
 * 页面内「全屏」按钮（仅触屏设备显示）。
 *
 * 为什么用它而不是 PWA 安装：通过局域网 IP 的纯 HTTP 访问属于「非安全上下文」，
 * Chrome 不会真正安装 PWA、也无法进入 standalone 全屏。而 Fullscreen API 不要求
 * HTTPS，只需用户点击即可触发，安卓 Chrome 支持良好，可真正隐藏浏览器 UI 进入沉浸式全屏。
 */
export default function FullscreenButton() {
  const isTouch = useIsTouch()
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  if (!isTouch) return null

  const toggle = () => {
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.()
      } else {
        void document.documentElement.requestFullscreen?.().catch(() => {
          // 某些浏览器/环境不支持，忽略即可
        })
      }
    } catch {
      // 忽略不支持的环境
    }
  }

  return (
    <button
      onClick={toggle}
      title={isFs ? '退出全屏' : '进入全屏'}
      className="flex items-center justify-center gap-1 px-2.5 h-9 rounded-md border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
    >
      {isFs ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}
      <span className="text-xs">{isFs ? '退出全屏' : '全屏'}</span>
    </button>
  )
}
