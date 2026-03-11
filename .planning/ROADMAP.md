# Roadmap — v1.1 Bug Fix + Polish

**Project:** GHL CRM Mobile App
**Milestone:** v1.1 — Bug Fix + Polish
**Granularity:** Fine (8–12 phases, 1–3 tasks each)
**Goal:** Fix remaining broken features and make the app ready to show and sell.

---

## Phase 1 — Diagnose Calendar API Response

**Goal:** Understand exactly what field names the GHL API returns for calendar events so we know what to fix in the display layer.

**Requirements covered:** CAL-01, CAL-02

**Success criteria:**
- We have a confirmed list of field names from the real GHL API response (e.g. `startTime` vs `start`, `title` vs `name`)
- We know which response envelope key holds the events array
- We know the format of the date/time values (ISO string, Unix timestamp, etc.)

**Estimated tasks:**
1. Log the raw API response from `/ghl/appointments` in the backend and capture a real example payload
2. Document the confirmed field names and response shape

---

## Phase 2 — Fix Calendar Data Mapping

**Goal:** Map the real GHL API field names to what the Calendar screen expects so events render correctly.

**Requirements covered:** CAL-01, CAL-02

**Success criteria:**
- Calendar screen shows real appointment data (not empty or undefined)
- Each card correctly displays time, duration, title, contact name, and status

**Estimated tasks:**
1. Update the backend or frontend mapping layer to use confirmed field names (`startTime`, `endTime`, `title`, `contactName`, `appointmentStatus`)
2. Confirm the response envelope key used (`d.events`, `d.data?.events`, `d.appointments`, etc.) matches what the screen reads

---

## Phase 3 — Fix Calendar Display: Grouping and Empty State

**Goal:** Group appointments by date with headers and show a proper empty state when there are no events.

**Requirements covered:** CAL-03, CAL-05

**Success criteria:**
- Appointments are visually grouped under a date header (e.g. "Wednesday, Mar 11")
- When there are no upcoming appointments, the screen shows a "No appointments" message instead of blank space

**Estimated tasks:**
1. Implement date-grouping logic that buckets events by calendar date
2. Add an empty state component that renders when the events list is empty

---

## Phase 4 — Remove Calendar Debug Panel

**Goal:** Remove the debug box (black/green terminal-style overlay) from the Calendar screen.

**Requirements covered:** CAL-04

**Success criteria:**
- Calendar screen has no debug box visible
- No debug logging text appears on screen for end users

**Estimated tasks:**
1. Find and delete the debug panel component and its render call in CalendarScreen
2. Remove or comment out any `console.log` statements used only for the debug display

---

## Phase 5 — Fix Message Sending in Conversations

**Goal:** Make the send-message flow work end to end so users can type and send an SMS from within a conversation thread.

**Requirements covered:** CONV-01, CONV-02

**Success criteria:**
- User can type a message, tap Send, and see the message appear in the thread immediately
- The POST to `/ghl/conversations/:id/messages` succeeds without an error

**Estimated tasks:**
1. Test and fix the backend `POST /ghl/conversations/:id/messages` route (confirm correct GHL endpoint, headers, and body shape)
2. Update the frontend send handler to optimistically append the sent message to the local thread state on success

---

## Phase 6 — Fix Message Bubble Direction

**Goal:** Ensure inbound and outbound messages render as distinct bubble styles (right-aligned outbound, left-aligned inbound).

**Requirements covered:** CONV-03

**Success criteria:**
- Outbound messages appear on the right side of the screen with the primary indigo color
- Inbound messages appear on the left side with a neutral background

**Estimated tasks:**
1. Check the field used to determine message direction (`direction`, `type`, `fromContact`, etc.) against real GHL data
2. Fix the bubble alignment and color logic in the message list component

---

## Phase 7 — Build Appointment Booking Modal (Calendar Picker)

**Goal:** Add a calendar icon button to the Conversations screen that opens a modal for booking an appointment for that contact.

**Requirements covered:** CONV-04, CONV-05, CONV-06

**Success criteria:**
- A calendar icon is visible in the Conversations screen header or message input area
- Tapping it opens a modal with a list of GHL calendars to choose from
- The modal has a working iOS-native date picker and time picker

**Estimated tasks:**
1. Add a calendar icon button to ConversationDetailScreen that opens a bottom sheet or modal
2. Fetch available GHL calendars from `/ghl/calendars` and display them as a selection list inside the modal
3. Add an iOS `DateTimePicker` for selecting date and time

---

## Phase 8 — Wire Appointment Booking Confirmation

**Goal:** Let the user confirm the appointment booking and create it in GHL via the API.

**Requirements covered:** CONV-07

**Success criteria:**
- Tapping Confirm in the modal calls `POST /ghl/appointments` with the selected calendar, date, time, and contact
- A success or error message is shown after the attempt
- The modal closes on success

**Estimated tasks:**
1. Wire the Confirm button to call the appointments API with the correct payload (calendarId, contactId, startTime)
2. Show a success toast or inline message, and close the modal; show an error message if it fails

---

## Phase 9 — Pipeline Data and Display Fix

**Goal:** Make the Pipelines screen load real GHL stages and deal data reliably.

**Requirements covered:** PIP-01, PIP-02, PIP-03

**Success criteria:**
- Pipeline stages load from GHL and appear as a horizontal tab list
- Each deal card shows name, value, contact name, and a status pill
- Each stage tab shows a badge with the count of deals in that stage

**Estimated tasks:**
1. Verify `/ghl/opportunities` returns stage info and confirm field names match what the screen expects
2. Add deal count badges to each stage tab
3. Confirm deal cards render value, contact name, and status pill correctly

---

## Phase 10 — Polish: Headers, Tabs, and Loading States

**Goal:** Make all screen headers, tab bar icons, and loading states consistent across the app.

**Requirements covered:** POL-01, POL-02, POL-03

**Success criteria:**
- Every screen header uses the same font size, color, and horizontal padding
- All tab bar icons and labels match in size and style
- Every screen that fetches data shows an ActivityIndicator spinner while loading, not a blank screen

**Estimated tasks:**
1. Audit all screen headers and normalize them to a single shared style constant
2. Audit tab bar icon names and labels; fix any that are inconsistent
3. Add loading spinner components to any screen that shows blank during data fetch

---

## Phase 11 — Polish: Error States

**Goal:** Replace raw JSON or empty screens with readable, user-friendly error messages.

**Requirements covered:** POL-04

**Success criteria:**
- When an API call fails, the user sees a plain-English message like "Couldn't load appointments. Check your connection."
- No raw JSON objects or stack traces are visible to the user

**Estimated tasks:**
1. Add a reusable ErrorMessage component
2. Replace all catch blocks that currently show raw errors with the new component

---

## Phase 12 — Polish: iOS Native Feel

**Goal:** Remove any Android-style UI patterns so the app feels at home on iPhone.

**Requirements covered:** POL-05

**Success criteria:**
- No Android-style ripple effects, Material Design elements, or non-iOS navigation patterns visible
- Modals and pickers use iOS-native animations and components
- Fonts, spacing, and button styles are consistent with native iOS conventions

**Estimated tasks:**
1. Audit all react-native-paper components used and switch any Material-style elements to iOS equivalents or custom components
2. Confirm all modals use `presentationStyle="pageSheet"` or bottom sheet pattern, not full-screen Android-style overlays

---

## Dependency Order Summary

```
Phase 1 → Phase 2 → Phase 3 → Phase 4   (Calendar: data → display → grouping → cleanup)
Phase 5 → Phase 6                         (Conversations: send → bubbles)
Phase 7 → Phase 8                         (Booking: modal → confirmation)
Phase 9                                   (Pipelines: independent)
Phase 10 → Phase 11 → Phase 12           (Polish: structure → errors → feel)
```

Phases 1–4, 9, and 10–12 can be worked in parallel with Phases 5–8. Calendar must be fixed before debug panel is removed (Phase 4 depends on Phase 2 being working).
