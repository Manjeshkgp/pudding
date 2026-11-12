import TopBar from "@/components/top-bar";
import Link from "next/link";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export default function LegalDoc({
  title,
  label,
  date,
  notice,
  paragraphs = [],
  sections = [],
  backHref,
  actions,
}: {
  title: string;
  label: string;
  date: string;
  notice?: string;
  paragraphs?: string[];
  sections?: LegalSection[];
  backHref: string;
  actions: { href: string; label: string }[];
}) {
  return (
    <main className="min-h-dvh bg-white">
      <div className="w-full bg-white pb-10">
        <TopBar backHref={backHref} />

        <header className="px-4 pb-8 pt-6">
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            {title}
          </h1>
        </header>

        <article className="flex flex-col gap-6 px-4 text-[17px] tracking-[-0.17px]">
          <div className="flex flex-col gap-1">
            <p className="leading-[25px] text-[#5e5e5e]">{label}</p>
            <p className="font-medium leading-[22px] text-black">
              {notice ? "Last updated " : ""}{date}
            </p>
          </div>
          {notice && (
            <aside aria-label="Sandbox notice" className="rounded-2xl bg-[#f3f3f3] p-4 leading-[25px] text-black">
              <h2 className="mb-2 font-semibold">Sandbox demo</h2>
              <p>{notice}</p>
            </aside>
          )}
          {paragraphs.length > 0 && (
            <div className="leading-[25px] text-black">
              {paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </div>
          )}
          {sections.map(({ heading, paragraphs }) => (
            <section key={heading} className="space-y-3 leading-[25px] text-black">
              <h2 className="font-display text-xl font-bold">{heading}</h2>
              {paragraphs.map((text) => <p key={text}>{text}</p>)}
            </section>
          ))}
        </article>
        <nav aria-label="Continue from this page" className="mt-8 flex flex-wrap gap-3 px-4">
          {actions.map(({ href, label }, index) => (
            <Link
              key={href}
              href={href}
              className={`rounded-full px-5 py-3 font-medium ${index === 0 ? "bg-black text-white" : "bg-[#f3f3f3] text-black"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
