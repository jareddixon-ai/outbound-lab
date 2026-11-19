import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Domain Health Checker · Outbound Lab",
  description: "Check whether a domain is ready to send outbound email: MX, SPF, DKIM and DMARC, graded, with plain-English fixes.",
};

export default function DomainCheckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
