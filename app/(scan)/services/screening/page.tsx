import type { Metadata } from "next";
import { ScreeningRequest } from "@/components/orders/screening-request";
import { reportFromLabel, reportRateLabel } from "@/config/services";

export const metadata: Metadata = {
  title: "Get a report",
  description: `An AI-writing risk report on your own text: paste it and get an overall level, a map of every paragraph and the sentences to look at again, with a PDF. ${reportFromLabel}, ${reportRateLabel}.`,
  alternates: { canonical: "/services/screening" },
};

export default function Page() {
  return <ScreeningRequest status={{ mode: "guest" }} />;
}
