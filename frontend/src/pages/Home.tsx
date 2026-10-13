import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects, createProject, scanProject, deleteProject } from '../services/api'
import type { Project } from '../types'
import { motion, AnimatePresence } from 'framer-motion'
import DirectoryPicker from '../components/DirectoryPicker'

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    listProjects().then(setProjects).catch(() => {})
  }, [])

  const statusLabel: Record<string, { text: string; color: string }> = {
    ready: { text: '已完成', color: 'text-green-400 bg-green-500/10' },
    analyzing: { text: '分析中', color: 'text-yellow-400 bg-yellow-500/10' },
    scanning: { text: '扫描中', color: 'text-blue-400 bg-blue-500/10' },
    exporting: { text: '导出中', color: 'text-purple-400 bg-purple-500/10' },
  }

  const handleProjectClick = (project: Project) => {
    if (project.status === 'ready') {
      navigate(`/project/${project.id}/filter`)
    } else {
      navigate(`/project/${project.id}`)
    }
  }

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个项目吗？此操作不会删除原始照片文件。')) return
    try {
      await deleteProject(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
    } catch {
      alert('删除失败')
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] p-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
            PhotoSwitch
          </h2>
          <p className="text-white/40 mt-2 text-sm">AI 驱动的旅行照片快速筛选工具</p>
        </motion.div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowCreate(true)}
          className="w-full mb-8 py-4 rounded-xl border border-dashed border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/5 transition-colors cursor-pointer"
        >
          + 创建新项目
        </motion.button>

        {projects.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white/30 mb-4">历史项目</h3>
            {projects.map((project, i) => {
              const status = statusLabel[project.status] || { text: project.status, color: 'text-white/40 bg-white/5' }
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => handleProjectClick(project)}
                  className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-medium">{project.name}</h4>
                      <p className="text-white/30 text-xs mt-1">
                        {new Date(project.created_at).toLocaleDateString('zh-CN')}
                        {project.total_files > 0 && ` · ${project.total_files} 张照片`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-md text-xs ${status.color}`}>
                        {status.text}
                      </span>
                      <button
                        onClick={(e) => handleDelete(e, project.id)}
                        className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer"
                        title="删除项目"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {project.source_folders.map(folder => (
                      <span key={folder} className="text-[10px] text-white/20 font-mono bg-white/5 px-1.5 py-0.5 rounded">
                        {folder.split('/').pop()}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {projects.length === 0 && !showCreate && (
          <div className="text-center py-16">
            <p className="text-white/20 text-sm">还没有项目，点击上方按钮创建第一个</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateProjectModal
            onClose={() => setShowCreate(false)}
            onCreated={(project) => {
              setShowCreate(false)
              navigate(`/project/${project.id}`)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function CreateProjectModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (project: Project) => void
}) {
  const [name, setName] = useState('')
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [threshold, setThreshold] = useState(0.85)

  const handleCreate = async () => {
    if (!name.trim() || selectedFolders.length === 0) {
      setError('请填写项目名称并选择照片文件夹')
      return
    }
    setLoading(true)
    setError('')
    try {
      const project = await createProject(name, selectedFolders, threshold)
      await scanProject(project.id)
      onCreated(project)
    } catch {
      setError('创建项目失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectFolder = (path: string) => {
    if (!selectedFolders.includes(path)) {
      setSelectedFolders(prev => [...prev, path])
    }
    setShowPicker(false)
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
          <h3 className="text-lg font-medium text-white">创建新项目</h3>

          <div>
            <label className="block text-sm text-white/60 mb-2">项目名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：京都旅行 2026"
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-2">照片文件夹</label>
            {selectedFolders.length > 0 && (
              <div className="space-y-2 mb-3">
                {selectedFolders.map(folder => (
                  <div key={folder} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <span className="text-yellow-400/60">📁</span>
                    <span className="text-white/70 text-sm font-mono truncate flex-1">{folder}</span>
                    <button
                      onClick={() => setSelectedFolders(prev => prev.filter(f => f !== folder))}
                      className="text-white/20 hover:text-red-400 text-lg cursor-pointer"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowPicker(true)}
              className="w-full py-3 rounded-lg border border-dashed border-white/20 text-white/40 hover:text-white/60 hover:border-cyan-500/30 transition-colors cursor-pointer text-sm"
            >
              + 选择文件夹
            </button>
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-2">
              相似度阈值: <span className="text-cyan-400">{threshold.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0.50"
              max="0.98"
              step="0.01"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>更宽松 (0.50)</span>
              <span>更严格 (0.98)</span>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-lg border border-white/10 text-white/40 hover:text-white/60 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium disabled:opacity-50 cursor-pointer"
            >
              {loading ? '创建中...' : '创建并扫描'}
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showPicker && (
          <DirectoryPicker
            onSelect={handleSelectFolder}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
