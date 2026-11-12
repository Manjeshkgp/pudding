import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import LegalDoc, { type LegalSection } from "@/components/legal-doc";
import { cookieNavigationState } from "@/lib/cookie-navigation";
import { getSessionFromRequest } from "@/lib/jwt";
import { stateFromClaim } from "@/lib/navigation-claims";
import { navigationRedirect } from "@/lib/navigation-policy";

const DOCS: Record<string, {
  title: string;
  label: string;
  notice?: string;
  paragraphs?: string[];
  sections?: LegalSection[];
}> = {
  terms: {
    title: "User Agreement",
    label: "Terms for using the Pudding demo",
    notice: "Pudding is a demo. All PayPal activity takes place in PayPal Sandbox. No real money moves, and no real subscription charges or purchases occur.",
    sections: [
      {
        heading: "About Pudding",
        paragraphs: [
          "These terms cover your use of the Pudding family money demo. Families can try allowances, savings goals, chores and purchase approvals. Balances, rewards, limits, bills and invoices in Pudding represent test activity. Demo balances have no cash value and cannot be withdrawn or redeemed.",
        ],
      },
      {
        heading: "Parent and co-parent responsibilities",
        paragraphs: [
          "Only a parent or legal guardian may create a child profile. The parent is responsible for supervising the child’s use of the demo, setting spending rules and deciding who can help manage the family. A co-parent’s access depends on the permissions granted to them. An authorized co-parent’s approval can use the primary parent’s saved Sandbox wallet.",
          "Keep account credentials and PINs private. Use fictional child profiles, sample bills and task photos that contain no people or identifying details. Use a PayPal Sandbox test account and keep real financial credentials out of Pudding.",
        ],
      },
      {
        heading: "Top-ups, allowances and purchases",
        paragraphs: [
          "A top-up raises the shared family spending limit. It does not deposit money. The shared limit applies to cumulative demo spending across the family. Individual allowances and daily, weekly or per-purchase limits are separate controls.",
          "Scanning generates a sample bill. A child can request payment, and an eligible request may be approved by AI under the configured rules or sent to a parent for review. An approved request can trigger a simulated payment through the primary parent’s saved PayPal Sandbox wallet. A paid invoice appears after PayPal confirms the Sandbox capture.",
        ],
      },
      {
        heading: "Sandbox subscription and cancellation",
        paragraphs: [
          "The demo offers a one-month test trial followed by simulated billing at the monthly or annual price shown at checkout. Subscription approval and cancellation are managed in PayPal Sandbox. To stop simulated renewals, cancel the subscription in your PayPal Sandbox account.",
        ],
      },
      {
        heading: "AI decisions and demo availability",
        paragraphs: [
          "AI may review a sample bill or the visible result of a chore. Its assessments can be wrong. A task photo cannot prove who performed the task. Parents should review requests that need their decision and should use their own judgment.",
          "Features and access may change during the demo. Test records may be reset or removed. Do not rely on the demo to store financial records or to make decisions about real purchases.",
        ],
      },
      {
        heading: "Questions",
        paragraphs: [
          "Signed-in parents can use Contact support in Accounts to record a question about the demo. For details about the information Pudding handles, see the Privacy Policy.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    label: "How Pudding handles information in the demo",
    notice: "Pudding is a demo. PayPal Sandbox simulates payments and subscriptions without moving real money. Pudding and its service providers still process information you enter or upload. Use fictional child profiles and sample task photos without people or identifying details.",
    sections: [
      {
        heading: "Information we collect",
        paragraphs: [
          "Parent accounts may include an email address, name, avatar, password and PIN hashes, security question records and account settings. Family records may include co-parent invitations and permissions, child names and dates of birth, generated usernames, avatars, PIN hashes and parental consent records.",
          "Using the demo creates records of allowances, savings goals, bills, approvals, Sandbox payments, chores, submitted photos and notes, notifications and support requests. Security and activity records may include IP addresses, browser information, timestamps and actions taken.",
        ],
      },
      {
        heading: "How we use information",
        paragraphs: [
          "Pudding uses this information to verify email addresses, sign users in, manage family access, run demo features, review purchases and chores, send notifications and investigate errors or suspicious activity. Session cookies keep users signed in. Browser storage can remember settings such as whether you dismissed the install prompt.",
        ],
      },
      {
        heading: "What family members can see",
        paragraphs: [
          "Children use their own profile. Parents and authorized co-parents can view relevant family activity, purchase requests and task submissions within their permissions. Only a parent or legal guardian should set up a child profile and supervise its use. Use fictional details for children throughout the demo.",
        ],
      },
      {
        heading: "PayPal and other providers",
        paragraphs: [
          "PayPal handles Sandbox sign-in, subscriptions, wallet approval and simulated payments. Pudding stores account identifiers, subscription and transaction references, and a server-side token for the saved Sandbox wallet. Pudding does not ask you to enter your PayPal password or card number on its own pages.",
          "Hosting and database services process app records. Resend processes email addresses and message content when it sends verification or other account emails. If you enable browser notifications, your browser’s push service processes the subscription and notifications. You can turn notifications off in Accounts or your browser settings.",
        ],
      },
      {
        heading: "AI review and camera use",
        paragraphs: [
          "The purchase camera helps simulate a scan. Pudding generates a sample bill and does not upload the camera image for purchase review. If AI review is enabled, Google Gemini may receive sample bill details, the child’s age and relevant review settings. It does not receive the saved PayPal wallet token.",
          "Chore evidence works differently. Pudding stores submitted task photos and may send them to Gemini with the task title, description and submitted note to assess the visible result. Older submissions may include both a before and an after photo. Google’s handling of inputs depends on the Gemini service terms and configuration. Unpaid services may use inputs and outputs to improve Google’s services. Keep faces, names, addresses and other identifying details out of photos and notes.",
        ],
      },
      {
        heading: "Retention and your choices",
        paragraphs: [
          "Demo records may remain after you stop using Pudding. Some information can remain in activity or audit records after a profile is removed. The demo does not publish a fixed deletion schedule.",
          "Parents can review and update family information in the app and change notification preferences. To ask about access, correction or deletion, a signed-in parent can record a request through Accounts → Contact support. This form stores the request in Pudding and does not notify an external support team.",
        ],
      },
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

  const request = new NextRequest("http://pudding.internal", {
    headers: { cookie: (await headers()).get("cookie") || "" },
  });
  const session = await getSessionFromRequest(request);
  const state = session?.navigation
    ? stateFromClaim(session.navigation)
    : session
      ? null
      : (await cookieNavigationState(request)).state;
  const destination = session
    ? state?.nextRoute ?? (session.subjectType === "CHILD" ? "/home" : "/onboarding")
    : state?.kind === "DRAFT"
      ? state.nextRoute
      : "/start";
  let signedInLabel = "Continue onboarding";
  if (state?.kind === "BLOCKED") signedInLabel = "Account status";
  else if (session?.subjectType === "CHILD") signedInLabel = "Go to home";
  else if (state?.completed) signedInLabel = "Go to family";
  const actions = session
    ? [{ href: destination, label: signedInLabel }]
    : [
        { href: destination, label: state?.kind === "DRAFT" ? "Continue signup" : "Get started" },
        { href: "/login", label: "Sign in" },
      ];

  // Only accept known in-app destinations so a crafted query cannot create an open redirect.
  const allowedReturn = [
    "/onboarding/setup",
    "/onboarding/plan",
    "/onboarding/paypal",
    "/account",
    "/account/paypal",
    "/family",
    "/help",
  ].find((path) => path === returnTo);
  const backHref = allowedReturn
    ? (state && navigationRedirect(state, allowedReturn)) || allowedReturn
    : destination;

  return (
    <LegalDoc
      title={doc.title}
      label={doc.label}
      date={doc.notice ? "12 November 2026" : "11 November 2026"}
      notice={doc.notice}
      sections={doc.sections}
      paragraphs={doc.paragraphs}
      backHref={backHref}
      actions={actions}
    />
  );
}
