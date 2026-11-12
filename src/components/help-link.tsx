"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Opens Help & Support and remembers which screen it was opened from, so the
// X on the help screens can return there.
export const HELP_ORIGIN_KEY = "pudding-help-origin";

export default function HelpLink({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const pathname = usePathname();
  return (
    <Link
      href="/help"
      prefetch={false}
      className={className}
      onClick={() => {
        try {
          sessionStorage.setItem(HELP_ORIGIN_KEY, pathname);
        } catch {}
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
