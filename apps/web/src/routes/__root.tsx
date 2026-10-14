import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { themeInitScript } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "@/styles.css?url";
import { assetRecoveryScript } from "@/lib/asset-recovery";
import { SITE_SHARE_META, shareMeta } from "@/lib/share-meta";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      ...SITE_SHARE_META,
      ...shareMeta({
        title: "SellBridge",
        description:
          "Conecte suas lojas, publique produtos de fornecedores e acompanhe suas vendas.",
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/svg+xml", sizes: "any", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  // Marks the moment React owns the page; end-to-end tests wait for it before typing.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        {/*
          The function's source text differs between the server and the client bundles; the
          script already ran from the server HTML, so the client's copy is never used.
        */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: assetRecoveryScript }}
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />

        <Scripts />
      </body>
    </html>
  );
}
