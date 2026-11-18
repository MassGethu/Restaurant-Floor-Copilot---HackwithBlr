GATE: OPEN 38 (rounds used up)

# UI review

The requested refresh is implemented. The taste skill's generic marketing-page gate remains open; it is not reported as passing. No waivers were added and no checker files were edited.

## Verified

- 18 frontend tests and the production build pass.
- Seven routes tested at 1440, 1024, 768, 390 and 320px: no horizontal overflow, no unnamed buttons, no page errors.
- Exception navigation, activity expansion, staff filter, availability control, mobile dialog, guest registration and ticket reload pass.
- Production performance audit at desktop and phone widths: **0 FAIL, 0 WARN**. One locally served font family, one loaded font file, no broken requests, zero measured layout shift. Timing is local CPU-browser evidence, not field data.
- The final design-gate run reports no text-contrast, focus, overlap, off-viewport or tap-size failures on the reviewed overview.

## Web Interface Guidelines review

Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

frontend/src/components/Layout.tsx:112 — pass — mobile icon link named; dialog state exposed; semantic navigation and skip link

frontend/src/components/ServiceFloorOverview.tsx:22 — pass — real operational data, descriptive table links, empty states and bounded queue preview

frontend/src/pages/AutonomyPage.tsx:253 — pass — labeled interventions, keyboard exception anchor, expandable bounded history

frontend/src/pages/CheckInPage.tsx:201 — pass — labeled touch inputs, autocomplete, progress semantics and ticket announcements

frontend/src/pages/WelcomePage.tsx:90 — pass — QR image dimensions and alt text, labeled URL field and native print action

frontend/src/design-system.css:1410 — pass — contrast corrections, visible focus, reduced motion, tabular counters and responsive layout

## Interpretation and limits

The open checks are listed in full below. They primarily require full-screen marketing heroes, conversion calls to action, decorative visuals, equal viewport margins instead of a sidebar, or promotional sections rather than application panels. Other findings include the standard dashboard practice of larger statistic numerals, count badges in headings, distinct active navigation and multiple panels at different levels. These were retained for the operating workspace. The gate's crop-based layout assumptions are not substituted for actual functional testing.

Reference, adaptation, voice, assets and font license are recorded in UI_DESIGN.md. No stock photos, invented restaurant claims or mock operational counts were added. Hardware phone scanning and screen-reader testing were not performed in this UI pass; the existing QR destination and guest flow remain functional.

## Full open gate findings

```text
gate: checking http://127.0.0.1:5176/autonomy (software); this takes a few minutes on a CPU Chrome
gate: rounds used up; 38 FAIL open
  FAIL hero-fill        main#workspace-main > div.autonomy-page > section.auto-summary "Actions recorded 32 Action  [1440, 390]
       the next section shows on the first screen: it starts at 265px on a 900px screen (the hero ends at 237px)
       fix: let the hero fill the first screen alone (min-height: 100svh, less above it): nothing of the next section on load
  FAIL flush            main#workspace-main > div.autonomy-page > section.auto-summary > div:nth-of-type(1) "Actio  [1440, 390]
       its first line sits 0px under the top edge of section.auto-summary, where the ground changes
       fix: give the section its padding at the edge where the ground changes (the closing call keeps a clear gap above the footer)
  FAIL flush            main#workspace-main > div.autonomy-page > section.service-floor-overview > div.service-flo  [1440, 390]
       its first line sits 0px under the top edge of section.service-floor-overview, where the ground changes
       fix: give the section its padding at the edge where the ground changes (the closing call keeps a clear gap above the footer)
  FAIL no-visual        main#workspace-main > div.autonomy-page > section.service-floor-overview "Your floor, righ  [1440, 390]
       no picture, effect or mock in this section; a feature section needs a visual
       fix: give the section a visual: a UI fragment on a ground, real icons, or a photograph that fits
  FAIL no-visual        main#workspace-main > div.autonomy-page > div.auto-grid > section.auto-panel.auto-incident  [1440, 390]
       no picture, effect or mock in this section; a feature section needs a visual
       fix: give the section a visual: a UI fragment on a ground, real icons, or a photograph that fits
  FAIL text-only        main#workspace-main > div.autonomy-page > section.auto-panel.auto-history "What the system  [1440, 390]
       the closing section is only text: no picture, icon, mock or effect in it
       fix: give the section a visual: a photograph that fits, the real icons, or a UI fragment on a ground
  FAIL card-visual      main#workspace-main > div.autonomy-page > section.auto-summary "Actions recorded 32 Action  [1440, 390]
       4 cards hold only text: no picture, icon, UI fragment or effect in any of them
       fix: give the cards a visual: an inset panel with a UI fragment, a photograph or real icons
  FAIL button-styles    (one screen)  [1440, 390]
       4 button styles on one screen: soft, fill #f7f9f3, outline #dde4d7 ("Shift handover"); soft, fill #e7eee3 ("Service overview"); soft, fill #2b5941 ("Add party"); soft, fill #2b5941, outline #2b5941 ("Review 3 exceptions"
       fix: one primary and one secondary button: one shape, one height per size, one label size
  FAIL button-styles    (the page)  [1440, 390]
       4 button styles on the page: soft, fill #e7eee3 x1 ("Service overview"); soft, fill #f7f9f3, outline #dde4d7 x5 ("Shift handover"); soft, fill #2b5941 x1 ("Add party"); soft, fill #2b5941, outline #2b5941 x1 ("Review 3 e
       fix: one primary and one secondary button: one shape, one height per size, one label size
  FAIL cta              main#workspace-main > div.autonomy-page > section.auto-panel.auto-history "What the system  [1440, 390]
       the last section before the footer ends with no button
       fix: add the action: a button in the hero, one on every priced item, one in the closing section
  FAIL copy-headline    div.autonomy-page > header.auto-heading > div:nth-of-type(1) > h1 "Service, in motion."  [1440]
       "Service, in motion." does not name what is sold (restaurant floor operations, restaurant, floor, operations, from flags)
       fix: put the category noun in the h1 (and who it is for, or where), in 2 to 8 words
  FAIL heading-scale    div.autonomy-page > section.auto-summary > div:nth-of-type(1) > strong "32"  [1440, 390]
       the figure "32" is set at 35px, larger than the section headings (h2 16px); 3 more like it
       fix: set figures at the h2 size or under: a stat reads as data, not as the heading
  FAIL section-gaps     div.autonomy-page > div.auto-grid > div.auto-aside > section.auto-panel:nth-of-type(2) / m  [1440]
       315px between these sections, +577% against the median 47px
       fix: use one gap between sections (all within 25% of each other)
  FAIL section-tile     main#workspace-main > div.autonomy-page > header.auto-heading "Service, in motion."  [1440, 390]
       the header and the first section fill 237px (0.26 screens at 1440x900; the section is 127px), shorter than the screen: the first screen shows 127px of it and 138px of the next section ("Actions recorded 32 Actions re"), 
       fix: make the hero exactly one screen (height: 100svh) with its content between the nav and 24px above the fold
  FAIL section-tile     main#workspace-main > div.autonomy-page > section.auto-summary "Actions recorded 32 Action  [1440, 390]
       the section is 138px tall (0.15 screens at 1440x900), shorter than the screen: its tile (the screen from its top) shows 138px of it and 456px of the next section, its heading "Your floor, right now." on screen
       fix: set every section after the hero to one screen or two (height: calc(var(--h,1) * 100vh)) and fit its content above --padb
  FAIL section-tile     main#workspace-main > div.autonomy-page > section.service-floor-overview "Your floor, righ  [1440]
       the section is 456px tall (0.51 screens at 1440x900), shorter than the screen: its tile (the screen from its top) shows 456px of it and 418px of the next section, its heading "Exceptions 3" on screen
       fix: set every section after the hero to one screen or two (height: calc(var(--h,1) * 100vh)) and fit its content above --padb
  FAIL section-tile     main#workspace-main > div.autonomy-page > div.auto-grid "Exceptions 3"  [1440]
       the section is 935px tall (1.04 screens at 1440x900), not one screen or two: the screen one screen on from its top (scroll 1601px, held at the page's end) shows 243px of it and 541px of the next section, its heading "Wha
       fix: set every section after the hero to one screen or two (height: calc(var(--h,1) * 100vh)) and fit its content above --padb
  FAIL section-tile     main#workspace-main > div.autonomy-page > section.auto-panel.auto-history "What the system  [1440]
       the section is 541px tall (0.60 screens at 1440x900), shorter than the screen: its tile, held at the page's end (scroll 1601px) shows 541px of it and 243px of the section above ("Exceptions 3"), its text "Table 4: no ava
       fix: set every section after the hero to one screen or two (height: calc(var(--h,1) * 100vh)) and fit its content above --padb
  FAIL run-on           h2#queue-preview-title "Waiting list 3"  [1440]
       "Waiting list | 3": the heading runs its first sentence into the grey second one with no stop
       fix: end the heading's first sentence with a full stop before its grey second one ("Rooms and prices. Breakfast included.")
  FAIL run-on           h2#exceptions-title "Exceptions 3"  [1440]
       "Exceptions | 3": the heading runs its first sentence into the grey second one with no stop
       fix: end the heading's first sentence with a full stop before its grey second one ("Rooms and prices. Breakfast included.")
  FAIL moment-none      (the page)  [1440]
       a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)
       fix: deal one (moments.mjs pick --page software) and mount it in its own section
  FAIL hero-screen      main#workspace-main > div.autonomy-page "YOUR SERVICE WORKSPACEService, in motion"  [1440]
       the hero ends at 2471px on a 900px screen, 1571px below the fold: it ends at the fold, 1px either way (SR-1)
       fix: make the hero exactly one screen (height: 100svh, its content fitted inside), never taller or shorter
  FAIL section-height   main#workspace-main > div.autonomy-page "YOUR SERVICE WORKSPACEService, in motion"  [1440]
       the section starts at 110px, 110px below the screen grid (0 x 900px): sections start on whole screens (SR-2)
       fix: make every section above it exactly one or two screens tall, so this one starts on a whole screen
  FAIL one-section      main#workspace-main > div.autonomy-page "YOUR SERVICE WORKSPACEService, in motion"  [1440]
       a <div> sits directly in <main>: every part of <main> is a <section> (SR-4)
       fix: put every block of <main> in a <section>, and give a band its own section instead of a ground inside one
  FAIL one-heading      div.service-floor-map > header.service-section-head > div > h2 "Your floor, right now."  [1440]
       the hero holds an h2 (6): its heading is the h1, and an h2 opens the next section (SR-5)
       fix: give each section one h2, first in its .wrap, and the hero only its h1
  FAIL container-edges  div#root > div.workspace > div.workspace-content > header.workspace-topbar "During service  [1440]
       the nav's content runs 258px from the left and 34px from the right (read from its outermost blocks: no .wrap): 258 and 34px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px either w
       fix: use one container on every section and the nav (.wrap): one margin left and right, 64-120px on a desktop, 16-24px on a phone
  FAIL container-edges  main#workspace-main > div.autonomy-page "YOUR SERVICE WORKSPACEService, in motion"  [1440]
       the content of section 1 runs 258px from the left and 34px from the right (read from its outermost blocks: no .wrap): 258 and 34px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px e
       fix: use one container on every section and the nav (.wrap): one margin left and right, 64-120px on a desktop, 16-24px on a phone
  FAIL container-edges  div#root "Skip to contentFloor CopilotTHE SERVICE "  [1440]
       a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)
       fix: build the page as header.nav, a main of sections (each one in-flow .wrap plus background layers) and footer.closing
  FAIL container-edges  h2#queue-preview-title "Waiting list 3"  [1440]
       the h2 starts 770px right of the container's left: every h1 and h2 starts on it, 2px either way (SR-6)
       fix: start the text on the container's left, or on the one split line every split shares
  FAIL container-edges  div.auto-aside > section.auto-panel:nth-of-type(1) > header > h2 "How service moves"  [1440]
       the h2 starts 769px right of the container's left: every h1 and h2 starts on it, 2px either way (SR-6)
       fix: start the text on the container's left, or on the one split line every split shares
  FAIL container-edges  div.auto-aside > section.auto-panel:nth-of-type(2) > header > h2 "Team workload"  [1440]
       the h2 starts 769px right of the container's left: every h1 and h2 starts on it, 2px either way (and 4 more like it: "Your floor, right now.", x 281, "Exceptions 3") (SR-6)
       fix: start the text on the container's left, or on the one split line every split shares
  FAIL row-lines        div.autonomy-page > section.service-floor-overview > div.service-floor-map > div.room-plan  [1440]
       a row of 4 items: its first item starts at 296px, its column's left line at 259px; its last item ends at 944px, its column's right line at 981px (2px either way) (SR-7)
       fix: start the row's first item on the container's left line and end its last on the right line, every item one height
  FAIL split-pair       main#workspace-main > div.autonomy-page > div.auto-grid "Exceptions 3Include resolvedAutom  [1440]
       the split's left column starts with a picture or a box, not text: text left, the visual right, on every split (SR-8)
       fix: put the text in the left column and the visual in the right, on every split
  FAIL flush            main#workspace-main > div.autonomy-page > section.auto-summary > div:nth-of-type(3) "Table  [390]
       its last line sits 0px above the lower edge of section.auto-summary, where the ground changes to section.service-floor-overview
       fix: give the section its padding at the edge where the ground changes (the closing call keeps a clear gap above the footer)
  FAIL flush            main#workspace-main > div.autonomy-page > section.service-floor-overview > aside.service-q  [390]
       its last line sits 0px above the rule on top of section.auto-panel.auto-incidents
       fix: give the section its padding at the edge where the ground changes (the closing call keeps a clear gap above the footer)
  FAIL no-visual        div.autonomy-page > div.auto-grid > div.auto-aside > section.auto-panel:nth-of-type(1) "Ho  [390]
       no picture, effect or mock in this section; a feature section needs a visual
       fix: give the section a visual: a UI fragment on a ground, real icons, or a photograph that fits
  FAIL no-visual        div.autonomy-page > div.auto-grid > div.auto-aside > section.auto-panel:nth-of-type(2) "Te  [390]
       no picture, effect or mock in this section; a feature section needs a visual
       fix: give the section a visual: a UI fragment on a ground, real icons, or a photograph that fits
  FAIL container        page  [1440, 390]
       no .wrap
       fix: put the content in one .wrap
  23 WARN (not blocking), first: flush h2#exceptions-title "Exceptions 3"; flush ol.auto-loop > li:nth-of-type(5) > a > s; flush div.auto-team > div:nth-of-type(4) > spa; flush main#workspace-main > div.autonomy-page ; flush main#workspace-main > div.autonomy-page 
Stop fixing: put these open FAILs and the waivers in your report, then finish.
GATE: OPEN 38 (rounds used up)

```
