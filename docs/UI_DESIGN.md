# Floor Copilot UI refresh

Software workspace for restaurant managers and staff. Primary action: review and resolve service exceptions.

Reference: the bundled Mercury DESIGN.md from VoltAgent's Awesome DESIGN.md collection. Adapt its 8px spacing system, light-weight variable sans typography, 12–16px panels, tonal separation and restrained action hierarchy to Floor Copilot's forest-green identity. Violet/lavender tokens and proprietary fonts are not used; self-hosted Inter is the reference's suggested substitute.

The operational dashboard keeps several useful regions on screen. Its actual floor state and queue are the main product visual. Full-screen marketing heroes, decorative shaders and stock restaurant photographs would obscure service work and are not used. The taste skill's marketing composition checks are reported separately from functional/accessibility checks.

- Shell: light sidebar, clear active navigation, date and direct guest QR entry.
- Overview: airy heading, four service totals, real table-state preview and live waiting list, then exceptions, staff workload and decision history.
- Floor and jobs: same surfaces, typography, controls and status colors.
- Guest pages: focused welcome card, large touch inputs, uncluttered QR sign and assignment ticket.
- Motion: one short heading entrance, subtle hover/press feedback, no recurring animations; reduced-motion support.
- Accessibility: visible focus, semantic links and buttons, labeled inputs, tabular numeric data, safe mobile spacing and no decorative data.

Guidelines reviewed: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

Voice: calm, direct service language; real table and queue data throughout. No invented business claims, stock photography, stand-in assets or new brand names.

Font: self-hosted Inter Variable, SIL Open Font License; a copy ships at `/inter-font-license.txt`.
