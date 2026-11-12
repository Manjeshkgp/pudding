import { ChevronRightIcon } from "@/components/icons";
import ScrollHeader from "@/components/scroll-header";
import HelpClose from "@/components/help-close";

import type { Article, Topic } from "@/components/help-content";

export default function HelpArticleScreen({ topic, article }: { topic: Topic; article: Article }) {
  return (
    <main className="min-h-dvh bg-white">
      <ScrollHeader title="Help" left={<HelpClose fallback={`/help/${topic.slug}`} />} />

      <div className="flex flex-col gap-8 pb-12">
        <h2 className="px-4 text-xl font-semibold leading-7 tracking-[-0.15px] text-black">
          {article.title}
        </h2>

        {article.sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2.5 px-4 text-black">
            <h3 className="text-2xl font-semibold leading-8 tracking-[-0.18px]">
              {s.title}
            </h3>
            <p className="text-[17px] leading-[25px] tracking-[-0.17px]">{s.body}</p>
          </section>
        ))}

        <section className="flex flex-col gap-6 px-4 text-black">
          <h3 className="text-2xl font-semibold leading-8 tracking-[-0.18px]">Support</h3>
          <div className="flex flex-col items-start gap-4">
            {["FAQs", "Chat with us"].map((l) => (
              <button
                key={l}
                type="button"
                className="flex items-center gap-2 text-[17px] font-medium leading-[22px] tracking-[-0.17px]"
              >
                {l}
                <ChevronRightIcon className="size-5" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
