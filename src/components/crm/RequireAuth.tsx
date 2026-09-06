import type { ReactNode } from "react";

// Auth gate removed: every page renders directly without sign-in.
export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
