import { createMiddleware } from "@tanstack/react-start";

// The app is protected by the shared password gate, so server functions run
// with a service-role client instead of a per-user Supabase session.
export const requireSupabaseAuth = createMiddleware().server(async ({ next }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return next({ context: { supabase: supabaseAdmin, userId: "shared-access" } });
});
