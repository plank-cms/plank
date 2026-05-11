import { useEffect, useState } from 'react'
import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  CodeIcon,
  SquareCodeIcon,
  LinkIcon,
  Unlink2Icon,
  WrapTextIcon,
  ImageIcon,
  Trash2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils.ts'
import { Textarea } from '@/components/ui/textarea.tsx'

export type ImageInsert = {
  id?: string | null
  src: string
  filename?: string | null
  alt?: string | null
  title?: string | null
  width?: number | null
  height?: number | null
}

type RichTextEditorProps = {
  value: string
  onChange: (json: string) => void
  placeholder?: string
  onInsertImage?: () => Promise<ImageInsert[] | null>
}

type ToolbarButtonProps = {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'flex size-7 items-center justify-center rounded transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-4 w-px bg-border" />
}

function formatImageDimensions(width?: number | null, height?: number | null): string | null {
  if (!width || !height) return null
  return `${width} × ${height}`
}

function getImageFilename(src: string): string {
  try {
    const url = new URL(src)
    const segments = url.pathname.split('/').filter(Boolean)
    return segments[segments.length - 1] || 'Image'
  } catch {
    const cleanSrc = src.split('?')[0]
    const segments = cleanSrc.split('/').filter(Boolean)
    return segments[segments.length - 1] || 'Image'
  }
}

async function updateMediaCaption(mediaId: string, caption: string | null) {
  const res = await fetch(`/cms/admin/media/${mediaId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ caption }),
  })

  if (!res.ok) throw new Error('Could not update media caption.')
}

function RichTextImageCard({ node, deleteNode, selected, updateAttributes, editor }: NodeViewProps) {
  const src = String(node.attrs.src ?? '')
  const mediaId = typeof node.attrs.mediaId === 'string' ? node.attrs.mediaId : null
  const nodeFilename = typeof node.attrs.filename === 'string' ? node.attrs.filename : null
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : null
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : null
  const width = typeof node.attrs.width === 'number' ? node.attrs.width : null
  const height = typeof node.attrs.height === 'number' ? node.attrs.height : null
  const filename = nodeFilename || getImageFilename(src)
  const dimensions = formatImageDimensions(width, height)
  const [caption, setCaption] = useState(title ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const editable = editor.isEditable

  useEffect(() => {
    setCaption(title ?? '')
  }, [title])

  async function handleCaptionBlur() {
    const normalizedCaption = caption.trim() || null
    const previousCaption = title?.trim() || null
    if (normalizedCaption === previousCaption) {
      setSaveError(null)
      return
    }

    updateAttributes({ title: normalizedCaption })
    setSaveError(null)

    if (!mediaId) return

    setIsSaving(true)
    try {
      await updateMediaCaption(mediaId, normalizedCaption)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update media caption.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <NodeViewWrapper
      className={cn(
        'my-3',
        'rounded-xl border bg-card shadow-xs transition-colors',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
      )}
      contentEditable={false}
      data-drag-handle
    >
      <div className="flex items-start gap-3 p-3">
        <div className="size-18 shrink-0 overflow-hidden rounded-lg border bg-muted">
          <img src={src} alt={alt ?? filename} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-foreground" title={filename}>
            {filename}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {dimensions && <span>{dimensions}</span>}
            {alt && <span className="truncate" title={alt}>Alt: {alt}</span>}
          </div>
          <div className="space-y-1">
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={handleCaptionBlur}
              placeholder="Figcaption..."
              disabled={!editable}
              className="min-h-8 resize-none border-0 bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground shadow-none focus-visible:ring-1"
            />
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{mediaId ? 'Synced with Media Library' : 'Local to this entry'}</span>
              {isSaving && <span>Saving…</span>}
            </div>
            {saveError && <p className="text-[11px] text-destructive">{saveError}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => deleteNode()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove image"
        >
          <Trash2Icon className="size-4" />
        </button>
      </div>
    </NodeViewWrapper>
  )
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  onInsertImage,
}: RichTextEditorProps) {
  const [isEmpty, setIsEmpty] = useState(!value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } },
      }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            mediaId: { default: null },
            filename: { default: null },
            width: { default: null },
            height: { default: null },
          }
        },
        addNodeView() {
          return ReactNodeViewRenderer(RichTextImageCard)
        },
      }).configure({ inline: false }),
    ],
    content: (() => {
      if (!value) return ''
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    })(),
    editorProps: {
      attributes: {
        class: 'h-128 px-3 py-2.5 focus:outline-none',
      },
    },
    onUpdate({ editor }) {
      setIsEmpty(editor.isEmpty)
      onChange(JSON.stringify(editor.getJSON()))
    },
  })

  useEffect(() => {
    if (!editor) return
    const incoming = value
      ? (() => {
          try {
            return JSON.parse(value)
          } catch {
            return value
          }
        })()
      : ''
    const current = JSON.stringify(editor.getJSON())
    if (current !== value) editor.commands.setContent(incoming, { emitUpdate: false })
    setIsEmpty(editor.isEmpty)
  }, [value])

  async function handleInsertImage() {
    if (!editor || !onInsertImage) return
    const images = await onInsertImage()
    if (!images || images.length === 0) return

    const content = images.map((img) => ({
      type: 'image',
      attrs: {
        mediaId: img.id ?? undefined,
        src: img.src,
        filename: img.filename ?? undefined,
        alt: img.alt ?? undefined,
        title: img.title ?? undefined,
        width: img.width ?? undefined,
        height: img.height ?? undefined,
      },
    }))

    editor.chain().focus().insertContent(content).run()
  }

  function handleSetLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? 'https://')
    if (url === null) return
    if (!url) {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().setLink({ href: url }).run()
  }

  if (!editor) return null

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-background px-2 py-1.5">
        <ToolbarButton
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1Icon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2Icon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3Icon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Ordered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Code block"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <SquareCodeIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton title="Add link" active={editor.isActive('link')} onClick={handleSetLink}>
          <LinkIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Remove link"
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink2Icon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        {onInsertImage && (
          <ToolbarButton title="Insert image" onClick={handleInsertImage}>
            <ImageIcon className="size-3.5" />
          </ToolbarButton>
        )}

        <ToolbarButton
          title="Hard break (Shift + Enter)"
          onClick={() => editor.chain().focus().setHardBreak().run()}
        >
          <WrapTextIcon className="size-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div className="relative overflow-y-auto">
        {isEmpty && placeholder && (
          <p className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground select-none">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
