import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.tsx'
import { pickRelationDisplayField } from '../lib/entriesList.ts'
import type { ContentType, FieldDef } from '../types.ts'

type RelationFieldSelectorProps = {
  allFields: FieldDef[]
  fieldName: string
  visible: string[]
  setVisible: Dispatch<SetStateAction<string[]>>
}

export function RelationFieldSelector({
  allFields,
  fieldName,
  visible,
  setVisible,
}: RelationFieldSelectorProps) {
  const base = fieldName.split('.')[0]
  const field = allFields.find((f) => f.name === base)
  const relatedSlug = field?.relatedSlug

  const { data: relatedCt } = useFetch<ContentType>(
    relatedSlug ? `/cms/admin/content-types/${relatedSlug}` : null,
  )

  const selected = visible.find((v) => v.split('.')[0] === base)
  const selectedSub = selected && selected.includes('.') ? selected.split('.')[1] : undefined

  function setFieldSub(baseName: string, sub?: string) {
    setVisible((prev) =>
      prev.map((v) => {
        const parts = v.split('.')
        if (parts[0] !== baseName) return v
        return sub ? `${baseName}.${sub}` : baseName
      }),
    )
  }

  useEffect(() => {
    if (!relatedCt?.fields) return
    if (selectedSub) return

    const found = pickRelationDisplayField(relatedCt.fields)

    if (found) {
      setFieldSub(base, found)
    }
  }, [relatedCt, selectedSub, base])

  if (!relatedCt?.fields) return null

  return (
    <Select value={selectedSub} onValueChange={(val) => setFieldSub(base, val)}>
      <SelectTrigger className="h-8 w-32 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {relatedCt.fields.map((rf) => (
          <SelectItem key={rf.name} value={rf.name}>
            {rf.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
