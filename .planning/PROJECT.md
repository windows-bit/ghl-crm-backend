# GHL CRM Mobile App

**One line:** A white-label iOS + Android CRM app that connects service business owners to their GoHighLevel account via API key.

**Core value:** Service business owners (window cleaners, pressure washers, etc.) can manage their GHL contacts, deals, conversations, and appointments from their phone — without needing to use the clunky GHL mobile app.

**Target user:** Small service business owners who already use GoHighLevel. Evan sells this app to them via his TikTok course / community.

**Monetization:** Sell access (Stripe/Gumroad paywall before onboarding). Each buyer brings their own GHL API key.

---

## Architecture

```
[React Native Expo App]  →  [Node.js + Express Backend on Railway]  →  [GHL v2 REST API]
                                         ↕
                               [Supabase — users + encrypted GHL keys]
```

- **Mobile:** React Native + Expo SDK 54 (runs in Expo Go for testing; EAS Build for production)
- **Backend:** Node.js + Express on Railway (auto-deploys from GitHub)
- **DB/Auth:** Supabase (users table with `ghl_key_encrypted`, `ghl_location_id`)
- **GHL API:** `https://services.leadconnectorhq.com` with `Version: 2021-07-28` header
- **Auth:** JWT tokens stored in Expo SecureStore

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Mobile | React Native + Expo SDK 54 |
| Navigation | React Navigation (native stack + bottom tabs) |
| UI | react-native-paper + Ionicons |
| HTTP | axios (with interceptors for JWT) |
| Backend | Node.js + Express |
| Hosting | Railway |
| Database | Supabase (PostgreSQL) |
| GHL API | REST v2 |

---

## Screens

| Screen | Tab | Status |
|--------|-----|--------|
| Login | — | ✓ Done |
| GHL Setup | — | ✓ Done |
| Dashboard | Dashboard tab | ✓ Done |
| Contacts | More → Contacts | ✓ Done |
| Pipelines | More → Pipelines | ✓ Done (needs real data testing) |
| Conversations | Conversations tab | ✓ Done (message sending needs fix) |
| Calendar | Calendar tab | ⚠ API works, display needs fix |
| Automations | More → Automations | ✓ Done |
| Invoices | More → Invoices | ✓ Done |
| Time Tracking | Timesheet tab | ✓ Done |
| More | More tab | ✓ Done |
| Settings | More → Settings | ✓ Done |

---

## Backend Routes

All routes live at `https://ghl-crm-backend-production.up.railway.app`:

| Route | Status |
|-------|--------|
| POST /auth/register | ✓ |
| POST /auth/login | ✓ |
| POST /auth/ghl-key | ✓ |
| GET /ghl/contacts | ✓ |
| POST /ghl/contacts | ✓ |
| GET /ghl/opportunities | ✓ |
| POST /ghl/opportunities | ✓ |
| GET /ghl/conversations | ✓ |
| GET /ghl/conversations/:id/messages | ✓ |
| POST /ghl/conversations/:id/messages | ⚠ needs testing |
| GET /ghl/calendars | ✓ |
| GET /ghl/appointments | ✓ (fixed 422, debug active) |
| POST /ghl/appointments | ✓ |
| GET /ghl/invoices | ✓ |
| POST /ghl/invoices | ✓ |
| GET /ghl/workflows | ✓ |
| POST /ghl/workflows/:id/trigger | ✓ (fixed endpoint) |

---

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Backend proxy for GHL keys | Never store raw keys on device — security | Shipped |
| GHL API v2 | v1 deprecated, v2 is current | Shipped |
| calendarId required for events | GHL v2 requires it, not just locationId | Fixed with 2-step fetch |
| JWT + SecureStore | Standard mobile auth pattern | Shipped |
| Expo Go for dev, EAS for prod | Fastest iteration path | In use |
| iOS-native design system | Evan's customers are primarily iPhone users | In use (#F2F2F7 bg, #4F46E5 primary) |

---

## Requirements

### Validated (already shipped)
- ✓ User can register and log in with email/password
- ✓ User can save their GHL API key + location ID
- ✓ User can view contacts list with search
- ✓ User can create new contacts
- ✓ User can view pipeline opportunities by stage
- ✓ User can view conversation threads
- ✓ User can view calendar appointments (API working)
- ✓ User can view and trigger automations (workflows)
- ✓ User can view invoices
- ✓ User can track time
- ✓ App navigates with iOS-style bottom tabs + stack

### Active (in progress / broken)
- [ ] Calendar appointments display correctly on screen
- [ ] User can send messages in conversation threads
- [ ] User can book appointments from Conversations screen
- [ ] Debug box removed from Calendar after fix

### Out of Scope (v1)
- Push notifications — complex, requires separate infra
- GHL OAuth (instead of API key) — more complex, defer to v2
- Stripe paywall in-app — handled externally before onboarding
- Multi-account support — single account per user for now

---

## Current Milestone: v1.1 — Bug Fix + Polish

**Goal:** Fix remaining broken features and make the app ready to show/sell.

**Target features:**
- Calendar display working with real GHL data
- Message sending working in Conversations
- Appointment booking from Conversations
- Remove debug artifacts
- iPhone polish pass

---
*Last updated: 2026-03-11 after GSD initialization*
