import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth";
import type { AuthLinkResult } from "@/lib/auth-link";
import { toast } from "sonner";
import { SiteHeader, Footer, CookieNotice } from "@/components/site/chrome";
import { themeInitScript } from "@/components/site/theme";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

function NotFoundComponent() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-gradient text-8xl font-extrabold">404</p>
      <h1 className="mt-4 text-2xl font-bold">{t.notFound.title}</h1>
      <p className="mt-2 text-muted-foreground">{t.notFound.body}</p>
      <Button asChild variant="hero" className="mt-8">
        <Link to="/">{t.notFound.home}</Link>
      </Button>
    </main>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="text-2xl font-bold">This page didn't load</h1>
      <p className="mt-2 text-muted-foreground">{t.common.somethingWrong}</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => { router.invalidate(); reset(); }}>Try again</Button>
        <Button asChild variant="glass"><a href="/">{t.notFound.home}</a></Button>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient; authLinkPromise?: Promise<AuthLinkResult | null> }>()({
  beforeLoad: async ({ context }) => {
    return { authLink: await context.authLinkPromise ?? null };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: t.landing.metaTitle },
      { name: "description", content: t.landing.metaDesc },
      { property: "og:site_name", content: t.brand },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#4f2fd6" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: t.brand },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    scripts: [{ children: themeInitScript }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-background focus:px-4 focus:py-2">
          Skip to content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, authLink: loadedAuthLink, authLinkPromise } = Route.useRouteContext();
  const [authLink, setAuthLink] = useState(loadedAuthLink);
  const [linkReady, setLinkReady] = useState(false);
  useEffect(() => {
    void (authLinkPromise ?? Promise.resolve(null)).then((result) => {
      setAuthLink(result);
      setLinkReady(true);
    });
  }, [authLinkPromise]);
  const router = useRouter();
  useEffect(() => {
    if (!authLink) return;
    if (!authLink.ok) toast.error(t.auth.errCode, { id: "auth-link" });
    else if (authLink.email) toast.success(t.settings.signedInAs(authLink.email), { id: "auth-link" });
    if (authLink.ok && authLink.recovery && router.state.location.pathname !== "/reset-password") {
      void router.navigate({ to: "/reset-password", replace: true });
    }
  }, [authLink, router]);
  const onChange = useCallback(
    (event: string) => {
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    },
    [router, queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      {linkReady ? (
      <AuthProvider onChange={onChange} authLink={authLink}>
        <SiteHeader />
        <div id="main">
          <Outlet />
        </div>
        <Footer />
        <CookieNotice />
        <Toaster position="top-center" />
      </AuthProvider>
      ) : <main className="flex min-h-[60vh] items-center justify-center" role="status">{t.common.loading}</main>}
    </QueryClientProvider>
  );
}
