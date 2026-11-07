import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { importDecisions, type DecisionImportReport } from '../services/api'

interface Props {
  projectId: string
  onClose: () => void
  onImported: () => Promise<void> | void
}

const STRATEGY_LABELS: Record<string, string> = {
  hash: '内容哈希',
  name_size: '文件名 + 大小',
  name_exif: '文件名 + EXIF 时间',
  stem_exif: '文件名主干 + EXIF 时间',
}

const STATUS_LABELS: Record<string, string> = {
  keep: '保留',
  eliminate: '淘汰',
  pending: '待筛',
}

function errorDetail(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string } }; message?: string }
  return e.response?.data?.detail || e.message || '操作失败'
}

export default function DecisionImportPanel({ projectId, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'fill_pending' | 'overwrite'>('fill_pending')
  const [restoreFavorites, setRestoreFavorites] = useState(true)
  const [report, setReport] = useState<DecisionImportReport | null>(null)
  const [stage, setStage] = useState<'select' | 'preview' | 'done'>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePreview = async () => {
    if (!file) {
      setError('请先选择筛选结果文件')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await importDecisions(projectId, file, {
        mode,
        dryRun: true,
        restoreFavorites,
      })
      setReport(result)
      setStage('preview')
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const result = await importDecisions(projectId, file, {
        mode,
        dryRun: false,
        restoreFavorites,
      })
      setReport(result)
      setStage('done')
      await onImported()
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto bg-[#12121f] border border-white/10 rounded-2xl p-8 pointer-events-auto space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">导入筛选结果</h3>
            {!loading && (
              <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xl cursor-pointer">×</button>
            )}
          </div>

          {stage === 'select' && (
            <>
              <p className="text-xs text-white/35 leading-relaxed">
                选择之前从 PhotoSwitch 导出的筛选结果 JSON。导入只恢复保留/淘汰/收藏状态,
                不会修改、移动或删除任何原始照片。
              </p>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null)
                    setError('')
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-4 py-6 rounded-xl border border-dashed border-white/15 bg-white/[0.03] hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-colors cursor-pointer text-center"
                >
                  {file ? (
                    <>
                      <div className="text-sm text-cyan-300 truncate">{file.name}</div>
                      <div className="text-[11px] text-white/30 mt-1">
                        {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''} · 点击重新选择
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-white/50">点击选择筛选结果文件</div>
                      <div className="text-[11px] text-white/25 mt-1">.json,通常约几 MB</div>
                    </>
                  )}
                </button>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-2">导入方式</label>
                <div className="space-y-2">
                  <ModeOption
                    checked={mode === 'fill_pending'}
                    title="只填充待筛照片"
                    description="已有选择保持不变;新项目恢复选择时用这个"
                    onSelect={() => setMode('fill_pending')}
                  />
                  <ModeOption
                    checked={mode === 'overwrite'}
                    title="覆盖已有选择"
                    description="以清单为准,覆盖当前项目里的保留/淘汰状态"
                    onSelect={() => setMode('overwrite')}
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreFavorites}
                  onChange={(e) => setRestoreFavorites(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500"
                />
                <div>
                  <span className="text-white/70 text-sm">同时恢复收藏标记</span>
                  <div className="text-white/30 text-xs">收藏状态独立于保留/淘汰</div>
                </div>
              </label>

              {error && <p className="text-red-400 text-sm break-all">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-3 rounded-lg border border-white/10 text-white/40 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handlePreview}
                  disabled={loading}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  {loading ? '解析中...' : '预览匹配结果'}
                </button>
              </div>
            </>
          )}

          {stage === 'preview' && report && (
            <>
              <p className="text-xs text-white/35">
                确认无误后再应用。预览不会修改任何数据。
              </p>

              <ReportSummary report={report} />

              {error && <p className="text-red-400 text-sm break-all">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStage('select')}
                  disabled={loading}
                  className="flex-1 py-3 rounded-lg border border-white/10 text-white/40 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  返回
                </button>
                <button
                  onClick={handleApply}
                  disabled={loading || (report.applied === 0 && report.favorites_restored === 0)}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium disabled:opacity-50 cursor-pointer"
                  title={report.applied === 0 && report.favorites_restored === 0 ? '没有需要应用的变化' : undefined}
                >
                  {loading
                    ? '应用中...'
                    : report.applied > 0
                      ? `确认应用 ${report.applied} 张`
                      : report.favorites_restored > 0
                        ? `恢复 ${report.favorites_restored} 个收藏`
                        : '没有需要应用的变化'}
                </button>
              </div>
            </>
          )}

          {stage === 'done' && report && (
            <>
              <div className="text-center py-2">
                <div className="text-2xl text-green-400">✓</div>
                <div className="text-sm text-green-400 mt-1">导入完成</div>
              </div>

              <ReportSummary report={report} />

              {error && <p className="text-red-400 text-sm break-all">{error}</p>}

              <button
                onClick={onClose}
                className="w-full py-3 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10 cursor-pointer"
              >
                关闭
              </button>
            </>
          )}
        </div>
      </motion.div>
    </>
  )
}

function ModeOption({ checked, title, description, onSelect }: {
  checked: boolean
  title: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
        checked
          ? 'border-cyan-500/40 bg-cyan-500/10'
          : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <div className={`text-sm ${checked ? 'text-cyan-300' : 'text-white/60'}`}>{title}</div>
      <div className="text-[11px] text-white/30 mt-0.5">{description}</div>
    </button>
  )
}

function ReportSummary({ report }: { report: DecisionImportReport }) {
  const strategies = Object.entries(report.by_strategy)
    .map(([key, value]) => `${STRATEGY_LABELS[key] || key} ${value}`)
    .join(' · ')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="清单照片" value={report.manifest_total} />
        <Stat label="匹配成功" value={report.matched} />
        <Stat label={report.dry_run ? '将应用' : '已应用'} value={report.applied} accent />
        <Stat
          label={report.mode === 'overwrite' ? '覆盖已有选择' : '保留已有选择'}
          value={report.mode === 'overwrite' ? report.overwritten : report.kept_existing}
        />
        <Stat label="恢复收藏" value={report.favorites_restored} />
      </div>

      {strategies && (
        <div className="text-[11px] text-white/30 px-1">匹配方式:{strategies}</div>
      )}

      {report.missing_count > 0 && (
        <details className="rounded-lg bg-yellow-500/5 border border-yellow-500/15 px-3 py-2">
          <summary className="text-xs text-yellow-400/80 cursor-pointer select-none">
            清单中有 {report.missing_count} 张在当前项目里没找到
          </summary>
          <SampleList items={report.missing_samples} showStatus />
        </details>
      )}

      {report.new_photos_count > 0 && (
        <details className="rounded-lg bg-cyan-500/5 border border-cyan-500/15 px-3 py-2">
          <summary className="text-xs text-cyan-400/80 cursor-pointer select-none">
            当前项目有 {report.new_photos_count} 张照片不在清单中(保持待筛)
          </summary>
          <SampleList items={report.new_photos_samples} />
        </details>
      )}

      {report.conflict_count > 0 && (
        <details className="rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2">
          <summary className="text-xs text-red-400/80 cursor-pointer select-none">
            有 {report.conflict_count} 条记录无法自动匹配,已跳过
          </summary>
          <div className="mt-2 max-h-32 overflow-y-auto space-y-1.5">
            {report.conflicts.map((conflict, i) => (
              <div key={i} className="text-[11px] text-white/40">
                <span className="text-white/55 break-all">{conflict.filename || conflict.hash}</span>
                <span className="text-white/25"> · {conflict.detail}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function SampleList({ items, showStatus = false }: {
  items: { filename: string; status?: string }[]
  showStatus?: boolean
}) {
  return (
    <div className="mt-2 max-h-28 overflow-y-auto space-y-1">
      {items.map((item, i) => (
        <div key={i} className="text-[11px] text-white/35 truncate">
          {item.filename}
          {showStatus && item.status ? (
            <span className="text-white/20"> · {STATUS_LABELS[item.status] || item.status}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <div className={`text-lg font-medium ${accent ? 'text-cyan-400' : 'text-white/80'}`}>{value}</div>
      <div className="text-[11px] text-white/30 mt-0.5">{label}</div>
    </div>
  )
}