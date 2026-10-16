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
- **Admin editors:** shared neutral cards, `ShieldCheck` plus administrator wording, `PencilLine` for reply-edit labels, and `Save` for publish/save actions. The extra administrator-only badge is an explicit role label, not a new permission rule.
  Moderation is inline on `/feedback` and `/proposals`, with home-section creation/deletion on `/`; there is no separate `/admin` page or navigation entry.
- **Icons:** use the installed `lucide-react` package, normally `size-4` beside text and `size-5` for navbar controls/headings. Decorative icons are `aria-hidden="true"`; text and accessible names remain. Emoji in user-supplied titles, bodies, names, search history, and replies is never rewritten. Native confirmation text loses only its UI emoji, retaining all confirmation behavior and wording.
- **Compact login card:** `p-6 mb-8`, heading `mb-4`, content-sized centered action without fixed/minimum height or vertical spacer; shared solid-blue primary button, responsive stacked/inline copy, and all original login text/states.

## 6. Motion & Interaction

Theme changes apply synchronously on activation, with no page reveal, animation, or artificial delay; reduced motion therefore has the same behavior. Follow OS changes only while no explicit override is active, and detach the system listener after a toggle or unmount. Persist explicit choices only. If browser storage is blocked or full, retain the current session's choice in memory. Unknown exceptions must propagate.

A synchronous first-party script in the root `<head>` resolves the theme before body paint. Its initialization logic is shared with the client hook; only the intentionally client-managed `<html>` attribute uses hydration-warning suppression. The button initializes after hydration rather than reading browser state during render.

## 7. Depth & Surface

Navbar dividers, drawer elevation, and neutral hover layering remain. Content cards share the single `shadow-sm` level above; buttons use no independent elevation. Controls use existing `rounded-xl` (12px). No accent outlines or decorative materials are introduced.

## 8. Accessibility Constraints & Accepted Debt

- Preserve WCAG AA contrast intent and visible keyboard focus. Native button activation supports Enter and Space; state is exposed through `aria-pressed`, not color alone.
- Primary users include phone/touch users, keyboard and screen-reader users, and users whose OS theme differs from their preferred site theme. All must reach the control without opening the drawer.
- No new dependencies, browser/network tooling, auth changes, privacy changes, pagination changes, or RPC changes are permitted for this task. Chrome changes must not change action availability, confirmations, draft reconciliation, or user-supplied content.
- Verification limitation: browser screenshots, real keyboard/screen-reader testing, and Lighthouse audits are not performed under the requested local-only tool constraints. Component state/hydration tests, diagnostics, typecheck, and the offline production build are the available evidence; visual QA is not claimed.
- The locked token-pair contrast is calculated above; these ratios do not certify component-specific colors or opacity combinations. Component type-role adoption remains separate from this foundation task. The offline font mock intentionally serves no real font assets, so the offline build verifies loader resolution, not glyph rendering. No new design debt is accepted; responsive screenshots remain unverified under the local-only tooling constraint.
