# Chat Wrapped

**Spotify Wrapped for your WhatsApp and Telegram chats.** Drop in an export and get the story of the chat: who talks most, who replies at 2 AM, your emoji language, reply-speed rankings and an award for everyone. An optional AI verdict adds a short personality write-up.

**Live:** https://wrapped.jashparmar.com · try the built-in demo chat, no export needed.

## Private by design

The interesting engineering constraint: people's chats are about as personal as data gets, so the app is built so that **message text never leaves the device**.

- **Parsing and analysis run in the browser**, inside a Web Worker, so a 100k-message chat doesn't freeze the page.
- **A strict Content Security Policy** (`connect-src 'self'`) means the page can only talk to its own origin. Even a compromised dependency couldn't send the chat anywhere else, and there are no dependencies anyway.
- **The AI sees anonymous numbers only.** Names become `P1…P8` before anything is sent ("P1 replies in 3 min, 21% of messages after midnight"), and the server swaps nothing back; the browser does. Top words are opt-in.
- **The server re-validates every field** against a strict schema (ids must match `P[1-8]`, words must be single tokens, emojis must be emoji), so the endpoint can't be used as a general-purpose LLM proxy or to smuggle text through.

## Architecture

```
 browser                                        Cloudflare edge
 ┌──────────────────────────────────┐          ┌────────────────────────────────┐
 │ File / zip ─▶ Web Worker         │          │ Worker                         │
 │   zip.js     (reads only the     │          │  /api/insights                 │
 │              chat entry, never   │  stats   │   validate (schema, sizes)     │
 │              the media)          │ ───────▶ │   edge cache by SHA-256        │
 │   parse.js   WhatsApp iOS/Android│ (no text)│   rate limit per IP            │
 │              + Telegram JSON     │          │   Gemini, JSON schema output   │
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
| `src/worker.ts` | Static assets plus `/api/insights`: validation, per-IP rate limiting, an edge cache keyed by payload hash, and Gemini structured output with a retry. |

No frameworks, no build step and no npm dependencies.

## Develop

```bash
npm test          # 19 tests: parsers, stats, zip reader, API validation
npm run dev       # wrangler dev on http://localhost:8787
```

AI insights need a Gemini key: `npx wrangler secret put GEMINI_API_KEY`. Without one the app works fully and the AI slide says it's switched off.

## Deploy

```bash
npm run deploy    # Cloudflare Workers, custom domain wrapped.jashparmar.com
```

Not affiliated with WhatsApp, Telegram or Spotify.
