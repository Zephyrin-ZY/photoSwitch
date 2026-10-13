import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { exportPhotos, browseDirectory, type BrowseResult } from '../services/api'

interface Props {
  projectId: string
  keptCount: number
  favoriteCount: number
  onClose: () => void
}

interface ExportProgress {
  done: boolean
  exported?: number
  errors?: number
  current?: number
  total?: number
}

export default function ExportPanel({ projectId, keptCount, favoriteCount, onClose }: Props) {
  const [destFolder, setDestFolder] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [correctOrientation, setCorrectOrientation] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerPath, setPickerPath] = useState('')
  const [pickerData, setPickerData] = useState<BrowseResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState('')

  const estimatedCount = onlyFavorites ? favoriteCount : keptCount

  const handleBrowse = async (path: string = '') => {
    try {
      const result = await browseDirectory(path)
      setPickerData(result)
      setPickerPath(result.current)
    } catch {
      setError('无法访问该目录')
    }
  }

  useEffect(() => {
    if (showPicker && !pickerData) {
      handleBrowse()
    }
  }, [showPicker])

  const handleExport = async () => {
    if (!destFolder.trim()) {
      setError('请选择目标文件夹')
      return
    }
    setExporting(true)
    setError('')
    try {
      await exportPhotos(projectId, destFolder, onlyFavorites, correctOrientation)
      // Poll progress
      const poll = setInterval(async () => {
        try {
          const resp = await fetch(`/api/projects/${projectId}/export/progress`)
          const data: ExportProgress = await resp.json()
          setProgress(data)
          if (data.done) {
            clearInterval(poll)
            setExporting(false)
          }
        } catch {
          // ignore
        }
      }, 1000)
    } catch {
      setError('导出失败')
      setExporting(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="w-full max-w-lg bg-[#12121f] border border-white/10 rounded-2xl p-8 pointer-events-auto space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">导出照片</h3>
            {!exporting && (
              <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xl cursor-pointer">×</button>
            )}
          </div>

          {progress?.done ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-2xl">✓</div>
              <div className="text-green-400 text-sm">导出完成</div>
              <div className="text-white/40 text-xs">
                成功导出 {progress.exported} 张照片
                {progress.errors ? `，${progress.errors} 张失败` : ''}
              </div>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10 cursor-pointer"
              >
                关闭
              </button>
            </div>
          ) : (
            <>
              {/* 导出统计 */}
              <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                <div className="text-sm text-white/60">
                  将导出 <span className="text-cyan-400 font-medium">{estimatedCount}</span> 张照片
                </div>
                <div className="text-xs text-white/30 mt-1">
                  {onlyFavorites
                    ? '仅收藏的照片'
                    : `保留 ${keptCount} 张 + 收藏 ${favoriteCount} 张（去重后 ${estimatedCount} 张）`
                  }
                </div>
              </div>

              {/* 目标文件夹 */}
              <div>
                <label className="block text-sm text-white/60 mb-2">目标文件夹</label>
                {destFolder && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 mb-2">
                    <span className="text-yellow-400/60">📁</span>
                    <span className="text-white/70 text-sm font-mono truncate flex-1">{destFolder}</span>
                    <button
                      onClick={() => setDestFolder('')}
                      className="text-white/20 hover:text-red-400 text-lg cursor-pointer"
                    >×</button>
                  </div>
                )}
                <button
                  onClick={() => setShowPicker(true)}
                  className="w-full py-3 rounded-lg border border-dashed border-white/20 text-white/40 hover:text-white/60 hover:border-cyan-500/30 transition-colors cursor-pointer text-sm"
                >
                  {destFolder ? '更改文件夹' : '+ 选择文件夹'}
                </button>
              </div>

              {/* 导出选项 */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyFavorites}
                    onChange={(e) => setOnlyFavorites(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500"
                  />
                  <div>
                    <span className="text-white/70 text-sm">仅导出收藏照片</span>
                    <div className="text-white/30 text-xs">只导出标记为收藏的照片</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={correctOrientation}
                    onChange={(e) => setCorrectOrientation(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500"
                  />
                  <div>
                    <span className="text-white/70 text-sm">修正照片方向</span>
                    <div className="text-white/30 text-xs">根据 EXIF 信息旋转，输出为 JPEG</div>
                  </div>
                </label>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              {/* 导出进度 */}
              {exporting && progress && !progress.done && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">导出中...</span>
                    <span className="text-white/40">{progress.current}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full"
                      animate={{ width: progress.total ? `${(progress.current! / progress.total) * 100}%` : '5%' }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={exporting}
                  className="flex-1 py-3 rounded-lg border border-white/10 text-white/40 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting || !destFolder}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  {exporting ? '导出中...' : '开始导出'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* 目录选择器 */}
      <AnimatePresence>
        {showPicker && pickerData && (
          <DirectoryPickerModal
            data={pickerData}
            currentPath={pickerPath}
            onNavigate={handleBrowse}
            onSelect={(path) => {
              setDestFolder(path)
              setShowPicker(false)
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function DirectoryPickerModal({ data, currentPath, onNavigate, onSelect, onClose }: {
  data: BrowseResult
  currentPath: string
  onNavigate: (path: string) => void
  onSelect: (path: string) => void
  onClose: () => void
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="w-full max-w-md bg-[#12121f] border border-white/10 rounded-2xl p-6 pointer-events-auto space-y-4 max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">选择目录</h4>
            <button onClick={onClose} className="text-white/30 hover:text-white/60 cursor-pointer">×</button>
          </div>

          <div className="text-xs text-white/30 font-mono truncate">{currentPath}</div>

          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {data.parent && (
              <button
                onClick={() => onNavigate(data.parent!)}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-white/50 hover:bg-white/5 cursor-pointer"
              >
                ← 上级目录
              </button>
            )}
            {data.entries.filter(e => e.is_dir).map(entry => (
              <div key={entry.path} className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate(entry.path)}
                  className="flex-1 text-left px-3 py-2 rounded-md text-sm text-white/60 hover:bg-white/5 cursor-pointer truncate"
                >
                  📁 {entry.name}
                </button>
                <button
                  onClick={() => onSelect(entry.path)}
                  className="px-2 py-1 text-xs text-cyan-400/60 hover:text-cyan-400 border border-cyan-500/20 rounded cursor-pointer hover:bg-cyan-500/10"
                >
                  选择
                </button>
              </div>
            ))}
            {data.entries.filter(e => e.is_dir).length === 0 && (
              <div className="text-white/20 text-xs text-center py-4">没有子目录</div>
            )}
          </div>

          <button
            onClick={() => onSelect(currentPath)}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium cursor-pointer"
          >
            选择当前目录
          </button>
        </div>
      </motion.div>
    </>
  )
}
