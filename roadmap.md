# Numo CRM roadmap

## In progress
- [ ] Lead pipeline speed: parallel enrichment, pre-enrichment dedupe, enrichment cache, progressive inserts, batched writes, retry/backoff, adaptive concurrency, stage timing logs.

## Next (explicit user step 1)
- [ ] Align Leads table to exact spec: lead_id (pk), date_added, business_name, owner_name, category, location, phone (E.164, UNIQUE), email, website, personalized_line, sms_consent (YES/NO/UNKNOWN, default UNKNOWN), consent_date, consent_source, outreach_status (default READY, incl. DO NOT CONTACT), conversation_status (default NEW), last_sms_sent, last_reply, last_contact_date, notes. Keep all other columns/features. Report final column list.

## Queued (from n8n/Twilio brief)

- [ ] Automated import path for n8n (secure webhook endpoint under /api/public + documented table access), dedupe/merge on phone or email, E.164 phone normalization.
- [ ] Leads UI: status/source/tag filters, search, detail view with raw_data, stat tiles by status.
- [ ] Messages table (lead_id, direction, body, twilio_message_sid, twilio_status) + lead fields last_message_at/direction/preview, reply_status, meeting_requested_at, meeting_scheduled_at, opted_out_at (auto do_not_contact).
- [ ] Outreach UI: reply-status badge column, saved views (Replied / Meeting Requested / Opted Out), chat-style thread, outreach summary stats.
- [ ] Final pass: verify nothing broke; document every endpoint/table + field names for n8n.
