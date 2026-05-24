// Public barrel — top-level kit exports.
//
// SCAFFOLDING ONLY (#955 of META #947). Implementations land in #956
// (schema), #957 (core), #958 (routes), #959 (UI), #960 (Specforge
// migration validates), #961 (docs).
//
// Until then, importing this kit will fail with "not implemented" runtime
// errors. See README.md + the spec at specforge:docs/backlog-kit-spec.md.

export type {
  BacklogConfig,
  BacklogKit,
  IntakeState,
  BlockStatus,
  IntakeRow,
  CommentRow,
  TriageUpdates,
} from "./types.js";

export { createBacklog } from "./create.js";
