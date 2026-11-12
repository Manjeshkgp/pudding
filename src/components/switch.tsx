"use client";

export default function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex h-12 w-[52px] shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      <span
        className={`relative h-[31px] w-[51px] rounded-full transition-colors duration-200 motion-reduce:transition-none ${on ? "bg-black" : "bg-[#e8e8e8]"}`}
      >
        <span
          className={`absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 motion-reduce:transition-none ${
            on ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}
