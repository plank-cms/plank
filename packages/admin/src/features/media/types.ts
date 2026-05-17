export type Folder = {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  item_count: number
}

export type MediaItem = {
  id: string
  filename: string
  url: string
  mime_type: string | null
  size: number | null
  alt: string | null
  caption: string | null
  width: number | null
  height: number | null
  folder_id: string | null
  created_at: string
}

export type MediaList = {
  items: MediaItem[]
  total: number
  page: number
  limit: number
  pages: number
}

export type FolderList = { folders: Folder[] }

export type BreadcrumbEntry = { id: string | null; name: string }
