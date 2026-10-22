# NEHS Student Rights Design System

This contract records the existing shared UI and its chrome unification. Sources: `app/globals.css`, `app/layout.tsx`, `components/Navbar.tsx`, and the shared `components/rights/` components. Theme behavior remains intact; chrome changes are presentational only.

## 1. Atmosphere & Identity

A Traditional Chinese campus service with white/slate surfaces, bold navigation, restrained blue actions, and neutral rounded controls. Preserve existing typography, content, layout, auth feedback, and footer.

## 2. Color

### Locked semantic palette

Five semantic families: page background, card surface, primary action, danger, and text. Text has primary and secondary ink; action-label aliases reuse existing palette colors rather than adding color families. Hex values below are the source of truth, including the blue-700/blue-400 and gray/slate family swatches.

| Role | CSS variable | Tailwind v4 utility | Light | Dark |
| --- | --- | --- | --- | --- |
| Page background | `--background` | `bg-background` | `#F8F7F4` | `#0A0A0A` |
| Card surface | `--surface` | `bg-surface` | `#FFFFFF` | `#141414` |
| Primary action | `--primary` | `bg-primary` / `text-primary` | `#1D4ED8` (blue-700 family) | `#60A5FA` (blue-400 family) |
| Danger | `--danger` | `bg-danger` / `text-danger` | `#C41E2A` | `#E5484D` |
| Primary text | `--foreground` | `text-foreground` | `#111827` (gray-900) | `#F1F5F9` (slate-100) |
| Secondary text | `--muted-foreground` | `text-muted-foreground` | `#6B7280` (gray-500) | `#94A3B8` (slate-400) |
| Primary action label | `--primary-foreground` | `text-primary-foreground` | `#FFFFFF` (card surface) | `#0A0A0A` (page background) |
| Danger action label | `--danger-foreground` | `text-danger-foreground` | `#FFFFFF` (card surface) | `#0A0A0A` (page background) |

The label tokens are for filled actions. Use the action/danger color itself for text on page/card surfaces; do not use a white label on either dark-theme accent fill.

### Contrast contract

WCAG relative luminance uses sRGB linearization (`c / 12.92` at `c <= 0.04045`, otherwise `((c + 0.055) / 1.055)^2.4`), weights `0.2126 / 0.7152 / 0.0722`, and `(Llighter + 0.05) / (Ldarker + 0.05)`. Ratios are rounded to two decimals; thresholds are checked before rounding.

| Ink / background pair | Light page | Light card | Dark page | Dark card |
| --- | --- | --- | --- | --- |
| Primary text | 16.56:1 | 17.74:1 | 18.07:1 | 16.82:1 |
| Secondary text | 4.51:1 | 4.83:1 | 7.72:1 | 7.18:1 |
| Primary action text | 6.26:1 | 6.70:1 | 7.79:1 | 7.25:1 |
| Danger text | 5.50:1 | 5.89:1 | 5.06:1 | 4.71:1 |

Filled primary actions with their label token: 6.70:1 light / 7.79:1 dark. Filled danger actions with their label token: 5.89:1 light / 5.06:1 dark. Body text exceeds the preferred 7:1; secondary and semantic accent text exceed 4.5:1 on both page and card surfaces. The light secondary/page pairing has little contrast headroom: do not reduce its opacity.

### Existing component colors

| Role | Existing token | Light | Dark |
| --- | --- | --- | --- |
| Navbar surface | `--surface` | `#FFFFFF` | `#141414` |
| Control ink | Tailwind `neutral-700` / `neutral-200` | `neutral-700` | `neutral-200` |
| Hover wash | Tailwind `neutral-100` / `neutral-800` | `neutral-100` | `neutral-800` |
| Press wash | Tailwind `neutral-200` / `neutral-700` | `neutral-200` | `neutral-700` |
| Keyboard focus | Tailwind `blue-500` | `blue-500` | `blue-500` |
| Focus offset | `--surface` | `#FFFFFF` | `#141414` |

The effective theme is the `.dark` class on `<html>`; its absence means light. Tailwind v4 `dark:` variants, all semantic variables, the body background/foreground, and CSS `color-scheme` must share this source of truth. On first visit, resolve `prefers-color-scheme: dark`; a valid `nehs-rights-theme` storage value (`light` or `dark`) overrides it. Initialization must not write an override. Do not add an OS media-query color override: a saved light preference on a dark OS must retain the light body background and ink.

## 3. Typography

Load Inter and Noto Sans TC once through `next/font/google` in the root layout. Expose their CSS variables on `<html>` and use this stack for the body and Tailwind `font-sans`: `var(--font-inter), var(--font-noto-sans-tc), "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`. Inter remains first with its existing Latin subset and automatic metric fallback; Noto Sans TC supplies Traditional Chinese glyphs without taking over Latin text. Noto uses variable weights, `display: swap`, and `preload: false` so its automatically segmented Chinese glyph ranges are loaded on demand rather than preloading another Latin subset. Its system CJK fallbacks are explicit in the shared stack.

The following named Tailwind type tokens include size, line-height, and weight in `app/globals.css`. They document future component usage only: no global heading/caption selectors and no component class changes are part of this foundation task.

| Role | Tailwind token | Size | Line height | Weight | Purpose |
| --- | --- | --- | --- | --- | --- |
| H1 | `text-h1` | 1.875rem (30px) | 2.25rem (36px) | 800 | Page title |
| H2 | `text-h2` | 1.25rem (20px) | 1.75rem (28px) | 700 | Section title |
| Body | `text-body` | 1rem (16px) | 1.5rem (24px) | 400 | Base reading text; applied to `body` only |
| Caption | `text-caption` | 0.75rem (12px) | 1rem (16px) | 400 | Metadata and captions, with secondary ink |
| Secondary | `text-secondary` | 0.875rem (14px) | 1.25rem (20px) | 400 | Supporting copy, with secondary ink |

Existing component scale values and bold/extrabold emphasis stay unchanged: `text-xs` captions, `text-sm` secondary/body controls, `text-base` drawer headings, `text-lg` navbar brand, and `text-xl` section headings. The theme button remains icon-only.

## 4. Spacing & Layout

Use the existing Tailwind spacing scale (base `1` = 4px): `2` = 8px, `3` = 12px, `4` = 16px, `5` = 20px, `6` = 24px, `11` = 44px, and `16` = 64px. Navbar: `max-w-7xl`, `px-4`, `h-16`, `gap-3`; action cluster: `gap-2 sm:gap-3`. The theme target is `min-h-11 min-w-11`, non-shrinking, with a `size-5` icon. It stays in the top action cluster at every breakpoint, independently of drawer visibility or login state. Keep existing document and drawer scroll ownership.

## 5. Components

### Navbar neutral icon button

- Structure: native `button`, decorative Lucide SVGs, no wrapper surface.
- Tokens: the control ink and hover/press washes above, `rounded-xl`, 44px square minimum, 20px icon.
- States: neutral default; hover and press use neutral washes; keyboard focus uses `ring-2 ring-blue-500 ring-offset-2`, with the dark surface offset. No accent border marks selection.
- Theme variant: stable Traditional Chinese label `深色模式`, `aria-pressed` indicates effective dark mode, and a title names the next theme. Moon offers dark mode; Sun offers light mode. Both SVGs are hidden from assistive technology.
- Hydration: preserve the target's geometry and deterministic markup; disable the control until client initialization supplies its effective state. CSS selects the appropriate icon from the root theme.

### Existing shared feedback and continuation

`ActionFeedback` retains alert/status semantics. `PageContinuation` retains its `min-h-11`, rounded neutral surface, disabled state, and blue focus ring, using the shared secondary-button recipe.

### Page-owned operation lifecycle

- `/feedback` and `/proposals` extend the existing identity-generation-scoped draft owner with operation slots and authoritative ballot snapshots, using the existing in-memory map store. Explicit logical keys (`reply:id`, `control:id`, `vote:id`, `review:id`, plus item deletion and comment keys) retain pending/result/error/uncertain state through tab filtering. Approve/reject share one review flight. No inactive cards stay mounted, no mutation replays automatically, and a second invocation during a flight neither POSTs nor acknowledges again.
- A stable `RightsOperationFeedback` region sits inside the page content, outside removable cards and tab selection. It uses the existing neutral card, `p-3`, `text-sm`, semantic foreground/danger ink, wrapping content, and the shared blue keyboard-focus ring. Its item/action-labelled pending or final message persists until another operation updates it. One polite, atomic live region announces shared operations; inline errors and conflict/reload controls remain next to each card with duplicate live announcements disabled. Standalone consumers retain their inline feedback.
- In the default admin Awaiting queue, saving a reply may remove the card and update the server counts without changing the selected tab. Its success remains visible and announced; viewing Replied is optional, not a prerequisite to perceiving completion. Delayed deletion reconciles the currently selected queue and removes any remounted row.
- Recover focus to the stable announcement (`tabIndex=-1`) only when focus belonged to the disappearing row and the user has not focused or pointed elsewhere. A clicked tab, another field, or other intentional focus target always wins. Recovery occurs after the result DOM commits, never to an approval/deletion control. Document scroll and sticky geometry remain unchanged; no animation or new motion token is introduced.
- A live page owner applies successful receipts, draft snapshot acknowledgements, and current-filter refresh even after a card unmounts. Owner retirement on account/status/role/generation change or page unmount discards every late effect, including acknowledgement, reconciliation, announcement and focus. Development StrictMode's cleanup/setup cycle must not permanently retire the reused owner. Existing draft snapshot comparison and original write bases remain authoritative.
- Ballots retain confirmed counts/viewer state and unresolved uncertainty across tabs. Uncertain outcomes reconcile via public server reads, never POST replay; failed reconciliation keeps the action blocked with an explicit refresh control. A stale list object or read begun before a newer receipt cannot overwrite that receipt. Comment refresh targets only a currently mounted comment list; absence of that list never loses the successful draft acknowledgement or page result.
- This lifecycle exception supersedes the older queue-task exclusions on shared mutation/draft changes only for this group. No new dependencies, backend/API/SQL/auth/theme edits, visual redesign, or new scroll container. Parent owns final manual browser snapshots and independent review; component/E2E evidence must distinguish default Awaiting success, remount singleflight, unknown outcome and retired identity.

### Session verification readiness

- The last server-verified identity remains presentation, not new authority. Background checks use independent latest-request sequencing, cancellation and a readiness epoch (`ready`, `checking`, `unavailable`). Same-account sign-in/refocus, transport errors, timeouts, 503s and malformed responses retain `verified` presentation, administrator labels, generation, mounted composers and page-owned drafts. Name-only metadata updates do not retire the owner. Verified account ID, email or role changes, real 401/403, sign-out and logout start retire the previous identity scope and every late effect.
- Only `ready` permits a new protected action. Every write uses the mutation hook's synchronous readiness guard before a request; vote readiness is checked before any ballot snapshot change. Submit/save/delete/review/vote controls use the shared disabled appearance while verification is paused. Fields, categories, anonymity options, tab navigation and local editing remain available unless an existing mutation flight already disables them. Do not put verification-disabled state on a whole form or fieldset. Recovery never replays a write; the user must explicitly submit again.
- Private author lookups pause with readiness. Previously revealed attribution disappears immediately when the readiness epoch changes, and late responses from that epoch cannot restore it. Recovery requires another explicit reveal; neither retry nor collapse/expand grants fresh disclosure. Admin-only pending-queue reads also check readiness before any request and before accepting a result, without clearing mounted rows or drafts; an interrupted lookup retains rows with an explicit reload action. Public reads remain available.
- A stable verification banner lives outside the generation-keyed children. It uses the existing neutral `ui.card`, semantic foreground/secondary ink, `p-4`, `gap-3`, `text-sm`, wrapping copy, and a content-sized shared secondary button; the document retains scroll ownership. In `checking`, explain `正在重新驗證登入狀態` and disable the `驗證中…` action. In `unavailable`, explain `暫時無法驗證登入狀態`, explicitly state `草稿已保留，仍可繼續編輯；送出、儲存與作者查詢暫停`, and offer `重新驗證登入狀態`. Initial failure has no retained identity and explains that protected actions are not yet available. Retry verifies the session only. No automatic mutation replay, overlay, accent border or new motion is introduced.
- Phone/touch, keyboard and assistive-technology users receive the same state: native disabled actions, editable fields, one polite atomic status explanation, a 44px retry target and existing visible focus. Do not steal focus on background verification or announce a retained draft as lost. The banner and button remain separate from operation-result announcements.
- This group explicitly permits the scoped client verification/auth guards above without changing server authorization, SQL, queue contracts, theme, hash navigation, dependencies or existing operation lifetimes. Component regressions cover controlled response order, identity retirement, no protected requests while paused, retained mounted/page drafts and explicit recovery. Parent owns real-route browser snapshots and final visual QA; no browser, assistive-technology or Lighthouse pass is claimed here, and no new visual debt is accepted.

### Feedback triage tabs

- Keep document scroll ownership. The tablist is a direct child of the feedback page, `sticky top-16 z-20`, below the existing 64px navbar, with opaque `bg-background` and the shared `ui.border` bottom divider. Do not introduce an overflow ancestor or a second scroll container.
- Three equal-width native tabs: `全部`, `待回覆`, `已回覆`. Use `text-sm text-foreground` in every state; selected is bold with a flat `h-0.5 bg-primary` underline (the requested 2px tab indicator, not an accent outline on a rounded surface). Hover/press use the existing neutral washes; keyboard focus uses the existing blue ring, inset.
- Targets remain at least `min-h-11`, with `px-2 py-2 gap-1`; labels/counts stack at narrow widths and become inline at `sm` with `gap-2 px-4`. Each count keeps a `w-11 h-4` tabular-number slot, including while loading; the skeleton is `w-6 h-3 rounded bg-foreground/10` and may pulse only with motion allowed. Counts come exclusively from the queue API's full query-matching population, independent of pagination; separately fetched hash targets never contribute. Unknown counts use the loading skeleton or an em dash on failure, never zero or a loaded-item fallback.
- Use one stable `tabpanel`, labelled by the selected tab. Roving tab stops, wrapping Left/Right arrows, Home/End, Enter/Space and visible focus support keyboard users. Empty-awaiting navigation moves focus to the replied tab. Selection is synchronous, with no panel animation or delayed input.
- The page integrates the unchanged cards with descendant scroll-margin utilities: `scroll-mt-36` (144px) at narrow widths and `sm:scroll-mt-32` (128px), clearing both sticky bars plus reading space. Deep-linked rows remain present even outside the selected filter; their public-read and retry behavior is unchanged.
- Default to awaiting for administrators and all for other readers. Each selection fetches the first server-filtered queue page; awaiting is globally oldest-first and other queues are newest-first, with no client reversal. Use the existing card/secondary-button recipes for empty states: `目前沒有待回覆建言` with `查看已回覆`, `尚無官方回覆`, and the unchanged all-items empty copy. Only a successful response with `total === 0` permits an empty-state claim; a partial list never means all work is done.
- Show `已載入 N／M 筆` using only queue rows for N and the server total for M (`—` until known). Filter/query/auth-generation changes discard the old page scope, without an inactive-tab cache. Load-more opens exactly one batch of 20; refresh reloads at most the number of batches already opened in the active scope. A late save refreshes the currently selected filter, not the filter where it began. Failed refreshes may retain cards/drafts but invalidate counts/totals until a trustworthy response arrives.
- External interaction/spatial catalog retrieval is skipped under the explicit no-network constraint; local interaction/layout references and the existing design contract supply the mechanics. Browser screenshots, sticky-layout and visual fidelity remain unverified under the existing local-only QA limitation.

### Proposal status tabs and pending-review rows

- Reuse the feedback triage tab recipe for geometry, count skeletons, neutral states, keyboard navigation, sticky position, stable panel and descendant scroll margins. Three tabs retain `px-2` until `md:px-4` so inline labels and fixed count slots fit at `sm`; labels do not wrap. Order is `全部` followed by `PUBLIC_STATUSES`: `處理中`, `已結案`; all readers default to `全部`. Fetch server filters `all`, `processing`, `closed` on selection, preserving globally newest-first order. Tab counts and totals describe the full query-matching public population; never infer them from loaded rows. An off-tab hash target remains rendered through its independent public read without changing selection or affecting counts.
- Each empty public filter uses the existing card recipe, secondary ink, centered `py-10` copy: the unchanged all-items message or `目前尚無處理中的提案。`, `目前尚無已結案的提案。`. Keep the existing empty-pending message and independent loading/error states.
- Pending review uses the separate admin-only `pending` queue, globally oldest-first from the server, within one neutral card (`p-4 sm:p-6`), not a stack of nested cards. Its heading reports `已載入 N／M 筆`; zero is shown only after a successful real-zero response. Public and pending loading, errors, totals and cursors remain independent. Rows use the shared neutral divider, `py-2`, and `gap-2` (8px). The document owns scroll. A shrinking `min-w-0 flex-1` native disclosure button holds a static `size-2 rounded-full bg-muted-foreground` status dot with the accessible label `待審核`, a single-line `truncate` title in existing `text-sm font-semibold`, and `text-xs text-muted-foreground` date · vote metadata. The summary and chevron share `aria-expanded` and `aria-controls` for the same mounted detail; activation toggles detail without changing the URL or issuing a public-item read. Private rows never claim a public `#item-<id>` anchor or substitute for a public deep-link read.
- The right-aligned action cluster uses `gap-2`, the existing primary `核准上架` and secondary `退回提案` recipes, and a neutral `ui.iconButton` disclosure. Every action has a minimum 44px target; labels stay untruncated. At narrow widths the left summary takes its own line and the action cluster wraps as needed, remaining right-aligned rather than overflowing or squeezing out the title.
- Disclosure is a native button with `aria-expanded`, `aria-controls`, a title-specific accessible name, visible focus and a decorative Lucide chevron. The hidden detail stays mounted so explicit author-lookup state survives collapse. Expanded detail reveals the full content, existing author attribution, `AuthorReveal`, `ActionFeedback` and the existing latest-data reload action. Content wraps, including unbroken strings; the summary title retains its full accessible text and a native title tooltip. Review buttons stop propagation, retain the rejection confirmation and `expectedVersion`, and open detail to expose result/conflict feedback. No automatic mutation replay, new draft store, panel animation or decorative motion is introduced.
- Existing page-owned control/comment drafts must survive tab unmount/remount unchanged, including their original write base. No card, composer, vote, comment, permission, author-redaction, RPC or API behavior is changed. Touch/keyboard users must be able to navigate, expand and review independently. Browser geometry, glyph rendering and real assistive-technology checks remain unverified under the explicitly requested local-only tooling constraints; no new design debt is accepted.

### Site-wide chrome recipes

`components/rights/ui.ts` is the shared Tailwind recipe source. Keep native elements and existing handlers; recipes add no state or behavior.

- **Card:** `rounded-2xl`, `bg-surface` (white in light mode, `#141414` in dark mode); one hairline `neutral-200` / `neutral-800` border and `shadow-sm`. Page background comes from `--background` (warm `#F8F7F4` / `#0a0a0a`, owned by the theme work). Use `p-4`, `p-5`, or `p-6` from the existing scale according to density. No colored admin or pending card variants.
- **Inset:** `rounded-xl`, `neutral-50` / `neutral-800/50`, without elevation; reserved for nested comment and attribution content, not a competing card style.
- **Primary button:** solid `bg-primary` with `text-primary-foreground`; `blue-800` hover / `blue-900` press in light mode, `blue-300` hover / `blue-500` press in dark mode. Geometry: `rounded-xl`, `min-h-11`, `px-4 py-2`, `text-sm font-semibold`. Student submissions, official-reply publishing, and other main publish/save actions share this recipe. No gradients or colored admin buttons.
- **Secondary button:** neutral fill and ink (`neutral-100/700` light, `neutral-800/200` dark), neutral hairline border, neutral hover/press washes; same target, radius, spacing, and type as primary. Reload, cancel/reject, logout, pagination, and other secondary actions use it.
- **Destructive button:** `border-danger/50` outline and `text-danger` ink; hover/press uses solid `bg-danger` with `text-danger-foreground` to retain the locked action-label contrast in both modes. Same geometry as other buttons. Only deletion uses this variant. Errors may retain red text and alert surfaces. Blue remains the keyboard-focus color for every variant.
- **Icon button:** the navbar's neutral 44px target and `size-5` Lucide icon, with the same neutral washes, disabled opacity, and visible blue keyboard focus. Destructive icon-only controls retain an explicit accessible name.
- **Badge:** borderless `rounded-full`, `px-2.5 py-1`, `text-xs font-semibold`, neutral fill/ink, `gap-1.5`. Admin badges include `ShieldCheck` plus the existing administrator wording; pending badges include `Clock` plus `待審核`. Labels, never color alone, carry meaning.
- **Field:** `rounded-xl`, neutral border and inset fill, `p-3`, `text-sm`, visible blue focus ring. Preserve every existing label, value, disabled condition, and input type.
- **Official reply display:** `OfficialReply` is shared by proposals and feedback. Preserve the feedback treatment: `p-4 rounded-xl bg-blue-50/80 dark:bg-blue-950/50`; `Megaphone` plus `學權組官方回覆：`, optional existing feedback date, and unmodified reply text. No accent border or purple variant.
- **Admin editors:** shared neutral cards, `ShieldCheck` plus administrator wording, `PencilLine` for reply-edit labels, and `Save` for publish/save actions. The extra administrator-only badge is an explicit role label, not a new permission rule. Proposal control statuses are `處理中` (all live undecided) and `已結案` (decided); approval lands `處理中`. When the control status is `已結案`, the reply editor shows guidance and placeholder requiring the `決議：採納／不採納＋理由` format as a documented convention (no hard DB validation); the decided outcome lives in the official reply text.
  Moderation is inline on `/feedback` and `/proposals`, with home-section creation/deletion on `/`; there is no separate `/admin` page or navigation entry.
- **Icons:** use the installed `lucide-react` package, normally `size-4` beside text and `size-5` for navbar controls/headings. Decorative icons are `aria-hidden="true"`; text and accessible names remain. Emoji in user-supplied titles, bodies, names, search history, and replies is never rewritten. Native confirmation text loses only its UI emoji, retaining all confirmation behavior and wording.
- **Compact login card:** `p-6 mb-8`, heading `mb-4`, content-sized centered action without fixed/minimum height or vertical spacer; shared solid-blue primary button, responsive stacked/inline copy, and all original login text/states.

## 6. Motion & Interaction

Public `#item-…` navigation scrolls once after the initial queue and target placement are ready. Changing the fragment permits a new scroll; pagination, list refresh, tab changes and removal of preceding rows do not repeat it. Keep the sticky-header scroll margins and the mounted-card frame retry, without taking scroll ownership away from the reader.

Theme changes apply synchronously on activation, with no page reveal, animation, or artificial delay; reduced motion therefore has the same behavior. Follow OS changes only while no explicit override is active, and detach the system listener after a toggle or unmount. Persist explicit choices only. If browser storage is blocked or full, retain the current session's choice in memory. Unknown exceptions must propagate.

The current document retains an explicit choice in `html[data-theme-preference]` before attempting localStorage persistence. It survives navbar/auth remounts and takes precedence over an older stored value; a new document without that attribute still initializes from storage or OS preference. No identity or user data is stored in this attribute.

A synchronous first-party script in the root `<head>` resolves the theme before body paint. Its initialization logic is shared with the client hook; only the intentionally client-managed `<html>` attribute uses hydration-warning suppression. The button initializes after hydration rather than reading browser state during render.

## 7. Depth & Surface

Navbar dividers, drawer elevation, and neutral hover layering remain. Content cards share the single `shadow-sm` level above; buttons use no independent elevation. Controls use existing `rounded-xl` (12px). No accent outlines or decorative materials are introduced.

## 8. Accessibility Constraints & Accepted Debt

- Preserve WCAG AA contrast intent and visible keyboard focus. Native button activation supports Enter and Space; state is exposed through `aria-pressed`, not color alone.
- Primary users include phone/touch users, keyboard and screen-reader users, and users whose OS theme differs from their preferred site theme. All must reach the control without opening the drawer.
- No new dependencies, browser/network tooling, auth changes, privacy changes, pagination changes, or RPC changes are permitted for this task. Chrome changes must not change action availability, confirmations, draft reconciliation, or user-supplied content.
- Verification limitation: browser screenshots, real keyboard/screen-reader testing, and Lighthouse audits are not performed under the requested local-only tool constraints. Component state/hydration tests, diagnostics, typecheck, and the offline production build are the available evidence; visual QA is not claimed.
- Queue exception to the older pagination restriction above: `/feedback` and `/proposals` now use the bounded queue API for exact counts, filtering and ordering. Search, home and comments retain the generic `Page` contract. No new dependencies, redesign, draft-store changes or shared mutation/auth fixes belong to this queue task. Parent owns browser QA; component tests cover tab keyboard selection, unknown/error/real-zero states, stale filter results and retained drafts. No new visual debt is accepted.
- The locked token-pair contrast is calculated above; these ratios do not certify component-specific colors or opacity combinations. Component type-role adoption remains separate from this foundation task. The offline font mock intentionally serves no real font assets, so the offline build verifies loader resolution, not glyph rendering. No new design debt is accepted; responsive screenshots remain unverified under the local-only tooling constraint.
