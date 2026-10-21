import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import {
  DEFAULT_BINDINGS,
  SHORTCUTS,
  SHORTCUT_MAP,
  comboEqual,
  formatCombo,
  matchesCombo,
  type KeyCombo,
} from '../utils/shortcuts'

const STORAGE_KEY = 'photoswitch.shortcuts.v1'

type Bindings = Record<string, KeyCombo>

interface ShortcutContextValue {
  bindings: Bindings
  getCombo: (id: string) => KeyCombo
  match: (e: KeyboardEvent, id: string) => boolean
  label: (id: string) => string
  setBinding: (id: string, c: KeyCombo) => void
  resetBinding: (id: string) => void
  resetAll: () => void
  // 返回同一分组内已占用该按键的其它动作 id，无冲突返回 null
  findConflict: (id: string, c: KeyCombo) => string | null
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null)

function load(): Bindings {
  const base: Bindings = { ...DEFAULT_BINDINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Record<string, KeyCombo>
    for (const [id, combo] of Object.entries(saved)) {
      if (combo && typeof combo.key === 'string') base[id] = combo
    }
  } catch {
    // 解析失败时回退到默认
  }
  return base
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<Bindings>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
    } catch {
      // 忽略持久化失败（如隐私模式）
    }
  }, [bindings])

  const getCombo = useCallback(
    (id: string): KeyCombo => bindings[id] ?? DEFAULT_BINDINGS[id] ?? { key: '' },
    [bindings]
  )

  const match = useCallback(
    (e: KeyboardEvent, id: string): boolean => {
      const c = bindings[id] ?? DEFAULT_BINDINGS[id]
      return c ? matchesCombo(e, c) : false
    },
    [bindings]
  )

  const label = useCallback(
    (id: string): string => formatCombo(bindings[id] ?? DEFAULT_BINDINGS[id] ?? { key: '' }),
    [bindings]
  )

  const setBinding = useCallback((id: string, c: KeyCombo) => {
    setBindings(prev => ({ ...prev, [id]: c }))
  }, [])

  const resetBinding = useCallback((id: string) => {
    setBindings(prev => ({ ...prev, [id]: DEFAULT_BINDINGS[id] }))
  }, [])

  const resetAll = useCallback(() => {
    setBindings({ ...DEFAULT_BINDINGS })
  }, [])

  const findConflict = useCallback(
    (id: string, c: KeyCombo): string | null => {
      const group = SHORTCUT_MAP[id]?.group
      for (const def of SHORTCUTS) {
        if (def.id === id || def.group !== group) continue
        const other = bindings[def.id] ?? DEFAULT_BINDINGS[def.id]
        if (other && comboEqual(other, c)) return def.id
      }
      return null
    },
    [bindings]
  )

  return (
    <ShortcutContext.Provider
      value={{ bindings, getCombo, match, label, setBinding, resetBinding, resetAll, findConflict }}
    >
      {children}
    </ShortcutContext.Provider>
  )
}

export function useShortcuts(): ShortcutContextValue {
  const ctx = useContext(ShortcutContext)
  if (!ctx) throw new Error('useShortcuts must be used within ShortcutProvider')
  return ctx
}
