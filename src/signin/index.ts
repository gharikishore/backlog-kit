// Magic-link sign-in: <SignInPage /> + EmailOtpBackend contract.
// (intake #967 / META #930).
//
// Portable across projects: branding + endpoint URLs come from props,
// colors from `--ft-*` CSS vars. The auth backend (Supabase OTP /
// NextAuth / Clerk / etc.) lives in the consumer — this component
// only POSTs the email and handles the UX states.
export { default as SignInPage } from "./SignInPage";
export type { SignInPageProps } from "./SignInPage";
