export type Section = { title: string; body: string };
export type Article = { slug: string; title: string; sections: Section[] };
export type Topic = { slug: string; title: string; articles: Article[] };
function art(title: string, sections: [string, string][]): Article {
  return {
    slug: title
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    title,
    sections: sections.map(([title, body]) => ({ title, body })),
  };
}
export const TOPICS: Topic[] = [
  {
    slug: "account",
    title: "Account",
    articles: [
      art("Account recovery claim process", [
        [
          "Recover your account",
          "Open parent login and choose Forgot password. Request an email code, then choose a new password.",
        ],
        [
          "During local testing",
          "Email delivery is disabled in development. The verification screen shows the development code returned by the API.",
        ],
        [
          "Need more help?",
          "A signed-in parent can save a support request from Accounts. The demo does not contact an external support team.",
        ],
      ]),
      art("Reset your password", [
        [
          "Start a reset",
          "Choose Forgot password on parent login, enter your email and request a code.",
        ],
        [
          "Finish",
          "Enter the newest six-digit code and a password with at least eight characters. Then sign in using that password.",
        ],
      ]),
      art("Update your profile", [
        [
          "Your name and avatar",
          "Open Accounts, then Edit your profile. Save your name and choose an avatar. Your existing details are prefilled.",
        ],
        [
          "Child profiles",
          "Use Manage children to edit a child's name, avatar or date of birth.",
        ],
      ]),
    ],
  },
  {
    slug: "kids-and-wallets",
    title: "Kids & Wallets",
    articles: [
      art("Add a kid", [
        [
          "Who can be added",
          "Children aged 6–18. Enter first name, last name and date of birth.",
        ],
        [
          "Activation",
          "After the primary parent saves a Sandbox PayPal wallet, open Family and activate the child's wallet. Pudding provides their generated username and six-digit PIN.",
        ],
        [
          "Spend allowance",
          "A parent allocates part of the internal family budget to the child's Spend wallet. This does not transfer money through PayPal.",
        ],
      ]),
      art("Set a daily spend limit", [
        [
          "Daily controls",
          "Open Family, tap Manage beside your child, and save a daily limit. Set 0 to ask the parent for every purchase.",
        ],
        [
          "AI and parent review",
          "Inside a positive limit, AI reviews the bill. Purchases above a daily, weekly or per-purchase threshold go to the parent. Child usage periods use UTC; the shared family limit never resets.",
        ],
      ]),
      art("Reset a kid’s PIN", [
        [
          "Where to reset",
          "Open Family, tap Manage beside your child, then Set or reset login PIN. Enter your parent PIN and choose six new digits.",
        ],
        [
          "Signing in",
          "The child uses their generated username and the new PIN. Resetting also clears a PIN lockout.",
        ],
      ]),
    ],
  },
  {
    slug: "payments-and-transactions",
    title: "Payments & Transactions",
    articles: [
      art("How payments work", [
        [
          "Scan a bill",
          "The child points the camera at a bill and holds it steady. After a short pause, the demo shows items and prices from its sample catalog on the same screen.",
        ],
        [
          "Review",
          "The child taps Request to Pay. AI-approved bills proceed to payment. Bills blocked by AI or requiring a parent decision go to the parent's inbox and approvals queue.",
        ],
        [
          "Payment",
          "An approval triggers a PayPal Sandbox payment using the primary parent's saved wallet. The paid invoice appears after PayPal confirms the capture.",
        ],
      ]),
      art("A payment is pending", [
        [
          "Reserved allowance",
          "While PayPal confirmation is pending, the app reserves the purchase amount.",
        ],
        [
          "Check confirmation",
          "Open the purchase and choose Check payment confirmation. A known order may also be confirmed by a verified webhook or reconciliation job.",
        ],
        [
          "Unknown outcome",
          "If the app asks for manual confirmation, check the Sandbox merchant's order history before retrying. Do not create a replacement purchase to work around an uncertain charge.",
        ],
      ]),
      art("Approve or decline a purchase", [
        [
          "Your approval queue",
          "Open a purchase request from Approvals or the inbox to see its items, quantities, prices, total and reason for review.",
        ],
        [
          "Your decision",
          "Tap Approve and confirm with your parent PIN to pay from the primary parent's saved Sandbox wallet. Decline closes the request.",
        ],
        [
          "Activity",
          "Open Family activity, or the child's Money tab, to see recorded purchases and virtual wallet activity.",
        ],
      ]),
    ],
  },
  {
    slug: "subscriptions-and-billing",
    title: "Spending limits",
    articles: [
      art("Your family limit", [
        [
          "What a top-up does",
          "A top-up increases the internal spending limit shared by all children on one account. It does not deposit money into Pudding.",
        ],
        [
          "Accumulated use",
          "Completed purchases permanently consume part of the limit. It does not reset monthly or yearly. Parents can add another top-up to authorize more spending.",
        ],
        [
          "No subscription",
          "The hackathon demo does not charge a monthly or yearly Pudding subscription.",
        ],
      ]),
      art("Increase your limit", [
        [
          "Add a top-up",
          "Open Family, tap Top up, enter the amount and confirm with your parent PIN. The increased limit is saved on the server.",
        ],
        [
          "Allocate allowance",
          "Open Manage for a child to allocate Spend allowance from the internal unallocated family budget.",
        ],
      ]),
      art("Update your payment method", [
        [
          "Save a wallet",
          "Open Accounts, then PayPal wallet. Link a supported Sandbox PayPal account and approve saving its wallet.",
        ],
        [
          "Authorize again",
          "If a saved wallet needs authorization again, choose Save wallet again. A successful wallet setup replaces the saved payment token after approval.",
        ],
      ]),
    ],
  },
  {
    slug: "safety-and-security",
    title: "Safety & Security",
    articles: [
      art("Your parent PIN", [
        [
          "Create or change",
          "Create your six-digit parent PIN during setup. Change or reset it from Accounts, then Security & PIN, using your account password.",
        ],
        [
          "Keep it private",
          "The parent PIN confirms top-ups and child activation. It is separate from each child's login PIN.",
        ],
      ]),
      art("How we keep kids safe", [
        [
          "Your controls",
          "Manage child limits or pause spending from Family. A paused wallet cannot make a new purchase payment.",
        ],
        [
          "Family privacy",
          "Children see their own wallet and purchases. They cannot access another child's private data or the family spending-limit totals.",
        ],
        [
          "Notifications",
          "Connect browser push from Accounts, then Notification preferences, or use the in-app inbox.",
        ],
      ]),
      art("Spot a suspicious message", [
        [
          "Protect credentials",
          "Do not share passwords, full PINs or PayPal payment tokens in messages.",
        ],
        [
          "Open the app directly",
          "Use your known Pudding address to review purchases and settings.",
        ],
      ]),
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    articles: [
      art("The code didn’t arrive", [
        [
          "Development mode",
          "In local development, emails are intentionally disabled. Use the development OTP shown on the verification screen.",
        ],
        [
          "Resend",
          "Request a new code if needed. Only the newest active code works, and repeated requests are rate limited.",
        ],
      ]),
      art("A scan won’t work", [
        [
          "Camera access",
          "Use localhost or an HTTPS tunnel and allow camera permission in the browser.",
        ],
        [
          "Capture anything",
          "Once the camera is live, Pudding automatically generates a sample bill from the demo catalog.",
        ],
        [
          "Try again",
          "If access was denied, allow it in browser settings and tap Retry camera.",
        ],
      ]),
      art("AI review is unavailable", [
        [
          "What happens",
          "The bill is sent to the parent for review with an explanation.",
        ],
        [
          "Developer configuration",
          "Gemini needs to be available within the project quota. A parent can continue reviewing purchases if it is unavailable.",
        ],
      ]),
    ],
  },
];
export function findTopic(slug: string) {
  return TOPICS.find((t) => t.slug === slug);
}
export function findArticle(topic: string, slug: string) {
  const t = findTopic(topic);
  return t
    ? { topic: t, article: t.articles.find((a) => a.slug === slug) }
    : null;
}
