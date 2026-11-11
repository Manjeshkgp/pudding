export interface CoParentPermissions {
  canManageBudget?: boolean;
  canManageAllowances?: boolean;
  canApproveChores?: boolean;
  canApproveSpending?: boolean;
  canManageChildren?: boolean;
  canManageSpendingRules?: boolean;
}

export const DEFAULT_LIMITED_COPARENT_PERMISSIONS: Required<CoParentPermissions> =
  {
    canManageBudget: false,
    canManageAllowances: true,
    canApproveChores: true,
    canApproveSpending: true,
    canManageChildren: false,
    canManageSpendingRules: false,
  };

export const FULL_COPARENT_PERMISSIONS: Required<CoParentPermissions> = {
  canManageBudget: true,
  canManageAllowances: true,
  canApproveChores: true,
  canApproveSpending: true,
  canManageChildren: true,
  canManageSpendingRules: true,
};

export function hasParentPermission(
  user:
    | { role: string; permissionLevel?: string; permissions?: unknown }
    | undefined,
  permission: keyof CoParentPermissions,
) {
  if (!user || !["PRIMARY_PARENT", "CO_PARENT"].includes(user.role))
    return false;
  if (user.role === "PRIMARY_PARENT" || user.permissionLevel === "EQUAL")
    return true;
  const custom =
    user.permissions && typeof user.permissions === "object"
      ? (user.permissions as CoParentPermissions)
      : {};
  return (
    (custom[permission] ?? DEFAULT_LIMITED_COPARENT_PERMISSIONS[permission]) ===
    true
  );
}
