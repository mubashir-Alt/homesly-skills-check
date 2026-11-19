# The Woodman Inn – Website Work Summary

19 November 2026 · Homesly Group

Live, editable version: https://claude.ai/artifact/CGmRzVSpNoR5ppY1QghJqH

## At a glance

thewoodmaninnburneston.com has been fully redesigned, made roughly three times faster on phones, and set up properly with Google. All work was done between 17 and 19 November 2026. Every page can still be edited by the team in Elementor.

| Measure | Before | After |
| --- | --- | --- |
| Google PageSpeed score, homepage on mobile (out of 100) | 27 | 85 |
| Time for the server to start sending a page | about 1.6 s | about 0.05 s (served from Cloudflare) |
| Google SEO score (Lighthouse, out of 100) | 92 | 100 |
| Accessibility score (Lighthouse, out of 100) | 71 | 94–100 depending on page |
| Pages redesigned | – | All 20 site pages, including legal pages |
| Google Search Console | Not connected | Verified, sitemap submitted, key pages sent for indexing |

The most important finding: **the Rooms page had never been indexed by Google**, so it could not appear in search results. It has now been submitted and should start appearing within a few days.

## Website redesign

Every page now shares one modern design, with a single header and footer used across the whole site. Pages are built in Elementor, so staff can change text, photos and prices without a developer.

- **Real photos only.** Heroes, rooms and gallery use the inn's own photography; no AI-generated images. Duplicate gallery photos were removed.
- **Less scrolling.** Sections are compact, and on phones and tablets long rows become swipeable cards.
- **Clear headings for Google.** Each page has one main heading (H1), for example "Pub with rooms · Burneston, near Bedale" on the homepage and "En-suite rooms near Bedale" on Rooms.

| Area | Pages |
| --- | --- |
| Main pages | Home, About, Rooms, Restaurant menu, Corporate accommodation, Gallery, Blogs, Contact |
| Landing pages | Golf breaks, Visitor attractions, Book a table, Direct booking, Offers, Vouchers, Reviews, News |
| Other | Thank-you page, Terms and conditions, Cookie policy, Privacy policy |

The Direct booking page used to embed the Cloudbeds booking engine, but Cloudbeds blocks it from loading on this domain. It now shows a clear booking card that links to Cloudbeds instead.

## Booking and enquiry forms

All enquiries now stay on the website and go to the bookings inbox. Each form was tested by sending a real enquiry.

| Form | How guests reach it | After sending |
| --- | --- | --- |
| Golf break enquiry (new) | "Check golf availability", "Book this course" and "Book golf package" on the Golf page open a pop-up. "Book this course" pre-selects that course. | Thank-you page worded for golf |
| Book a table | "Book a table" buttons open a pop-up | Thank-you page worded for table bookings |
| Contact | Contact page form | Thank-you page worded for contact messages |
| Book a stay | "Book now" buttons open the existing stay booking pop-up (kept as it was) | Unchanged |

- Golf buttons no longer send guests away to Cloudbeds; they open the golf enquiry form.
- "Book a Table" was removed from the footer, as requested.
- Forms are protected from spam by Cloudflare Turnstile. The Send button looks faded for a second or two until the check passes; that is normal.

## Speed and reliability

The homepage on a phone went from a Google PageSpeed score of 27 to 85. The page now appears in about 1.3 s and the main photo in about 3.9 s.

1. **Cloudflare added in front of the site (free plan).** Pages are served from Cloudflare's UK servers instead of the server in the USA, and the site gets free SSL, DDoS protection and a second DNS provider. Email was not affected.
2. **Pages cached at Cloudflare for visitors.** A visitor's page now starts arriving in about 0.05 s instead of 1.6 s. Logged-in staff and the admin area are never cached.
3. **Cache clears itself.** Saving a page, menu or design in WordPress automatically refreshes Cloudflare, so changes show straight away. There is also a "Clear Cloudflare cache" button in the WordPress top bar.
4. **Lighter pages.** Unused theme and plugin files are no longer loaded on the new pages, small style files are built into the page, and fonts load without blocking.
5. **Tracking loads after the page.** Google Tag Manager and the Meta pixel now load once the page is ready, so they no longer slow it down. Tracking still works.
6. **Right-sized photos.** Phones and tablets get smaller versions of hero and banner photos; desktops get full size.

The remaining limit is the server itself (a US server running several hotel sites). A UK server or a Redis cache would help further, but needs server access.

## Google visibility (SEO)

The site now scores 100 out of 100 on Google's SEO check and is connected to Google Search Console for the first time.

**On the website (Rank Math SEO plugin)**

- Every page has a proper Google title (under 60 characters) and description (under 165 characters).
- Opening hours are published to Google: Mon–Tue 15:00–22:00, Wed–Sat 12:00–22:00, Sun 12:00–19:00.
- Duplicate and empty category pages are hidden from Google, so it focuses on the real pages.
- Pages are no longer labelled as news "articles" in the code Google reads.
- The logo and images have descriptive text for search engines and screen readers.

**Google Search Console (set up 19 November 2026)**

- Added under the pub's Google account, bookings@woodmaninnpub.com, as a "Domain" property covering every version of the site.
- Ownership verified through a record in Cloudflare. **Please do not delete the "google-site-verification" TXT record in Cloudflare**, or Google will lose access.
- Sitemap submitted, so Google can find all pages and blog posts.
- Re-indexing requested for the Homepage, Rooms, Golf breaks, Visitor attractions and Restaurant.

| Page | Google status before | Action |
| --- | --- | --- |
| Rooms | Not on Google at all | Sent for indexing |
| Homepage | Indexed | Re-crawl requested |
| Golf breaks | Indexed, old design | Re-crawl requested |
| Visitor attractions | Indexed, old design | Re-crawl requested |
| Restaurant | Indexed, old design | Re-crawl requested |

Google's full indexing report takes a day or two to fill in after a new set-up.

## Accessibility and design polish

All text and buttons now pass the international readability standard (WCAG AA) for colour contrast, and every page was checked on phone, tablet and desktop.

- **Darker brand gold.** The old gold (#B5823A) was too light to read on cream and white backgrounds and behind white button text. It is now a slightly deeper bronze (#825E2A) everywhere. The light gold on the dark green sections already passed and was kept.
- **Rooms slider arrows.** Arrows were added so guests can see there are more rooms to swipe through.
- **"Check rates" on one line.** The button text no longer wraps.
- **Stray calendar removed.** A leftover theme calendar list that showed under the footer in private browsing is gone.
- **Phone-friendly.** Phone numbers do not break across lines, guests can zoom the page, the WhatsApp button is labelled for screen readers, and the review stars show correctly.
- **Spacing and layout.** Padding, margins and column layouts were checked and tidied on every page at phone, tablet and desktop sizes.

| Page | Accessibility score (Lighthouse, mobile) |
| --- | --- |
| Rooms | 100 |
| Restaurant | 100 |
| About | 100 |
| Contact | 97 |
| Homepage | 95 |
| Golf breaks | 94 |

The last few points on Home and Golf come from how Elementor builds its FAQ accordions; this does not affect guests and can be tidied later.

## Open items and next steps

Nothing is broken; these are follow-ups to get the most out of the new site.

- [ ] **Check Google's indexing report** in Search Console in 2–3 days and submit any remaining pages. Google allows about 10 requests a day.
- [ ] **Decide who else needs Search Console access.** Today only bookings@woodmaninnpub.com can see it; others can be added under Settings → Users and permissions.
- [ ] **Update the Google Business Profile** with the new website pages, opening hours and photos, so Maps and Search match the site.
- [ ] **Ask Cloudbeds to allow thewoodmaninnburneston.com** for their embedded booking engine. Once they do, the live availability widget can go back on the Direct booking page.
- [ ] **Cloudflare housekeeping:** delete the old, unused cache-purge API token, and check the "Cloudflare Agent Token" is still needed (it was regenerated by mistake during set-up).
- [ ] **Optional speed upgrade:** a UK/EU server or a Redis cache on the current server. This needs server (Hestia/SSH) access.
- [ ] **Optional:** rebuild the FAQ accordions on Home and Golf to clear the last accessibility warnings.

For any new design work, use the bronze **#825E2A** rather than the old gold, so text stays readable.

## Accounts and access

This shows where each part of the website is managed. No passwords are included here.

| What | Where it's managed | Signed in with |
| --- | --- | --- |
| Website pages and content | WordPress admin, edited with Elementor | Existing WordPress admin login |
| Speed, cache and design code | WordPress → WPCode snippets: "Woodman Inn – Speed 2", "Layout polish (CSS)", "Cloudflare cache purge" | WordPress admin |
| SEO titles, descriptions, opening hours | WordPress → Rank Math SEO | WordPress admin |
| Forms and pop-ups | WordPress → Contact Form 7 and Popup Maker | WordPress admin |
| CDN, caching, DNS | Cloudflare (free plan) | Homesly Cloudflare login (mubashir@homeslystays.com) |
| Google Search Console | search.google.com/search-console | bookings@woodmaninnpub.com |
| Tracking | Google Tag Manager (GTM-WTFPGDF5) and Meta pixel | Existing accounts, unchanged |
| Room bookings | Cloudbeds | Existing account, unchanged |
| Hosting | Homesly server (HestiaCP), shared with other hotel sites | Homesly IT |

Editing tip: after changing a page in Elementor, just save it. Cloudflare refreshes automatically. If a change doesn't show for guests, click "Refresh Page Cache" and then "Clear Cloudflare cache" in the WordPress top bar.
