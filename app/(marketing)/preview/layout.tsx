import type { Metadata } from "next";

// Design previews: reachable by link, kept out of search results.
export const metadata: Metadata = {
  title: "Design preview",
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: LayoutProps<"/preview">) {
  return children;
}
