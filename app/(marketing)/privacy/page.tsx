import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { brand, retention, uploads } from "@/config/app";

export const metadata: Metadata = { title: "Privacy" };

// Foundation text. Have it reviewed against the PDPO (Cap. 486) before launch.
export default function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy policy" body="How we handle your account, your writing and your documents." />
      <Container className="prose-doc max-w-3xl">
        <p><strong>Operator:</strong> {brand.operator}, {brand.jurisdiction}. Contact: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> email address, optional display name, sign-in records.</li>
          <li><strong>Free scans:</strong> the signal scores and risk level for each scan. {retention.storeScanText ? "The scanned text is also stored." : "The text you paste is analysed in memory and not stored."}</li>
          <li><strong>Orders:</strong> the document or text you submit, its title, any notes, the service chosen, and the result we deliver.</li>
          <li><strong>Payments:</strong> handled by Stripe. We store the payment reference, amount and status, never your card details.</li>
        </ul>
        <h2>How documents are handled</h2>
        <ul>
          <li>Files are stored in private storage. There are no public links to them.</li>
          <li>Access is limited to you and authorised staff, enforced by database access rules, and opened through signed links that expire after {uploads.signedUrlTtl} seconds.</li>
          <li>For screening, a staff member downloads your document and runs the screening on an external service (Turnitin). Screenings are configured not to store your paper in any repository.</li>
          <li>We do not put document contents in analytics or logs.</li>
          <li>Every status change and file access is recorded in an audit log.</li>
        </ul>
        <h2>Retention</h2>
        <ul>
          <li>Source documents and refinement text are deleted {retention.sourceDocumentDays} days after the order is completed or cancelled, by a scheduled deletion job.</li>
          <li>Screening reports are deleted {retention.reportDays} days after completion. Result values (for example, a similarity percentage) remain in your order history until you ask us to delete them.</li>
          <li>You can delete your scan history from Settings, or ask us to delete your account and all associated data at any time.</li>
        </ul>
        <h2>Third parties</h2>
        <ul>
          <li><strong>Supabase:</strong> authentication, database and file storage.</li>
          <li><strong>Stripe:</strong> payment processing.</li>
          <li><strong>Turnitin:</strong> used by our staff to perform screening you order. Turnitin is a third-party service and is not affiliated with us.</li>
          <li><strong>Hosting provider:</strong> serves the website.</li>
        </ul>
        <h2>Your rights</h2>
        <p>You can request access to, correction of, or deletion of your personal data by emailing <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
      </Container>
    </>
  );
}
