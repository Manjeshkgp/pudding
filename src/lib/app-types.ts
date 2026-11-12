export type Wallet = {
  spendBalance: string;
  saveBalance: string;

  purchaseReservedBalance?: string;
  isFrozen?: boolean;
};
export type Kid = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  username: string;
  age: number;
  avatar: string;
  pinSet?: boolean;
  isFrozen?: boolean;
  wallet: Wallet | null;
};
export type Me = {
  subjectType: "USER" | "CHILD";
  user?: {
    id: string;
    name: string;
    email: string;
    avatar: string;
    role: string;
    permissionLevel?: string;
    permissions?: import("@/lib/co-parent-permissions").CoParentPermissions;
    pinSet: boolean;
    paypalIsVerified: boolean;
    paypalVaultConnected: boolean;
  };
  child?: Kid;
  family: { id: string; name: string; currency: string; children?: Kid[] };
};
export type InvoiceItem = {
  name: string;
  category: string;
  quantity: number;
  unitPrice: string;
};
export type Purchase = {
  id: string;
  childId: string;
  child?: { name: string; avatar?: string };
  amount: string;
  currency: string;
  items: InvoiceItem[];
  status: string;
  decisionReason: string | null;
  aiDecision: string | null;
  reviewedByUserId?: string | null;
  paypalOrderId?: string | null;
  createdAt: string;
  paidAt?: string | null;
};
export type PurchaseReviewDetails = {
  canApprove: boolean;
  pinSet: boolean;
  availableSpend: string;
};
export type Chore = {
  id: string;
  title: string;
  description?: string;
  rewardAmount: string;
  recurrence: string;
  dueDate: string | null;
  latestSubmission?: { status: string } | null;
  submissions?: { id: string; status: string; child?: { name: string } }[];
};
export type ChildHome = {
  profile: {
    id: string;
    name: string;
    avatar: string;
    xp: number;
    level: number;
    currency: string;
  };
  wallet: Wallet | null;
  chores: Chore[];
  savingsGoals: {
    id: string;
    name: string;
    currentAmount: string;
    targetAmount: string;
  }[];
};
export function money(
  value: string | number | null | undefined,
  currency = "USD",
) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(value || 0),
  );
}
export const readable = (text: string) =>
  text.toLowerCase().replaceAll("_", " ");
