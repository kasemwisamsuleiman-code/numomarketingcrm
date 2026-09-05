# Numo CRM roadmap

## In progress
- [ ] Lead pipeline speed: parallel enrichment, pre-enrichment dedupe, enrichment cache, progressive inserts, batched writes, retry/backoff, adaptive concurrency, stage timing logs.

## Queued (from n8n/Twilio brief)
- [ ] Leads schema extension: source_actor, apify_run_id, first/last/full name, job_title, linkedin_url, city/state/country, industry, tags[], lead_status lifecycle, do_not_contact, raw_data jsonb, duplicate_of, needs_review. Keep existing columns.
- [ ] Automated import path for n8n (secure webhook endpoint under /api/public + documented table access), dedupe/merge on phone or email, E.164 phone normalization.
- [ ] Leads UI: status/source/tag filters, search, detail view with raw_data, stat tiles by status.
- [ ] Messages table (lead_id, direction, body, twilio_message_sid, twilio_status) + lead fields last_message_at/direction/preview, reply_status, meeting_requested_at, meeting_scheduled_at, opted_out_at (auto do_not_contact).
- [ ] Outreach UI: reply-status badge column, saved views (Replied / Meeting Requested / Opted Out), chat-style thread, outreach summary stats.
- [ ] Final pass: verify nothing broke; document every endpoint/table + field names for n8n.
