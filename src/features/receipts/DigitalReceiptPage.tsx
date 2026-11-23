import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { LuPrinter, LuReceipt } from "react-icons/lu";
import { AuthBackdrop, AuthCard } from "@/features/auth/AuthChrome";
import { Receipt } from "@/features/pos/Receipt";
import { Badge, Button, Callout } from "@/components/ui";
import { actions } from "@/services/api";
import { printReceipt } from "@/lib/export";
import type { SaleReceipt, SaleStatus } from "@/types";

const STATUS: Record<SaleStatus, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  completed: { tone: "success", label: "Paid" },
  partially_refunded: { tone: "warning", label: "Part refunded" },
  refunded: { tone: "danger", label: "Refunded" },
  voided: { tone: "neutral", label: "Voided" },
};

/** Public receipt opened from the QR code on a printed receipt. No sign-in needed. */
export function DigitalReceiptPage() {
  const { token = "" } = useParams();
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void actions.digitalReceipt(token)
      .then((r) => { if (alive) setReceipt(r); })
      .catch((e: Error) => { if (alive) setError(e.message || "We couldn't open this receipt."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const state = receipt?.status ? STATUS[receipt.status] : undefined;

  return (
    <AuthBackdrop>
      <div className="flex w-full items-center justify-center p-4 sm:p-6">
        <AuthCard className="max-w-lg">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink-900">Digital receipt</h1>
              <p className="mt-1 text-sm text-ink-500">The same receipt, ready on your phone.</p>
            </div>
            {state && <Badge tone={state.tone}>{state.label}</Badge>}
          </div>

          {loading && (
            <div className="grid place-items-center gap-3 py-16 text-center" role="status">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><LuReceipt className="size-6" /></span>
              <p className="text-sm text-ink-500">Opening your receipt…</p>
            </div>
          )}

          {!loading && error && <Callout tone="danger" title="We couldn't open this receipt">{error}</Callout>}

          {!loading && receipt && (
            <>
              <Receipt data={receipt} className="mx-auto shadow-none ring-0" />
              <Button className="mt-5" block variant="secondary" icon={<LuPrinter className="size-4" />} onClick={() => printReceipt(receipt)}>
                Print receipt
              </Button>
            </>
          )}

          <p className="mt-4 text-center text-xs text-ink-400">Keep this link to see the receipt again later.</p>
        </AuthCard>
      </div>
    </AuthBackdrop>
  );
}
