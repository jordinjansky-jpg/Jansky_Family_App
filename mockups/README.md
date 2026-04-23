# Design mockups

These are static HTML mockups to align on the UI direction before writing the spec. Open any file in a browser. They share `design-system.css`.

## Files

- **01-dashboard.html** — Phone-first Dashboard. Quiet header, one banner slot, optional ambient strip (weather + dinner), task list with standard Card component. FAB for add-task. Five-slot bottom nav.
- **02-calendar-day.html** — Calendar in Week-default view with day detail. Header weather. View tabs, person-filter chips, Events → Tasks → Meals sections. School-imported meals tagged.
- **03-kid.html** — Kid mode. Fixed parent-escape gear top-right. Three-stat row, multiplier banner (kid-styled shared banner), large task cards (`.card.kid` modifier), tiles for Meals/Weather/Activity, trophy carousel.

## How to view

Just open the `.html` files in any browser. On desktop they render inside a phone-sized frame with shadows so you can judge the mobile layout. On a real phone they fill the screen.

## What these are NOT

- Wired up (no JS behavior, no data)
- Final pixels (colors/spacing will iterate)
- Production code (mockups live in `mockups/`, production is untouched)

## What to react to

- Tone: does it feel like a premium hub or a dev demo?
- Information density: too sparse, too packed, or right?
- Color palette: warm off-white + teal accent — keep, cool it down, or replace?
- Typography: system-font bold sans-serif — keep or try a display face for titles?
- Card shape: rounded-16, subtle border — keep or go softer/flatter?
- Kid mode: right balance of fun vs calm, or still too playful/too serious?
- Where backlog features live: meal tile, weather chip, activity tile, school lunch tag — are these homes right?

Once we align on tone/structure, I'll fold the mockup decisions into the final CLAUDE.md spec and we can start refactoring production.
