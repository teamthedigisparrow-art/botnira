# Twilio Phone Number Billing & Lifecycle Policy

## Overview
BotNira provisions Twilio phone numbers for vendors who subscribe to paid plans (Voice/SMS channels). This document explains when numbers are released and billing implications.

---

## 💰 Twilio Costs
- **Monthly rental**: ~$1.15 per US/CA number
- **Inbound calls**: $0.0085/min
- **Outbound calls**: $0.014/min
- **SMS**: $0.0079 per message

**CRITICAL**: If phone numbers are NOT released, BotNira continues paying $1.15/month per unused number indefinitely.

---

## 📋 Phone Number Lifecycle

### 1. When Number is Provisioned
- Vendor subscribes to paid plan
- Clicks "Buy Number" in Voice channel
- BotNira provisions number from Twilio subaccount
- Vendor is charged via Stripe
- **Twilio billing starts immediately** (~$1.15/month)

### 2. When Number is Released (Billing Stops ✅)
Phone numbers are automatically released in these scenarios:

#### a) Manual Disconnect by Vendor
- Vendor clicks "Deactivate" button in Voice channel
- **Action**: Number immediately released from Twilio
- **Result**: Twilio billing stops within current billing cycle
- **Vendor can**: Buy a NEW number (same or different)
- **Vendor CANNOT**: Reclaim the exact same number

#### b) Subscription Cancelled
- Vendor cancels subscription via Stripe
- Stripe webhook: `customer.subscription.deleted` fires
- **Action**: Number automatically released from Twilio
- **Result**: Twilio billing stops
- **Vendor can**: Re-subscribe and buy a NEW number
- **Vendor CANNOT**: Reclaim their old number

#### c) Subscription Expired (Trial Ended, No Payment)
- Vendor's trial ends and they don't upgrade
- `subscription_status` → "none"
- **Action**: Number NOT automatically released (by design)
- **Reason**: Grace period for vendors to renew
- **Manual intervention**: BotNira admin can run cleanup script

### 3. When Number is NOT Released (Billing Continues 🚨)
These scenarios keep the number active (BotNira keeps paying):

#### a) Payment Failed (`past_due`)
- Vendor's card declines
- Stripe webhook: `invoice.payment_failed` fires
- **Action**: Number kept for 7-14 day grace period
- **Reason**: Stripe retry logic, vendors may fix payment method
- **Twilio cost**: Continues (~$1.15/month)
- **When released**: After Stripe exhausts retries and cancels subscription

#### b) Trial Period
- Vendor in 5-day trial, hasn't upgraded
- **Action**: Number kept during trial
- **Reason**: Trial channels (web, WhatsApp) don't have phone numbers
- **Note**: Voice/SMS require paid plan, so no numbers exist during trial

---

## ❓ FAQ: Can Vendors Reclaim Their Number?

### Q: Vendor disconnected their number. Can they get the SAME number back?
**A: NO**

Once a number is released to Twilio:
1. It goes back to Twilio's available inventory
2. Any Twilio customer can purchase it
3. BotNira cannot "hold" or "reserve" numbers

### Q: What if vendor wants to keep their number while on break?
**A: They must keep their subscription active**

Options:
- Keep paying for subscription (keeps number + stops Twilio billing to BotNira)
- OR release number and buy a new one later

### Q: Can vendor pause subscription but keep number?
**A: Not currently supported**

Would require:
- New "paused" subscription tier
- BotNira continues paying Twilio during pause
- Vendor pays reduced "number holding fee"

---

## 🔧 Implementation Details

### Code Location: `/app/backend/server.py`

#### Helper Function (Line ~3889):
```python
async def _release_vendor_phone_number(vendor_id: str) -> bool:
    """Release a vendor's Twilio phone number to stop billing."""
    # Deletes number from Twilio subaccount
    # Updates voice_connections collection
    # Marks voice + SMS channels as "disconnected"
```

#### Manual Disconnect (Line ~3930):
```python
@api_router.post("/voice/deactivate")
async def voice_deactivate(user):
    released = await _release_vendor_phone_number(user["vendor_id"])
    return {"ok": True}
```

#### Stripe Webhook (Line ~2734):
```python
elif etype == "customer.subscription.deleted":
    # Subscription cancelled
    await _release_vendor_phone_number(vendor_id)
    # Stops Twilio billing ✅
```

---

## 📊 Cost Impact (Before Fix)

**Problem**: Numbers were NOT released on subscription cancellation
- 100 cancelled vendors = $115/month wasted
- 1,000 cancelled vendors = $1,150/month wasted

**Solution**: Automatic release on subscription cancel
- Saves $1.15/month per cancelled vendor
- Prevents accumulation of unused number charges

---

## 🚀 Future Enhancements

### Option 1: Number Reservation Fee
- Allow vendors to "pause" but keep number
- Charge $5/month "hold fee"
- BotNira pays Twilio $1.15, keeps $3.85 margin

### Option 2: Number Transfer
- Vendor can "port" their BotNira number to their own Twilio account
- One-time fee + Twilio porting process

### Option 3: Grace Period
- On subscription cancel, hold number for 7 days
- Allow vendor to re-subscribe and reclaim
- After 7 days, auto-release

---

## ✅ Current Status (After Fix)

✅ Manual disconnect → Releases number immediately
✅ Subscription cancelled → Auto-releases number
✅ Payment failed (`past_due`) → Keeps number for Stripe retry period
⚠️ Trial expired → Manual cleanup needed (low priority, trials don't have numbers)

**Estimated savings**: $1.15/month per cancelled vendor (scales with churn rate)
