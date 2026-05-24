// Layout wrapper for `/admin/*` pages (intake #968 / META #930).
// Adds AdminHeader chrome at the top + delegates content to children.
// Consumer's app/admin/layout.tsx renders this with whatever
// AdminHeaderProps it needs.
import type { ReactNode } from "react";
import { AdminHeader, type AdminHeaderProps } from "./AdminHeader";

export type AdminLayoutProps = AdminHeaderProps & {
  children: ReactNode;
};

export function AdminLayout({ children, ...headerProps }: AdminLayoutProps) {
  return (
    <>
      <AdminHeader {...headerProps} />
      {children}
    </>
  );
}
