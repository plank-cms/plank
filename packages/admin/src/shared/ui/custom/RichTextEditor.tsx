import { useEffect, useRef, useState } from 'react'
import {
  useEditor,
  useEditorState,
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
import { cn } from '@/shared/lib/utils.ts'
import { Button } from '@/shared/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.tsx'
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Textarea } from '@/shared/ui/textarea.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip.tsx'

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

type LinkMenu = {
  href: string
  left: number
  top: number
  width: number
  height: number
  pos: number
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

function RichTextImageCard({
  node,
  deleteNode,
  selected,
  updateAttributes,
  editor,
}: NodeViewProps) {
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
            {alt && (
              <span className="truncate" title={alt}>
                Alt: {alt}
              </span>
            )}
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
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkDialogMode, setLinkDialogMode] = useState<'add' | 'edit'>('add')
  const [linkMenu, setLinkMenu] = useState<LinkMenu | null>(null)
  const linkMenuTimer = useRef<number | null>(null)

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
      handleKeyDown(view, event) {
        if (
          !event.shiftKey ||
          (!event.ctrlKey && !event.metaKey) ||
          event.altKey ||
          !['ArrowLeft', 'ArrowRight'].includes(event.key)
        ) {
          return false
        }

        const { $head } = view.state.selection
        if (!$head.parent.isTextblock) return false
        return event.key === 'ArrowLeft'
          ? $head.parentOffset === 0
          : $head.parentOffset === $head.parent.content.size
      },
      handleDOMEvents: {
        mouseover(view, event) {
          const target = event.target
          if (!(target instanceof Element)) return false
          const link = target.closest('a[href]')
          if (!link) return false

          if (linkMenuTimer.current) window.clearTimeout(linkMenuTimer.current)
          const rect = link.getBoundingClientRect()
          setLinkMenu({
            href: link.getAttribute('href') ?? '',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            pos: view.posAtDOM(link, 0),
          })
          return false
        },
        mouseout(_view, event) {
          const target = event.target
          const relatedTarget = event.relatedTarget
          if (
            target instanceof Element &&
            target.closest('a[href]')?.contains(relatedTarget as Node | null)
          ) {
            return false
          }

          linkMenuTimer.current = window.setTimeout(() => setLinkMenu(null), 150)
          return false
        },
      },
    },
    onUpdate({ editor }) {
      setIsEmpty(editor.isEmpty)
      onChange(JSON.stringify(editor.getJSON()))
    },
  })

  const toolbar = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      heading1: editor.isActive('heading', { level: 1 }),
      heading2: editor.isActive('heading', { level: 2 }),
      heading3: editor.isActive('heading', { level: 3 }),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      blockquote: editor.isActive('blockquote'),
      code: editor.isActive('code'),
      codeBlock: editor.isActive('codeBlock'),
      link: editor.isActive('link'),
    }),
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

  useEffect(() => {
    return () => {
      if (linkMenuTimer.current) window.clearTimeout(linkMenuTimer.current)
    }
  }, [])

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

  function handleOpenLinkDialog() {
    if (!editor) return
    const href = editor.getAttributes('link').href as string | undefined
    setLinkUrl(href ?? 'https://')
    setLinkDialogMode(href ? 'edit' : 'add')
    setLinkDialogOpen(true)
  }

  function handleSaveLink() {
    if (!editor) return
    const href = linkUrl.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (href) chain.setLink({ href }).run()
    else chain.unsetLink().run()
    setLinkDialogOpen(false)
  }

  function handleEditLink() {
    if (!editor || !linkMenu) return
    editor.chain().focus().setTextSelection(linkMenu.pos).extendMarkRange('link').run()
    setLinkUrl(linkMenu.href)
    setLinkDialogMode('edit')
    setLinkMenu(null)
    setLinkDialogOpen(true)
  }

  function handleRemoveLink() {
    if (!editor || !linkMenu) return
    editor.chain().focus().setTextSelection(linkMenu.pos).extendMarkRange('link').unsetLink().run()
    setLinkMenu(null)
  }

  if (!editor) return null

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-background px-2 py-1.5">
        <ToolbarButton
          title="Bold"
          active={toolbar?.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={toolbar?.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={toolbar?.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={toolbar?.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Heading 1"
          active={toolbar?.heading1}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1Icon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={toolbar?.heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2Icon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={toolbar?.heading3}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3Icon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Bullet list"
          active={toolbar?.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Ordered list"
          active={toolbar?.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Blockquote"
          active={toolbar?.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={toolbar?.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Code block"
          active={toolbar?.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <SquareCodeIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton title="Add link" active={toolbar?.link} onClick={handleOpenLinkDialog}>
          <LinkIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Remove link"
          disabled={!toolbar?.link}
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

      {linkMenu && (
        <Tooltip open>
          <TooltipTrigger asChild>
            <span
              aria-hidden="true"
              className="pointer-events-none fixed"
              style={{
                left: linkMenu.left,
                top: linkMenu.top,
                width: linkMenu.width,
                height: linkMenu.height,
              }}
            />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="flex items-center gap-1 p-1"
            onPointerEnter={() => {
              if (linkMenuTimer.current) window.clearTimeout(linkMenuTimer.current)
            }}
            onPointerLeave={() => setLinkMenu(null)}
          >
            <Button
              size="sm"
              variant="ghost"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleEditLink}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleRemoveLink}
            >
              Remove
            </Button>
          </TooltipContent>
        </Tooltip>
      )}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{linkDialogMode === 'edit' ? 'Edit Link' : 'Add Link'}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              handleSaveLink()
            }}
          >
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="rich-text-link-url">URL</FieldLabel>
                <Input
                  id="rich-text-link-url"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  autoFocus
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
