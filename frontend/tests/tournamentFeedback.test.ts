import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createActionErrorFeedback,
  createFavoriteFeedback,
  createKeepAndContinueFeedback,
  createKeepBothFeedback,
  createPickFeedback,
  createPreviewFeedback,
  createUndoFeedback,
  getSelectionSummary,
} from '../src/utils/tournamentFeedback.ts'

test('selection summary reflects current focus side', () => {
  assert.equal(getSelectionSummary(0), '当前选中：左图')
  assert.equal(getSelectionSummary(1), '当前选中：右图')
})

test('pick feedback explains winner and loser clearly', () => {
  assert.deepEqual(
    createPickFeedback('IMG_1001.JPG', 'IMG_1002.JPG'),
    {
      message: 'IMG_1001.JPG 胜出，IMG_1002.JPG 已淘汰',
      tone: 'success',
    },
  )
})

test('favorite feedback distinguishes add and remove', () => {
  assert.equal(
    createFavoriteFeedback('IMG_1001.JPG', true).message,
    '已收藏 IMG_1001.JPG',
  )
  assert.equal(
    createFavoriteFeedback('IMG_1001.JPG', false).message,
    '已取消收藏 IMG_1001.JPG',
  )
})

test('keep, undo and error feedback are action-specific', () => {
  assert.equal(
    createKeepBothFeedback().message,
    '两张都已直接保留，继续下一轮对比',
  )
  assert.equal(
    createKeepAndContinueFeedback('IMG_1003.JPG').message,
    '已直接保留 IMG_1003.JPG，另一张继续参与淘汰赛',
  )
  assert.equal(
    createUndoFeedback('IMG_1004.JPG').message,
    '已撤销上一轮，恢复 IMG_1004.JPG',
  )
  assert.equal(
    createActionErrorFeedback('收藏').message,
    '收藏失败，请重试',
  )
  assert.equal(
    createPreviewFeedback().message,
    '已进入大图对比，可按 K 直接保留当前照片',
  )
})
