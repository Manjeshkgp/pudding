import { notFound } from "next/navigation";
import LegalDoc from "@/components/legal-doc";

const DOCS: Record<
  string,
  { title: string; label: string; paragraphs: string[] }
> = {
  terms: {
    title: "Demo Terms & Conditions",
    label: "Pudding demo terms",
    paragraphs: [
      "Pudding is a workable family money demo for the PayPal AI hackathon. Use PayPal Sandbox accounts for all payments.",
      "Parents manage their family, activate child accounts, allocate virtual allowance, and decide which purchases are appropriate. AI review supports the demo and can route a purchase to the parent when unavailable.",
      "A top-up increases an internal limit shared by all children on the account. It does not deposit or transfer money into Pudding. Approved purchases create separate PayPal Sandbox payments.",
    ],
  },
  privacy: {
    title: "Demo Privacy Notice",
    label: "Pudding demo privacy",
    paragraphs: [
      "The demo stores parent account details, hashed passwords and PINs, child profiles, consent records, virtual wallet activity, purchase bills, invoices and review decisions.",
      "PayPal handles wallet approval and Sandbox payments. Pudding stores PayPal identifiers and the saved payment token on the server. These are not exposed to children or included in AI requests.",
      "Bill review sends sample item names, quantities, prices, currency, child's age and the age-review setting to Google Gemini. The purchase camera image is not retained or sent to the model in this demo. For chores, before/after task photos, task title, description and the child’s note are sent to Gemini to assess visible progress. These photos are stored privately in the demo database and accessible to the child and authorized family parents. Google may use free-tier inputs to improve its products; use sample photos without people or private details.",
      "Browser notifications are optional. You can manage notification preferences in Accounts and view updates in the in-app inbox.",
    ],
  },
  guardian: {
    title: "Parent and Guardian Agreement",
    label: "Parent and guardian information",
    paragraphs: [
      "Only a parent or authorized guardian should create and manage a child's profile. Use Sandbox accounts and demo information when exploring Pudding.",
      "Parents supervise purchase decisions, control their child's limits and keep login PINs private. Each child has a separate username and six-digit PIN.",
      "Co-parent permissions control access to family actions. A co-parent approving a demo purchase uses the primary parent's saved Sandbox wallet, rather than adding a separate payment source.",
    ],
  },
  payments: {
    title: "Demo Payments Information",
    label: "Pudding demo payments",
    paragraphs: [
      "Top-ups increase a permanent internal family spending limit. They do not request a PayPal transfer. The limit applies to accumulated spending across all children on the account, with no monthly or yearly reset.",
      "Only an approved purchase request triggers a separate Sandbox payment using the primary parent's saved PayPal wallet. Sandbox proceeds go to the Sandbox business account that owns the app, representing a purchase in this demo.",
      "A purchase is shown as paid only after PayPal confirms a completed capture. A declined request does not charge the wallet. An uncertain payment stays pending until its outcome can be checked.",
      "Live payments, refunds and disputes are outside the current hackathon payment demo.",
    ],
  },
  support: {
    title: "Contact support",
    label: "Pudding demo support",
    paragraphs: [
      "Open Accounts, then Contact support to save a demo support request. Requests are stored with your account and can be viewed on that page.",
      "The demo does not contact an external support team. For a child login issue, the parent can open Family, choose Manage for the child, and set or reset the child's PIN.",
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export default async function LegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { slug } = await params;
  const { returnTo } = await searchParams;
  const doc = DOCS[slug];
  if (!doc) notFound();

  // Only accept known in-app destinations so a crafted query cannot create an open redirect.
  const backHref = [
    "/onboarding/setup",
    "/onboarding/plan",
    "/onboarding/paypal",
    "/account",
    "/account/paypal",
    "/family",
  ].includes(returnTo ?? "")
    ? returnTo!
    : "/onboarding";

  return (
    <LegalDoc
      title={doc.title}
      label={doc.label}
      date="11 November 2026"
      paragraphs={doc.paragraphs}
      backHref={backHref}
    />
  );
}
