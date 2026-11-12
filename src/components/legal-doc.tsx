import TopBar from "@/components/top-bar";

export default function LegalDoc({
  title,
  label,
  date,
  paragraphs,
  backHref,
}: {
  title: string;
  label: string;
  date: string;
  paragraphs: string[];
  backHref: string;
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
            <p className="font-medium leading-[22px] text-black">{date}</p>
          </div>
          <div className="leading-[25px] text-black">
            {paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
