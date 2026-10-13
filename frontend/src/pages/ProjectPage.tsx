import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, getScanProgress, startAnalysis, getAnalysisProgress } from '../services/api'
import type { Project } from '../types'
import { motion } from 'framer-motion'
import { useToast } from '../components/Toast'
import {
  getAnalysisOutcome,
  getAnalysisStatusMessage,
  shouldAutoNavigateToFilter,
} from '../utils/analysisFlow'
import {
  getAnalysisPercent,
  getScanProgressMessage,
  getScanProgressPercent,
} from '../utils/progressDisplay'

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showError } = useToast()
  const [project, setProject] = useState<Project | null>(null)
  const [scanProg, setScanProg] = useState({
    done: false,
    current: 0,
    total: 0,
    discovered: 0,
    current_folder: null as string | null,
    current_file: null as string | null,
  })
  const [analysisProg, setAnalysisProg] = useState({
    thumbnail: { current: 0, total: 0 },
    clip: { current: 0, total: 0 },
    done: false,
    error: null as string | null,
  })
  const [phase, setPhase] = useState<'scanning' | 'analyzing' | 'ready'>('scanning')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!id) return
    getProject(id).then(setProject)
  }, [id])

  useEffect(() => {
    if (!id || phase !== 'scanning') return
    const timer = setInterval(async () => {
      try {
        const prog = await getScanProgress(id)
        setScanProg(prog)
        if (prog.done) {
          clearInterval(timer)
          setPhase('analyzing')
          await startAnalysis(id, true)
        }
      } catch {
        // Ignore transient polling failures and retry on the next interval.
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [id, phase, retryKey])

  useEffect(() => {
    if (!id || phase !== 'analyzing') return
    const timer = setInterval(async () => {
      try {
        const prog = await getAnalysisProgress(id)
        setAnalysisProg(prog)
        if (prog.done) {
          clearInterval(timer)
          if (shouldAutoNavigateToFilter(prog)) {
            setPhase('ready')
            setTimeout(() => navigate(`/project/${id}/filter`), 1500)
          }
        }
      } catch {
        // Ignore transient polling failures and retry on the next interval.
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [id, phase, navigate])

  const scanPercent = getScanProgressPercent(scanProg)
  const scanMessage = getScanProgressMessage(scanProg)
  const analysisPercent = getAnalysisPercent(analysisProg)
  const analysisOutcome = getAnalysisOutcome(analysisProg)
  const analysisStatusMessage = getAnalysisStatusMessage(analysisProg)

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center"
      >
        <h2 className="text-2xl font-bold text-white mb-2">{project?.name || '加载中...'}</h2>

        {phase === 'scanning' && (
          <div className="mt-8 space-y-4">
            <div className="text-white/50 text-sm">正在扫描文件夹...</div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                animate={{ width: scanProg.done ? '100%' : scanProg.total > 0 ? `${scanPercent}%` : '12%' }}
                transition={{ duration: 1 }}
              />
            </div>
            <div className="text-white/30 text-xs">
              {scanMessage}
            </div>
            {scanProg.current_folder && (
              <div className="text-white/20 text-[11px] truncate">
                当前目录：{scanProg.current_folder.split('/').pop() || scanProg.current_folder}
              </div>
            )}
            {scanProg.current_file && (
              <div className="text-white/15 text-[11px] truncate">
                当前文件：{scanProg.current_file.split('/').pop() || scanProg.current_file}
              </div>
            )}
          </div>
        )}

        {phase === 'analyzing' && (
          <div className="mt-8 space-y-6">
            <ProgressItem
              label="生成缩略图"
              current={analysisProg.thumbnail.current}
              total={analysisProg.thumbnail.total}
              color="from-cyan-500 to-blue-500"
            />
            <ProgressItem
              label="提取特征向量 (CLIP)"
              current={analysisProg.clip.current}
              total={analysisProg.clip.total}
              color="from-blue-500 to-purple-500"
            />
            {analysisProg.error && (
              <div className="text-red-400 text-sm mt-2">{analysisProg.error}</div>
            )}
            <div className="text-white/30 text-xs">
              {analysisStatusMessage || `总进度 ${analysisPercent}%`}
            </div>
            {analysisOutcome === 'failure' && (
              <button
                onClick={async () => {
                  setAnalysisProg(prev => ({
                    ...prev,
                    done: false,
                    error: null,
                    thumbnail: { current: 0, total: prev.thumbnail.total },
                    clip: { current: 0, total: prev.clip.total },
                  }))
                  setPhase('analyzing')
                  setRetryKey(k => k + 1)
                  try {
                    await startAnalysis(id!, true)
                  } catch {
                    showError('重试分析失败')
                  }
                }}
                className="mt-2 px-4 py-2 text-sm text-white/70 border border-white/10 rounded-lg hover:bg-white/5 cursor-pointer"
              >
                重试分析
              </button>
            )}
          </div>
        )}

        {phase === 'ready' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 text-cyan-400"
          >
            分析完成！正在进入筛选...
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

function ProgressItem({ label, current, total, color }: {
  label: string
  current: number
  total: number
  color: string
}) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="text-left">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-white/60">{label}</span>
        <span className="text-white/40">{current}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={`h-full bg-gradient-to-r ${color} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  )
}
