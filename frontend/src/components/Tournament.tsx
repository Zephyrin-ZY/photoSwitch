import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { getThumbnailUrl, getOriginalUrl } from '../services/api'
import type { Photo } from '../types'
import {
  createActionErrorFeedback,
  createFavoriteFeedback,
  createKeepAndContinueFeedback,
  createPickFeedback,
  createPreviewFeedback,
  createUndoFeedback,
  getSelectionSummary,
  type TournamentFeedback,
} from '../utils/tournamentFeedback'

interface Props {
  photos: Photo[]
  projectId: string
  onClose: () => void
  onComplete: () => void
  onStatusChange: (hash: string, status: string) => Promise<void>
  onToggleFavorite: (hash: string, isFavorite: boolean) => Promise<void>
}

export default function Tournament({ photos, projectId, onClose, onComplete, onStatusChange, onToggleFavorite }: Props) {
  const [round, setRound] = useState<Photo[]>([...photos])
  const [matchIdx, setMatchIdx] = useState(0)
  const [winner, setWinner] = useState<Photo | null>(null)
  const [history, setHistory] = useState<{ eliminated: Photo; winner: Photo }[]>([])

  // 选中和预览状态
  const [selectedIdx, setSelectedIdx] = useState<0 | 1>(0)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewIdx, setPreviewIdx] = useState<0 | 1>(0)
  const [previewScale, setPreviewScale] = useState(1)
  const [feedback, setFeedback] = useState<TournamentFeedback | null>(null)
  const previewOffsetRef = useRef({ x: 0, y: 0 })

  const currentA = round[matchIdx * 2]
  const currentB = round[matchIdx * 2 + 1]
  const isFinished = round.length === 1 || (!currentA && !currentB)

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => {
      setFeedback(null)
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const handlePick = useCallback(async (winnerIdx: 0 | 1) => {
    if (!currentA || !currentB) return
    const w = winnerIdx === 0 ? currentA : currentB
    const l = winnerIdx === 0 ? currentB : currentA

    try {
      await onStatusChange(l.hash, 'eliminate')
      setHistory(prev => [...prev, { eliminated: l, winner: w }])

      const nextRound = [...round]
      nextRound[matchIdx * 2] = w
      nextRound.splice(matchIdx * 2 + 1, 1)

      if (matchIdx >= Math.floor(nextRound.length / 2)) {
        if (nextRound.length === 1) {
          setRound(nextRound)
          setWinner(nextRound[0])
          await onStatusChange(nextRound[0].hash, 'keep')
        } else {
          setRound(nextRound)
          setMatchIdx(0)
          setSelectedIdx(0)
        }
      } else {
        setRound(nextRound)
        setMatchIdx(matchIdx)
        setSelectedIdx(0)
      }
      setFeedback(createPickFeedback(w.filename, l.filename))
      setPreviewMode(false)
    } catch (error) {
      setFeedback(createActionErrorFeedback('操作'))
      console.error('操作失败:', error)
    }
  }, [round, matchIdx, currentA, currentB, onStatusChange])

  const handleFavorite = useCallback(async (idx: 0 | 1) => {
    const p = idx === 0 ? currentA : currentB
    if (p) {
      try {
        const newVal = !p.is_favorite
        await onToggleFavorite(p.hash, newVal)
        setRound(prev => prev.map(r => r.hash === p.hash ? { ...r, is_favorite: newVal } : r))
        setFeedback(createFavoriteFeedback(p.filename, newVal))
      } catch (error) {
        setFeedback(createActionErrorFeedback('收藏'))
        console.error('收藏失败:', error)
      }
    }
  }, [currentA, currentB, onToggleFavorite])

  const handleSelectedKeepAndContinue = useCallback(async () => {
    // 选中的照片直接晋级（保留），另一张继续参与 PK
    const selected = selectedIdx === 0 ? currentA : currentB
    if (!selected) return
    try {
      await onStatusChange(selected.hash, 'keep')

      const nextRound = [...round]
      const removePos = matchIdx * 2 + selectedIdx
      nextRound.splice(removePos, 1)

      if (nextRound.length === 0) {
        setRound([])
        setWinner(null)
      } else if (nextRound.length === 1) {
        setRound(nextRound)
        setWinner(nextRound[0])
        await onStatusChange(nextRound[0].hash, 'keep')
      } else {
        setRound(nextRound)
        if (matchIdx >= Math.ceil(nextRound.length / 2)) {
          setMatchIdx(0)
        }
        setSelectedIdx(0)
      }
      setFeedback(createKeepAndContinueFeedback(selected.filename))
      setPreviewMode(false)
    } catch (error) {
      setFeedback(createActionErrorFeedback('保留'))
      console.error('保留失败:', error)
    }
  }, [selectedIdx, round, matchIdx, currentA, currentB, onStatusChange])

  const handleKeepAndContinue = useCallback(async () => {
    // 在预览中保留当前照片，自动切到另一张
    const p = previewIdx === 0 ? currentA : currentB
    if (!p) return
    try {
      await onStatusChange(p.hash, 'keep')
      // 从 round 中移除这张（它已保留）
      const nextRound = [...round]
      const removePos = matchIdx * 2 + previewIdx
      nextRound.splice(removePos, 1)

      if (nextRound.length === 0) {
        setRound([])
        setWinner(null)
        setPreviewMode(false)
      } else if (nextRound.length === 1) {
        setRound(nextRound)
        setWinner(nextRound[0])
        await onStatusChange(nextRound[0].hash, 'keep')
        setPreviewMode(false)
        setSelectedIdx(0)
      } else {
        // 如果移除的是当前场的第一张，matchIdx 不变（第二张补上）
        // 如果移除的是第二张，matchIdx 不变
        setRound(nextRound)
        // 检查当前 matchIdx 是否还有效
        if (matchIdx >= Math.ceil(nextRound.length / 2)) {
          setMatchIdx(0)
        }
        setPreviewIdx(0)
        setSelectedIdx(0)
      }
      setFeedback(createKeepAndContinueFeedback(p.filename))
    } catch (error) {
      setFeedback(createActionErrorFeedback('保留'))
      console.error('保留失败:', error)
    }
  }, [previewIdx, currentA, currentB, round, matchIdx, onStatusChange])

  const handleUndo = useCallback(async () => {
    if (history.length === 0) return
    const last = history[history.length - 1]

    try {
      await onStatusChange(last.eliminated.hash, 'pending')
      const nextRound = [...round]
      nextRound.splice(matchIdx * 2 + 1, 0, last.eliminated)
      setRound(nextRound)
      setHistory(prev => prev.slice(0, -1))
      setSelectedIdx(0)
      setPreviewMode(false)
      setFeedback(createUndoFeedback(last.eliminated.filename))
    } catch (error) {
      setFeedback(createActionErrorFeedback('撤销'))
      console.error('撤销失败:', error)
    }
  }, [history, round, matchIdx, onStatusChange])

  const enterPreview = useCallback(() => {
    setPreviewIdx(selectedIdx)
    setPreviewScale(1)
    previewOffsetRef.current = { x: 0, y: 0 }
    setPreviewMode(true)
    setFeedback(createPreviewFeedback())
  }, [selectedIdx])

  // PK 界面键盘
  useEffect(() => {
    if (previewMode) return // 预览模式有自己的 handler

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setSelectedIdx(0) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedIdx(1) }
      if (e.key === 'Enter') { e.preventDefault(); handlePick(selectedIdx) }
      if (e.key === ' ') { e.preventDefault(); enterPreview() }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); handleFavorite(selectedIdx) }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); handleSelectedKeepAndContinue() }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleUndo() }
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewMode, selectedIdx, handlePick, enterPreview, handleFavorite, handleSelectedKeepAndContinue, handleUndo, onClose])

  // 预览模式键盘
  useEffect(() => {
    if (!previewMode) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPreviewIdx(0) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPreviewIdx(1) }
      if (e.key === 'Enter') { e.preventDefault(); handlePick(previewIdx) }
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); handleKeepAndContinue() }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); handleFavorite(previewIdx) }
      if (e.key === 'Escape') { e.preventDefault(); setPreviewMode(false) }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setPreviewScale(s => Math.min(5, s + 0.3)) }
      if (e.key === '-') { e.preventDefault(); setPreviewScale(s => Math.max(0.5, s - 0.3)) }
      if (e.key === '0') { e.preventDefault(); setPreviewScale(1); previewOffsetRef.current = { x: 0, y: 0 } }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewMode, previewIdx, handlePick, handleKeepAndContinue, handleFavorite])

  const handlePreviewWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setPreviewScale(s => Math.max(0.5, Math.min(5, s - e.deltaY * 0.002)))
  }, [])

  // ---- 渲染 ----

  if (isFinished && winner) {
    return (
      <FinishedScreen
        winner={winner}
        message="最终胜出"
        onAction={onComplete}
        actionText="按任意键继续"
      />
    )
  }

  if (!currentA || !currentB) {
    return (
      <FinishedScreen
        winner={null}
        message="对决结束"
        onAction={onClose}
        actionText="按任意键继续"
      />
    )
  }

  // 大图预览模式
  if (previewMode) {
    const previewPhoto = previewIdx === 0 ? currentA : currentB
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/98 flex flex-col"
      >
        {feedback && (
          <FeedbackBanner feedback={feedback} />
        )}
        {/* 顶部信息栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
          <div className="flex items-center gap-4">
            <span className="text-white/50 text-sm">{previewPhoto.filename}</span>
            <span className="text-white/20 text-xs">{previewIdx === 0 ? 'A' : 'B'} / 2</span>
            {previewPhoto.is_favorite && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleKeepAndContinue()} className="px-3 py-1.5 text-xs text-green-400/60 hover:text-green-400 border border-green-500/20 rounded-md cursor-pointer hover:bg-green-500/10">
              ✓ 保留继续 (K)
            </button>
            <button onClick={() => handleFavorite(previewIdx)} className="px-3 py-1.5 text-xs text-yellow-400/60 hover:text-yellow-400 border border-yellow-500/20 rounded-md cursor-pointer hover:bg-yellow-500/10">
              ★ 收藏 (S)
            </button>
            <button onClick={() => setPreviewScale(1)} className="px-3 py-1.5 text-xs text-white/30 border border-white/10 rounded-md cursor-pointer hover:text-white/60">
              重置缩放
            </button>
            <button onClick={() => setPreviewMode(false)} className="px-3 py-1.5 text-xs text-white/30 border border-white/10 rounded-md cursor-pointer hover:text-white/60">
              返回PK (Esc)
            </button>
          </div>
        </div>

        {/* 大图 */}
        <div
          className="flex-1 overflow-hidden flex items-center justify-center"
          onWheel={handlePreviewWheel}
        >
          <img
            src={getOriginalUrl(previewPhoto.hash, projectId)}
            alt=""
            className="max-h-full max-w-full object-contain select-none"
            style={{
              transform: `scale(${previewScale})`,
              cursor: previewScale > 1 ? 'grab' : 'default',
            }}
            draggable={false}
          />
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-center gap-4 px-6 py-3 border-t border-white/10">
          <button
            onClick={() => setPreviewIdx(0)}
            className={`px-4 py-2 text-xs border rounded-md cursor-pointer transition-colors ${
              previewIdx === 0 ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'text-white/40 border-white/10 hover:text-white/60'
            }`}
          >
            ← A
          </button>
          <button
            onClick={() => handlePick(previewIdx)}
            className="px-6 py-2 text-sm text-green-400 border border-green-500/30 rounded-md cursor-pointer hover:bg-green-500/10 transition-colors"
          >
            Enter 胜出
          </button>
          <button
            onClick={() => setPreviewIdx(1)}
            className={`px-4 py-2 text-xs border rounded-md cursor-pointer transition-colors ${
              previewIdx === 1 ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'text-white/40 border-white/10 hover:text-white/60'
            }`}
          >
            B →
          </button>
        </div>

        <div className="text-center text-white/15 text-xs pb-2">
          ← → 切换 · Enter 胜出 · K 保留继续 · S 收藏 · 滚轮缩放 · Esc 返回
        </div>
      </motion.div>
    )
  }

  // PK 主界面
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col"
    >
      {feedback && (
        <FeedbackBanner feedback={feedback} />
      )}
      <div className="flex items-center justify-between px-6 py-3">
        <div>
          <span className="text-white/40 text-sm">
            第 {matchIdx + 1} / {Math.ceil(round.length / 2)} 轮
            <span className="ml-2 text-white/20">剩余 {round.length} 张</span>
          </span>
          <div className="text-[11px] text-cyan-400/80 mt-1">
            {getSelectionSummary(selectedIdx)}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleUndo} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 border border-white/10 rounded-md cursor-pointer">
            撤销
          </button>
          <button onClick={handleSelectedKeepAndContinue} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 border border-white/10 rounded-md cursor-pointer">
            选中直接保留 (D)
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 border border-white/10 rounded-md cursor-pointer">
            关闭
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center gap-6 px-6 pb-6">
        <PhotoCard
          photo={currentA}
          selected={selectedIdx === 0}
          onSelect={() => setSelectedIdx(0)}
          onFavorite={() => handleFavorite(0)}
        />
        <div className="text-white/20 text-2xl font-bold">VS</div>
        <PhotoCard
          photo={currentB}
          selected={selectedIdx === 1}
          onSelect={() => setSelectedIdx(1)}
          onFavorite={() => handleFavorite(1)}
        />
      </div>

      <div className="text-center text-white/20 text-xs pb-3">
        ← → 选择 · Enter 胜出 · Space 预览 · S 收藏 · D 选中直接保留 · Esc 关闭
      </div>
    </motion.div>
  )
}

function PhotoCard({ photo, selected, onSelect, onFavorite }: {
  photo: Photo
  selected: boolean
  onSelect: () => void
  onFavorite: () => void
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`flex-1 max-w-[45%] flex flex-col items-center cursor-pointer ${selected ? 'ring-2 ring-cyan-400/60 rounded-xl' : ''}`}
      onClick={onSelect}
    >
      <div className={`rounded-xl overflow-hidden border-2 transition-colors ${selected ? 'border-cyan-400/40' : 'border-transparent'}`}>
        <img
          src={getThumbnailUrl(photo.hash, 'medium')}
          alt=""
          className="max-h-[65vh] object-contain"
        />
      </div>
      <div className="mt-3 text-center">
        <p className={`text-sm ${selected ? 'text-cyan-400' : 'text-white/60'}`}>{photo.filename}</p>
        <div className="flex gap-2 mt-2 justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onFavorite()
            }}
            className="cursor-pointer transition-all hover:scale-110"
            title={photo.is_favorite ? '取消收藏' : '收藏'}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill={photo.is_favorite ? '#eab308' : 'none'} stroke={photo.is_favorite ? '#eab308' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function FeedbackBanner({ feedback }: { feedback: TournamentFeedback }) {
  const toneClass = {
    info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    success: 'border-green-500/30 bg-green-500/10 text-green-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
  }[feedback.tone]

  return (
    <div className="absolute top-16 left-1/2 z-10 -translate-x-1/2 px-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`rounded-full border px-4 py-2 text-xs shadow-lg backdrop-blur-sm ${toneClass}`}
      >
        {feedback.message}
      </motion.div>
    </div>
  )
}

function FinishedScreen({ winner, message, onAction, actionText }: {
  winner: Photo | null
  message: string
  onAction: () => void
  actionText: string
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      onAction()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onAction])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center cursor-pointer"
      onClick={onAction}
    >
      <div className="text-center">
        <h3 className="text-xl font-bold text-white mb-4">{message}</h3>
        {winner && (
          <>
            <img
              src={getThumbnailUrl(winner.hash, 'medium')}
              alt=""
              className="max-h-[60vh] rounded-xl mx-auto"
            />
            <p className="text-white/50 mt-4">{winner.filename}</p>
          </>
        )}
        <p className="text-white/30 mt-6 text-sm">{actionText}</p>
      </div>
    </motion.div>
  )
}
