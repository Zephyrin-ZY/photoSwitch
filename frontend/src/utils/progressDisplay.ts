export interface ScanProgressMetrics {
  current: number
  total: number
  discovered: number
  done: boolean
}

export interface AnalysisProgressMetrics {
  thumbnail: { current: number; total: number }
  clip: { current: number; total: number }
}

export function getScanProgressPercent(progress: ScanProgressMetrics): number {
  if (progress.total <= 0) return 0
  return Math.round((progress.current / progress.total) * 100)
}

export function getScanProgressMessage(progress: ScanProgressMetrics): string {
  if (progress.total <= 0) {
    return progress.discovered > 0
      ? `正在统计照片... 已发现 ${progress.discovered} 张`
      : '正在统计照片...'
  }

  return `已处理 ${progress.current} / ${progress.total} 张候选照片，发现 ${progress.discovered} 张可导入照片`
}

export function getAnalysisPercent(
  progress: AnalysisProgressMetrics,
): number {
  const stages = [
    progress.thumbnail,
    progress.clip,
  ]

  const total = stages.reduce((sum, stage) => sum + stage.total, 0)
  if (total <= 0) return 0

  const current = stages.reduce((sum, stage) => sum + stage.current, 0)
  return Math.round((current / total) * 100)
}
