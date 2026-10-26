# Chat Wrapped

**Spotify Wrapped for your WhatsApp and Telegram chats.** Drop in an export and get the story of the chat: who talks most, who replies at 2 AM, your emoji language, reply-speed rankings and an award for everyone. An optional AI verdict adds a short personality write-up.

**Live:** https://wrapped.jashparmar.com · try the built-in demo chat, no export needed.

## What you get

A story of 20+ slides and a full stats page:
- **Totals and rhythm:** messages, words, prime time, a weekday × hour heatmap, a calendar of every day, busiest day, streaks, silences, the longest conversation and the longest message.
- **Every person, not just the top few:** rank, a personal title from their standout habit (Night Owl, Ghost, Double Texter, Reel Dealer, Lurker…), reply speed, chat bestie, top words and emoji, and a shareable card each.
- **Group dynamics:** who replies to whom, the dynamic duo, conversation starters and killers, catchphrases, shared links by site, good-morning and good-night champions.
- **Your Wrapped:** pick which person is you for personal slides; pick a year ("2026 Wrapped") with a year-over-year comparison.
- **Play with it:** search any word or emoji ("how many times did we say bro?"), a "guess who said it" quiz, CSV export.

## Private by design

The interesting engineering constraint: people's chats are about as personal as data gets, so the app is built so that **message text never leaves the device**.

- **Parsing and analysis run in the browser**, inside a Web Worker, so a 100k-message chat doesn't freeze the page.
- **A strict Content Security Policy** (`connect-src 'self'`) means the page can only talk to its own origin. Even a compromised dependency couldn't send the chat anywhere else, and there are no dependencies anyway.
- **The AI sees anonymous numbers only.** Names become `P1…P8` before anything is sent ("P1 replies in 3 min, 21% of messages after midnight"), and the server swaps nothing back; the browser does. Top words are opt-in.
- **The server re-validates every field** against a strict schema (ids must match `P[1-8]`, words must be single tokens, emojis must be emoji), so the endpoint can't be used as a general-purpose LLM proxy or to smuggle text through.

## One tap from WhatsApp

WhatsApp chats are end-to-end encrypted and no app can read them, so instead of a bot the app plugs into the phone's share sheet:

- **Android:** Chat Wrapped is an installable PWA with a [Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target). WhatsApp → Export chat → **Chat Wrapped** opens the story straight away. The service worker parks the shared file in Cache Storage and the page picks it up, so the chat still never reaches the server (if a share ever hits the server, it redirects without reading the body).
- **iPhone:** websites can't be share targets on iOS, so the page documents a three-step Shortcut that saves the export and opens the site ready to pick it.
- **Back into the group:** "Send to the group" opens the share sheet with the summary card and a caption that carries only totals (messages, peak hour, top emoji). Desktop falls back to a `wa.me` link. Link previews come from an Open Graph image.
- **Offline:** the app shell is cached, so it works with Wi-Fi off, which is the easiest way to prove nothing is uploaded.

## Analytics without tracking

There's no analytics script on the page (the CSP would block one anyway). The Worker counts page loads itself and the page reports button taps by name (`demo`, `share_group`, ...) with `sendBeacon`. Everything lands in daily counters in D1:

- unique visitors use a salted SHA-256 of IP + user agent + date, so they can't be reversed or linked across days, and the hashes are pruned after 35 days;
- bots and scanners are filtered (user agent plus `Sec-Fetch-Mode: navigate`), and link-preview fetches from WhatsApp, LinkedIn and others are counted separately, which shows when the link is being shared;
- a private `/stats/<secret>` page (an unguessable link, no login) (server-rendered, no JS) shows visitors per day, the funnel from visit → Wrapped → sent to a group, countries, referrers and AI provider health. Matchday Brain writes to the same database.

## Architecture

```
 browser                                        Cloudflare edge
 ┌──────────────────────────────────┐          ┌────────────────────────────────┐
 │ File / zip ─▶ Web Worker         │          │ Worker                         │
 │   zip.js     (reads only the     │          │  /api/insights                 │
 │              chat entry, never   │  stats   │   validate (schema, sizes)     │
 │              the media)          │ ───────▶ │   edge cache by SHA-256        │
 │   parse.js   WhatsApp iOS/Android│ (no text)│   rate limit per IP            │
 │              + Telegram JSON     │          │   Gemini → Workers AI fallback │
 │   stats.js   streaks, replies,   │ ◀─────── │   clean + cap model output     │
 │              heatmap, awards     │ verdict  │  static assets + CSP headers   │
 │ Story player · dashboard · PNG   │          └────────────────────────────────┘
 └──────────────────────────────────┘
```

| Piece | Notes |
|---|---|
| `public/js/parse.js` | WhatsApp iOS and Android formats (12/24-hour clocks, bidi marks, multi-line messages, media/deleted/edited markers, system notices) and Telegram JSON. Ambiguous `1/2/24` dates are resolved by picking the reading that keeps the chat in chronological order. |
| `public/js/zip.js` | Reads only the central directory and the chat entry, so a 2 GB export full of photos is never loaded into memory. Inflates with the native `DecompressionStream`. |
| `public/js/stats.js` | Reply-time medians, conversation starters (6+ hours of silence starts a new conversation), streaks and silences, a weekday × hour heatmap, a gap-filled monthly timeline, top words/emojis and nine deterministic awards. |
| `public/js/story.js` | Full-screen story with auto-advance, tap/hold/keyboard navigation and reduced-motion support. |
| `public/js/share.js` | Renders a 1080×1350 summary card on a canvas and opens the native share sheet when available. |
| `src/worker.ts` | Static assets plus `/api/insights`: validation, per-IP rate limiting, an edge cache keyed by payload hash (repeat requests return in ~60 ms), and Gemini structured output with a **model fallback chain**: if a model is overloaded, retired or slow, the next one in `GEMINI_MODELS` answers instead, and if all of Gemini is busy, Llama 3.3 70B on **Cloudflare Workers AI** (same account, no extra key) takes over. |

No frameworks, no build step and no npm dependencies.

## Develop

```bash
npm test          # 32 tests: parsers, stats, zip reader, API validation
npm run dev       # wrangler dev (needs a workers.dev subdomain for the AI binding)
node scripts/static.js   # static server for PWA/share-target testing on :8792
node scripts/compare.js A.zip B.txt   # explain why two phones' exports of one chat differ
```

AI insights use Gemini when `GEMINI_API_KEY` is set (`npx wrangler secret put GEMINI_API_KEY`) and fall back to Workers AI, which needs no key.

## Deploy

```bash
npm run deploy    # Cloudflare Workers, custom domain wrapped.jashparmar.com
```

Not affiliated with WhatsApp, Telegram or Spotify.
