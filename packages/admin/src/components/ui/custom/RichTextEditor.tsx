import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils.ts'

type RichTextEditorProps = {
  value: string
  onChange: (json: string) => void
  placeholder?: string
  onInsertImage?: () => Promise<string | null>
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

export function RichTextEditor({ value, onChange, placeholder, onInsertImage }: RichTextEditorProps) {
  const [isEmpty, setIsEmpty] = useState(!value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } },
      }),
      Image.configure({
        HTMLAttributes: { class: 'max-w-full rounded' },
        allowedAttributes: ['src'],
      }),
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
        class: 'h-96 px-3 py-2.5 focus:outline-none',
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
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleInsertImage() {
    if (!editor || !onInsertImage) return
    const url = await onInsertImage()
    if (url) editor.chain().focus().setImage({ src: url }).run()
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
