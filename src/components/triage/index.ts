// Triage-side React components.
//
// Shell (#934):
//   ReviewCard — generic 2-column aside+article layout
//
// Kit-adapter contract (#973):
//   BacklogUIAdapter / BacklogUIProvider / useBacklogUI
//
// Admin/backlog primitives (#973):
//   BacklogCard, BacklogViewsToolbar, PaginationBar, FilterChip,
//   StateLozenge, ActionBtn, LinkifiedSeqText, NoteDisplay, NoteEditor,
//   BlockStrip, CommentsThread, HistoryTimeline, AttachmentsStrip,
//   LogicalNextStrip, RelatedStrip
//
// Specforge-specific (NOT moved): SignupAcceptBtn, SignupProvisionPanel.
// BacklogCard accepts these as `renderSignup*` slot props — consumers
// without signup flows pass undefined and the card renders nothing in
// those positions when kind=*_signup.

export { default as ReviewCard } from "./ReviewCard";
export type { ReviewCardProps, ReviewCardDrag } from "./ReviewCard";

export { BacklogUIProvider, useBacklogUI } from "./kit-adapter";
export type {
  BacklogUIAdapter,
  KitButtonProps,
  KitLozengeProps,
  IdentityCandidate,
  ReasoningSectionsProps,
} from "./kit-adapter";

// Default adapter + drop-in page (intake #986).
export { defaultBacklogUIAdapter } from "./default-adapter";
export { BacklogPage } from "./BacklogPage";
export type { BacklogPageProps } from "./BacklogPage";

export { BacklogCard } from "./BacklogCard";
export { BacklogViewsToolbar } from "./BacklogViewsToolbar";
export { PaginationBar } from "./PaginationBar";
export { FilterChip } from "./FilterChip";
export { StateLozenge } from "./StateLozenge";
export { ActionBtn } from "./ActionBtn";
export { LinkifiedSeqText } from "./LinkifiedSeqText";
export { NoteDisplay } from "./NoteDisplay";
export { NoteEditor } from "./NoteEditor";
export { BlockStrip } from "./BlockStrip";
export { CommentsThread } from "./CommentsThread";
export { HistoryTimeline } from "./HistoryTimeline";
export { AttachmentsStrip } from "./AttachmentsStrip";
export { LogicalNextStrip } from "./LogicalNextStrip";
export { RelatedStrip } from "./RelatedStrip";
