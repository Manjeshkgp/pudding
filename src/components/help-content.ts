// Sample help copy for Pudding. Written here so every topic, article list and
// article has real text. Nothing is loaded from the network.

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
    sections: sections.map(([t, b]) => ({ title: t, body: b })),
  };
}

export const TOPICS: Topic[] = [
  {
    slug: "account",
    title: "Account",
    articles: [
      art("Account recovery claim process", [
        ["What happened?", "Lost access to your Pudding account? Here’s how to get it back, and what happens to your kids’ wallets while you wait."],
        ["Why you can’t sign in", "Forgot your password, changed your phone number, or lost your device? Find out which one applies to you and what to try first."],
        ["What happens after you submit", "We review every claim within 2 to 3 working days. You’ll get an update by email and a push notification once it’s decided."],
      ]),
      art("Change your email address", [
        ["Before you start", "You need to be signed in on a device you trust. We send a 6-digit code to your new email to confirm it’s yours."],
        ["How to change it", "Open Accounts, tap your name, then Email. Enter the new address and the code we send you."],
        ["What stays the same", "Your kids, wallets and spending limits don’t change. Only the address we use to reach you does."],
      ]),
      art("Reset your password", [
        ["When to use this", "Use it if you forgot your password or think someone else knows it."],
        ["How it works", "Choose Forgot password on the sign-in screen. We email you a code, then you pick a new password."],
        ["After the reset", "You’ll be signed out of other devices. Sign in again with the new password."],
      ]),
      art("Update your profile", [
        ["What your kids see", "Your kids see your name and your picture in their app, so they know who approved a purchase."],
        ["How to edit", "Open Accounts and tap your name. Change the name or tap the pencil on your picture to pick a new one."],
        ["When it changes", "New details show up in your kids’ app the next time they open it."],
      ]),
      art("Delete your account", [
        ["Before you delete", "Deleting your account also removes your kids’ accounts and wallets. Spend or move any balance first."],
        ["How to delete", "Open Accounts, then Security & Privacy, then Delete account. We ask for your password to confirm."],
        ["What we keep", "We keep payment records for the period the law requires. Everything else is removed within 30 days."],
      ]),
    ],
  },
  {
    slug: "kids-and-wallets",
    title: "Kids & Wallets",
    articles: [
      art("Add a kid", [
        ["Who can be added", "Kids from 6 to 18 years old. Add a first name, last name and date of birth."],
        ["How to add one", "Open Accounts, then Manage kids, then Add kid. You can add more than one in a row."],
        ["What your kid does next", "Your kid signs in with the username you pick and a 6-digit PIN."],
      ]),
      art("Set a daily spend limit", [
        ["What a limit does", "A daily limit caps how much your kid can spend in one day. Anything above it needs your approval."],
        ["How to set it", "Open your kid’s wallet, tap Limits and enter an amount in dollars."],
        ["Changing it later", "You can raise or lower the limit at any time. The new amount applies from the next purchase."],
      ]),
      art("Approve or decline a purchase", [
        ["How requests reach you", "When your kid scans an invoice, you get a notification with the items and the total."],
        ["What you see", "The products, quantities, total and a short reason explaining why it needs your approval."],
        ["Your answer", "Tap Approve to let it go through, or Decline to stop it. Your kid sees the result right away."],
      ]),
      art("Reset a kid’s PIN", [
        ["If your kid forgets", "You can set a new PIN without knowing the old one."],
        ["How to reset", "Open your kid’s profile, tap Security, then Reset PIN. Pick 6 new digits."],
        ["Tell your kid", "Your kid uses the new PIN the next time they sign in."],
      ]),
    ],
  },
  {
    slug: "payments-and-transactions",
    title: "Payments & Transactions",
    articles: [
      art("How payments work", [
        ["Paying with PayPal", "Pudding uses PayPal to move money. You add funds from your PayPal account."],
        ["When money moves", "Money leaves your account only after you approve a purchase."],
        ["Where to see it", "Every payment appears in your transaction list with the date, amount and your kid’s name."],
      ]),
      art("A payment is pending", [
        ["What pending means", "The purchase is waiting for your approval or for PayPal to confirm it."],
        ["How long it takes", "Most payments clear within a few minutes. Some can take up to one working day."],
        ["If it stays pending", "Check your PayPal account. If it’s still stuck after a day, contact us from Support."],
      ]),
      art("Report a wrong charge", [
        ["What to check first", "Open the transaction and look at the items. A scanned invoice lists every product."],
        ["How to report", "Tap the transaction, then Report a problem. Tell us what looks wrong."],
        ["What happens next", "We look into it within 2 to 3 working days and update you by email."],
      ]),
      art("Download your statements", [
        ["What’s included", "Each statement lists every payment for the month in dollars and cents."],
        ["How to get one", "Open Accounts, then Payments, then Statements. Pick a month."],
        ["Format", "Statements download as a PDF you can save or print."],
      ]),
    ],
  },
  {
    slug: "subscriptions-and-billing",
    title: "Subscriptions & Billing",
    articles: [
      art("Your plan", [
        ["What’s on your plan", "Your plan decides how many kids you can add and which features you get."],
        ["See your plan", "Open Accounts, then Preferences, then Plan."],
        ["Sibling discount", "Adding more than one child lowers the price per kid on your plan."],
      ]),
      art("Change or cancel your plan", [
        ["Changing", "Pick a new plan and the change starts on your next billing date."],
        ["Cancelling", "Choose Cancel plan. You keep your features until the end of the period you paid for."],
        ["Your kids’ wallets", "Wallets stay open after you cancel, but spending is paused until you pick a plan again."],
      ]),
      art("Update your payment method", [
        ["Why update it", "Do this if your card expired or you want to use a different PayPal account."],
        ["How to update", "Open Accounts, then Billing, then Payment method."],
        ["Next charge", "The new method is used from your next billing date."],
      ]),
      art("Billing dates and receipts", [
        ["When you’re charged", "You’re charged on the same day each month, starting the day you joined."],
        ["Receipts", "A receipt is emailed after every charge. You can also find it under Billing."],
        ["Failed charges", "If a charge fails we try again after 3 days and email you each time."],
      ]),
    ],
  },
  {
    slug: "safety-and-security",
    title: "Safety & Security",
    articles: [
      art("How we keep kids safe", [
        ["You’re in control", "Your kid can’t spend above the daily limit without your approval."],
        ["Private by default", "We only ask for the details we need. Your kid’s name and date of birth are not shared with shops."],
        ["Always visible", "Every purchase and approval is recorded in your history."],
      ]),
      art("Set up extra security", [
        ["Security questions", "Pick questions only you can answer. We ask them if you ever need to recover your account."],
        ["Notifications", "Turn on notifications so you see approval requests as soon as they arrive."],
        ["Where to find it", "Open Accounts, then Security & Privacy."],
      ]),
      art("Spot a suspicious message", [
        ["What we never ask for", "We never ask for your password or full PIN by email, text or chat."],
        ["What to do", "Don’t tap links in a message you didn’t expect. Open the Pudding app yourself instead."],
        ["Tell us", "Forward the message through Support and we’ll look into it."],
      ]),
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    articles: [
      art("The code didn’t arrive", [
        ["Check the basics", "Look in your spam folder and make sure the email address is right."],
        ["Ask for a new code", "Wait 30 seconds, then tap Resend. Only the newest code works."],
        ["Still nothing", "Try a different network, or contact us from Support."],
      ]),
      art("The app is slow or stuck", [
        ["First steps", "Close the app and open it again. Check that you’re online."],
        ["Update", "Make sure you have the latest version of your browser or app."],
        ["If it keeps happening", "Tell us which screen it happens on and what you tapped."],
      ]),
      art("A scan won’t work", [
        ["Good conditions", "Hold the phone steady in good light. Keep the whole invoice in view."],
        ["Camera access", "Allow camera access when your phone asks. You can turn it on later in your phone settings."],
        ["Try again", "If the scan still fails, ask a parent to add the purchase by hand."],
      ]),
    ],
  },
];

export function findTopic(slug: string) {
  return TOPICS.find((t) => t.slug === slug);
}

export function findArticle(topic: string, slug: string) {
  const t = findTopic(topic);
  return t ? { topic: t, article: t.articles.find((a) => a.slug === slug) } : null;
}
