export interface KeyCombo {
  key: string
  ctrl?: boolean
  alt?: boolean
  meta?: boolean
}

export type ShortcutGroup = 'viewer' | 'pk' | 'preview'

export interface ShortcutDef {
  id: string
  label: string
  group: ShortcutGroup
  defaultCombo: KeyCombo
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

export const IS_MAC = isMac

function combo(key: string, mods: Partial<KeyCombo> = {}): KeyCombo {
  return { key, ...mods }
}

export const GROUP_LABELS: Record<ShortcutGroup, string> = {
  viewer: '单图查看',
  pk: 'PK 对战',
  preview: 'PK 大图预览',
}

export const GROUP_ORDER: ShortcutGroup[] = ['viewer', 'pk', 'preview']

export const SHORTCUTS: ShortcutDef[] = [
  // 单图查看
  { id: 'viewer.keep', label: '保留', group: 'viewer', defaultCombo: combo('k') },
  { id: 'viewer.eliminate', label: '淘汰', group: 'viewer', defaultCombo: combo('ArrowDown') },
  { id: 'viewer.favorite', label: '收藏 / 取消收藏', group: 'viewer', defaultCombo: combo('ArrowUp') },
  { id: 'viewer.prev', label: '上一张', group: 'viewer', defaultCombo: combo('ArrowLeft') },
  { id: 'viewer.next', label: '下一张', group: 'viewer', defaultCombo: combo('ArrowRight') },
  { id: 'viewer.zoomIn', label: '放大', group: 'viewer', defaultCombo: combo('+') },
  { id: 'viewer.zoomOut', label: '缩小', group: 'viewer', defaultCombo: combo('-') },
  { id: 'viewer.resetZoom', label: '重置缩放', group: 'viewer', defaultCombo: combo('0') },
  { id: 'viewer.close', label: '关闭', group: 'viewer', defaultCombo: combo('Escape') },
  // PK 对战
  { id: 'pk.selectLeft', label: '选择左图', group: 'pk', defaultCombo: combo('ArrowLeft') },
  { id: 'pk.selectRight', label: '选择右图', group: 'pk', defaultCombo: combo('ArrowRight') },
  { id: 'pk.pick', label: '胜出', group: 'pk', defaultCombo: combo('Enter') },
  { id: 'pk.preview', label: '预览大图', group: 'pk', defaultCombo: combo(' ') },
  { id: 'pk.favorite', label: '收藏选中', group: 'pk', defaultCombo: combo('s') },
  { id: 'pk.keepSelected', label: '选中直接保留', group: 'pk', defaultCombo: combo('d') },
  { id: 'pk.undo', label: '撤销', group: 'pk', defaultCombo: isMac ? combo('z', { meta: true }) : combo('z', { ctrl: true }) },
  { id: 'pk.close', label: '关闭', group: 'pk', defaultCombo: combo('Escape') },
  // PK 大图预览
  { id: 'preview.selectLeft', label: '切换到左图', group: 'preview', defaultCombo: combo('ArrowLeft') },
  { id: 'preview.selectRight', label: '切换到右图', group: 'preview', defaultCombo: combo('ArrowRight') },
  { id: 'preview.pick', label: '胜出', group: 'preview', defaultCombo: combo('Enter') },
  { id: 'preview.keepContinue', label: '保留并继续', group: 'preview', defaultCombo: combo('k') },
  { id: 'preview.favorite', label: '收藏', group: 'preview', defaultCombo: combo('s') },
  { id: 'preview.zoomIn', label: '放大', group: 'preview', defaultCombo: combo('+') },
  { id: 'preview.zoomOut', label: '缩小', group: 'preview', defaultCombo: combo('-') },
  { id: 'preview.resetZoom', label: '重置缩放', group: 'preview', defaultCombo: combo('0') },
  { id: 'preview.back', label: '返回 PK', group: 'preview', defaultCombo: combo('Escape') },
]

export const SHORTCUT_MAP: Record<string, ShortcutDef> = Object.fromEntries(
  SHORTCUTS.map(s => [s.id, s])
)

export const DEFAULT_BINDINGS: Record<string, KeyCombo> = Object.fromEntries(
  SHORTCUTS.map(s => [s.id, s.defaultCombo])
)

const KEY_ALIAS: Record<string, string> = {
  '=': '+',
  'Spacebar': ' ',
}

function normalizeKey(key: string): string {
  const mapped = KEY_ALIAS[key] ?? key
  return mapped.length === 1 ? mapped.toLowerCase() : mapped
}

const KEY_LABELS: Record<string, string> = {
  ' ': '空格',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '回车',
  Escape: 'Esc',
  Backspace: '退格',
  Delete: 'Del',
  Tab: 'Tab',
}

export function formatCombo(c: KeyCombo): string {
  const parts: string[] = []
  if (c.ctrl) parts.push('Ctrl')
  if (c.alt) parts.push('Alt')
  if (c.meta) parts.push(isMac ? '⌘' : 'Meta')
  const nk = normalizeKey(c.key)
  parts.push(KEY_LABELS[nk] ?? (nk.length === 1 ? nk.toUpperCase() : nk))
  return parts.join(' + ')
}

export function comboEqual(a: KeyCombo, b: KeyCombo): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    !!a.ctrl === !!b.ctrl &&
    !!a.alt === !!b.alt &&
    !!a.meta === !!b.meta
  )
}

// shift 不参与匹配：字母的 e.key 已含大小写并统一转小写，符号（如 +/=）通过别名归一
export function matchesCombo(e: KeyboardEvent, c: KeyCombo): boolean {
  if (normalizeKey(e.key) !== normalizeKey(c.key)) return false
  if (!!e.ctrlKey !== !!c.ctrl) return false
  if (!!e.altKey !== !!c.alt) return false
  if (!!e.metaKey !== !!c.meta) return false
  return true
}

export function comboFromEvent(e: KeyboardEvent): KeyCombo | null {
  if (['Control', 'Alt', 'Meta', 'Shift'].includes(e.key)) return null
  const c: KeyCombo = { key: normalizeKey(e.key) }
  if (e.ctrlKey) c.ctrl = true
  if (e.altKey) c.alt = true
  if (e.metaKey) c.meta = true
  return c
}
