import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { FaqList } from "@/components/landing/faq-list";
import { Container } from "@/components/ui/section";
import { faq } from "@/config/faq";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <>
      <PageHeader eyebrow="FAQ" title="Frequently asked questions." />
      <Container className="max-w-3xl">
        <FaqList items={faq} />
      </Container>
    </>
  );
}
