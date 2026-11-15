# Homesly Skills Check

A daily WordPress skills assessment for the Homesly Stays web team. Each person gets 15 questions a day about the real changes on their own hotel websites: 11 from their question bank and 4 written fresh by Claude. Answers are marked on the server and explained afterwards. Managers see the whole team's results.

- **Site:** static HTML/JS, hosted on GitHub Pages.
- **Logins, database and marking:** Supabase (email sign-in links, Postgres with row-level security, one Edge Function).
- **Answer keys** live only in the database, never in this repo.

## How people sign in

**Employees (Harshith, Sai Lakshmi)**
1. Open the site and enter your `@homeslystays.com` email.
2. Click the sign-in link we email you. Open it on the same device and browser.
3. Take today's assessment from the Overview page. You get one attempt per day, with 25 minutes once you start.

**Manager**
1. Sign in the same way with your own `@homeslystays.com` email.
2. You land on **Team overview**: today's status, scores, trends and anything waiting to be marked.
3. Use **People & access** to add or remove people and choose whose sites each employee is tested on.

Any other email domain is refused at sign-in. Someone with a company email who isn't listed under People & access sees a "not set up yet" message.

## One-time setup

1. **Create a Supabase project** (free) at supabase.com. Then note the Project URL and the `anon` key from Project Settings → API.
2. **Fill in `assets/config.js`** with those two values. Both are safe to publish.
3. **Link and deploy** from this folder:
   ```bash
   npx supabase@2 login
   npx supabase@2 link --project-ref <your-project-ref>
   npx supabase@2 db push
   npx supabase@2 functions deploy api
   ```
4. **Set secrets.** Run these yourself; never commit the values.
   ```bash
   npx supabase@2 secrets set ANTHROPIC_API_KEY=<your key>
   npx supabase@2 secrets set ALLOWED_ORIGIN=https://<github-user-or-org>.github.io
   node scripts/set-import-token.mjs
   ```
5. **Load the question banks** from the private folder:
   ```bash
   node scripts/import-bank.mjs
   ```
6. **Configure sign-in emails** in Supabase → Authentication:
   - URL Configuration: set Site URL and Redirect URLs to the GitHub Pages address.
   - Emails → SMTP: add your own mail server (e.g. Google Workspace SMTP, Resend or Brevo). Supabase's built-in sender only delivers to project team members and is heavily rate-limited, so staff won't get links without this.
7. **Add yourself as the first manager.** In the SQL Editor run:
   ```sql
   insert into staff (email, full_name, role) values ('<you>@homeslystays.com', '<Your name>', 'manager');
   ```
   Add everyone else from **People & access** in the app.

## Hiring assessments

Managers have a **Hiring** area for shortlisted candidates (after the verbal interview, before the operations round).

1. **New assessment from a JD.** Upload a Word, PDF or text JD, or paste it. Claude writes the candidate brief (using one of our hotels), **Section 1** quick multiple-choice questions, **Section 2** short written tasks, a weighted **scorecard** in plain English with red flags, and **follow-up questions** for the review call. Read it, edit it (Edit tab), then save it as Live.
2. **Add a candidate.** You get a private link (shown once) and a ready-to-send message for email or WhatsApp. Candidates don't sign in. The link works for 7 days.
3. **The candidate** reads the brief, agrees to the rules and privacy terms, checks their camera and screen, and takes the test in **one sitting (about 90 minutes)**. Nothing to make or upload: everything is typed in the portal.
   - For the whole test: camera on with a face check, **entire screen shared**, full screen, copy and paste off, and leaving the page is logged. A camera still about every 30 s and a screenshot about every 60 s, plus both at every warning. 5 strikes submit the test automatically.
   - Section 1 is marked automatically, and Claude suggests marks for Section 2. The test is submitted when they finish or when time runs out.
4. **Review** on the candidate's page: **At a glance** (quick-question score, average AI mark, strikes, time used), the captures, a table of Section 1 answers, and each written answer with its marking guide. Score each area 0–10 by clicking the matching description; the total and the Hire / Second round / Reject recommendation update as you go. Run the review call with the follow-up questions and note what they said.

(Roles created before this change keep their old two-part format with a 48-hour take-home.)

Security: candidate tables and the `hiring` storage bucket aren't readable from the browser except by managers. Candidates act only through the API, using a random token that's stored as a hash. Files are read through 1-hour signed links. Answer keys and scorecards live in `private-bank/roles/` (never committed) and in the database. Delete captures from the candidate page once you've decided (candidates are told it's within 6 months). Treat warnings as signals and look at the captures before rejecting anyone. Proctoring can't fully rule out a second device out of camera view, which is why the review call matters.

### Set it up

```bash
npx supabase@2 db push
npx supabase@2 functions deploy api
node scripts/import-roles.mjs
```

`import-roles` loads every pack in `private-bank/roles/` (the Social Media Marketing Executive pack is there already). New roles made in the app don't need it.

Preview without a backend: `npm run preview`, open `http://localhost:5178/?demo`, sign in as `manager@homeslystays.com` and choose **Hiring**. Demo data stays in your browser.

### Your own subdomain (e.g. `careers.homeslystays.com`)

1. In GitHub → Settings → Pages, set **Custom domain** to the subdomain (this adds a `CNAME` file) and tick **Enforce HTTPS**.
2. At your DNS provider, add a `CNAME` record from the subdomain to `mubashir-alt.github.io`.
3. Supabase → Authentication → URL Configuration: add `https://careers.homeslystays.com/` to the Site URL / Redirect URLs (also in `supabase/config.toml`).
4. `npx supabase@2 secrets set ALLOWED_ORIGIN=https://careers.homeslystays.com`

You can link to it from a GoHighLevel sub-account page or email; the site itself stays on GitHub Pages and Supabase.

## Weekly refresh

Every Friday a scheduled Claude task reads the week's commits in `Homeslystays/Homesly_website`. It adds new facts and questions to `private-bank/`, retires outdated ones, and runs `node scripts/import-bank.mjs`.

## Preview the design without a backend

```bash
npm run preview
```
Then open `http://localhost:5178/?demo`. Sign in as `manager@homeslystays.com`, `harshith@…` or `sai@…`. Nothing is saved.
