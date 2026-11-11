"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export function Select({
  label,
  children,
  value,
  onChange,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        value?: string;
        children?: React.ReactNode;
        disabled?: boolean;
      }>(child) ||
      child.type !== "option" ||
      child.props.disabled
    )
      return [];
    return [
      {
        value: child.props.value ?? String(child.props.children),
        label: child.props.children,
      },
    ];
  });
  const selected = options.findIndex((option) => option.value === value);
  function expand() {
    if (!options.length || disabled) return;
    setActive(Math.max(0, selected));
    setOpen(true);
  }
  function choose(index: number) {
    if (!options[index]) return;
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function move(index: number) {
    setActive(index);
    document
      .getElementById(`${id}-option-${index}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div
      ref={root}
      className="relative flex min-w-0 flex-col gap-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span id={`${id}-label`} className="text-[17px] font-medium">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        id={`${id}-trigger`}
        disabled={disabled || !options.length}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        onClick={() => (open ? setOpen(false) : expand())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            expand();
          }
        }}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-transparent bg-[#f3f3f3] px-4 py-3 text-left outline-none focus-visible:border-black disabled:opacity-50"
      >
        <span id={`${id}-value`} className="min-w-0">
          {options[selected]?.label ?? "Select an option"}
        </span>
        <ChevronDown
          aria-hidden
          className={`size-5 shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          ref={list}
          role="listbox"
          id={`${id}-options`}
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={
            options[active] ? `${id}-option-${active}` : undefined
          }
          className="z-10 max-h-52 overflow-auto rounded-2xl border border-[#e8e8e8] bg-white p-1.5 shadow-lg outline-none"
          onKeyDown={(event) => {
            if (event.key === "Tab") return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              choose(active);
            } else if (
              event.key === "ArrowDown" ||
              event.key === "ArrowUp" ||
              event.key === "Home" ||
              event.key === "End"
            ) {
              event.preventDefault();
              move(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? options.length - 1
                    : (active +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                      options.length,
              );
            }
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-[15px] ${active === index ? "bg-[#f3f3f3]" : "hover:bg-[#f8f8f8]"}`}
            >
              {option.label}
              {option.value === value && (
                <Check className="size-4 shrink-0" aria-hidden />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
