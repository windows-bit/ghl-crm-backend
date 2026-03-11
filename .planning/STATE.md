# Project State

## Current Position

Phase: Not started
Plan: —
Status: Roadmap created, ready to execute
Last activity: 2026-03-11 — Roadmap created for v1.1

---

## Roadmap Summary

| Phase | Name | Status |
|-------|------|--------|
| 1 | Diagnose Calendar API Response | Not started |
| 2 | Fix Calendar Data Mapping | Not started |
| 3 | Fix Calendar Display: Grouping and Empty State | Not started |
| 4 | Remove Calendar Debug Panel | Not started |
| 5 | Fix Message Sending in Conversations | Not started |
| 6 | Fix Message Bubble Direction | Not started |
| 7 | Build Appointment Booking Modal (Calendar Picker) | Not started |
| 8 | Wire Appointment Booking Confirmation | Not started |
| 9 | Pipeline Data and Display Fix | Not started |
| 10 | Polish: Headers, Tabs, and Loading States | Not started |
| 11 | Polish: Error States | Not started |
| 12 | Polish: iOS Native Feel | Not started |

---

## Accumulated Context

- Backend URL: https://ghl-crm-backend-production.up.railway.app
- GHL API base: https://services.leadconnectorhq.com (Version: 2021-07-28)
- Mobile app: Expo SDK 54, React Native
- Design system: #F2F2F7 bg, #4F46E5 primary (indigo), white cards, iOS-native
- GHL Calendar fix: 2-step fetch (get calendars, then get events per calendarId)
- Current calendar issue: debug box shows `Got N events` — field names from GHL response may not match what the code expects (startTime, endTime, title, contactName, appointmentStatus)
- Auth: JWT stored in Expo SecureStore, attached via axios interceptor
- Calendar events API returns data under: d.events || d.data?.events || d.appointments || d.data?.appointments
