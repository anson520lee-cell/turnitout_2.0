import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/ui/section";
import { brand } from "@/config/app";
import { CREDITS_PER_USD } from "@/config/pricing";

export const metadata: Metadata = {
  title: "Refunds",
  description: "How credits, top-ups and refunds work at 0%, including crypto and PayPal payments.",
  alternates: { canonical: "/refunds" },
};

// Draft policy written for the owner to review. Have it checked before launch.
export default function RefundsPage() {
  return (
    <>
      <PageHeader eyebrow="Refunds" title="Credits, payments and refunds" />
      <Container className="prose-doc max-w-3xl">
        <h2>1. Credits</h2>
        <p>
          Services are paid for with credits. You buy credits in US dollars ({CREDITS_PER_USD} credits = US$1) by card, PayPal or
          crypto. Credits do not expire and are tied to your account.
        </p>

        <h2>2. If we can&rsquo;t deliver</h2>
        <p>
          If we cannot complete a paid report or Writing Refinement order (for example, the document can&rsquo;t be processed),
          the credits for that order go back to your balance in full. You can also ask for them as a refund of the top-up (see 4).
        </p>

        <h2>3. Orders that were delivered</h2>
        <p>
          A delivered report reflects the result returned at the time of screening and is not refunded because a later result,
          or another institution&rsquo;s result, is different. A new screening after you revise your text is a new order. If a
          delivered order is clearly wrong because of our mistake (wrong document, missing pages), tell us and we will redo it or
          return the credits.
        </p>

        <h2>4. Refunding unused credits</h2>
        <ul>
          <li>Within 14 days of a top-up, credits from it that you have not spent can be refunded.</li>
          <li>Card and PayPal refunds go back to the original payment method.</li>
          <li>
            Crypto refunds are sent in the same coin to an address you give us, on the same network, less the network fee. The
            amount is the US dollar value you paid, not the coin&rsquo;s later price.
          </li>
          <li>Credits added by a promotion or referral are not refundable as money.</li>
        </ul>

        <h2>5. Payment problems</h2>
        <ul>
          <li>
            <strong>Wrong network or coin.</strong> Coins sent on a network or token we don&rsquo;t list can&rsquo;t be credited
            and usually can&rsquo;t be recovered. Always use the network shown on the payment page.
          </li>
          <li>
            <strong>Wrong amount.</strong> If you sent less than the amount shown, we credit what arrived or ask you to send the
            difference; if you sent more, we credit the extra.
          </li>
          <li>
            <strong>Payment not showing.</strong> Stablecoin payments are usually confirmed automatically within minutes; PayPal
            and Bitcoin are checked by hand. If nothing has happened after a working day, contact us with your reference.
          </li>
        </ul>

        <h2>6. How to ask</h2>
        <p>
          Email <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> from the address on your account, with the top-up
          or order reference (shown on your <Link href="/billing">Billing &amp; Credits</Link> page). We reply within two working
          days.
        </p>
      </Container>
    </>
  );
}
