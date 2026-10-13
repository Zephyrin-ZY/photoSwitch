import { useState } from 'react'

export default function TestPage() {
  const [count, setCount] = useState(0)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`])
    console.log(msg)  // 同时输出到浏览器控制台
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">前端功能测试</h1>

      <div className="space-y-4">
        {/* 测试 1: 基本渲染 */}
        <div className="p-4 bg-white/10 rounded-lg">
          <h2 className="font-semibold mb-2">测试 1: 基本渲染</h2>
          <p className="text-sm text-white/60">
            如果你能看到这段文字，说明 React 渲染正常 ✓
          </p>
        </div>

        {/* 测试 2: 状态管理 */}
        <div className="p-4 bg-white/10 rounded-lg">
          <h2 className="font-semibold mb-2">测试 2: 状态管理</h2>
          <p className="mb-2">计数: <span className="font-mono text-cyan-400">{count}</span></p>
          <button
            onClick={() => {
              setCount(c => c + 1)
              addLog(`点击按钮，计数: ${count + 1}`)
            }}
            className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30"
          >
            点击我 +1
          </button>
        </div>

        {/* 测试 3: 事件处理 */}
        <div className="p-4 bg-white/10 rounded-lg">
          <h2 className="font-semibold mb-2">测试 3: 事件处理</h2>
          <div className="flex gap-2">
            <button
              onClick={() => addLog('左键点击 ✓')}
              className="px-4 py-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
            >
              左键
            </button>
            <button
              onClick={() => addLog('右键点击 ✓')}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
            >
              右键
            </button>
          </div>
        </div>

        {/* 测试 4: 键盘事件 */}
        <div className="p-4 bg-white/10 rounded-lg">
          <h2 className="font-semibold mb-2">测试 4: 键盘事件</h2>
          <p className="text-sm text-white/60 mb-2">
            按任意键测试键盘事件是否正常
          </p>
          <input
            type="text"
            placeholder="在这里按键..."
            className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded text-white"
            onKeyDown={(e) => addLog(`键盘事件: ${e.key}`)}
          />
        </div>

        {/* 测试 5: API 调用 */}
        <div className="p-4 bg-white/10 rounded-lg">
          <h2 className="font-semibold mb-2">测试 5: API 调用</h2>
          <button
            onClick={async () => {
              addLog('开始 API 调用...')
              try {
                const res = await fetch('/api/health')
                const data = await res.json()
                addLog(`API 响应: ${JSON.stringify(data)}`)
              } catch (error) {
                addLog(`API 错误: ${error}`)
              }
            }}
            className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30"
          >
            测试 API
          </button>
        </div>

        {/* 日志输出 */}
        <div className="p-4 bg-black/50 rounded-lg">
          <h2 className="font-semibold mb-2">操作日志</h2>
          <div className="font-mono text-sm space-y-1 max-h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-white/40">暂无日志，请点击上方按钮测试</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className="text-green-400">{log}</p>
              ))
            )}
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="mt-2 text-xs text-white/40 hover:text-white/60"
            >
              清空日志
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
