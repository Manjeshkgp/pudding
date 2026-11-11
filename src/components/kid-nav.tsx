"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

type Tab = "home" | "money" | "tasks" | "quest";

const TABS: { id: Tab; label: string; icon: string; href?: string }[] = [
  { id: "home", label: "Home", icon: "/kid-home/nav-home.svg", href: "/home" },
  {
    id: "money",
    label: "Money",
    icon: "/kid-home/nav-money.svg",
    href: "/money",
  },
  {
    id: "tasks",
    label: "Earn",
    icon: "/kid-home/nav-tasks.svg",
    href: "/earn",
  },
  {
    id: "quest",
    label: "Quest",
    icon: "/kid-home/nav-quest.svg",
    href: "/quest",
  },
];

const slot = "relative flex size-11 shrink-0 items-center justify-center";

// Floating bottom bar of the kid app. The white pill glides to the tab you
// open. Only the screens that exist are linked.
export default function KidNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const active = TABS.find((t) => t.href && pathname.startsWith(t.href))?.id;

  const button = (t: (typeof TABS)[number]) => {
    const inner = (
      <>
        {t.id === active && (
          <motion.span
            layoutId="kid-nav-pill"
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }
            }
            className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] h-[57px] w-[78px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.08)]"
          />
        )}
        <motion.span
          whileTap={reduceMotion ? undefined : { scale: 0.86 }}
          transition={{ type: "spring", stiffness: 500, damping: 24 }}
          className="flex"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.icon} alt="" width={36} height={36} draggable={false} />
        </motion.span>
      </>
    );
    return t.href ? (
      <Link
        key={t.id}
        href={t.href}
        aria-label={t.label}
        aria-current={t.id === active ? "page" : undefined}
        className={slot}
      >
        {inner}
      </Link>
    ) : (
      <button key={t.id} type="button" aria-label={t.label} className={slot}>
        {inner}
      </button>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-2.5 pb-[max(56px,env(safe-area-inset-bottom))] pt-4"
    >
      <div className="pointer-events-auto relative flex h-[72px] items-center gap-5 rounded-full border border-white/20 px-[29px] py-2 shadow-[inset_0px_2px_12px_0px_rgba(0,0,0,0.12)] backdrop-blur-[17px]">
        <div className="absolute inset-0 -z-10 rounded-full bg-black/[0.04]" />
        {TABS.map(button)}
      </div>
    </nav>
  );
}
