import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { brand, localModel, retention, uploads } from "@/config/app";
import { retentionSentence } from "@/config/privacy-copy";
import { deepseekEnabled } from "@/lib/deepseek";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How 0% handles your account, your writing and your documents: what we keep, for how long, and who can see it.",
  alternates: { canonical: "/privacy" },
};

// Foundation text. Have it reviewed against the PDPO (Cap. 486) before launch.
export default function PrivacyPage() {
  const model = deepseekEnabled();
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy policy" body="How we handle your account, your writing and your documents." />
      <Container className="prose-doc max-w-3xl">
        <p><strong>Operator:</strong> {brand.operator}, {brand.jurisdiction}. Contact: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> email address, optional display name, sign-in records.</li>
          <li><strong>Earlier free scans:</strong> the free scan has been withdrawn. Scan records made before then hold only scores and a risk level, never the text you pasted. You can delete them from Settings.</li>
          <li><strong>Orders:</strong> the document or text you submit, its title, any notes, the service chosen, and the result we deliver.</li>
          <li><strong>Payments:</strong> you top up credits with crypto (USDT, USDC or BTC) through NOWPayments, or by PayPal or Alipay, and spend credits on orders. We keep your credit balance and transaction history, and for each crypto payment the coin, network, amount, deposit address, transaction status and the payment ID, so we can match your payment. For a PayPal or Alipay top-up we keep the transaction ID you give us so staff can confirm it by hand. We never ask for or store your wallet keys or seed phrase.</li>
          <li><strong>Daily free report:</strong> to stop one person making many accounts we keep a salted one-way hash of your IP address (never the address itself) and a count for the day. Old counts are deleted automatically.</li>
        </ul>
        <h2>How documents are handled</h2>
        <ul>
          <li>Files are stored in private storage. There are no public links to them.</li>
          <li>Access is limited to you and authorised staff, enforced by database access rules, and opened through signed links that expire after {uploads.signedUrlTtl} seconds.</li>
          <li>For a paid report, your text is cut into sections and each section is sent to an outside AI provider (DeepSeek), which writes the review. Your text is not sent to Turnitin or added to any paper repository. The sections&rsquo; answers are kept only until the report is finished.</li>
          {model && localModel.refinementDrafts && (
            <li>For writing refinement, an AI model (DeepSeek, an outside provider) may prepare a first draft from your text, so the text is sent to that provider. A staff member reviews and edits every draft, and nothing the model writes reaches you without that review. Drafts are deleted together with your text.</li>
          )}
          <li>We do not put document contents in analytics or logs.</li>
          <li>We may use text submitted from now on, with personal details removed, to maintain and improve the service.</li>
          <li>Every status change and file access is recorded in an audit log.</li>
        </ul>
        <h2>Retention</h2>
        <ul>
          <li>{retentionSentence.source} A scheduled job does the deleting.</li>
          <li>Orders left unpaid for {retention.unpaidOrderDays} days, with no payment reported, are cancelled and their text and files deleted straight away. Cancelling an unpaid order yourself deletes them at once.</li>
          <li>Reports (including paid AI-writing risk reports, which quote the sentences they mark) are deleted {retention.reportDays} days after completion. The order itself, with its date and price, remains in your history until you ask us to delete it.</li>
          <li>You can delete your scan history from Settings, or ask us to delete your account and all associated data at any time.</li>
        </ul>
        <h2>Third parties</h2>
        <ul>
          <li><strong>Supabase:</strong> authentication, database and file storage.</li>
          <li><strong>NOWPayments:</strong> crypto payment processing (USDT, USDC, BTC).</li>
          {model && <li><strong>DeepSeek:</strong> an AI provider that processes the text for reports and refinement drafts.</li>}
          <li><strong>Hosting provider:</strong> serves the website.</li>
        </ul>
        <h2>Your rights</h2>
        <p>You can request access to, correction of, or deletion of your personal data by emailing <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
      </Container>
    </>
  );
}
