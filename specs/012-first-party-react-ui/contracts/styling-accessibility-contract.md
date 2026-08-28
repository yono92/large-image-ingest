# Contract: Styling And Accessibility

## Stylesheet Delivery

- Default styles are opt-in through `large-image-ingest/react-ui/styles.css`.
- Importing `large-image-ingest/react-ui` alone does not inject styles or access `document`.
- The package marks CSS as a side effect so direct stylesheet imports survive consumer tree shaking.
- The stylesheet scopes selectors beneath prefixed component classes/data attributes and does not reset host typography, buttons, inputs, or global box sizing.
- All public classes begin `lii-`; all public custom properties begin `--lii-`.

## Token Groups

The documented stable token set covers:

- surface/background/elevated surface;
- foreground/muted foreground/border;
- accent, success, warning, danger, and focus;
- font family, size scale, line height, and numeric font behavior;
- spacing scale;
- control height;
- radius and shadow;
- progress track/fill;
- motion duration and easing.

Tokens control visual presentation only. They cannot hide lifecycle states, remove required focus, or change action validity.

Internal layout classes and DOM nesting are not stable public contracts. Only explicitly documented root/state classes, data attributes, and tokens follow semantic versioning.

## Bounded Slots

Supported slots:

- panel header/description;
- safe derivative preview;
- supplementary selection guidance;
- supplementary recovery guidance;
- terminal-state follow-up action area.

Slots cannot replace the file input, live status region, progress semantics, core lifecycle controls, or error heading. Slot failures are isolated from controller operations and surface through the application callback.

## Responsive Contract

- One-column layout at narrow widths, including 320 CSS pixels.
- Actions wrap without horizontal page scrolling.
- Source names wrap or truncate with an accessible full-text path.
- Byte counts use tabular numerals when available and remain readable when labels wrap.
- At 200% zoom, no control, error, recovery choice, or verification result is clipped or covered.
- Component layout responds to its available container where practical rather than assuming full viewport width.

## Keyboard And Focus Contract

- The dropzone contains or labels a native file input and remains operable without drag/drop.
- Enter/Space activation follows native button/label behavior; no custom key simulation overrides native semantics.
- Tab order follows visible reading order.
- Disabled actions are truly disabled and not represented only through CSS.
- When a user action produces a blocking validation/recovery error, focus moves to a stable error heading or the invalid control using a documented, non-looping rule.
- Reload recovery initially focuses the page normally; it does not steal focus merely because records exist.
- Cancel/discard confirmation is application-owned or uses an accessible bounded confirmation pattern; destructive recovery deletion is never silent.

## Status Announcement Contract

- One polite live region announces material phase changes, completion, verification result, and blocking errors.
- Chunk progress does not announce on every acknowledgement. Announcements are throttled to meaningful percentage or phase thresholds.
- Error alerts use assertive announcement only when immediate action is required.
- Visible status text remains present independently of the live region.

## Visual Accessibility Contract

- Default text, controls, borders required for understanding, and focus indicators meet the selected AA contrast target.
- Icons, if any are rendered inline, have text equivalents and never carry status alone.
- Success, warning, danger, paused, and verification states combine text plus shape/icon/border, not color alone.
- Reduced-motion preference removes non-essential transition and progress animation.
- Indeterminate activity avoids rapid flashing or continuous attention-grabbing motion.

## Test Obligations

For every default panel state:

- semantic DOM/accessibility scan with zero serious or critical violations;
- accessible-name and role assertions for input, controls, progress, error, recovery, and verification;
- keyboard-only happy path and pause/recovery path;
- reduced-motion style assertion;
- narrow, desktop, and 200% zoom browser checks;
- default and alternate-token theme screenshots or review artifacts;
- no global CSS leakage into a host fixture surrounding the panel.
