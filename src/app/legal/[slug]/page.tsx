import { notFound } from "next/navigation";
import LegalDoc from "@/components/legal-doc";

// Sample text only. Every document uses the same made-up body for now.
const BODY = [
  "As part of the registration process, we collect personal information about you and your child, including names, dates of birth, contact details and account information. We may also collect transaction details, payment activity and device information to provide our services, manage accounts and help families keep track of their money.",
  "To provide our services, we may share relevant information with trusted third-party service providers who support us with account management, payment processing, security and fraud prevention. Payments are processed through PayPal, which handles payment information in accordance with its own privacy policy and terms of service.",
  "We use the information we collect to operate your account, process payments, monitor transactions, provide parental controls and improve the experience. We take reasonable steps to protect personal information and prevent unauthorised access or disclosure.",
  "Parents and legal guardians can request access to their child's personal information, ask for corrections or request account-related changes, subject to applicable laws and requirements.",
  "We do not sell children's personal information. Information is shared only where necessary to provide our services, meet legal obligations or protect the security of our users.",
  "For further details about how we collect, use and protect your information, please refer to our Privacy Policy or contact our support team.",
];

const DOCS: Record<string, { title: string; label: string }> = {
  terms: { title: "Terms & Conditions", label: "Pudding privacy notice" },
  privacy: { title: "Privacy Notice", label: "Pudding privacy notice" },
  guardian: {
    title: "Parent and Guardian Agreement",
    label: "Pudding parent and guardian agreement",
  },
  payments: {
    title: "Payment and Refund Policy",
    label: "Pudding payment and refund policy",
  },
  support: { title: "Contact support", label: "Pudding support" },
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
  const backHref = ["/setup", "/plan"].includes(returnTo ?? "") ? returnTo! : "/setup";

  return (
    <LegalDoc
      title={doc.title}
      label={doc.label}
      date="6 November 2026"
      paragraphs={BODY}
      backHref={backHref}
    />
  );
}
