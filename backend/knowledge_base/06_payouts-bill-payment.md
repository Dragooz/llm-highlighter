# Payouts & Bill Payment

> Pay your business bills and invoices quickly through Swipey.

Source: https://help.swipey.co/en/collection/21-payouts-bill-payment

---

## Payouts Introduction

Payouts helps businesses manage, review, schedule and pay vendor invoices and bills. Supports **local bank transfer, JomPay, and foreign disbursement**.

Number of bills per plan varies — see [swipey.co/pricing](https://swipey.co/pricing/).

---

### 1. Bill Capture

Forward PDF/Excel/Word invoices to **bills@swipey.co** → auto-captured and shown in Kanban view.

**Rules:**
- Only registered Swipey users can forward bills (non-registered emails ignored)
- Max 10 invoices per email
- Only invoices/bills — EPF, salary slips, payroll reports not processed
- Processing: ~5 mins, up to 2 hours
- Bills show "Processing" label while being extracted

---

### 2. Managing Bills — Kanban Stages

| Status | Description |
|---|---|
| **Pending Review** | New bills land here. Review vendor, amount, currency, bank details. AI auto-extracts but user must verify accuracy. |
| **To Approve** | Bill reviewed and ready for approval. Must set "Pay On" date before moving to Scheduled. |
| **Scheduled** | Ready for payment. Master account deducted immediately to ring-fence funds. Can be moved out before pay date to release funds. |
| **Paid** | Disbursed. Stays here 30 days; older paid bills in Funds tab. |
| **Rejected** | Rejected by user or payment failed (wrong bank details). |

**Review checklist per bill:**
1. Vendor name
2. Charged amount
3. Currency
4. Bank details

---

### 3. Vendor Management

- First-time vendor: add details from inner bill page OR Settings → Vendor → Add New Vendor
- Repeat vendor: bank details auto-populated from Vendor Master List
- Vendor details saved to master list for future reuse

**Supported foreign currencies:**
AUD, USD, EUR, GBP, SGD, CNY, PHP, IDR, PKR, BDT + 100+ countries for disbursement.

> Reach out for currencies not listed above.

---

### 4. Scheduling & Making Payment

1. Open bill → set **Pay on Date** (today or future)
2. Move to **Scheduled** (click "Approve" or select Scheduled from dropdown)
3. Bill auto-paid on scheduled date

**Payment cut-off times (GIRO network):**

| Swipey Cut-off | Disbursed | Cleared by |
|---|---|---|
| 10:00 am | 12:30 pm | 12:30 pm same day |
| 1:00 pm | 4:30 pm | 4:30 pm same day |
| 5:00 pm | 7:00 pm | 7:00 pm same day |
| After 5:00 pm | 10:00 am next day | 10:00 am next day |

> No processing on weekends or Malaysian public holidays.
> Cross-border payments: 1–3 working days.

---

## Create Bulk Payments via Payouts

Upload multiple bills at once or use bulk scheduling from the Payouts Kanban. Useful for payroll-adjacent payments and recurring vendor invoices.

---

## Download Paid Bills Receipt

Payouts → Paid column → select bill → **Download Receipt**.

---

## Manage and Send Receipts to Vendors

After payment, Swipey can automatically send payment confirmation receipts to vendors. Configure in Payouts settings → enable auto-send → enter vendor email (saved in Vendor Master List).
