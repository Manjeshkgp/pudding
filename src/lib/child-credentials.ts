import { z } from "zod";

export const childUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,23}$/,
    "Username must be 3–24 characters, start with a letter, and use only lowercase letters, numbers, and underscores"
  );

export const childPinSchema = z
  .string()
  .regex(/^[0-9]{6}$/, "PIN must be exactly 6 digits");
