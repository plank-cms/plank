import {
  CalendarClockIcon,
  PencilIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/shared/ui/button.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.tsx'
import { UserAvatar } from '@/shared/ui/custom/UserAvatar.tsx'
import type { UserOption } from '../entryTypes.ts'

type EntryHeaderActionsProps = {
  isNew: boolean
  canDeleteCurrentEntry: boolean
  isReadOnlySingle: boolean
  deleting: boolean
  onDeleteClick: () => void
  status: 'draft' | 'scheduled' | 'published' | 'pending' | 'in_review'
  readOnly: boolean
  onRevertToDraft: () => void
  busy: boolean
  patching: boolean
  showReviewerControl: boolean
  assignedEditorId: string | null
  assignedEditorAvatarUrl: string | null
  assignedEditorFirstName: string | null
  assignedEditorLastName: string | null
  reviewerLabel: string | null
  handleAssignEditor: (editorId: string) => void
  canManageReviewer: boolean
  isEditorRole: boolean
  reviewerCandidates: UserOption[]
  showReviewerInfo: boolean
  showReviewEditButton: boolean
  onToggleReviewLock: () => void
  showRejectButton: boolean
  onReject: () => void
  supportsPreviewUI: boolean
  previewEnabled: boolean
  canOpenPreview: boolean
  onOpenPreview: () => void
  previewSetupError: string | null
  previewHint: string | null
  onSaveDraft: () => void
  editorialMode: boolean
  saveDraftEnabled: boolean
  onOpenScheduler: () => void
  isContributorRole: boolean
  canPublish: boolean
  onPublish: () => void
  publishLabel: string
  isPublishedStale: boolean
}

export function EntryHeaderActions({
  isNew,
  canDeleteCurrentEntry,
  isReadOnlySingle,
  deleting,
  onDeleteClick,
  status,
  readOnly,
  onRevertToDraft,
  busy,
  patching,
  showReviewerControl,
  assignedEditorId,
  assignedEditorAvatarUrl,
  assignedEditorFirstName,
  assignedEditorLastName,
  reviewerLabel,
  handleAssignEditor,
  canManageReviewer,
  isEditorRole,
  reviewerCandidates,
  showReviewerInfo,
  showReviewEditButton,
  onToggleReviewLock,
  showRejectButton,
  onReject,
  supportsPreviewUI,
  previewEnabled,
  canOpenPreview,
  onOpenPreview,
  previewSetupError,
  previewHint,
  onSaveDraft,
  editorialMode,
  saveDraftEnabled,
  onOpenScheduler,
  isContributorRole,
  canPublish,
  onPublish,
  publishLabel,
  isPublishedStale,
}: EntryHeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {!isNew && canDeleteCurrentEntry && !isReadOnlySingle && (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDeleteClick}
          disabled={deleting}
        >
          <Trash2Icon className="size-4" />
        </Button>
      )}
      {!isNew && status === 'published' && !readOnly && (
        <Button variant="outline" onClick={onRevertToDraft} disabled={busy}>
          {patching ? <Spinner className="size-4" /> : null}
          Revert to draft
        </Button>
      )}
      {!isNew && status === 'scheduled' && !readOnly && (
        <Button variant="outline" onClick={onRevertToDraft} disabled={busy}>
          {patching ? <Spinner className="size-4" /> : null}
          Cancel schedule
        </Button>
      )}
      {showReviewerControl && (
        <Select
          value={assignedEditorId ?? 'none'}
          onValueChange={handleAssignEditor}
          disabled={!canManageReviewer || busy}
        >
          <SelectTrigger className="h-10 min-h-10 max-h-10 w-42 py-0">
            <div className="flex items-center gap-2">
              <UserAvatar
                avatarUrl={assignedEditorAvatarUrl ?? null}
                firstName={assignedEditorFirstName ?? null}
                lastName={assignedEditorLastName ?? null}
                className="size-5"
                fallbackClassName="text-[9px]"
              />
              <SelectValue placeholder={reviewerLabel ? reviewerLabel : 'Assign editor'} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {!isEditorRole && <SelectItem value="none">Unassign</SelectItem>}
            {reviewerCandidates.map((reviewer) => (
              <SelectItem key={reviewer.id} value={reviewer.id}>
                {reviewer.first_name || reviewer.last_name || reviewer.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!canManageReviewer && showReviewerInfo && (
        <div className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm">
          <UserAvatar
            avatarUrl={assignedEditorAvatarUrl ?? null}
            firstName={assignedEditorFirstName ?? null}
            lastName={assignedEditorLastName ?? null}
            className="size-5"
            fallbackClassName="text-[9px]"
          />
          <span>{reviewerLabel || 'Assigned editor'}</span>
        </div>
      )}
      {showReviewEditButton && (
        <Button variant="outline" size="icon" onClick={onToggleReviewLock} disabled={busy}>
          <PencilIcon className="size-4" />
        </Button>
      )}
      {showRejectButton && (
        <Button variant="outline" size="icon" onClick={onReject} disabled={busy}>
          <XIcon className="size-4" />
        </Button>
      )}
      {supportsPreviewUI && previewEnabled && canOpenPreview && (
        <Button
          variant="outline"
          onClick={onOpenPreview}
          disabled={readOnly || busy || Boolean(previewSetupError)}
          title={previewHint ?? undefined}
        >
          Open preview
        </Button>
      )}
      <Button
        variant="outline"
        onClick={onSaveDraft}
        size={editorialMode ? 'icon' : 'default'}
        disabled={!saveDraftEnabled}
      >
        {busy ? (
          <Spinner className="size-4" />
        ) : editorialMode ? (
          <SaveIcon className="size-4" />
        ) : null}
        {!editorialMode && (status === 'scheduled' ? 'Save draft (cancel schedule)' : 'Save draft')}
      </Button>
      {status !== 'scheduled' && !(editorialMode && isContributorRole) && (
        <Button
          variant="outline"
          onClick={onOpenScheduler}
          size={editorialMode ? 'icon' : 'default'}
          disabled={readOnly || busy}
        >
          <CalendarClockIcon className="size-4" />
          {!editorialMode && 'Schedule'}
        </Button>
      )}
      <Button onClick={onPublish} disabled={readOnly || !canPublish || busy}>
        {patching ? <Spinner className="size-4" /> : null}
        {status === 'scheduled'
          ? editorialMode && isContributorRole
            ? 'Review'
            : 'Publish now'
          : status === 'published' && !isPublishedStale
            ? 'Republish'
            : publishLabel}
      </Button>
    </div>
  )
}
