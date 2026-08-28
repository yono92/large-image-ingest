# Research: First-Party Inspection Upload UI

## Decision: Ship A Public Optional UI Surface In This Feature

**Decision**: Add a first-party `react-ui` surface to the existing package and ship a polished reference application in the same feature. The UI is reusable product code, not only an example. Uppy remains under integration documentation.

**Rationale**: The headless React contract has already shipped and the Uppy exercise proved the lifecycle can be composed through public APIs. Another example-only layer would improve demonstration but would not reduce adopter work. A public optional surface makes the library's inspection-specific value directly installable while preserving the headless path.

**Alternatives considered**:

- Example first, public package later: safest for API stability, but rejected because the current evidence already identifies stable responsibilities and the user explicitly wants a first-party experience.
- Replace the headless React surface: rejected because established applications need design-system freedom and the styled UI should be optional.
- Separate scoped package immediately: deferred because the repository already uses optional subpath exports and does not yet require a separate release cadence.

## Decision: Provide One Complete Panel And Composable Primitives

**Decision**: Export a complete inspection upload panel plus a provider and focused selection, source, validation, progress, controls, recovery, error, and verification components.

**Rationale**: A single panel minimizes time-to-value, while primitives prevent a rigid dashboard from becoming unusable in established industrial layouts. Both layers share one presentation coordinator and one ingest controller.

**Alternatives considered**:

- Complete panel only: smaller API, but forces adopters to fork when layout requirements differ.
- Primitives only: repeats the current headless adoption problem and does not create an attractive default experience.
- General-purpose component toolkit: rejected because the feature should solve inspection ingest, not become a design-system library.

## Decision: Keep Transfer Authority In The Existing Controller

**Decision**: Introduce a UI presentation coordinator for selection, recovery discovery, verification display, labels, and pending control intent. It creates exactly one existing ingest controller through an application-supplied factory and never implements upload, retry, receipt, resume, or completion logic.

**Rationale**: The UI needs state beyond the controller—such as no selected source, safe recovery choices, and verification pending—but those are presentation concerns. Upload authority remains in core and the headless controller.

**Alternatives considered**:

- Let the panel construct transports and session options directly: rejected because it would bake provider and application policy into UI.
- Mirror controller state into an independent upload state machine: rejected because it creates conflicting lifecycle ownership.
- Require applications to compose all selection and recovery state: rejected because that is precisely the repeated coordination this first-party UI should own.

## Decision: Make Two Narrow Headless Contract Improvements First

**Decision**: Correct preflight validation failures to use the existing `validation.failed` error category and add additive preparation progress to the headless controller so the UI can distinguish validation/source preparation from transport creation. Preserve existing fields and controller operations.

**Rationale**: The Uppy evidence showed that message inspection is currently required to distinguish validation from transport failure, and `starting` hides checksum work that can be long for multi-gigabyte sources. A first-party UI should not institutionalize those workarounds.

**Alternatives considered**:

- Keep message-based classification in the UI: rejected because it is brittle and not a stable typed contract.
- Invent UI timers to simulate preparation progress: rejected because presentation would no longer be authoritative.
- Add a general new core lifecycle engine: rejected because the existing checksum callback and validated event can support the UI with small additive controller changes.

## Decision: Use Native Elements And Static CSS With No UI Runtime Dependency

**Decision**: Build the components from React and native browser elements, ship a separately imported static stylesheet, prefix all classes and custom properties, and add no component framework, icon package, CSS-in-JS runtime, or uploader dependency.

**Rationale**: Native file input, button, progress, list, output, and status semantics cover the workflow. Static CSS keeps bundle and runtime cost small, works with server rendering, and avoids forcing styling infrastructure onto non-UI consumers.

**Alternatives considered**:

- CSS-in-JS: rejected because it adds runtime and server-rendering complexity.
- Tailwind-dependent package output: rejected because consumers should not need the library's build pipeline or class scanner.
- A third-party component system: rejected because it would impose visual and accessibility dependencies unrelated to ingest.

## Decision: Style Through Prefixed Tokens And Bounded Slots

**Decision**: Provide a default inspection-oriented theme, `--lii-*` custom properties, prefixed class names, root `className` and `style`, documented label overrides, and a small set of presentation slots. Do not expose arbitrary internal render callbacks for every element.

**Rationale**: Tokens cover common branding without making markup a permanent public contract. Bounded slots support product-specific header, derivative preview, and supplementary guidance while lifecycle components retain semantic ownership.

**Alternatives considered**:

- Make every element replaceable: rejected because it multiplies API surface and makes accessibility unenforceable.
- Shadow DOM: rejected because React application theming and server rendering become harder.
- Fixed theme only: rejected because industrial adopters commonly have established design systems.

## Decision: Treat Preview As An Explicit Caller-Supplied Derivative

**Decision**: Render no source preview by default. Accept only an explicit preview descriptor or slot identified as a derivative, with caller-provided URL, accessible label, and lifecycle. Never call `FileReader`, `createImageBitmap`, canvas decoding, or full-source object URL generation inside the UI.

**Rationale**: Very large TIFF and inspection sources may be expensive or impossible to decode safely in the browser. The project constitution requires presentation artifacts to remain separate from the original.

**Alternatives considered**:

- Automatically show browser-supported image previews: rejected because behavior becomes format- and size-dependent and blurs original/derivative identity.
- Generate a thumbnail in the UI package: rejected because derivative generation belongs to a separate adapter and manifest path.
- No preview extension point: safe but unnecessarily limits polished host applications that already own derivatives.

## Decision: Build Recovery From Safe Summaries

**Decision**: The coordinator reads an application-supplied existing resume store, immediately projects recoverable records into minimal safe summaries, retains opaque record identifiers internally, and requires source compatibility before enabling Resume. Multi-tab ownership is surfaced as an application responsibility in the first release.

**Rationale**: Recovery is core product value, but full resume records can contain sensitive transport evidence. The UI needs filename, size, updated time, progress, and compatibility outcome—not remote URLs or receipts.

**Alternatives considered**:

- Pass full records into render callbacks: rejected as an unnecessary exposure surface.
- Hide recovery from the default panel: rejected because resumability is a primary differentiator.
- Persist source bytes in browser storage: rejected because it is impractical for multi-gigabyte inspection images and changes the security model.

## Decision: Keep Stored Verification Application-Supplied And Explicit

**Decision**: Accept an optional completion-verification adapter that returns a safe verified, failed, or unavailable result. If absent, show “verification not configured” after transfer completion rather than claiming success.

**Rationale**: Stored-original verification usually occurs behind a server or storage gateway and cannot be inferred from browser transport completion. The UI needs a provider-neutral callback, not a backend implementation.

**Alternatives considered**:

- Treat transport completion as verification: rejected because it weakens the product's integrity claim.
- Require one verification endpoint shape: rejected because storage targets differ.
- Omit verification UI: rejected because it hides a core distinction the library is designed to preserve.

## Decision: Target Accessibility As A Release Contract

**Decision**: Use native semantics, labeled controls, one restrained live-status channel, visible focus, keyboard-complete interactions, reduced motion, non-color status cues, AA contrast, responsive layouts, and 200% zoom support. Validate semantics in DOM tests and critical keyboard/responsive journeys in a credential-free browser suite.

**Rationale**: File selection and long-running recovery are operational workflows, not decorative demos. Accessibility defects would become public component defects once the UI ships.

**Alternatives considered**:

- Documentation-only accessibility guidance: rejected because the default component owns its markup and styling.
- Automated scanner only: rejected because focus order, drag/drop alternatives, live announcements, and zoom require interaction checks.
- Full localization system in v1: deferred; label overrides provide a bounded initial path.

## Decision: Use Layered Verification And A Dedicated Reference App

**Decision**: Add reducer/coordinator unit tests, component DOM and accessibility tests, controller contract tests, package export/style tests, a dedicated first-party reference app, browser keyboard/responsive scenarios, existing 10-trial recovery evidence, and the full repository release gates.

**Rationale**: The UI adds public behavior, CSS packaging, lifecycle composition, and visual accessibility risks that type checking alone cannot catch. The reference app should reuse provider-neutral local transfer infrastructure rather than depend on Uppy.

**Alternatives considered**:

- Snapshot tests only: rejected because they do not prove semantics or interaction.
- Browser tests only: rejected because state matrices and failures are faster and more precise under deterministic fakes.
- Reuse the Uppy page as the official demo: rejected because it would keep Uppy as the visible product identity.
