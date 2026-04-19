# Accounting Integration

> Connect Swipey to QuickBooks or Xero for seamless bookkeeping.

Source: https://help.swipey.co/en/collection/24-accounting-intergration

---

## QuickBooks Integration

### Step 1: Set Up QuickBooks Cash Account

Before linking, create a cash account in QuickBooks to represent Swipey funds:

1. Log in to QuickBooks
2. Chart of Accounts → **New** → Account Type: Cash and Cash Equivalents
3. Name it (e.g., "Swipey Master Account")
4. Repeat for Swipey Cards Account

### Step 2: Link QuickBooks to Swipey

1. Swipey dashboard → **Accounting** → **Connect to QuickBooks**
2. Click **Connect**
3. Authenticate with QuickBooks credentials
4. Map **Swipey Master Account** → your QuickBooks ledger account
5. Map **Swipey Cards Account** → your QuickBooks ledger account
6. Confirm — all linked accounts show green "Linked" label

> **Important:** Do not disconnect QuickBooks after linking — disconnecting may cause unsaved changes. Swipey is working on improving this.

### Step 3: Sync Transactions to QuickBooks

Swipey dashboard → Accounting → **Sync** → transactions pushed to mapped QuickBooks accounts.

- **Expenses** = card transactions + bill payments
- **Internal Transfers** = master account movements (deposit, top-up, clawback)

---

## Xero Integration

### Step 1: Create Cash Accounts in Xero

1. Log in to Xero → **Accounting** → **Chart of Accounts**
2. **Add Bank Account** → **Add without Bank Feed**
3. Name it (e.g., "Swipey Master Account")
4. Repeat for Swipey Cards Account

### Step 2: Connect Xero to Swipey

1. Swipey dashboard → **Accounting Integration** → **Connect to Xero**
2. Authenticate with Xero credentials

### Step 3: Map Accounts

After connecting:
- Select **Swipey Master Account** → map to Xero cash account created in Step 1
- Select **Swipey Cards Account** → map to Xero cards account

### Step 4: Sync Transactions

Accounting → click **Expense** or **Internal Transfers** to start syncing:

| Sync Type | What It Covers |
|---|---|
| Expense | Card transactions & bill payments |
| Internal Transfers | Deposit, top-up, clawback |

---

## Syncing Transactions to QuickBooks / Xero

After accounts are linked and mapped:
- Transactions sync automatically or on-demand
- Receipts and notes attached in Swipey carry over
- Match synced transactions in QuickBooks/Xero for reconciliation

> Keep accounting software connected at all times for uninterrupted sync.
