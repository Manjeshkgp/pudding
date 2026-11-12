"use client";
import { useRouter } from "next/navigation";
import { canGoBack } from "@/lib/navigation-history";
import { ChevronLeftIcon } from "@/components/icons";
export default function BackButton({
  fallback = "/family",
  className,
  children,
  avoid = [],
  ...props
}: {
  fallback?: string;
  avoid?: string[];
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const router = useRouter();
  return (
    <button
      {...props}
      type="button"
      aria-label={props["aria-label"] || "Back"}
      className={
        className ||
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
      }
      onClick={() => {
        if (canGoBack(avoid)) router.back();
        else router.replace(fallback);
      }}
    >
      {children || <ChevronLeftIcon className="size-6 text-black" />}
    </button>
  );
}
