import { useEffect, useState } from 'react'
import { getServerInfo } from '../services/api'
import { useIsTouch } from '../utils/touch'

/**
 * 标题栏显示本机局域网访问地址。
 *
 * 因为服务器就是这台电脑，其局域网 IP 会随网络变化；浏览器网页自身拿不到
 * 服务器 IP（用 localhost 打开时只知道 localhost），所以由后端探测本机 IP，
 * 前端拉取后与当前端口拼成平板可访问的完整地址。仅在非触屏（PC）端显示。
 */
export default function LanAddress() {
  const isTouch = useIsTouch()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    getServerInfo()
      .then(info => {
        if (cancelled) return
        if (!info.lan_ip) {
          setFailed(true)
          return
        }
        const port =
          window.location.port || (window.location.protocol === 'https:' ? '443' : '80')
        setUrl(`${window.location.protocol}//${info.lan_ip}:${port}`)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 触屏设备已经连上了，不需要显示；探测失败则不打扰
  if (isTouch || failed || !url) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时忽略（地址仍可见，可手动选择复制）
    }
  }

  const display = url.replace(/^https?:\/\//, '')

  return (
    <button
      onClick={copy}
      title={`平板/手机在同一 WiFi 下访问：${url}（点击复制）`}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span className="text-xs font-mono">{display}</span>
      <span className="text-[10px] text-white/30">{copied ? '已复制' : '复制'}</span>
    </button>
  )
}
