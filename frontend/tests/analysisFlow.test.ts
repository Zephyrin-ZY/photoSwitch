import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAnalysisOutcome,
  getAnalysisStatusMessage,
  shouldAutoNavigateToFilter,
  type AnalysisProgressState,
} from '../src/utils/analysisFlow.ts'

function makeProgress(overrides: Partial<AnalysisProgressState> = {}): AnalysisProgressState {
  return {
    done: overrides.done ?? false,
    error: overrides.error ?? null,
  }
}

test('successful analysis auto-navigates to filter', () => {
  const progress = makeProgress({ done: true, error: null })

  assert.equal(getAnalysisOutcome(progress), 'success')
  assert.equal(shouldAutoNavigateToFilter(progress), true)
  assert.equal(getAnalysisStatusMessage(progress), '分析完成，正在进入筛选...')
})

test('failed analysis stays on page and allows retry', () => {
  const progress = makeProgress({ done: true, error: 'CLIP feature extraction failed' })

  assert.equal(getAnalysisOutcome(progress), 'failure')
  assert.equal(shouldAutoNavigateToFilter(progress), false)
  assert.equal(getAnalysisStatusMessage(progress), '分析失败，请重试')
})

test('unfinished analysis remains in progress', () => {
  const progress = makeProgress({ done: false, error: null })

  assert.equal(getAnalysisOutcome(progress), 'running')
  assert.equal(shouldAutoNavigateToFilter(progress), false)
})
