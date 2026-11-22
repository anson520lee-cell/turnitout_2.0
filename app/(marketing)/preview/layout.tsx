import type { Metadata } from "next";
import { Entrance } from "@/components/motion/entrance";
import { SpaceBackground } from "@/components/space/space-background";

// Design previews: reachable by link, kept out of search results.
export const metadata: Metadata = {
  title: "Design preview",
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: LayoutProps<"/preview">) {
  return (
    <>
      <SpaceBackground />
      {children}
      <Entrance />
    </>
  );
}
