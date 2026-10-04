# Test imports

Sample spreadsheets for exercising **Inventory → Import Sales**
(`/staff/owner/inventory/import`). Upload one, check the preview against the
table below, and only click Apply when you actually want the stock deducted.

Regenerate them any time:

```powershell
npm run test-imports
```

That runs `scripts/make-test-imports.mts`, which builds the sheets from
`src/lib/sales-sheet.ts` — the same module the downloadable template and the
re-download of a past import use. Change the client's layout in one place and
these files follow.

## The files

| File | What it is | Expected preview |
|---|---|---|
| `sales-basic.xlsx` | Four ordinary sales, small quantities. | 4 rows, **4 matched** |
| `sales-fullday.xlsx` | All 8 menu items — 26 unique ingredients. The heavy transaction that reproduced the P2028 transaction timeout. | 8 rows, **8 matched** |
| `sales-with-skips.xlsx` | Valid rows mixed with an off-menu name, a zero quantity, a text quantity, and a blank line. | 5 rows, **2 matched**, 1 unmatched, 2 bad-qty (the blank line is dropped, not reported) |
| `sales-insufficient.xlsx` | Quantities of 9999, far past what's on hand. | 2 rows, **2 matched**, ingredients flagged **insufficient** |
| `sales-from-template.xlsx` | **The realistic upload.** The downloadable template with 4 rows typed in: 200 data rows where Transaction ID / Category / Unit Price / Total are live formulas, plus a `SUM` TOTAL row. | 4 rows, **4 matched**, **0 bad-qty** |
| `sales-alt-headers.xlsx` | Flat two-column sheet with `Item` / `Sold` headers and messy names (`"  cheesy  bacon FRIES "`). | 3 rows, **3 matched** |
| `sales-legacy-headers.xlsx` | Flat `Product` / `Quantity` sheet — the pre-redesign template shape. | 3 rows, **3 matched** |

## Why `sales-from-template.xlsx` matters

It is the only fixture shaped like what a client actually sends. Its 196 unused
rows are not empty — they hold formula objects — and its TOTAL row holds a `SUM`
in the Qty column. Both would be read as rows with a quantity and no product if
the parser's guards in `src/app/actions/sales-import.ts` ever regressed. If this
file starts reporting bad-qty rows, that is the bug.

## Notes

- Product names must stay in step with the live menu. All 8 are `AVAILABLE` and
  have recipes; if one is renamed or archived, update `PRODUCTS` in
  `scripts/make-test-imports.mts` or the "matched" counts above stop holding.
- Applying an import **really deducts stock**. `sales-fullday.xlsx` moves 26
  ingredients at once — fine for a demo, but don't apply it repeatedly against
  the live database expecting the numbers to stay put.
- The importer only ever reads **Menu Item** and **Qty**. Everything else on
  these sheets — banners, Transaction ID, Category, Unit Price, Total — is there
  so the file looks like the client's own paperwork.
- Uploading the same filename twice within 24 hours raises a possible-duplicate
  warning on the preview. That's expected while testing.
