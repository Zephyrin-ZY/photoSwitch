import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useShortcuts } from '../stores/ShortcutStore'
import { useToast } from './Toast'
import {
  SHORTCUTS,
  SHORTCUT_MAP,
  GROUP_LABELS,
  GROUP_ORDER,
  comboEqual,
  comboFromEvent,
  formatCombo,
  type KeyCombo,
  type ShortcutGroup,
} from '../utils/shortcuts'

interface Props {
  onClose: () => void
}

export default function ShortcutSettings({ onClose }: Props) {
  const { getCombo, setBinding, resetBinding, resetAll, findConflict } = useShortcuts()
  const { showError, showSuccess } = useToast()
  const [recordingId, setRecordingId] = useState<string | null>(null)

  const stopRecording = useCallback(() => setRecordingId(null), [])

  useEffect(() => {
    if (!recordingId) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        stopRecording()
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return // 只按了修饰键，继续等待
      const conflict = findConflict(recordingId, combo)
      if (conflict) {
        showError(`「${formatCombo(combo)}」已被「${SHORTCUT_MAP[conflict]?.label}」占用`)
        stopRecording()
        return
      }
      setBinding(recordingId, combo)
      stopRecording()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recordingId, findConflict, setBinding, showError, stopRecording])

  // 关闭弹窗时若正在录制则一并取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !recordingId) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recordingId, onClose])

  const handleResetAll = () => {
    resetAll()
    showSuccess('已恢复全部默认快捷键')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-white/10 bg-[#12121f] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold text-white">快捷键设置</h2>
            <p className="text-xs text-white/40 mt-0.5">
              点击按键框后按下新按键即可修改 · Esc 取消录制
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetAll}
              className="px-3 py-1.5 text-xs text-white/50 border border-white/10 rounded-md hover:text-white/80 hover:bg-white/5 cursor-pointer"
            >
              恢复默认
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-white/50 border border-white/10 rounded-md hover:text-white/80 hover:bg-white/5 cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {GROUP_ORDER.map(group => (
            <GroupSection
              key={group}
              group={group}
              recordingId={recordingId}
              onStartRecording={setRecordingId}
              getCombo={getCombo}
              resetBinding={resetBinding}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function GroupSection({
  group,
  recordingId,
  onStartRecording,
  getCombo,
  resetBinding,
}: {
  group: ShortcutGroup
  recordingId: string | null
  onStartRecording: (id: string) => void
  getCombo: (id: string) => KeyCombo
  resetBinding: (id: string) => void
}) {
  const items = SHORTCUTS.filter(s => s.group === group)
  return (
    <div>
      <h3 className="text-xs font-medium text-cyan-400/80 mb-2 tracking-wide">
        {GROUP_LABELS[group]}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map(item => {
          const isRecording = recordingId === item.id
          const combo = getCombo(item.id)
          const isDefault = comboEqual(combo, item.defaultCombo)
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5"
            >
              <span className="text-sm text-white/70 truncate">{item.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {!isDefault && (
                  <button
                    onClick={() => resetBinding(item.id)}
                    title="恢复默认"
                    className="text-white/25 hover:text-white/60 cursor-pointer text-xs px-1"
                  >
                    ↺
                  </button>
                )}
                <button
                  onClick={() => onStartRecording(item.id)}
                  className={`min-w-[64px] px-2.5 py-1 text-xs rounded-md border font-mono transition-colors cursor-pointer ${
                    isRecording
                      ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300 animate-pulse'
                      : 'border-white/10 bg-black/30 text-white/70 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {isRecording ? '按下按键…' : formatCombo(combo)}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
