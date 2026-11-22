import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionProvider } from "@/components/motion/providers";
import { InteractiveSurfaces } from "@/components/motion/interactive-surfaces";
import { TranslationGuard } from "@/components/motion/translation-guard";
import { brand } from "@/config/app";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./studio.css";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: `${brand.name} · ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: brand.name,
    title: `${brand.name} · ${brand.tagline}`,
    description: brand.description,
    locale: "en_HK",
  },
  twitter: { card: "summary_large_image", title: `${brand.name} · ${brand.tagline}`, description: brand.description },
};

export const viewport: Viewport = {
  themeColor: "#070b12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <div className="studio-sky" aria-hidden />
        <MotionProvider>{children}</MotionProvider>
        <InteractiveSurfaces />
        <TranslationGuard />
        {/* page views and the funnel events from lib/analytics; no cookies, no document text */}
        <Analytics />
      </body>
    </html>
  );
}
