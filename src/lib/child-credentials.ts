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

export function parseChildBirthDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function calculateChildAge(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const birthdayHasNotOccurredThisYear =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      now.getUTCDate() < dateOfBirth.getUTCDate());
  if (birthdayHasNotOccurredThisYear) age -= 1;
  return age;
}

export function childUsernameBase(name: string, dateOfBirth: Date): string {
  const firstName = name.trim().split(/\s+/)[0] || "kid";
  const letters = firstName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const prefix = (letters.match(/^[a-z]/) ? letters : `kid${letters}`).slice(0, 5) || "kid";
  const year = String(dateOfBirth.getUTCFullYear()).slice(-2);
  const month = String(dateOfBirth.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateOfBirth.getUTCDate()).padStart(2, "0");
  return `${prefix}${year}${month}${day}`;
}

export async function findAvailableChildUsername(
  name: string,
  dateOfBirth: Date,
  isTaken: (username: string) => Promise<boolean>
): Promise<string> {
  const base = childUsernameBase(name, dateOfBirth);
  for (let suffix = 1; suffix <= 9999; suffix += 1) {
    const tail = suffix === 1 ? "" : `_${suffix}`;
    const candidate = `${base.slice(0, 24 - tail.length)}${tail}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error("Unable to create a unique child username");
}
