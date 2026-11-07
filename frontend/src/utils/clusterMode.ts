export type ClusterMode = 'review' | 'tournament'

const STORAGE_KEY = 'photoswitch.clusterMode'

/** 没有历史偏好时：触屏默认逐张浏览，鼠标设备默认 PK。 */
export function defaultClusterMode(isTouch: boolean): ClusterMode {
  return isTouch ? 'review' : 'tournament'
}

export function loadClusterMode(isTouch: boolean): ClusterMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'review' || raw === 'tournament') return raw
  } catch {
    // 隐私模式或 SSR 下不可用，回退默认值
  }
  return defaultClusterMode(isTouch)
}

export function saveClusterMode(mode: ClusterMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // 存不了只影响记忆，不影响本次选择
  }
}
