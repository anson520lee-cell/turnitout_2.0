# 0% design rules

One visual language for the public site, the scan pages and the signed-in app. Check new work against this list.

## Mood
Space + machine learning, dark and calm. The background supports the content and never competes with it: no twinkling stars, a sparse neural field, a small backdrop network. Effects are allowed only where listed below.

When enriching an existing page, preserve its gradual darkening, space backdrop, fine linework, type and layout. Choose motion for a specific reading task, such as tracking a sentence from a report back to its paragraph.

Let people discover the artwork through its response to movement and touch. Reserve visible labels for the document, its data and actual destinations. Keep keyboard controls accessible by name.

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
| Sentence reading guide | The home illustration typesets the sample essay on a sheet, which answers in layers on separate clocks (`components/visuals/manuscript-motion.ts`): a hairline under the sentence being read moves in the same frame as the pointer; the sentence lifts off the page only after a short rest (~0.2 s), its neighbours less and later; what the pointer passed floats a moment, then settles; light under the paper builds while the pointer rests and fades last. A quick sweep throws ink instead of lifting lines. A press lifts the sentence further and its release sends a wave across the sheet. Touch: a drop of ink where the finger lands, a tap lifts that sentence, a sideways drag reads along the lines. The word chart, the keyboard and a tap raise the chosen sentence the same way, and the readout below follows. Reduced motion keeps the sheet flat and still, with the hairline and the printed highlight only. |
| Workflow chapters | The five report steps use native scrolling to move a horizontal strip of draft, access, allowance, optional quote and paragraph map. One smoothed scroll position drives the strip, the rolling step number, a thumb on the step bar and each frame's drawing, so a visitor who stops between two steps sees both part way, and scrolling back reverses it. Each step's top rule fills as the reading line passes. The same thin progress rule follows reading in the public navigation. |
| Report paragraph map | Pointing at a bar or stepping between paragraphs reveals an excerpt from that report; the other bars step back. The excerpt opens its source sentence. Any link into a sentence of the report lands with a highlighter drawn along that sentence once it is in view, a lit paragraph rail, and focus on the sentence. |
| Press feedback | Buttons (`.btn-fx`) and other clickable surfaces (`[data-press]`) sink and drop a ripple at the press point within the frame of the press, on mouse and touch. Keep login, submit and payment to this alone, so they stay fast and plain. |
| Document + agent terminal | The product visual: home hero, scan page. Terminal under the document on phones |
| 3D sphere network | Pattern Engine section only |
| Reveal entrance | Any section |
| Background (galaxy, nebula, field, landscape) | Global, kept dim |
Anything else (glows, pulsing dots, rings of neurons, floating chips) needs a reason and should not cover text.

## Honesty
Visuals with ML metrics are illustrative and must not claim to measure the user's text. The Pattern Engine is deterministic statistics. Wording is about writing clearly, never about evading detection.
