# 0% design rules

One visual language for the public site, the scan pages and the signed-in app. Check new work against this list.

## Mood
Space + machine learning, dark and calm. The background supports the content and never competes with it: no twinkling stars, a sparse neural field, a small backdrop network. Effects are allowed only where listed below.

## Colour
- Background: ink-950…ink-700. Text: `fg` (#e9edf7), `fg-muted` (#9aa3b8), `fg-subtle` (#8a92ae, the lightest grey allowed for text).
- One accent (`accent`, blue) for actions and live data; `cyan` and `violet` only as secondary signal colours; `ok` / `warn` / `risk` only for status.
- No new hues without a reason.

## Type
- Geist for text, Geist Mono for labels, numbers and code. Georgia only where already used for document text.
- Sizes: page title 36–48px (PageHeader, and AppHeader on public pages via `.public-shell`); app page title 24–28px; section title 30–44px; body 15–16px; secondary 13–14px; labels 11px.
- **Nothing a user needs to read is smaller than 11px.** Smaller mono text is allowed only inside decorative visuals (terminal, document, mock dashboard) whose content is also given elsewhere in real text.

## Components
- Cards: `Card` (glass) / `Card strong` (glass-strong), radius 16–24px. Don't hand-roll card backgrounds.
- Buttons: `buttonClasses` liquid glass only. No opaque coloured buttons.
- Page headers: `PageHeader` on marketing pages, `AppHeader` in the app and on the (scan) pages.
- Badges for status, `Eyebrow` (mono, 11px, uppercase, accent) above section titles.

## Effects: where they are allowed
| Effect | Where |
|---|---|
| Particle headings (h1/h2) | Public pages only; never in the signed-in app, never in the footer |
| Document + agent terminal | The product visual: home hero, scan page. Terminal under the document on phones |
| 3D sphere network | Pattern Engine section only |
| Reveal entrance | Any section |
| Background (galaxy, nebula, field, landscape) | Global, kept dim |
Anything else (glows, pulsing dots, rings of neurons, floating chips) needs a reason and should not cover text.

## Honesty
Visuals with ML metrics are illustrative and must not claim to measure the user's text. The Pattern Engine is deterministic statistics. Wording is about writing clearly, never about evading detection.
