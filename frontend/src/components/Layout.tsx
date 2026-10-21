import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ToastProvider } from './Toast'
import ShortcutSettings from './ShortcutSettings'
import LanAddress from './LanAddress'
import FullscreenButton from './FullscreenButton'

export default function Layout() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const [showSettings, setShowSettings] = useState(false)

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <header className="h-14 border-b border-white/10 flex items-center px-6 bg-[#0d0d1a]/80 backdrop-blur-md sticky top-0 z-50">
          {!isHome && (
            <Link
              to="/"
              className="mr-4 px-3 py-1.5 text-xs text-white/50 border border-white/10 rounded-md hover:text-white/80 hover:bg-white/5 transition-colors"
            >
              首页
            </Link>
          )}
          <h1 className="text-lg font-semibold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            PhotoSwitch
          </h1>
          <span className="ml-3 text-xs text-white/30">AI Photo Selector</span>
          <div className="ml-auto flex items-center gap-2">
            <LanAddress />
            <FullscreenButton />
            <button
              onClick={() => setShowSettings(true)}
              title="快捷键设置"
              className="p-2 text-white/40 hover:text-white/80 rounded-md border border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
        <AnimatePresence>
          {showSettings && <ShortcutSettings onClose={() => setShowSettings(false)} />}
        </AnimatePresence>
      </div>
    </ToastProvider>
  )
}
