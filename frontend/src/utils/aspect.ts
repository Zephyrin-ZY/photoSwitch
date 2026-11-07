export interface LoadedAspect {
  hash: string
  aspect: number
}

/**
 * 已加载图片的比例只对同一张照片有效。
 * loaded 或 hash 缺失时必须回退，否则 `loaded?.hash === undefined` 会误判为同一张。
 */
export function resolveDisplayAspect(
  loaded: LoadedAspect | null | undefined,
  hash: string | undefined,
  fallback: number | null,
): number | null {
  return loaded && hash && loaded.hash === hash ? loaded.aspect : fallback
}
