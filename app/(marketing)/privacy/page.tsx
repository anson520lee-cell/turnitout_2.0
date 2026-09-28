import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { brand, localModel, retention, uploads } from "@/config/app";
import { localModelEnabled } from "@/lib/local-model/jobs";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How 0% handles your account, your writing and your documents: what we keep, for how long, and who can see it.",
  alternates: { canonical: "/privacy" },
};

// Foundation text. Have it reviewed against the PDPO (Cap. 486) before launch.
export default function PrivacyPage() {
  const model = localModelEnabled();
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy policy" body="How we handle your account, your writing and your documents." />
      <Container className="prose-doc max-w-3xl">
        <p><strong>Operator:</strong> {brand.operator}, {brand.jurisdiction}. Contact: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> email address, optional display name, sign-in records.</li>
          <li><strong>Free scans:</strong> the signal scores and risk level for each scan. {retention.storeScanText ? "The scanned text is also stored." : "The text you paste is analysed in memory and not stored."}</li>
          {model && localModel.scanFeedback && (
            <li><strong>Writing feedback on free scans:</strong> while our writing model is online, the text you scan is also passed to it so it can write you feedback. The text is held only until the model picks it up, and the feedback is deleted once it has been shown to you, both within {localModel.scanFeedbackMinutes} minutes. Neither is saved to your scan history.</li>
          )}
          <li><strong>Orders:</strong> the document or text you submit, its title, any notes, the service chosen, and the result we deliver.</li>
          <li><strong>Payments:</strong> made by Alipay, PayMe, bank transfer or card (Stripe). For Alipay, PayMe and bank transfer we store the payment reference you enter (transaction number or payer name), the amount and the status so we can match your payment. We never receive or store card details.</li>
          <li><strong>Free scans without an account:</strong> to enforce the daily limit we keep a salted one-way hash of your IP address (never the address itself) and a count for the day. Old counts are deleted automatically. Results of scans made without an account are not saved.</li>
        </ul>
        <h2>How documents are handled</h2>
        <ul>
          <li>Files are stored in private storage. There are no public links to them.</li>
          <li>Access is limited to you and authorised staff, enforced by database access rules, and opened through signed links that expire after {uploads.signedUrlTtl} seconds.</li>
          <li>For screening, a staff member downloads your document and runs the screening on an external service (Turnitin). Screenings are configured not to store your paper in any repository.</li>
          {model && localModel.refinementDrafts && (
            <li>For writing refinement, our writing model may prepare a first draft from your text. A staff member reviews and edits every draft, and nothing the model writes reaches you without that review. Drafts are deleted together with your text.</li>
          )}
          {model && (
            <li>Our writing model runs on equipment we operate. Your text is not sent to an outside AI provider.</li>
          )}
          <li>We do not put document contents in analytics or logs.</li>
          <li>Every status change and file access is recorded in an audit log.</li>
        </ul>
        <h2>Retention</h2>
        <ul>
          <li>Source documents and refinement text are deleted {retention.sourceDocumentDays} days after the order is completed or cancelled, by a scheduled deletion job.</li>
          <li>Orders left unpaid for {retention.unpaidOrderDays} days, with no payment reported, are cancelled and their text and files deleted straight away. Cancelling an unpaid order yourself deletes them at once.</li>
          <li>Screening reports are deleted {retention.reportDays} days after completion. Result values (for example, a similarity percentage) remain in your order history until you ask us to delete them.</li>
          <li>You can delete your scan history from Settings, or ask us to delete your account and all associated data at any time.</li>
        </ul>
        <h2>Third parties</h2>
        <ul>
          <li><strong>Supabase:</strong> authentication, database and file storage.</li>
          <li><strong>Stripe:</strong> card payment processing.</li>
          <li><strong>Alipay, PayMe and your bank:</strong> when you pay by those methods, they process the payment under their own terms.</li>
          <li><strong>Turnitin:</strong> used by our staff to perform screening you order. Turnitin is a third-party service and is not affiliated with us.</li>
          <li><strong>Hosting provider:</strong> serves the website.</li>
        </ul>
        <h2>Your rights</h2>
        <p>You can request access to, correction of, or deletion of your personal data by emailing <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
      </Container>
    </>
  );
}
