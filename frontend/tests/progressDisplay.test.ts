import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAnalysisPercent,
  getScanProgressPercent,
  getScanProgressMessage,
  type AnalysisProgressMetrics,
  type ScanProgressMetrics,
} from '../src/utils/progressDisplay.ts'

function makeScan(overrides: Partial<ScanProgressMetrics> = {}): ScanProgressMetrics {
  return {
    current: overrides.current ?? 0,
    total: overrides.total ?? 0,
    discovered: overrides.discovered ?? 0,
    done: overrides.done ?? false,
  }
}

function makeAnalysis(
  overrides: Partial<AnalysisProgressMetrics> = {},
): AnalysisProgressMetrics {
  return {
    thumbnail: overrides.thumbnail ?? { current: 0, total: 0 },
    clip: overrides.clip ?? { current: 0, total: 0 },
  }
}

test('scan progress percent uses current over total when available', () => {
  assert.equal(
    getScanProgressPercent(makeScan({ current: 25, total: 100 })),
    25,
  )
})

test('scan progress message reflects counting before total is known', () => {
  assert.equal(
    getScanProgressMessage(makeScan({ total: 0, discovered: 12 })),
    '正在统计照片... 已发现 12 张',
  )
})

test('scan progress message reflects processed candidates when total is known', () => {
  assert.equal(
    getScanProgressMessage(makeScan({ current: 40, total: 120, discovered: 38 })),
    '已处理 40 / 120 张候选照片，发现 38 张可导入照片',
  )
})

test('analysis percent combines thumbnail and clip stages', () => {
  const progress = makeAnalysis({
    thumbnail: { current: 50, total: 100 },
    clip: { current: 25, total: 100 },
  })

  assert.equal(getAnalysisPercent(progress), 38)
})
