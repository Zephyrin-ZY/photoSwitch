import axios from 'axios'
import type { Project, Photo } from '../types'

const api = axios.create({
  baseURL: '/api',
})

export async function listProjects(): Promise<Project[]> {
  const { data } = await api.get('/projects')
  return data
}

export interface ServerInfo {
  lan_ip: string | null
  /** lan_ip 的来源：转发头 / PHOTOSWITCH_LAN_IP 配置 / 本地探测 */
  lan_ip_source?: 'forwarded' | 'config' | 'detected' | null
  /** 后端是否运行在容器内（容器内探测不到宿主机网卡） */
  in_container?: boolean
  hostname: string
  candidates: string[]
}

/** 获取本机局域网访问信息（后端探测宿主机 IP）。 */
export async function getServerInfo(): Promise<ServerInfo> {
  const { data } = await api.get('/server-info')
  return data
}

export async function createProject(name: string, sourceFolders: string[], similarityThreshold: number = 0.85): Promise<Project> {
  const { data } = await api.post('/projects', { name, source_folders: sourceFolders, similarity_threshold: similarityThreshold })
  return data
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get(`/projects/${id}`)
  return data
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`)
}

export async function scanProject(id: string): Promise<void> {
  await api.post(`/projects/${id}/scan`)
}

export async function getScanProgress(id: string): Promise<{
  done: boolean
  current: number
  total: number
  discovered: number
  current_folder: string | null
  current_file: string | null
}> {
  const { data } = await api.get(`/projects/${id}/scan/progress`)
  return {
    done: false,
    current: 0,
    total: 0,
    discovered: 0,
    current_folder: null,
    current_file: null,
    ...data,
  }
}

export async function getPhotos(
  projectId: string,
  params: { status?: string; cluster_id?: string; favorite?: boolean; offset?: number; limit?: number } = {}
): Promise<{ total: number; files: Photo[] }> {
  const { data } = await api.get(`/projects/${projectId}/photos`, { params })
  return data
}

export async function updatePhotoStatus(projectId: string, fileHash: string, status: string): Promise<Photo> {
  const { data } = await api.put(`/projects/${projectId}/photos/${fileHash}/status`, { status })
  return data
}

export async function toggleFavorite(projectId: string, fileHash: string, isFavorite: boolean): Promise<Photo> {
  const { data } = await api.put(`/projects/${projectId}/photos/${fileHash}/favorite`, { is_favorite: isFavorite })
  return data
}

export async function getClusters(projectId: string, status?: string, favorite?: boolean): Promise<{ clusters: Record<string, Photo[]> }> {
  const params: Record<string, unknown> = {}
  if (status) params.status = status
  if (favorite !== undefined) params.favorite = favorite
  const { data } = await api.get(`/projects/${projectId}/clusters`, { params })
  return data
}

export async function startAnalysis(projectId: string, force: boolean = false): Promise<void> {
  await api.post(`/projects/${projectId}/analysis/start`, { force })
}

export async function regenerateThumbnails(projectId: string): Promise<{ status: string }> {
  const { data } = await api.post(`/projects/${projectId}/analysis/regenerate-thumbnails`)
  return data
}

export async function getAnalysisProgress(projectId: string): Promise<{
  thumbnail: { current: number; total: number }
  clip: { current: number; total: number }
  done: boolean
  error: string | null
}> {
  const { data } = await api.get(`/projects/${projectId}/analysis/progress`)
  return {
    thumbnail: { current: 0, total: 0 },
    clip: { current: 0, total: 0 },
    done: false,
    error: null,
    ...data,
  }
}

export async function exportPhotos(
  projectId: string,
  destFolder: string,
  onlyFavorites: boolean = false,
  correctOrientation: boolean = false,
  exportJpg: boolean = true,
  exportRaw: boolean = false
): Promise<void> {
  await api.post(`/projects/${projectId}/export`, {
    dest_folder: destFolder,
    only_favorites: onlyFavorites,
    correct_orientation: correctOrientation,
    export_jpg: exportJpg,
    export_raw: exportRaw,
  })
}

export function getThumbnailUrl(hash: string, projectId: string, size: 'thumb' | 'medium' = 'thumb'): string {
  return `/api/photos/${hash}/thumbnail?project_id=${projectId}&size=${size}`
}

export function getOriginalUrl(hash: string, projectId: string): string {
  return `/api/photos/${hash}/original?project_id=${projectId}`
}

export interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  child_count: number
}

export interface BrowseResult {
  current: string
  parent: string | null
  entries: DirEntry[]
}

export async function browseDirectory(path: string = ''): Promise<BrowseResult> {
  const { data } = await api.post('/projects/browse', { path })
  return data
}
