import Link from "next/link";
import { ChevronLeftIcon, QuestionCircleIcon } from "@/components/icons";

const circle =
  "flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_40px_0px_rgba(0,0,0,0.12)]";

// Round white back button on the left, round help button on the right.
export default function TopBar({
  backHref,
  help = true,
}: {
  backHref: string;
  help?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-[max(20px,env(safe-area-inset-top))]">
      <Link href={backHref} aria-label="Back" className={circle}>
        <ChevronLeftIcon className="size-6 text-black" />
      </Link>
      {help && (
        <button type="button" aria-label="Help" className={circle}>
          <QuestionCircleIcon className="size-6 text-black" />
        </button>
      )}
    </div>
  );
}
