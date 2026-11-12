"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

type Tab = "home" | "money" | "tasks";

const TABS: { id: Tab; label: string; icon: string; href: string }[] = [
  { id: "home", label: "Home", icon: "/kid-home/nav-home.svg", href: "/home" },
  { id: "money", label: "Money", icon: "/kid-home/nav-money.svg", href: "/money" },
  { id: "tasks", label: "Earn", icon: "/kid-home/nav-tasks.svg", href: "/earn" },
];

const slot = "relative flex h-[56px] min-w-0 flex-1 items-center justify-center";

// Floating bottom bar of the kid app. The white pill glides to the tab you
// open. Only the screens that exist are linked.
export default function KidNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const active = TABS.find((t) => t.href && pathname.startsWith(t.href))?.id;
  if (pathname === "/scan") return null;

  const button = (t: (typeof TABS)[number]) => {
    const inner = (
      <>
        {t.id === active && (
          <motion.span
            layoutId="kid-nav-pill"
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }}
            className="absolute left-1/2 top-1/2 h-[56px] w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.08)]"
          />
        )}
        <motion.span
          whileTap={reduceMotion ? undefined : { scale: 0.86 }}
          transition={{ type: "spring", stiffness: 500, damping: 24 }}
          className="relative z-10 flex"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.icon} alt="" width={36} height={36} />
        </motion.span>
      </>
    );
    return (
      <Link key={t.id} href={t.href} aria-label={t.label} aria-current={t.id === active ? "page" : undefined} className={slot}>
        {inner}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[520px] items-center justify-between gap-2 px-4 pb-[max(48px,env(safe-area-inset-bottom))] pt-4"
    >
      {/* Glass bar sticks out 4px past the tabs on each side, like the Figma frame */}
      <div className="pointer-events-auto relative h-[68px] min-w-0 max-w-[254px] flex-1">
        <div className="absolute inset-0 rounded-full border border-white/20 bg-black/[0.04] shadow-[inset_0px_2px_12px_0px_rgba(0,0,0,0.12)] backdrop-blur-[17px]" />
        <div className="relative flex h-full items-center px-1">
          {TABS.map(button)}
        </div>
      </div>

      <Link
        href="/scan"
        aria-label="Scan to pay"
        aria-current={pathname === "/scan" ? "page" : undefined}
        className="pointer-events-auto relative flex size-[68px] shrink-0 items-center justify-center"
      >
        <motion.span
          className="relative flex size-full items-center justify-center rounded-full bg-black "
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
        >
          <motion.svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            aria-hidden="true"
            animate={reduceMotion ? undefined : { scale: [1, 1.12, 1] }}
            transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
          >
            <path d="M6 13V9.5A3.5 3.5 0 0 1 9.5 6H13M23 6h3.5A3.5 3.5 0 0 1 30 9.5V13M30 23v3.5a3.5 3.5 0 0 1-3.5 3.5H23M13 30H9.5A3.5 3.5 0 0 1 6 26.5V23" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="11.5" y="11.5" width="5" height="5" rx="1" fill="#fff" />
            <rect x="19.5" y="11.5" width="5" height="5" rx="1" fill="#fff" />
            <rect x="11.5" y="19.5" width="5" height="5" rx="1" fill="#fff" />
            <rect x="19.5" y="19.5" width="2.5" height="2.5" fill="#fff" />
            <rect x="22" y="22" width="2.5" height="2.5" fill="#fff" />
            {/* Scan line sweeping up and down */}
            {!reduceMotion && (
              <motion.rect
                x="8"
                width="20"
                height="2"
                rx="1"
                fill="#ff9500"
                initial={{ y: 9 }}
                animate={{ y: [9, 25, 9] }}
                transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
              />
            )}
          </motion.svg>
        </motion.span>
      </Link>
    </nav>
  );
}
