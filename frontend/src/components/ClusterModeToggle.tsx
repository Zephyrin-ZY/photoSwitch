import type { ClusterMode } from '../utils/clusterMode'

const OPTIONS: { value: ClusterMode; label: string; title: string }[] = [
  { value: 'review', label: '逐张', title: '逐张浏览淘汰' },
  { value: 'tournament', label: 'PK', title: '两两对决' },
]

/** 组内筛选模式的切换控件，浏览与 PK 顶栏共用。 */
export default function ClusterModeToggle({ mode, onChange }: {
  mode: ClusterMode
  onChange: (mode: ClusterMode) => void
}) {
  return (
    <div className="flex shrink-0 rounded-md border border-white/10 overflow-hidden text-[11px]">
      {OPTIONS.map(option => {
        const active = mode === option.value
        return (
          <button
            key={option.value}
            onClick={() => !active && onChange(option.value)}
            title={option.title}
            aria-pressed={active}
            className={`h-9 px-2.5 transition-colors cursor-pointer ${
              active
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-white/40 hover:text-white/70 active:bg-white/10'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
