// @local/backlog-kit — barrel entry.
//
// Re-exports schema + lib. Components are NOT re-exported here because
// "use client" boundaries shouldn't be pulled into server-side imports
// of the barrel — consumers should import components via the explicit
// subpath: `import { IntakeWidget } from "@local/backlog-kit/components/capture";`

export * from "./schema";
export * from "./lib";
export const PACKAGE_NAME = "@local/backlog-kit";
export const PACKAGE_VERSION = "1.0.0";
