# Numo CRM Core

Build a full-stack web app called Numo CRM for a marketing agency. Start with the CRM foundation only, not the AI lead generator yet. The visual design must closely match a premium black, cream, beige, and warm-gold CRM reference: dark rounded header, NUMO MARKETING branding, large page titles, cream background, polished KPI cards, wide tables with dark headers, rounded panels, soft shadows, modern sans-serif typography, and colored status pills. Create working navigation and responsive pages for Dashboard, Lead Tracker, Meetings, Clients, and Invoices. The Lead Tracker should support persistent records with fields for Date Added, Business Name, Category, Location, Phone, Email, Website, Business Hours, Personalized Line, Outreach Status, and Notes. Statuses include READY, PENDING, CONTACTED, REPLIED, MEETING SET, CLIENT, NOT INTERESTED. Include working search, filters, sorting, add/edit/delete, notes, duplicate detection, and live KPI metrics. Meetings and Clients should have working create/edit flows, statuses, search/filtering, and persistent storage. The Invoices page should exist with a manual Create Invoice action only; invoices must never auto-generate unless the user explicitly creates one. Include client autofill, invoice numbering, automatic subtotal/discount/tax/total/balance calculations, statuses, invoice history, PDF-ready preview, and room for later email sending. Use the NUMO black/cream/gold brand throughout. Keep the architecture ready for future Apify + OpenAI lead generation integration without needing to redesign the CRM.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://numomarketingcrm.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cc6dd0d5-3a05-4009-9ec8-44d663b25a9f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
