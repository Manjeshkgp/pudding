import { z } from "zod";

export const coParentNameFields = {
  name: z.string().trim().min(2).max(100).optional(),
  firstName: z.string().trim().min(1).max(49).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
};

export function validateNameParts(
  input: { firstName?: string; lastName?: string },
  context: z.RefinementCtx,
) {
  if (Boolean(input.firstName) !== Boolean(input.lastName))
    context.addIssue({
      code: "custom",
      message: "Enter both a first and last name.",
    });
}
