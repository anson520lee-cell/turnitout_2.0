# 0% design rules

One visual language for the public site, the scan pages and the signed-in app. Check new work against this list.

## Mood
Space + machine learning, dark and calm, drawn mostly with 1px lines. The background supports the content and never competes with it: no twinkling stars, a sparse neural field, a small backdrop network. Effects are allowed only where listed below.

## Colour
- Background: ink-950…ink-700. Text: `fg` (#e9edf7), `fg-muted` (#9aa3b8), `fg-subtle` (#8a92ae, the lightest grey allowed for text).
- One accent (`accent`, blue) for actions, live data and "you are here" marks; `cyan` and `violet` only as secondary signal colours; `ok` / `warn` / `risk` only for status.
- Lines: `--line` for rules between things, `--line-strong` for the one rule that heads a list or a page. No glow on lines, except the 1px "you are here" marker.
- No new hues without a reason.

## Type
- Geist for text, Geist Mono for labels, indices (`01`, `02` …), numbers and code. Georgia only where already used for document text.
- Sizes: page title 36–48px (PageHeader, and AppHeader on public pages via `.public-shell`); app page title 24–28px; section title 30–44px; app figures 44–60px (tabular); body 15–16px; secondary 13–14px; labels 11px.
- Headlines are two lines: the second is the same words' 1px outline (`Headline` / `PageHeader` `outline`). The app keeps one-line titles.
- **Nothing a user needs to read is smaller than 11px.** Smaller mono text is allowed only inside decorative visuals (terminal, document, mock dashboard) whose content is also given elsewhere in real text.

## Components
- Cards: `Card` (glass) / `Card strong` (glass-strong), radius 16–24px. Don't hand-roll card backgrounds. In the app, prefer no card at all: figures on hairlines (`.app-stats`), lists as ruled rows (`.app-list` / `OrderRow`).
- Buttons: `buttonClasses` liquid glass only. No opaque coloured buttons.
- Page headers: `PageHeader` on marketing pages, `AppHeader` in the app and on the (scan) pages. Long text pages use `ProseDoc` (numbered sections, an "On this page" index on wide screens).
- Lists: an index in mono, the row's text, then status and an arrow. Filters are tabs on one hairline (`.app-tabs`); the one in use is underlined in accent.
- Progress: `OrderTimeline`, one thin line, lit up to "now".
- Badges for status, `Eyebrow` (mono, 11px, uppercase, accent, after a short hairline) above section titles.
- Every page view keeps working data visible: labels, real links, keyboard support and a visible focus ring (2px accent).

## Effects: where they are allowed
| Effect | Where |
|---|---|
| Essay under the lens (WebGL glass sheet, lens with contour lines, lines that lift) | Home page only: the hero and its four chapters (Paste, Read, Report, Refine). Sample essay and example data only; reduced motion rests the lens on one sentence |
| Scroll stories (a pinned example that changes as you scroll: "From draft to report", the five-step rail) | How it works and the home page. Example text only, labelled as an illustration |
| Build entrance (1px outline traces the card, then it fills) and line rises | Any public section, following the scroll |
| Document + agent terminal | The product visual on the scan page. Terminal under the document on phones |
| Signed-in app | Quick and quiet: the title rises, rules draw in, list rows rise once, a 1px line traces each panel once, the page marker slides. No pointer light, no tilt, no corner brackets |
| Sign-in, ordering and payment | Plain and instant: no entrance on forms, nothing moves in the way of a field or a button |
| Hover and press | Everywhere: visible within 0.2s (colour or rule first), then the movement; a thin ring from the press point |
| Background (galaxy, nebula, field, landscape) | Global, kept dim |
Anything else (glows, pulsing dots, rings of neurons, floating chips) needs a reason and should not cover text. With reduced motion everything is simply there.

## Honesty
Visuals with ML metrics are illustrative and must not claim to measure the user's text. The Pattern Engine is deterministic statistics. Wording is about writing clearly, never about evading detection.
