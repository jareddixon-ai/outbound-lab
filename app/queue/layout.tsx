import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Work Queue · Outbound Lab",
  description: "Who to contact first, and why: fit score plus timely signals plus warm paths.",
};

export default function QueueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
