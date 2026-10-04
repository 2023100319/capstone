/**
 * Legacy single-branch label, kept for one reader: the receipt PDF prints
 * "<name> Branch" (`receipt-pdf.ts`). That surface is part of the hidden POS —
 * the Transaction links are commented out for every role in the staff layout —
 * so nothing customer-facing says this any more. Ordering is branch-agnostic:
 * a slip is good at any of the stores listed in `locations.ts`.
 *
 * If the POS is ever un-hidden, decide then whether a receipt should name a
 * branch at all; doing it properly means a Branch table + a `branchId` on Order.
 */
export const BRANCH_NAME = "Malolos";
