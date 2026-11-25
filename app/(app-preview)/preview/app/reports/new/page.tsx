import { ScreeningRequest } from "@/components/orders/screening-request";

export default async function ReportPreview({ searchParams }: PageProps<"/preview/app/reports/new">) {
  const { state } = await searchParams;
  return <ScreeningRequest status={{ mode: "account", remaining: state === "used" ? 0 : 1, unlimited: false }} preview />;
}
