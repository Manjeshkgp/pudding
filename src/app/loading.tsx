import { SpinnerIcon } from "@/components/icons";

export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Opening page"
      className="flex min-h-dvh items-center justify-center bg-white"
    >
      <SpinnerIcon className="size-8 text-black motion-reduce:animate-none" />
      <span className="sr-only">Opening page</span>
    </main>
  );
}
