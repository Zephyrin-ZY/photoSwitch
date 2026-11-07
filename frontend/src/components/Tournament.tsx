import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { getThumbnailUrl, getOriginalUrl } from '../services/api'
import { useShortcuts } from '../stores/ShortcutStore'
import { usePhotoGestures } from '../hooks/usePhotoGestures'
import { useIsTouch } from '../utils/touch'
import { resolveDisplayAspect } from '../utils/aspect'
import ClusterModeToggle from './ClusterModeToggle'
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
  /** 切到逐张浏览（已完成的对决结果保留，未决出的照片继续以 pending 参与） */
  onSwitchMode: () => void
  onStatusChange: (hash: string, status: string) => Promise<void>
  onToggleFavorite: (hash: string, isFavorite: boolean) => Promise<void>
}

/** 双击判胜的窗口；首击后等这么久没有第二击才按单击（放大）处理 */
const DOUBLE_TAP_DELAY = 260

export default function Tournament({ photos, projectId, onClose, onComplete, onSwitchMode, onStatusChange, onToggleFavorite }: Props) {
  const { match, label } = useShortcuts()
  const isTouch = useIsTouch()
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

  // 触屏预览的捏合/双击缩放需要内容尺寸与视口尺寸
  const [previewStage, setPreviewStage] = useState({ width: 0, height: 0 })
  const [previewLoadedAspect, setPreviewLoadedAspect] = useState<{ hash: string; aspect: number } | null>(null)

  const currentA = round[matchIdx * 2]
  const currentB = round[matchIdx * 2 + 1]
  const isFinished = round.length === 1 || (!currentA && !currentB)

  const previewPhoto = previewIdx === 0 ? currentA : currentB
  const previewMetaAspect = previewPhoto?.width && previewPhoto.height
    ? previewPhoto.width / previewPhoto.height
    : null
  const previewAspect = resolveDisplayAspect(previewLoadedAspect, previewPhoto?.hash, previewMetaAspect)

  const previewContainSize = useMemo(() => {
    if (!previewAspect || previewStage.width <= 0 || previewStage.height <= 0) return null
    let width = previewStage.width
    let height = width / previewAspect
    if (height > previewStage.height) {
      height = previewStage.height
      width = height * previewAspect
    }
    return { width, height }
  }, [previewAspect, previewStage])

  const previewGestures = usePhotoGestures({
    onPrev: () => setPreviewIdx(0),
    onNext: () => setPreviewIdx(1),
    resetKey: previewPhoto?.hash,
    contentSize: previewContainSize,
    viewportSize: previewStage,
  })
  const { imgStyle: previewImgStyle, handlers: previewHandlers, stageRef: previewStageRef } = previewGestures

  useEffect(() => {
    if (!previewMode || !isTouch) return
    const el = previewStageRef.current
    if (!el) return
    const update = () => setPreviewStage({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [previewMode, isTouch, previewStageRef])

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
    if (!currentA || !currentB) return
    const selected = selectedIdx === 0 ? currentA : currentB
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
    if (!currentA || !currentB) return
    const p = previewIdx === 0 ? currentA : currentB
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

  const openPreview = useCallback((idx: 0 | 1) => {
    setPreviewIdx(idx)
    setPreviewScale(1)
    previewOffsetRef.current = { x: 0, y: 0 }
    setPreviewMode(true)
    setFeedback(createPreviewFeedback())
  }, [])

  // PK 界面键盘
  useEffect(() => {
    // 预览模式有自己的 handler；结束后只剩 FinishedScreen 的“任意键继续”
    if (previewMode || isFinished) return

    const handler = (e: KeyboardEvent) => {
      // 忽略长按自动连发：否则按住 D 会把整组照片连续保留、跳过未查看的照片
      if (e.repeat) return
      if (match(e, 'pk.selectLeft')) { e.preventDefault(); setSelectedIdx(0) }
      if (match(e, 'pk.selectRight')) { e.preventDefault(); setSelectedIdx(1) }
      if (match(e, 'pk.pick')) { e.preventDefault(); handlePick(selectedIdx) }
      if (match(e, 'pk.preview')) { e.preventDefault(); openPreview(selectedIdx) }
      if (match(e, 'pk.favorite')) { e.preventDefault(); handleFavorite(selectedIdx) }
      if (match(e, 'pk.keepSelected')) { e.preventDefault(); handleSelectedKeepAndContinue() }
      if (match(e, 'pk.undo')) { e.preventDefault(); handleUndo() }
      if (match(e, 'pk.close')) { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewMode, isFinished, selectedIdx, handlePick, openPreview, handleFavorite, handleSelectedKeepAndContinue, handleUndo, onClose, match])

  // 预览模式键盘
  useEffect(() => {
    if (!previewMode) return

    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (match(e, 'preview.selectLeft')) { e.preventDefault(); setPreviewIdx(0) }
      if (match(e, 'preview.selectRight')) { e.preventDefault(); setPreviewIdx(1) }
      if (match(e, 'preview.pick')) { e.preventDefault(); handlePick(previewIdx) }
      if (match(e, 'preview.keepContinue')) { e.preventDefault(); handleKeepAndContinue() }
      if (match(e, 'preview.favorite')) { e.preventDefault(); handleFavorite(previewIdx) }
      if (match(e, 'preview.back')) { e.preventDefault(); setPreviewMode(false) }
      if (match(e, 'preview.zoomIn')) { e.preventDefault(); setPreviewScale(s => Math.min(5, s + 0.3)) }
      if (match(e, 'preview.zoomOut')) { e.preventDefault(); setPreviewScale(s => Math.max(0.5, s - 0.3)) }
      if (match(e, 'preview.resetZoom')) { e.preventDefault(); setPreviewScale(1); previewOffsetRef.current = { x: 0, y: 0 } }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewMode, previewIdx, handlePick, handleKeepAndContinue, handleFavorite, match])

  const handlePreviewWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setPreviewScale(s => Math.max(0.5, Math.min(5, s - e.deltaY * 0.002)))
  }, [])

  const handlePreviewLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (!previewPhoto || naturalWidth <= 0 || naturalHeight <= 0) return
    setPreviewLoadedAspect({ hash: previewPhoto.hash, aspect: naturalWidth / naturalHeight })
  }, [previewPhoto])

  // ---- 渲染 ----

  if (isFinished && winner) {
    return (
      <FinishedScreen
        winner={winner}
        projectId={projectId}
        message="最终胜出"
        actionText={isTouch ? '点按任意位置继续' : '按任意键继续'}
        onAction={onComplete}
      />
    )
  }

  if (!currentA || !currentB) {
    return (
      <FinishedScreen
        winner={null}
        projectId={projectId}
        message="对决结束"
        actionText={isTouch ? '点按任意位置继续' : '按任意键继续'}
        onAction={onClose}
      />
    )
  }

  // 大图预览模式
  if (previewMode) {
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
        <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-white/50 text-sm truncate">{previewPhoto.filename}</span>
            <span className="text-white/20 text-xs shrink-0">{previewIdx === 0 ? 'A' : 'B'} / 2</span>
            {previewPhoto.is_favorite && (
              <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {!isTouch && (
              <button onClick={() => handleKeepAndContinue()} className="px-3 py-1.5 text-xs text-green-400/60 hover:text-green-400 border border-green-500/20 rounded-md cursor-pointer hover:bg-green-500/10">
                ✓ 保留继续 ({label('preview.keepContinue')})
              </button>
            )}
            <button onClick={() => handleFavorite(previewIdx)} className="h-9 px-3 text-xs text-yellow-400/60 hover:text-yellow-400 border border-yellow-500/20 rounded-md cursor-pointer hover:bg-yellow-500/10">
              ★ <span className="hidden sm:inline">收藏 ({label('preview.favorite')})</span>
            </button>
            {!isTouch && (
              <button onClick={() => setPreviewScale(1)} className="px-3 py-1.5 text-xs text-white/30 border border-white/10 rounded-md cursor-pointer hover:text-white/60">
                重置缩放
              </button>
            )}
            <button onClick={() => setPreviewMode(false)} className="h-9 px-3 text-xs text-white/40 border border-white/10 rounded-md cursor-pointer hover:text-white/60">
              返回PK{!isTouch && ` (${label('preview.back')})`}
            </button>
          </div>
        </div>

        {/* 大图 */}
        {isTouch ? (
          <div
            ref={previewStageRef}
            className="flex-1 min-h-0 overflow-hidden relative select-none touch-none flex items-center justify-center"
            {...previewHandlers}
          >
            <img
              src={getOriginalUrl(previewPhoto.hash, projectId)}
              alt=""
              className="h-full w-full object-contain select-none"
              style={previewImgStyle}
              draggable={false}
              onLoad={handlePreviewLoad}
            />
          </div>
        ) : (
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
        )}

        {/* 底部操作栏 */}
        <div className="flex items-center justify-center gap-4 px-6 py-3 border-t border-white/10">
          <button
            onClick={() => setPreviewIdx(0)}
            className={`h-12 px-4 text-xs border rounded-md cursor-pointer transition-colors ${
              previewIdx === 0 ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'text-white/40 border-white/10 hover:text-white/60'
            }`}
          >
            ← A
          </button>
          <button
            onClick={() => handlePick(previewIdx)}
            className="h-12 px-6 text-sm text-green-400 border border-green-500/30 rounded-md cursor-pointer hover:bg-green-500/10 transition-colors"
          >
            {isTouch ? '胜出' : `${label('preview.pick')} 胜出`}
          </button>
          <button
            onClick={() => setPreviewIdx(1)}
            className={`h-12 px-4 text-xs border rounded-md cursor-pointer transition-colors ${
              previewIdx === 1 ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'text-white/40 border-white/10 hover:text-white/60'
            }`}
          >
            B →
          </button>
        </div>

        <div className="text-center text-white/15 text-xs pb-2 px-4">
          {isTouch
            ? '左右滑动切换 · 双指/双击缩放 · 点「胜出」判定'
            : `${label('preview.selectLeft')} / ${label('preview.selectRight')} 切换 · ${label('preview.pick')} 胜出 · ${label('preview.keepContinue')} 保留继续 · ${label('preview.favorite')} 收藏 · 滚轮缩放 · ${label('preview.back')} 返回`}
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
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-2.5 md:py-3">
        <div className="min-w-0">
          <span className="text-white/40 text-xs md:text-sm block truncate">
            第 {matchIdx + 1} / {Math.ceil(round.length / 2)} 轮
            <span className="ml-2 text-white/20">剩余 {round.length} 张</span>
          </span>
          <div className={`mt-1 truncate ${isTouch ? 'text-[10px] text-white/30' : 'text-[11px] text-cyan-400/80'}`}>
            {isTouch ? '双击照片胜出 · 单击放大查看' : getSelectionSummary(selectedIdx)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ClusterModeToggle mode="tournament" onChange={onSwitchMode} />
          <button
            onClick={handleUndo}
            aria-label="撤销上一次对决"
            className="h-9 px-2.5 text-xs text-white/40 hover:text-white/70 border border-white/10 rounded-md cursor-pointer active:bg-white/10"
          >
            <span className="text-base">↩</span>
            {!isTouch && <span className="ml-1">撤销</span>}
          </button>
          {!isTouch && (
            <button onClick={handleSelectedKeepAndContinue} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 border border-white/10 rounded-md cursor-pointer">
              选中直接保留 ({label('pk.keepSelected')})
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="关闭"
            className="h-9 w-9 flex items-center justify-center text-white/40 hover:text-white/60 border border-white/10 rounded-md cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row items-stretch md:items-center justify-center gap-2 md:gap-6 px-3 md:px-6 pb-2 md:pb-6">
        <PhotoCard
          photo={currentA}
          label="A"
          projectId={projectId}
          isTouch={isTouch}
          selected={selectedIdx === 0}
          onSelect={() => setSelectedIdx(0)}
          onPick={() => handlePick(0)}
          onOpenPreview={() => openPreview(0)}
          onFavorite={() => handleFavorite(0)}
        />
        <div className="hidden md:block shrink-0 text-white/20 text-2xl font-bold">VS</div>
        <PhotoCard
          photo={currentB}
          label="B"
          projectId={projectId}
          isTouch={isTouch}
          selected={selectedIdx === 1}
          onSelect={() => setSelectedIdx(1)}
          onPick={() => handlePick(1)}
          onOpenPreview={() => openPreview(1)}
          onFavorite={() => handleFavorite(1)}
        />
      </div>

      {!isTouch && (
        <div className="text-center text-white/20 text-xs pb-3">
          {label('pk.selectLeft')} / {label('pk.selectRight')} 选择 · {label('pk.pick')} 胜出 · {label('pk.preview')} 预览 · {label('pk.favorite')} 收藏 · {label('pk.keepSelected')} 选中直接保留 · {label('pk.close')} 关闭
        </div>
      )}
    </motion.div>
  )
}

function PhotoCard({ photo, label: side, projectId, selected, isTouch, onSelect, onPick, onOpenPreview, onFavorite }: {
  photo: Photo
  label: 'A' | 'B'
  projectId: string
  selected: boolean
  isTouch: boolean
  onSelect: () => void
  onPick: () => void
  onOpenPreview: () => void
  onFavorite: () => void
}) {
  const tapTimer = useRef<number | null>(null)
  const clearTap = useCallback(() => {
    if (tapTimer.current !== null) {
      window.clearTimeout(tapTimer.current)
      tapTimer.current = null
    }
  }, [])

  useEffect(() => clearTap, [clearTap])
  // 换到下一张时丢弃尚未触发的单击，避免把放大动作带到新照片上
  useEffect(() => { clearTap() }, [photo.hash, clearTap])

  const handleTap = () => {
    if (!isTouch) {
      onSelect()
      return
    }
    if (tapTimer.current !== null) {
      clearTap()
      onPick()
      return
    }
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null
      onOpenPreview()
    }, DOUBLE_TAP_DELAY)
  }

  return (
    <motion.div
      whileHover={isTouch ? undefined : { scale: 1.02 }}
      style={isTouch ? { touchAction: 'manipulation' } : undefined}
      className={
        isTouch
          ? 'relative flex-1 min-h-0 w-full flex flex-col items-center justify-center cursor-pointer select-none'
          : `flex-1 max-w-[45%] flex flex-col items-center cursor-pointer ${selected ? 'ring-2 ring-cyan-400/60 rounded-xl' : ''}`
      }
      onClick={handleTap}
    >
      <div className={
        isTouch
          ? 'flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden'
          : `rounded-xl overflow-hidden border-2 transition-colors ${selected ? 'border-cyan-400/40' : 'border-transparent'}`
      }>
        <img
          src={getThumbnailUrl(photo.hash, projectId, 'medium')}
          alt=""
          className={isTouch ? 'h-full w-full object-contain' : 'max-h-[65vh] object-contain'}
          draggable={false}
        />
      </div>

      {isTouch ? (
        <>
          <span className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/50 border border-white/10 text-white/70 text-xs flex items-center justify-center pointer-events-none">
            {side}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              clearTap()
              onFavorite()
            }}
            aria-label={photo.is_favorite ? '取消收藏' : '收藏'}
            className="absolute top-1 right-1 h-11 w-11 flex items-center justify-center cursor-pointer active:scale-95"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill={photo.is_favorite ? '#eab308' : 'none'} stroke={photo.is_favorite ? '#eab308' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <div className="shrink-0 max-w-full truncate px-2 pt-1 text-[11px] text-white/35">{photo.filename}</div>
        </>
      ) : (
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
      )}
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
    <div className="absolute top-16 left-1/2 z-10 -translate-x-1/2 px-4 max-w-[90vw]">
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

function FinishedScreen({ winner, projectId, message, onAction, actionText }: {
  winner: Photo | null
  projectId: string
  message: string
  onAction: () => void
  actionText: string
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
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
              src={getThumbnailUrl(winner.hash, projectId, 'medium')}
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
