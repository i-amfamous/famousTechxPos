/**
 * Loads Paystack Inline on demand. The public key and the reference come from our own server;
 * the secret key never leaves the server. Inline collects the customer's contact and MoMo number.
 */
import { AppError } from "./errors";

const SCRIPT_URL = "https://js.paystack.co/v1/inline.js";

export interface PaystackInlineResponse {
  reference: string;
  status?: string;
  transaction?: string;
}

export interface PaystackInlineOptions {
  key: string;
  email: string;
  amount: number;
  currency: string;
  ref: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
  callback: (response: PaystackInlineResponse) => void;
  onClose: () => void;
}

interface PaystackPopup { setup: (options: PaystackInlineOptions) => { openIframe: () => void } }

declare global {
  interface Window { PaystackPop?: PaystackPopup }
}

let loader: Promise<void> | null = null;

/** Adds the Inline script once, even if two dialogs are opened in quick succession. */
export function loadPaystackInline(): Promise<void> {
  if (window.PaystackPop) return Promise.resolve();
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => window.PaystackPop ? resolve() : reject(new AppError("Paystack didn't load. Please try again.", "paystack"));
      script.onerror = () => {
        loader = null;
        reject(new AppError("Can't reach Paystack. Check the internet connection and try again.", "network"));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}

/** Opens the hosted dialog. Throws a friendly error if the script or popup is unavailable. */
export async function openPaystackDialog(options: PaystackInlineOptions): Promise<void> {
  await loadPaystackInline();
  if (!window.PaystackPop) throw new AppError("Paystack didn't load. Please try again.", "paystack");
  window.PaystackPop.setup(options).openIframe();
}
