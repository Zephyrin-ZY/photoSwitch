import { getDownloadUrl } from '../services/api'
import type { Photo } from '../types'

export type DownloadFormat = 'jpg' | 'raw'

export function hasRaw(photo: Photo): boolean {
  return Boolean(photo.raw_filename || photo.raw_path)
}

export async function downloadOriginal(
  projectId: string,
  photo: Photo,
  format: DownloadFormat,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(getDownloadUrl(photo.hash, projectId, format), { signal })
  if (!resp.ok) {
    let detail = '下载失败'
    try {
      const data = await resp.json()
      if (data?.detail) detail = String(data.detail)
    } catch {
      // 非 JSON 错误响应，保留默认提示
    }
    throw new Error(detail)
  }

  const blob = await resp.blob()
  const filename = format === 'raw'
    ? (photo.raw_filename || photo.raw_path?.split('/').pop() || `${photo.filename}.raw`)
    : photo.filename
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 稍后释放，避免部分浏览器尚未开始读取 blob
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

export async function downloadDecisions(projectId: string): Promise<void> {
  const resp = await fetch(`/api/projects/${projectId}/decisions/export`)
  if (!resp.ok) {
    let detail = '导出筛选结果失败'
    try {
      const data = await resp.json()
      if (data?.detail) detail = String(data.detail)
    } catch {
      // 非 JSON 错误响应，保留默认提示
    }
    throw new Error(detail)
  }

  const blob = await resp.blob()
  const disposition = resp.headers.get('content-disposition') || ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const filename = encoded ? decodeURIComponent(encoded[1]) : 'photoswitch-decisions.json'

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}