/**
 * Manual payment methods (Alipay, PayMe, bank transfer). The customer pays
 * outside the site, then tells us their reference; an admin checks the
 * account and confirms the claim, and only then is the order marked paid.
 *
 * BEFORE LAUNCH: replace every value that starts with "REPLACE" with your
 * real payee details, and put your QR images in `public/payments/` (or set
 * `qrImage: null`). The admin Settings page lists anything still unset.
 * Nothing here is secret: all of it is shown to paying customers.
 */

export const MANUAL_PAYMENT_METHODS = ["alipay", "payme", "paypal", "bank_transfer", "usdt", "usdc", "bitcoin"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export interface PayeeDetail {
  label: string;
  value: string;
  /** Show a copy button next to the value. */
  copy?: boolean;
}

export interface ManualPaymentConfig {
  id: ManualPaymentMethod;
  label: string;
  /** One line under the method name. */
  short: string;
  /** Optional warning or hint shown above the payee details (e.g. "use the right network"). */
  note?: string;
  enabled: boolean;
  payee: PayeeDetail[];
  /** Optional pay link (e.g. a PayMe business link). Opened in a new tab. */
  link?: string;
  /** Path under /public. A framed placeholder is shown if the file is missing. */
  qrImage: string | null;
  /** Step-by-step instructions. The amount and reference code are shown separately. */
  steps: string[];
  /** What we ask the customer for after paying, so the admin can match it. */
  referenceLabel: string;
  referencePlaceholder: string;
}

export const manualPayments: Record<ManualPaymentMethod, ManualPaymentConfig> = {
  alipay: {
    id: "alipay",
    label: "Alipay",
    short: "Scan the QR code in AlipayHK or Alipay.",
    enabled: false, // credits are bought in USD / crypto only; set true to offer the HKD methods again
    payee: [
      { label: "Account", value: "REPLACE: Alipay account (phone or email)", copy: true },
      { label: "Account name", value: "REPLACE: account holder name" },
    ],
    qrImage: "/payments/alipay-qr.png",
    steps: [
      "Open AlipayHK (or Alipay) and scan the QR code, or transfer to the account shown.",
      "Enter the exact amount shown here.",
      "Put the reference code in the payment note.",
      "Come back here and enter your Alipay transaction number.",
    ],
    referenceLabel: "Alipay transaction number",
    referencePlaceholder: "e.g. 2026092722001…",
  },
  payme: {
    id: "payme",
    label: "PayMe",
    short: "Pay with PayMe from HSBC.",
    enabled: false,
    payee: [
      { label: "PayMe name", value: "REPLACE: PayMe display name" },
      { label: "PayMe link", value: "REPLACE: PayMe link", copy: true },
    ],
    link: "REPLACE: PayMe link",
    qrImage: "/payments/payme-qr.png",
    steps: [
      "Open PayMe and scan the PayMe code, or use the payment link.",
      "Enter the exact amount shown here.",
      "Put the reference code in the message.",
      "Come back here and enter your PayMe name or transaction ID.",
    ],
    referenceLabel: "Your PayMe name or transaction ID",
    referencePlaceholder: "e.g. Chan Tai Man",
  },
  paypal: {
    id: "paypal",
    label: "PayPal",
    short: "Scan the QR code in the PayPal app and send the amount.",
    enabled: true, // hand-confirmed: the customer scans, pays, then enters the transaction ID
    payee: [{ label: "PayPal name", value: "LY L" }],
    qrImage: "/payments/paypal-qr.png",
    note: "Send the exact USD amount shown here.",
    steps: [
      "Open the PayPal app and scan the QR code.",
      "Send the exact amount in US dollars (USD).",
      "Put the reference code in the payment note.",
      "Come back here and enter your PayPal transaction ID.",
    ],
    referenceLabel: "PayPal transaction ID",
    referencePlaceholder: "e.g. 5TY05013RG002845M",
  },
  bank_transfer: {
    id: "bank_transfer",
    label: "Bank transfer",
    short: "FPS or a local bank transfer in HKD.",
    enabled: false,
    payee: [
      { label: "Bank", value: "REPLACE: bank name" },
      { label: "Account name", value: "REPLACE: account holder name" },
      { label: "Account number", value: "REPLACE: account number", copy: true },
      { label: "FPS ID", value: "REPLACE: FPS ID (optional, or remove this line)", copy: true },
    ],
    qrImage: null,
    steps: [
      "Transfer the exact amount in HKD by FPS or online banking.",
      "Put the reference code in the transfer remarks.",
      "Keep your receipt until the order is confirmed.",
      "Come back here and enter the name on your bank account or the transfer reference.",
    ],
    referenceLabel: "Name on your account or transfer reference",
    referencePlaceholder: "e.g. CHAN TAI MAN / FPS ref FRN2026…",
  },

  usdt: {
    id: "usdt",
    label: "USDT",
    short: "Tether stablecoin, sent on the network shown.",
    enabled: false, // crypto only: payment is by NOWPayments (see lib/payments/nowpayments)
    payee: [
      { label: "Network", value: "REPLACE: network (e.g. TRON TRC-20)" },
      { label: "Wallet address", value: "REPLACE: USDT wallet address", copy: true },
    ],
    qrImage: "/payments/usdt-qr.png",
    note: "Send only USDT on the network shown. Coins sent on a different network are lost and cannot be recovered. Network fees are paid by you.",
    steps: [
      "Open your wallet or exchange and choose USDT on the network shown here.",
      "Send the amount shown (1 USDT is worth about US$1, so send the same number of USDT as the US$ amount).",
      "Copy the transaction ID (TXID) when the transfer is sent.",
      "Come back here and paste the TXID.",
    ],
    referenceLabel: "Transaction ID (TXID)",
    referencePlaceholder: "e.g. 0x4f1c… or a 64-character TRON hash",
  },
  usdc: {
    id: "usdc",
    label: "USDC",
    short: "Circle stablecoin, sent on the network shown.",
    enabled: false, // crypto only: payment is by NOWPayments (see lib/payments/nowpayments)
    payee: [
      { label: "Network", value: "REPLACE: network (e.g. Ethereum ERC-20, Base, Solana)" },
      { label: "Wallet address", value: "REPLACE: USDC wallet address", copy: true },
    ],
    qrImage: "/payments/usdc-qr.png",
    note: "Send only USDC on the network shown. Coins sent on a different network are lost and cannot be recovered. Network fees are paid by you.",
    steps: [
      "Open your wallet or exchange and choose USDC on the network shown here.",
      "Send the amount shown (1 USDC is worth about US$1, so send the same number of USDC as the US$ amount).",
      "Copy the transaction ID (TXID) when the transfer is sent.",
      "Come back here and paste the TXID.",
    ],
    referenceLabel: "Transaction ID (TXID)",
    referencePlaceholder: "e.g. 0x9a2e… or a Solana signature",
  },
  bitcoin: {
    id: "bitcoin",
    label: "Bitcoin",
    short: "Send BTC on the Bitcoin network.",
    enabled: false, // crypto only: payment is by NOWPayments (see lib/payments/nowpayments)
    payee: [
      { label: "Network", value: "Bitcoin (on-chain)" },
      { label: "Wallet address", value: "REPLACE: Bitcoin wallet address", copy: true },
    ],
    qrImage: "/payments/bitcoin-qr.png",
    note: "Send only Bitcoin (BTC) to this address. The BTC amount depends on today's exchange rate; send the equivalent of the US$ amount. Network fees are paid by you.",
    steps: [
      "Open your Bitcoin wallet or exchange and send BTC to the address shown here.",
      "Send the BTC equivalent of the US$ amount at today's rate.",
      "Copy the transaction ID (TXID) when the transfer is sent.",
      "Come back here and paste the TXID.",
    ],
    referenceLabel: "Transaction ID (TXID)",
    referencePlaceholder: "e.g. a 64-character hex transaction hash",
  },
};

export const manualPaymentList: ManualPaymentConfig[] = MANUAL_PAYMENT_METHODS.map((m) => manualPayments[m]);

export function enabledManualPayments(): ManualPaymentConfig[] {
  return manualPaymentList.filter((m) => m.enabled);
}

export function isManualPaymentMethod(v: unknown): v is ManualPaymentMethod {
  return typeof v === "string" && (MANUAL_PAYMENT_METHODS as readonly string[]).includes(v);
}

/** True while a payee value is still the shipped placeholder. */
export function isPlaceholder(value: string | undefined | null): boolean {
  return !value || value.trim().toUpperCase().startsWith("REPLACE");
}

/** True once every payee detail (and the pay link, if any) has a real value. */
export function payeeReady(m: ManualPaymentConfig): boolean {
  return m.payee.every((p) => !isPlaceholder(p.value)) && (m.link === undefined || !isPlaceholder(m.link));
}

/**
 * Whether customers may report a payment by this method. On a deployed site a
 * method still showing placeholder payee details can't take claims (nobody
 * could have paid it); in development it can, so the flow can be tested.
 */
export function acceptsClaims(m: ManualPaymentConfig): boolean {
  return m.enabled && (payeeReady(m) || process.env.NODE_ENV !== "production");
}

/** Methods where the customer may pick any amount (min US$5): the crypto ones. */
export const CRYPTO_METHODS = ["usdt", "usdc", "bitcoin"] as const;

export function isCryptoMethod(v: string): boolean {
  return (CRYPTO_METHODS as readonly string[]).includes(v);
}

/** Code the customer puts in the transfer note, so the admin can match it. */
export const referencePrefix = "ZP";

/** Reference for a credit top-up, taken from the account id so it is stable per customer. */
export function topupReference(userId: string): string {
  return `${referencePrefix}-${userId.slice(0, 8).toUpperCase()}`;
}

export function paymentReference(orderId: string): string {
  return `${referencePrefix}-${orderId.slice(0, 8).toUpperCase()}`;
}

/** Human label for a `payments.provider` / `payment_claims.method` value. */
export function paymentMethodLabel(provider: string): string {
  if (isManualPaymentMethod(provider)) return manualPayments[provider].label;
  if (provider === "stripe") return "Card / Google Pay (Stripe)";
  if (provider === "credits") return "Credits";
  if (provider === "dev") return "Simulated (dev)";
  return provider;
}

/** Customer reference limits; must match the payment_claims check constraint. */
export const claimReference = { min: 1, max: 200 } as const;
