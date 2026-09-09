# Weather Panel

A standalone weather panel for an outerwear retailer: search a UK town, see current conditions and a 3-day outlook, and get a merchandising message (headline + CTA) that changes with the weather. Vanilla HTML/CSS/JS, no build step, no keys.

## How to run

- Open `index.html` in a browser — that's it. (Or serve the folder with any static server / VS Code Live Server.)
- The default location (Manchester, badged "Our store") shows staff-pick framing; searching anywhere else switches to trip framing. The last searched location is remembered in localStorage.
- If the weather API can't be reached the panel degrades on purpose: a failed search falls back to the store's weather, and a full outage hides the weather UI and runs as a plain "new arrivals" merch section.

## Demo / spoof tool

Add a `?spoof=` param to force a state without waiting for real weather:

- `?spoof=rain` — rain condition → waterproofs message + CTA
- `?spoof=cold` — snow/cold → knitwear message + CTA
- `?spoof=clear` — mild and clear → default new-arrivals state
- `?spoof=down` — simulates the weather API being unreachable → merch-only fallback layout

## Theming & config

**Re-skin (`style.css`, top of file):** the whole theme derives from one colour. Change `--brand` to any hex/colour value and every tint, gradient, and surface re-derives from it via relative OKLCH — no other colour edits needed. `--radius` controls corner rounding everywhere (inner radii are calculated from it), and `--font-display` / `--font-body` swap the type pair.

**Behaviour config (`app.js`, top of file):**

- `DEFAULT_LOCATION` — the store's location (name, lat/lon, `isStore` flag drives the badge and "what we're wearing" framing).
- `merchMessages` — per-weather-state headline + CTA copy. Add a collection URL per state when this meets a real store.
- `weatherMap` — WMO code → display text, merch condition (`rain`/`cold`/`default`), and icon. Unknown codes fall back safely.
- `getMerchCondition` — the "cold" threshold (feels-like < 8°C) lives here.

All of these are exactly what a Shopify `{% schema %}` would expose as theme settings.

## The commercial angle

This is a merchandising feature wearing a weather widget, not the other way round — the forecast is just the trigger for showing the right products at the right moment.

- **Context-driven selling:** "it's going to rain 88% on Thursday" next to "Waterproofs are 20% off" is a genuinely relevant pitch, not a generic banner. Weather is one of the strongest short-term demand signals in outerwear retail.
- **Personalised by default:** the panel opens on the store's weather with staff-pick framing ("What we're wearing today" + Our Store badge) — social proof from real people at a real place. The moment a shopper searches their own town or destination, the same panel becomes *their* forecast and a trip-prep checklist ("Where are you off to?"). Their last location is remembered, so returning visitors land on something personal without logging in.
- **In the real world** this would go further: IP/geolocation for a first-visit local forecast, customer-account location as the default, per-state collection URLs so each CTA lands on a weather-matched collection, and weather-triggered campaign copy managed from theme settings.
- **Measurable:** each merch state has its own CTA, so click-through per weather state is trivially trackable — and the whole panel is A/B-testable against a static new-arrivals block to prove the uplift before it earns a permanent homepage slot.
- **Resilient by design:** if the weather API fails, the panel quietly becomes a standard new-arrivals section — the merchandising surface never goes dark.

## What I'd do next with more time

- Package as a Shopify section (`sections/weather-panel.liquid`) with `{% schema %}` settings for the store location, title/explainer copy, and the per-weather headline + CTA + collection URL (the `merchMessages` object is already shaped for this).
- Real product cards fed by the matched collection, replacing the skeletons (and removing their `aria-hidden` once they're real content).
- Cache the forecast in localStorage with a short TTL so repeat visits don't re-hit the API.
- Postcode search — Open-Meteo's geocoder only matches place names, so I'd add postcodes.io (also free/keyless) as a fallback.
- Keyboard navigation (arrow keys) through the search results, and a °C/°F toggle.
- Small JS fallback for carousel arrows/dots in Firefox/Safari (see flags below).


## How I used AI

Built with Claude Code as a pair, working in small reviewed steps (the commit history reflects the actual build order: console-tested data layer → UI wiring → styling passes).

- **What it wrote:**  The fetch/geocode layer, render functions, CSS & Markup Foundations. I directed the approach: API-first with a console-testable data layer before any UI, what to build at each step, and all the UX calls (dropping the retry button in favour of re-search, overlay dropdown, store badge, spoof tool, carousel behaviour, the failure-fallback ladder).
- **What I changed:** I edited the code directly as well as through the AI — reworked the JS smoke test and its cases, rewrote comments in my own voice, simplified the theming config to a single hex brand token, and stripped bits I didn't want (visible search label, eyebrow line, the dev smoke test once the UI covered it). Tested every step in the browser/console myself. Most of the QA was me spotting what the AI missed — carousel arrows hanging off the card, the dropdown shoving the layout down, dead space from the status line, a demo assertion that had drifted out of sync — and sending it back until each was right.
- **What it got wrong:** the CSS-only carousel arrows were mispositioned twice (`position-area` keywords span differently than expected — they ended up off the card, then at the viewport edge) before screenshots caught it; a refactor crashed under Node by calling a function before its `const` was initialised; it put a mobile media query above the base rules it needed to override, so the cascade silently ignored it; and it misdiagnosed a "mobile overflow" that turned out to be headless Chrome's minimum window width, not a real bug — worth knowing screenshots can lie.


Total Time :1hr 48min (inc design & thought process)