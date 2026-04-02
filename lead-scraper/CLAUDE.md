# Lead Scraper

## What We're Building
An automated pipeline that scrapes leads from Google Maps, Facebook, and other sources and pushes them directly into GoHighLevel.

## Guardrails
- Keep it simple — no unnecessary dependencies
- Must connect to GHL API to create contacts automatically
- Scraping is done via Apify actors (not custom scrapers)
- Output must include: name, phone, email, address where available

## Tools
- Apify — scraping
- GoHighLevel API — contact creation
- Google Sheets (optional staging area)

## Target Lead Sources
- Google Maps: property management companies, HOAs in Houston
- Facebook Groups: homeowners asking for cleaning recommendations
- Yelp: customers leaving bad reviews on competitors

## Status
- [ ] Apify actor configured
- [ ] GHL API connected
- [ ] Webhook pipeline built
- [ ] Outreach sequence created in GHL
