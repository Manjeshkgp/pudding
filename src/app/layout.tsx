import type { Metadata, Viewport } from "next";
import "./globals.css";
import MobileOnly from "@/components/mobile-only";

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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-slate-900 antialiased">
        <div className="desktop:hidden">{children}</div>
        <MobileOnly />
      </body>
    </html>
  );
}
