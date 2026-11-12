import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import AuthNavigationBoundary from "@/components/auth-navigation-boundary";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import MobileOnly from "@/components/mobile-only";
import ClickFeedback from "@/components/click-feedback";
import InstallAppPrompt from "@/components/install-app-prompt";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Phone keyboards shrink the page, so bottom bars sit above the keyboard
  interactiveWidget: "resizes-content",
};
export const metadata: Metadata = {
  title: "Pudding",
  description:
    "Teach children healthy money habits through safe, supervised earning, saving, and spending.",
  applicationName: "Pudding",
  manifest: "/manifest.json",
  icons: {
    icon: "/images/pudding-cat.svg",
    shortcut: "/images/pudding-cat.svg",
    apple: "/images/pudding-app-192.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromRequest(
    new NextRequest("http://pudding.internal", {
      headers: { cookie: (await headers()).get("cookie") || "" },
    }),
  );
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-white text-slate-900 antialiased">
        <div className="desktop:hidden">
          <AuthNavigationBoundary subjectId={session?.sub}>
            {children}
          </AuthNavigationBoundary>
        </div>
        <MobileOnly />
        <ClickFeedback />
        <InstallAppPrompt />
      </body>
    </html>
  );
}
