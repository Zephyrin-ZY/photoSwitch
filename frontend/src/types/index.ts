export interface Photo {
  hash: string
  filename: string
  original_path: string
  file_size: number
  format: string
  status: 'pending' | 'keep' | 'eliminate'
  is_favorite: boolean
  cluster_id: string | null
  exif: Record<string, unknown>
  created_at: string
  width: number | null
  height: number | null
  orientation: number | null
}

export interface Project {
  id: string
  name: string
  source_folders: string[]
  created_at: string
  status: 'scanning' | 'analyzing' | 'ready' | 'exporting'
  total_files: number
  analyzed_files: number
  similarity_threshold: number
}

export interface Cluster {
  id: string
  photos: Photo[]
}
