// Sample kids shared by the crew list and the edit screen.
export const KIDS = [
  { first: "Alex", last: "Silvestri", dob: new Date(2013, 10, 1), avatar: 0, label: "first" },
  { first: "Elena", last: "Silvestri", dob: new Date(2013, 10, 1), avatar: 1, label: "second" },
];

export function ageText(dob: Date) {
  return "22 years";
}
