// Keep route content in normal flow. Moving the whole viewport during every
// navigation shifts touch targets and forces fixed headers/bars into a new layer.
export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
