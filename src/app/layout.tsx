import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoodSpend — Smart Family & Kids Money App",
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
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
