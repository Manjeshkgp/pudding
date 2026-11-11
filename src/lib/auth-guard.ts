import { NextRequest } from "next/server";
import { ApiError } from "./api-response";
import { getSessionFromRequest, SessionPayload } from "./jwt";
import prisma from "./prisma";

export {
  DEFAULT_LIMITED_COPARENT_PERMISSIONS,
  FULL_COPARENT_PERMISSIONS,
} from "./co-parent-permissions";
import {
  CoParentPermissions,
  DEFAULT_LIMITED_COPARENT_PERMISSIONS,
} from "./co-parent-permissions";
export type { CoParentPermissions } from "./co-parent-permissions";

/**
 * Requires any valid authenticated session (Parent, Co-Parent, Child, or Admin).
 * Verifies account/family freeze status in real time.
 */
export async function requireAuth(req: NextRequest): Promise<SessionPayload> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  }

  if (session.subjectType === "USER") {
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      include: { family: true },
    });

    if (!user) {
      throw new ApiError(401, "User account no longer exists", "UNAUTHORIZED");
    }
    if (user.isFrozen) {
      throw new ApiError(
        403,
        "Your account has been frozen. Please contact support.",
        "ACCOUNT_FROZEN",
      );
    }
    if (user.family?.isFrozen && user.role !== "ADMIN") {
      throw new ApiError(
        403,
        "Your family account is currently frozen.",
        "FAMILY_FROZEN",
      );
    }
  } else if (session.subjectType === "CHILD") {
    const child = await prisma.child.findUnique({
      where: { id: session.sub },
      include: { family: true },
    });

    if (!child) {
      throw new ApiError(401, "Child profile no longer exists", "UNAUTHORIZED");
    }
    if (child.isFrozen) {
      throw new ApiError(
        403,
        "Your account is paused by your parent.",
        "CHILD_FROZEN",
      );
    }
    if (child.family.isFrozen) {
      throw new ApiError(
        403,
        "Family account is currently paused.",
        "FAMILY_FROZEN",
      );
    }
  }

  return session;
}

/**
 * Requires a Parent or Co-Parent session (strictly blocks Children per NFR-4).
 */
export async function requireParent(
  req: NextRequest,
  requiredPermission?: keyof CoParentPermissions,
) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  }

  if (
    session.subjectType !== "USER" ||
    (session.role !== "PRIMARY_PARENT" && session.role !== "CO_PARENT")
  ) {
    throw new ApiError(
      403,
      "Parent access required for this action",
      "FORBIDDEN_PARENT_ONLY",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { family: true },
  });

  if (!user || !user.familyId || !user.family) {
    throw new ApiError(401, "Parent account not found", "UNAUTHORIZED");
  }

  if (user.isFrozen || user.family.isFrozen) {
    throw new ApiError(
      403,
      "Account or family wallet is currently frozen",
      "ACCOUNT_FROZEN",
    );
  }

  // Check co-parent granular permission if CO_PARENT has LIMITED permissionLevel
  if (
    user.role === "CO_PARENT" &&
    user.permissionLevel === "LIMITED" &&
    requiredPermission
  ) {
    const customPerms = (user.permissions ??
      DEFAULT_LIMITED_COPARENT_PERMISSIONS) as CoParentPermissions;
    const isAllowed =
      customPerms[requiredPermission] ??
      DEFAULT_LIMITED_COPARENT_PERMISSIONS[requiredPermission];

    if (!isAllowed) {
      throw new ApiError(
        403,
        `Co-parent does not have permission: ${requiredPermission}`,
        "INSUFFICIENT_COPARENT_PERMISSIONS",
      );
    }
  }

  return { session, user, family: user.family };
}

/**
 * Requires specifically the PRIMARY_PARENT of the family.
 */
export async function requirePrimaryParent(req: NextRequest) {
  const { session, user, family } = await requireParent(req);
  if (user.role !== "PRIMARY_PARENT") {
    throw new ApiError(
      403,
      "Only the primary parent can perform this action",
      "PRIMARY_PARENT_REQUIRED",
    );
  }
  return { session, user, family };
}

/**
 * Requires an authenticated Child session (or a Parent belonging to the same family).
 * Enforces FR-11.4: A child can never view another child's private data.
 */
export async function requireChildOrFamilyParent(
  req: NextRequest,
  targetChildId: string,
) {
  const session = await requireAuth(req);

  if (session.subjectType === "CHILD") {
    if (session.sub !== targetChildId) {
      throw new ApiError(
        403,
        "Children can only access their own wallet and profile",
        "FORBIDDEN_CROSS_CHILD_ACCESS",
      );
    }
    const child = await prisma.child.findUnique({
      where: { id: targetChildId },
      include: { wallet: true, family: true },
    });
    if (!child) {
      throw new ApiError(404, "Child not found", "CHILD_NOT_FOUND");
    }
    return { session, child, isParent: false };
  }

  if (session.subjectType === "USER") {
    const child = await prisma.child.findUnique({
      where: { id: targetChildId },
      include: { wallet: true, family: true },
    });
    if (!child) {
      throw new ApiError(404, "Child not found", "CHILD_NOT_FOUND");
    }
    if (session.role !== "ADMIN" && child.familyId !== session.familyId) {
      throw new ApiError(
        403,
        "You do not have access to this child profile",
        "FORBIDDEN_FAMILY_MISMATCH",
      );
    }
    return { session, child, isParent: true };
  }

  throw new ApiError(403, "Access denied", "FORBIDDEN");
}

/**
 * Requires an internal ADMIN session (FR-14.5).
 */
export async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.subjectType !== "USER" || session.role !== "ADMIN") {
    throw new ApiError(403, "Admin access required", "ADMIN_ONLY");
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.sub },
  });

  if (!admin || admin.role !== "ADMIN" || admin.isFrozen) {
    throw new ApiError(403, "Admin account invalid or frozen", "ADMIN_ONLY");
  }

  return { session, admin };
}
