import type { Metadata } from "next";

// The page itself is a client component, which can't set its own title,
// so this small layout does it.
export const metadata: Metadata = {
  title: "Opener Experiment · Outbound Lab",
  description: "Reply rates for opener style A vs B, with a significance test, plus how leads are routed to AEs.",
};

export default function ExperimentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
