type UploadResult = { id: string; url: string; filename: string; alt: string | null; width: number | null; height: number | null }

type PresignResponse =
  | { mode: 'presigned'; key: string; uploadUrl: string; publicUrl: string }
  | { mode: 'direct' }

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = localStorage.getItem('plank_token')
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
}

function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

export async function uploadMediaFile(
  file: File,
  options?: { folderId?: string | null },
): Promise<UploadResult> {
  const dims = await getImageDimensions(file)

  const presignRes = await fetch('/cms/admin/media/presign', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ filename: file.name, mimeType: file.type, folderId: options?.folderId ?? null }),
  })
  if (!presignRes.ok) throw new Error('Upload failed.')
  const presign = (await presignRes.json()) as PresignResponse

  if (presign.mode === 'presigned') {
    const uploadRes = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    })
    if (!uploadRes.ok) throw new Error('Upload failed.')

    const confirmRes = await fetch('/cms/admin/media/confirm', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        key: presign.key,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        folderId: options?.folderId ?? null,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      }),
    })
    if (!confirmRes.ok) throw new Error('Upload failed.')
    return confirmRes.json() as Promise<UploadResult>
  }

  // Local provider — direct FormData upload
  const body = new FormData()
  body.append('files', file, file.name)
  if (options?.folderId) body.append('folder_id', options.folderId)
  if (dims?.width) body.append('width', String(dims.width))
  if (dims?.height) body.append('height', String(dims.height))
  const res = await fetch('/cms/admin/media', { method: 'POST', headers: authHeaders(), body })
  if (!res.ok) throw new Error('Upload failed.')
  return res.json() as Promise<UploadResult>
}

export async function uploadAvatarFile(file: File): Promise<string> {
  type AvatarPresign =
    | { mode: 'presigned'; key: string; uploadUrl: string }
    | { mode: 'direct' }

  const presignRes = await fetch('/cms/admin/users/me/avatar/presign', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ filename: file.name, mimeType: file.type }),
  })
  if (!presignRes.ok) throw new Error('Upload failed.')
  const presign = (await presignRes.json()) as AvatarPresign

  if (presign.mode === 'presigned') {
    const uploadRes = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    })
    if (!uploadRes.ok) throw new Error('Upload failed.')

    const confirmRes = await fetch('/cms/admin/users/me/avatar/confirm', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key: presign.key }),
    })
    if (!confirmRes.ok) throw new Error('Upload failed.')
    const data = (await confirmRes.json()) as { avatarUrl: string }
    return data.avatarUrl
  }

  // Local provider — direct FormData upload
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/cms/admin/users/me/avatar', { method: 'POST', headers: authHeaders(), body })
  if (!res.ok) throw new Error('Upload failed.')
  const data = (await res.json()) as { avatarUrl: string }
  return data.avatarUrl
}
