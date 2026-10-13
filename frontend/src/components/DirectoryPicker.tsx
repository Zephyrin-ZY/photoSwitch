import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { browseDirectory, type BrowseResult } from '../services/api'

interface Props {
  onSelect: (path: string) => void
  onClose: () => void
}

export default function DirectoryPicker({ onSelect, onClose }: Props) {
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const navigate = async (path: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await browseDirectory(path)
      setBrowseResult(result)
    } catch {
      setError('无法访问该目录')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    navigate('')
  }, [])

  const handleSelect = () => {
    if (browseResult?.current) {
      onSelect(browseResult.current)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-[#12121f] border border-white/10 rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white font-medium">选择照片目录</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xl cursor-pointer">×</button>
        </div>

        <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="text-white/40 text-xs">当前路径：</span>
            <span className="text-cyan-400 text-sm font-mono truncate flex-1">
              {browseResult?.current || '加载中...'}
            </span>
          </div>
        </div>

        <div className="h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-white/30 text-sm">加载中...</div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-400/60 text-sm">{error}</div>
          ) : (
            <div className="py-1">
              {browseResult?.parent && (
                <button
                  onClick={() => navigate(browseResult.parent!)}
                  className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white/5 transition-colors text-left cursor-pointer"
                >
                  <span className="text-white/20 text-lg">↑</span>
                  <span className="text-white/50 text-sm">返回上级</span>
                </button>
              )}

              {browseResult?.entries
                .filter(e => e.is_dir)
                .map(entry => (
                  <button
                    key={entry.path}
                    onClick={() => navigate(entry.path)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white/5 transition-colors text-left cursor-pointer"
                  >
                    <span className="text-yellow-400/60 text-lg">📁</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/80 text-sm truncate">{entry.name}</div>
                      {entry.child_count >= 0 && (
                        <div className="text-white/20 text-xs">{entry.child_count} 项</div>
                      )}
                    </div>
                  </button>
                ))}

              {browseResult?.entries.filter(e => e.is_dir).length === 0 && !loading && (
                <div className="flex items-center justify-center h-40 text-white/20 text-sm">
                  此目录下没有子文件夹
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
          <span className="text-white/30 text-xs truncate flex-1 mr-4">
            {browseResult?.current}
          </span>
          <button
            onClick={handleSelect}
            disabled={!browseResult?.current}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium disabled:opacity-30 cursor-pointer"
          >
            选择此目录
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
