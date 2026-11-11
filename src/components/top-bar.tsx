import BackButton from "@/components/back-button";
import Link from "next/link";
import HelpLink from "@/components/help-link";
import { ChevronLeftIcon, QuestionCircleIcon } from "@/components/icons";

const circle =
  "flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]";

// Round white back button on the left, round help button on the right.
export default function TopBar({
  backHref,
  help = true,
  glassHelp = false,
}: {
  backHref: string | null;
  help?: boolean;
  // Frosted-glass help button, as on the password screen
  glassHelp?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-[max(20px,env(safe-area-inset-top))]">
      {backHref ? (
        <BackButton fallback={backHref} className={circle}>
          <ChevronLeftIcon className="size-6 text-black" />
        </BackButton>
      ) : (
        <Link
          href="/login"
          aria-label="Save and exit signup"
          className={circle}
        >
          Exit
        </Link>
      )}
      {help && (
        <HelpLink
          aria-label="Help"
          className={
            glassHelp
              ? "flex size-11 items-center justify-center rounded-full bg-white/65 shadow-[0px_8px_40px_0px_rgba(0,0,0,0.12)] backdrop-blur-xl"
              : circle
          }
        >
          <QuestionCircleIcon className="size-6 text-black" />
        </HelpLink>
      )}
    </div>
  );
}
