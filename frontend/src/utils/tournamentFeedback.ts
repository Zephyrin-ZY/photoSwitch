export type TournamentFeedbackTone = 'info' | 'success' | 'error'

export interface TournamentFeedback {
  message: string
  tone: TournamentFeedbackTone
}

export function getSelectionSummary(selectedIdx: 0 | 1): string {
  return selectedIdx === 0 ? '当前选中：左图' : '当前选中：右图'
}

export function createPickFeedback(
  winnerFilename: string,
  loserFilename: string,
): TournamentFeedback {
  return {
    message: `${winnerFilename} 胜出，${loserFilename} 已淘汰`,
    tone: 'success',
  }
}

export function createFavoriteFeedback(
  filename: string,
  isFavorite: boolean,
): TournamentFeedback {
  return {
    message: isFavorite ? `已收藏 ${filename}` : `已取消收藏 ${filename}`,
    tone: 'info',
  }
}

export function createKeepBothFeedback(): TournamentFeedback {
  return {
    message: '两张都已直接保留，继续下一轮对比',
    tone: 'success',
  }
}

export function createKeepAndContinueFeedback(filename: string): TournamentFeedback {
  return {
    message: `已直接保留 ${filename}，另一张继续参与淘汰赛`,
    tone: 'success',
  }
}

export function createUndoFeedback(filename: string): TournamentFeedback {
  return {
    message: `已撤销上一轮，恢复 ${filename}`,
    tone: 'info',
  }
}

export function createPreviewFeedback(): TournamentFeedback {
  return {
    message: '已进入大图对比，可按 K 直接保留当前照片',
    tone: 'info',
  }
}

export function createActionErrorFeedback(actionLabel: string): TournamentFeedback {
  return {
    message: `${actionLabel}失败，请重试`,
    tone: 'error',
  }
}
