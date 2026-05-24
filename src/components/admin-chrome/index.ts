// Admin chrome: AdminHeader top bar + AdminLayout wrapper.
// (intake #968 / META #930).
//
// Portable across projects: branding + endpoint URLs from props,
// colors from `--ft-*` CSS vars. Sign-out and /me endpoints are
// consumer-supplied — the components only POST/GET them and render
// the user data.
//
// AppLauncher tile grid is intentionally NOT in this kit. The app
// list is consumer-specific (specforge has 12+ tiles, each with its
// own route + icon + stats query). Consumers build their own tile
// grid + render it as the body of /admin/page.tsx; the chrome here
// just wraps it.
export { AdminHeader } from "./AdminHeader";
export type { AdminHeaderProps } from "./AdminHeader";
export { AdminLayout } from "./AdminLayout";
export type { AdminLayoutProps } from "./AdminLayout";
