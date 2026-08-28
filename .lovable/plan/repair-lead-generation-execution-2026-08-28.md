# Repair lead generation execution

## What will change
- Replace the long-running `generateLeads` request with an authenticated persisted job: start an Apify run immediately, save its run ID/state, and return control to the UI.
- Add authenticated status polling that checks Apify in short requests; once scraping finishes, it runs OpenAI qualification, location validation, deduplication, and user-scoped database insertion exactly once.
- Update Lead Generator and Dashboard controls to show real stages (`SOURCING`, `QUALIFYING`, `COMPLETED`, `FAILED`) and actionable failure details instead of a generic mutation failure.
- Keep credentials server-only and retain existing APIFY + OPENAI provider reporting.

## Backend data
- Extend `lead_gen_runs` with private job metadata needed to resume work safely (provider run/dataset IDs and processing timestamps/state). Existing per-user access rules remain unchanged.

## Verification
- Typecheck and production build.
- Exercise the authenticated server path with 1–3 candidates, then verify the job completes and any accepted real lead reaches Lead Tracker with `APIFY + OPENAI`.
- Do not publish or run a large batch.

## Technical notes
- Each server request will remain short; no request waits for the full Google Maps crawl.
- A conditional state transition prevents duplicate OpenAI processing/inserts if multiple polls arrive together.
