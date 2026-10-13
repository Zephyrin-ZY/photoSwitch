import { Outlet, Link, useLocation } from 'react-router-dom'
import { ToastProvider } from './Toast'

export default function Layout() {
  const location = useLocation()
  const isHome = location.pathname === '/'

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
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  )
}
