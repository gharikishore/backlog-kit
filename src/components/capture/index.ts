// Capture-side React components: IntakeWidget (floating bug/feedback
// button) + ErrorReporter (window.onerror auto-capture).
//
// Both render in the root layout of the consumer app. ErrorReporter
// has no UI (returns null); IntakeWidget renders the floating pill +
// modal.
export { default as IntakeWidget } from "./IntakeWidget";
export type { IntakeWidgetProps } from "./IntakeWidget";
export { default as ErrorReporter } from "./ErrorReporter";
export type { ErrorReporterProps } from "./ErrorReporter";
