import { BillingView } from "@/components/billing/billing-view";
import { TopUpPanel } from "@/components/billing/top-up-panel";
import { demoBalance, demoTopups, demoTransactions } from "../demo";

/**
 * Billing & Credits for a made-up account. The top-up form is the real one, unchanged (its buttons
 * work only for a signed-in account, exactly as on the real page); its reference here is a placeholder.
 */
export default function AppPreviewBilling() {
  return (
    <BillingView
      balance={demoBalance}
      topups={demoTopups}
      txs={demoTransactions}
      cryptoByTopup={new Map()}
      topUp={<TopUpPanel stripe={false} reference="ZP-PREVIEW" cryptoCoins={[]} />}
    />
  );
}
