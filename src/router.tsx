import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { consumeAuthLink, readAuthLink } from "@/lib/auth-link";
import { supabase } from "@/integrations/supabase/client";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient();
  // Runs before hydration can initialize the generated client or restore account A.
  const authLinkPromise = (async () => {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    const params = readAuthLink(url);
    if (!params) return null;
    for (const key of ["access_token", "refresh_token", "token_hash", "code", "type", "expires_in", "expires_at", "token_type", "error", "error_description", "error_code"]) url.searchParams.delete(key);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    const result = await consumeAuthLink(params, supabase, async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      localStorage.removeItem("wc_signed_in_at");
    });
    if (result.ok) localStorage.setItem("wc_signed_in_at", String(Date.now()));
    return result;
  })();

  const router = createRouter({
    routeTree,
    context: { queryClient, authLinkPromise },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
