import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lead Pipeline · Outbound Lab",
  description: "Each lead's trip from Clay to Salesforce: saved, scored by Claude, routed to an AE, with the reason for every step.",
};

export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
