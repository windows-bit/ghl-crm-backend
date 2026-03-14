# GHL CRM Backend — Agent Context

## What this is
Node.js/Express backend for the GHL CRM mobile app. Proxies calls to GoHighLevel API v2.
Uses Supabase for user accounts and time tracking. Deployed on Railway.

## Tech stack
- Node.js + Express 4
- Supabase (lib/supabase.js) for database
- JWT (jsonwebtoken) for auth tokens
- AES-256-CBC encryption via lib/encrypt.js for GHL API keys
- Anthropic SDK 0.78.0 for AI chat (claude-sonnet-4-6 model)
- Axios for GHL API calls
- bcrypt for password hashing

## File structure
- server.js — entry point, mounts all routes
- routes/ghl.js — GHL API proxy (all GHL calls go through here)
- routes/ai.js — AI chat with Claude tool use
- routes/time.js — employee time tracking (Supabase: time_entries table)
- routes/auth.js — register, login, save GHL key
- middleware/auth.js — JWT verification, attaches req.user.id
- lib/claude.js — agentic loop with GHL tools (claude-sonnet-4-6)
- lib/supabase.js — Supabase client
- lib/encrypt.js — AES encrypt/decrypt for GHL keys

## GHL API conventions (CRITICAL)
- Base URL: https://services.leadconnectorhq.com
- Version header: `Version: 2021-07-28` (most endpoints)
- Version header: `Version: 2021-04-15` (calendar events only)
- Auth header: `Authorization: Bearer {ghlApiKey}`
- Always use `getGhlCreds(req.user.id)` to get { apiKey, locationId }
- Location ID is stored per user in Supabase, NOT hardcoded

## Routes that exist (DO NOT recreate)
- POST /auth/register, POST /auth/login, POST /auth/ghl-key ✅
- GET /ghl/contacts, POST /ghl/contacts ✅
- GET /ghl/pipelines, GET /ghl/opportunities ✅
- GET /ghl/conversations, GET /ghl/conversations/:id/messages ✅
- POST /ghl/conversations/:id/messages ✅
- GET /ghl/calendar/events ✅
- GET /ghl/invoices, POST /ghl/invoices ✅
- GET /ghl/products ✅
- GET /ghl/workflows, POST /ghl/workflows/:id/trigger ✅
- POST /ai/chat ✅
- GET /time/active, POST /time/clock-in, POST /time/clock-out, GET /time/history ✅

## Known issues to fix
- claude.js: model name should be 'claude-sonnet-4-6' (check if current is wrong)
- ghl.js: remove debug console.log left in production (search for '[SendMessage] payload:')
- routes: no input validation — add basic checks on required fields for POST routes
- auth.js: no rate limiting on login endpoint (brute force risk)

## What still needs to be built
1. Add contact search by name to ghl.js — GET /ghl/contacts?search= already exists
   but needs to be wired to AutomationsScreen workflow trigger
2. Add GET /ghl/contacts/:id endpoint for fetching single contact details
3. Webhook endpoint for real-time GHL updates (future — not urgent)

## Do NOT do these things
- Do not change the Supabase table schema without checking existing tables first
- Do not change the JWT secret or encryption key logic
- Do not switch from Express to another framework
- Do not add TypeScript
