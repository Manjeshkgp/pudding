import type { Metadata } from "next";
import TopBar from "@/components/top-bar";
import { ChevronRightIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "FAQs | Pudding",
};

const questions = [
  {
    question: "What can my family do in Pudding?",
    answer:
      "Parents can give children a virtual allowance, set spending rules, assign chores and review purchase requests. Children can earn rewards, save toward goals and request purchases. This demo uses PayPal Sandbox for payments.",
  },
  {
    question: "How do I add a child and help them sign in?",
    answer:
      "Add your child’s profile during signup or from Family. Once the primary parent has saved a PayPal Sandbox wallet, activate the child’s wallet in Family to get their username and login PIN. A parent can reset the PIN from the child’s settings.",
  },
  {
    question: "What’s the difference between a top-up and an allowance?",
    answer:
      "A top-up raises the shared spending limit for all children in the family. The limit does not reset, and topping up does not move money. Spend allowance is the amount a parent allocates to an individual child. Daily, weekly and per-purchase limits are separate controls.",
  },
  {
    question: "What happens when my child scans a bill?",
    answer:
      "The demo generates a sample bill. When your child taps Request to Pay, Pudding checks their spending rules. AI can approve an eligible request when enabled. Requests that need a parent decision, including requests blocked by AI, appear in the parent’s inbox and approvals.",
  },
  {
    question: "When does a purchase count as paid?",
    answer:
      "An approved purchase uses the primary parent’s saved PayPal Sandbox wallet. Pudding shows a paid invoice after PayPal confirms the payment. If the purchase is pending, open it and check the payment confirmation before trying again.",
  },
  {
    question: "How do chore rewards and savings work?",
    answer:
      "A child submits a photo for a task. AI can approve supported submissions, and a parent can review others. Approved rewards are split 70% into Spending Allowance and 30% into Savings. Children can put money toward a savings goal from either balance.",
  },
  {
    question: "Can another parent help manage the family?",
    answer:
      "The primary parent can invite a co-parent and choose their access level. The invitation link expires after 24 hours. If it expires, the primary parent can resend or remove the invitation.",
  },
  {
    question: "What should I do if my verification email doesn’t arrive?",
    answer:
      "Check the email address and your spam folder. Tap Resend code when the countdown ends. Each code expires after 10 minutes, and requesting a new one replaces the previous code.",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-dvh bg-white">
      <TopBar backHref="/help" help={false} />
      <h1 className="px-4 pb-6 pt-6 font-display text-[32px] font-bold leading-10 text-black">
        Frequently asked questions
      </h1>
      <div className="flex flex-col gap-3 px-4 pb-10 text-black">
        {questions.map(({ question, answer }) => (
          <details key={question} className="group rounded-2xl border border-[#e8e8e8]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronRightIcon className="size-5 shrink-0 text-[#5e5e5e] group-open:rotate-90" />
            </summary>
            <p className="px-4 pb-4 text-[15px] leading-6 text-[#5e5e5e]">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </main>
  );
}
