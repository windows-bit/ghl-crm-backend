# Requirements — v1.1 Bug Fix + Polish

## v1.1 Requirements

### Calendar
- [ ] **CAL-01**: User can see their upcoming GHL appointments displayed as cards in the Calendar tab
- [ ] **CAL-02**: Each appointment card shows time, duration, title, contact name, and status color
- [ ] **CAL-03**: Appointments are grouped by date with a date header
- [ ] **CAL-04**: Debug panel (black/green box) is removed from Calendar screen
- [ ] **CAL-05**: Calendar shows "No appointments" state when GHL has no upcoming events

### Conversations
- [ ] **CONV-01**: User can type and send a message in a conversation thread (SMS)
- [ ] **CONV-02**: Sent messages appear immediately in the thread after sending
- [ ] **CONV-03**: Message bubbles correctly show inbound vs outbound direction
- [ ] **CONV-04**: User can tap a calendar icon in a conversation to book an appointment for that contact
- [ ] **CONV-05**: Appointment booking modal shows available GHL calendars to choose from
- [ ] **CONV-06**: Appointment booking modal has working date + time pickers (iOS native)
- [ ] **CONV-07**: User can confirm and create the appointment from the modal

### Polish
- [ ] **POL-01**: All screen headers are consistent (same size, color, padding)
- [ ] **POL-02**: All tab bar icons and labels are consistent
- [ ] **POL-03**: Loading states show spinners (not blank screens)
- [ ] **POL-04**: Error states show readable messages (not raw JSON)
- [ ] **POL-05**: App feels native on iPhone (no Android-style UI patterns)

### Pipelines
- [ ] **PIP-01**: Pipeline stages load from GHL and display as horizontal tab list
- [ ] **PIP-02**: Deals in each stage show name, value, contact, and status pill
- [ ] **PIP-03**: Deal count badge shows per stage tab

---

## v2 Requirements (deferred)
- Push notifications for new conversations/appointments
- Ability to edit existing contacts
- Ability to edit/move pipeline opportunities between stages
- GHL OAuth login (instead of API key paste)
- Invoice creation in-app
- Dark mode

## Out of Scope
- Multi-account GHL support — one GHL account per user
- In-app Stripe paywall — handled externally
- Custom branding/white-label per customer — future business model decision
- Android-specific design — iOS-first, Android acceptable but not priority

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CAL-01 | Phase 1 | — |
| CAL-02 | Phase 1 | — |
| CAL-03 | Phase 1 | — |
| CAL-04 | Phase 1 | — |
| CAL-05 | Phase 1 | — |
| CONV-01 | Phase 2 | — |
| CONV-02 | Phase 2 | — |
| CONV-03 | Phase 2 | — |
| CONV-04 | Phase 3 | — |
| CONV-05 | Phase 3 | — |
| CONV-06 | Phase 3 | — |
| CONV-07 | Phase 3 | — |
| POL-01 | Phase 4 | — |
| POL-02 | Phase 4 | — |
| POL-03 | Phase 4 | — |
| POL-04 | Phase 4 | — |
| POL-05 | Phase 4 | — |
| PIP-01 | Phase 5 | — |
| PIP-02 | Phase 5 | — |
| PIP-03 | Phase 5 | — |
