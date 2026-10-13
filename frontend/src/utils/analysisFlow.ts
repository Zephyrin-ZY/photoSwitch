export interface AnalysisProgressState {
  done: boolean
  error: string | null
}

export type AnalysisOutcome = 'running' | 'success' | 'failure'

export function getAnalysisOutcome(
  progress: AnalysisProgressState,
): AnalysisOutcome {
  if (!progress.done) return 'running'
  if (progress.error) return 'failure'
  return 'success'
}

export function shouldAutoNavigateToFilter(
  progress: AnalysisProgressState,
): boolean {
  return getAnalysisOutcome(progress) === 'success'
}

export function getAnalysisStatusMessage(
  progress: AnalysisProgressState,
): string {
  const outcome = getAnalysisOutcome(progress)
  if (outcome === 'success') return '分析完成，正在进入筛选...'
  if (outcome === 'failure') return '分析失败，请重试'
  return ''
}
