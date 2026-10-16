# Peni design system: "İlan" (v1.0)

Single source of truth for the Peni redesign, web (`apps/web`) and mobile (`apps/mobile`). Written 16 Oct 2026 by the design lead after three directions were scored (Broadside 23.5, İstanbul 21.1, Commons 19.4). It builds on **Broadside**, takes the best ideas of the other two, and fixes every must-fix the judges listed.

**How to read this document**

- **MUST**, **NEVER** and **ONLY** are rules. Anything else is a default you may adjust if you write down why.
- Every colour ratio, font file, package version and API name below was checked on 16 Oct 2026, with `npm view`, fontTools on the shipped font files, a WCAG contrast script, and the typings in the npm tarballs.
- Some states need data the API doesn't return yet. These are marked **[gap Gn]**. §13 lists every gap and the fallback to ship until it is filled. **NEVER** show a made-up value in place of missing data.
- All UI copy is Turkish and appears in "quotes" exactly as it should ship. §11 has the copy rules and the banned list.

---

## 1. Concept and principles

Peni should feel like **a well-printed sheet pinned up on a café wall**: warm paper, press-black ink, and a copper coin that belongs to that one café. The idea is the coffeehouse as a public room. Istanbul's first coffeehouses opened in Tahtakale in 1554 and were called *mekteb-i irfan*, "the school of the cultured". In 1652 Pasqua Rosée, who came from İzmir, opened London's first coffeehouse, where a penny bought a seat at the common table. The "penny university" is a story coming home, not an English costume.

The theme lives in five objects only. Everything else is plain, modern, generous UI.

| Object | What it is | Where it appears |
|---|---|---|
| **Peni jetonu** | Each café's own copper trade token | Every peni amount, the wallet, the moment you earn peni, the app icon |
| **Askı rafı** | A hook rail where one hanging glass is one ikram waiting to be taken | Home card, café page, staff panel |
| **Fiş** | A printed slip with a scalloped bottom edge | Order status, gift, staff ticket |
| **Manşet** | The café's masthead: name, Oxford rule, dateline | Café page, café feed |
| **Uzun masa** | A long table with chairs on both sides | Peni masası invitations |

**Principles**

1. **One colour, one meaning.**
   - Ink means action and text.
   - Copper means peni and nothing else.
   - Turquoise (*firuze*) means askı and nothing else.
   - Vişne (cherry red) means masa: events, dates and the question of the day.
   - Café colourways mean "which café".
   - Status colours (success, warning, danger) always come with an icon and a word.
2. **Amounts read as goods.** "Sende 90 peni · ≈ 3 çay." "Askıda 7 çay bekliyor."
3. **Show only work that really happened.** An order stage moves only when a barista taps it. There are no fake timers and no ETA unless real data exists.
4. **Everyone is equal at the table.** No tiers, no streaks, no donor leaderboards. People who take from the askı are never named or shown, anywhere.
5. **Motion explains a change of state** (peni arriving, an order moving, a cup hanging) and does nothing else. Nothing animates on scroll and nothing loops forever.
6. **Warm, not austere.** Write friendly *sen* copy. Use paper backgrounds, tinted panels for askı and masa, and generous copper on coins. The ink-black "press room" chrome is for staff only.
7. **No cosplay.** No blackletter, no long-s, no parchment, sepia or stains, no drop caps in the UI, no "Turk's head" signs. No çini bands, no çintemani, no nazar beads, no tulip wallpaper, no souvenir street-sign plates.
8. **One part-time developer.** Five signature objects and about 24 primitives, drawn once in `packages/brand` and rendered on both platforms. Anything outside §12 needs a written reason.

---

## 2. Decisions: conflicts resolved

| # | Conflict | Decision |
|---|---|---|
| D1 | Masa red was 1.04:1 against danger red (Broadside) | Masa moves to **vişne** (`#7B2457` light, `#E6A0CF` dark), 40–50° of hue away from danger. Masa colour **NEVER** sets a whole sentence; it is used for date blocks, filled seats, masa legends and its soft panel. Danger always carries the `CircleAlert` icon. |
| D2 | Focus ring colour (copper or cobalt would share a feature hue) | `--focus` is **ink** (≥13:1 on every page surface). Every coloured container redefines `--focus` to its own on-colour: the Hazır fiş uses `on-success`; the press header uses `on-press`. |
| D3 | Staff header built on `ink` turns cream in dark mode | Fixed **press** tokens (`#1D1813` bg, `#F2EADC` text) that are the same in both themes. |
| D4 | Coin flying to the TL cart total (Commons) | **Dropped.** It mixes peni with lira. Adding to the cart gives a count roll and a small bump on the cart bar. |
| D5 | Coin rim legend was illegible at 56px (about 4.5px rendered, 2.53:1 at the gradient edge) | The legend is drawn **only at ≥96px**, on a flat copper band (4.86:1), always `aria-hidden`. At 56px the coin shows the device and the initials. At 16 and 28px it shows only an embossed "p". |
| D6 | Cafés can't be told apart by the copper coin | Four **café colourways** (zeytin, lacivert, mürekkep, patlıcan), picked by `hash(slug) % 4` until the café chooses one [gap G9]. They are used for the cover pattern, the 6px wallet-card band, the left edge of café posts and the staff header underline. Vişne is not a colourway, because it belongs to masa. |
| D7 | Askı take animation | It plays **only inside the taker's own sheet**. Every other viewer's rail updates silently on the next fetch, with no fade, no sway and no "biri aldı" line. |
| D8 | Daily askı counts identify takers in small cafés | Show **weekly** aggregates from `claimedLast7Days`, and hide the ikram count when it is below 3. |
| D9 | Café match drawn as a half-size cup | Only **whole items** are ever drawn. The match shows as text ("Kafe de 15 peni ekledi."), plus one extra full cup only when it completes a whole item. |
| D10 | Stacked phone chrome (cart bar + bottom nav + order pill ≈ 180px) | **One floating layer at a time.** On the café page the cart bar *replaces* the bottom nav. The active order lives in a **header chip**, not a floating pill. |
| D11 | Non-members saw missing or greyed steppers | Non-members see a normal "+". Tapping it opens a join sheet with "Katıl ve ekle". |
| D12 | Earn preview was wrong in all three directions | Peni is earned only on what is paid at the till: `floor(dueKurus × earnRatePercent / 10000)`. The preview recalculates live as the peni toggle changes. |
| D13 | Peni toggle showed an uncapped amount | The toggle shows the capped amount: `min(balance, floor((subtotal − askı) × maxRedeemShare%), due)`. |
| D14 | Gift flow picked the person before the café (gifts are same-café only) | The **café is chosen first**. The phone lookup reveals only "Ad S." and only for members of that café [gap G6]. |
| D15 | Toast "Moda Kahvesi siparişini aldı" implied the café accepted | **No success toast** after sending. The app goes straight to the fiş, which reads "Kafeye iletildi". |
| D16 | Inline "İptal et → Emin misin?" swap let a double tap cancel | Cancel uses a confirm sheet and appears only while the order is `submitted`. |
| D17 | Condensed caps at 12px on functional labels | Functional labels (`legend`) are 13px Archivo at normal width, in caps with +0.08em tracking. Condensed caps (`plate`) are only for datelines, stamps, date blocks, the staff order code and the coin legend. |
| D18 | Shelby cafés close orders at the till | On Shelby boards the Hazır ticket shows "Kasada kapanacak" instead of a close button. This is the existing `closesAtTill` behaviour and it must be kept. |
| D19 | "Jeton kesesi" title vs the "Cüzdan" tab | The page title is "Cüzdan". "JETON KESESİ" is the legend over the coin cards. The profile tab is "Profil", not "Ben". |
| D20 | vaul is unmaintained | Use the **Base UI Drawer** (phone) and **Base UI Dialog** (≥768px) for every web sheet. |
| D21 | Toast vendor on mobile | A small custom `ToastHost` built on Reanimated. No `sonner-native`, which would pull in gesture-handler. |
| D22 | Mobile fonts (7 files, about 880KB) | **5 static TTFs, about 606KB.** Brygada 700 and Archivo 500 are not loaded. |
| D23 | Fonts lack ≈ and → on the web subsets (verified: absent from both latin and latin-ext) | Web draws ≈ with the `<Approx/>` SVG and → with lucide `ArrowRight`. Mobile TTFs include both characters. **NEVER** put ≈, →, ✓, ☞ or ❦ in web strings. |
| D24 | Drawer snap points | None. The cart drawer opens to content height (max 88dvh). The cart bar already plays the "peek" role. |
| D25 | Staff sections naming | **Tezgâh · Askı · Rapor**, plus Ayarlar on mobile. This keeps staff vocabulary separate from the customer "Siparişler". |

---

## 3. Colour

### 3.1 Tokens

Values are sRGB hex. On the web they are CSS custom properties on `:root` and are swapped in the dark blocks (§3.5). On mobile they are the `light` and `dark` objects in `packages/brand/src/tokens.ts`, in camelCase (for example `peniSoft`).

| Token | Light | Dark | Role, and the ONLY uses allowed |
|---|---|---|---|
| `bg` | `#F4EEE2` | `#14110E` | Page paper. Carries the grain texture on web. |
| `surface` | `#FFFBF4` | `#1E1915` | Cards, sheets, fiş, inputs |
| `surface-2` | `#EAE1D0` | `#29221C` | Sunk wells, skeletons, disabled fills, table top, the 0-state of the stepper |
| `ink` | `#1D1813` | `#F2EADC` | Text, rules, icons, primary buttons |
| `ink-2` | `#5C5044` | `#BEAF9A` | The **only** secondary text tone: meta lines, hints, disabled labels |
| `line` | `#DCD1BD` | `#383029` | Decorative hairlines and row dividers. Never the only boundary of a control. |
| `line-strong` | `#8A7B67` | `#7C6C5A` | Input borders, empty seats, the status track, secondary button borders |
| `primary` | `#1D1813` | `#F2EADC` | Every primary button fill (= ink) |
| `on-primary` | `#FFFBF4` | `#14110E` | Text on primary |
| `primary-pressed` | `#3A322A` | `#D9D0C2` | Pressed or hover fill for primary |
| `peni` | `#A5531E` | `#E3955A` | Copper fill: the peni toggle when on, coin-related fills. **Peni only.** |
| `on-peni` | `#FFFFFF` | `#1A0F07` | Text on a `peni` fill |
| `peni-ink` | `#93461A` | `#EDA36A` | Peni amounts as text ("90 peni", "+2 peni") |
| `peni-soft` | `#F4E0CB` | `#3A2618` | Earn-preview panel, member peni chip |
| `aski` | `#0A6670` | `#55C4CC` | Askı fill: cups on the rail, the "Askıdan al" button. **Askı only.** |
| `on-aski` | `#FFFBF4` | `#14110E` | Text on an `aski` fill |
| `aski-pressed` | `#0D5961` | `#47AEB6` | Pressed fill for `aski` buttons |
| `aski-ink` | `#085A63` | `#6CCDD4` | Askı text and legends |
| `aski-soft` | `#D2EAEC` | `#10303A` | The askı module panel |
| `hook` | `#6F6252` | `#A08E78` | Rail, hooks, empty hooks. ≥4.4:1 on every surface, including `aski-soft`. |
| `masa` | `#7B2457` | `#E6A0CF` | Vişne fill: date blocks, filled seats, masa rule. **Masa only.** |
| `on-masa` | `#FFFBF4` | `#14110E` | Text on a `masa` fill |
| `masa-ink` | `#7B2457` | `#EBAAD5` | Masa legends ("PENİ MASASI", "GÜNÜN SORUSU") and dates. Never body sentences. |
| `masa-soft` | `#F5DEE8` | `#3A1A30` | Question card, the "Bugün masada" strip |
| `success` | `#2C6A3F` | `#86C998` | The Hazır fiş fill, the "Açık" dot |
| `on-success` | `#FFFFFF` | `#0F1F14` | Text and focus ring on `success` |
| `on-success-2` | `#DCEEDF` | `#1E3A27` | Secondary text on `success` |
| `success-ink` | `#2A6339` | `#93D1A3` | "kabul edildi" tags, confirmations |
| `success-soft` | `#DAEBD9` | `#173222` | Success chip background |
| `danger` | `#A9241C` | `#FF8B7B` | Error text and icons. **Always with `CircleAlert`.** |
| `danger-soft` | `#F8DCD7` | `#401C17` | Error banner background, the ≥10-minute elapsed chip |
| `warning` | `#9A6A00` | `#E9BC62` | Non-text only: the 4px new-ticket bar |
| `warning-ink` | `#7A5200` | `#E9BC62` | Timer and pause text; "bekliyor" tags |
| `warning-soft` | `#F5E4B8` | `#3A2C0E` | Pause banner, order notes on tickets, the 5–9-minute chip |
| `focus` | `#1D1813` | `#F2EADC` | 2px outline with 2px offset. Overridden per container (D2). |
| `press` | `#1D1813` | `#1D1813` | Staff header background, **the same in both themes** |
| `on-press` | `#F2EADC` | `#F2EADC` | Text, icons and focus on `press` |
| `on-press-2` | `#BEAF9A` | `#BEAF9A` | Secondary text on `press` |

**Café colourways.** These are fixed and the same in both themes. Text on them is cream `#FBF4E6`, with secondary text `#E4D6BD`. In dark mode always add a 1px ring `oklch(100% 0 0 / .12)`, because they sit at 1.2–2.0:1 against the dark page.

| Key | Name | Hex |
|---|---|---|
| `zeytin` | Zeytin (olive) | `#3D4A22` |
| `lacivert` | Lacivert (navy) | `#1B2C57` |
| `murekkep` | Mürekkep (ink-brown) | `#2B211B` |
| `patlican` | Patlıcan (aubergine) | `#45243F` |

**Coin colours.** These are fixed, decorative, and live only in `shapes.ts`.

| Part | Hex |
|---|---|
| Face gradient | `#E2A46B` (0%) → `#CF8A50` (45%) → `#A5531E` (100%) |
| Flat legend band | `#CF8A50` |
| Beads, hairlines | `#7A3A12` |
| Legend text | `#4A2209` |
| Device and emboss shadow | `#5B2A0D` |
| Emboss highlight | `#F3C79A` |

### 3.2 Usage rules

- Text on a soft fill uses that fill's `-ink` token, `ink` or `ink-2`. **NEVER** put a mid tone on its own soft.
- **Disabled is never opacity.** Use `ink-2` text on `surface-2` with no border, plus a visible reason ("Bakiyen 75").
- Status is never shown by colour alone. Every tag, chip and banner has an icon and a word.
- Copper creep check: if any button other than the peni toggle is copper, the screen is wrong. "Gönder", "Katıl" and "Ismarla" are **ink** buttons.
- Turquoise is never used for "success". Green is never used for askı. Askı lines on receipts are not coloured at all.
- Native controls follow the theme through `color-scheme` (set per theme in §3.5). Range sliders are not used anywhere.

### 3.3 Verified contrast (WCAG 2.x formula, node script, 16 Oct 2026)

Every row passes, with 0 failures. Text pairs need ≥4.5:1 and non-text pairs need ≥3:1.

**Text (≥ 4.5:1)**

| Pair (fg / bg) | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| `ink` / `bg` | #1D1813 / #F4EEE2 | 15.24 | #F2EADC / #14110E | 15.75 |
| `ink` / `surface` | #1D1813 / #FFFBF4 | 17.07 | #F2EADC / #1E1915 | 14.59 |
| `ink` / `surface-2` | #1D1813 / #EAE1D0 | 13.57 | #F2EADC / #29221C | 13.12 |
| `ink` / `peni-soft` | #1D1813 / #F4E0CB | 13.73 | #F2EADC / #3A2618 | 11.96 |
| `ink` / `aski-soft` | #1D1813 / #D2EAEC | 14.02 | #F2EADC / #10303A | 11.67 |
| `ink` / `masa-soft` | #1D1813 / #F5DEE8 | 13.84 | #F2EADC / #3A1A30 | 12.83 |
| `ink` / `success-soft` | #1D1813 / #DAEBD9 | 14.15 | #F2EADC / #173222 | 11.60 |
| `ink` / `warning-soft` | #1D1813 / #F5E4B8 | 13.98 | #F2EADC / #3A2C0E | 11.37 |
| `ink` / `danger-soft` | #1D1813 / #F8DCD7 | 13.60 | #F2EADC / #401C17 | 12.59 |
| `ink-2` / `bg` | #5C5044 / #F4EEE2 | 6.77 | #BEAF9A / #14110E | 8.77 |
| `ink-2` / `surface` | #5C5044 / #FFFBF4 | 7.58 | #BEAF9A / #1E1915 | 8.12 |
| `ink-2` / `surface-2` (disabled) | #5C5044 / #EAE1D0 | 6.02 | #BEAF9A / #29221C | 7.31 |
| `ink-2` / `peni-soft` | #5C5044 / #F4E0CB | 6.10 | #BEAF9A / #3A2618 | 6.66 |
| `ink-2` / `aski-soft` | #5C5044 / #D2EAEC | 6.23 | #BEAF9A / #10303A | 6.50 |
| `ink-2` / `masa-soft` | #5C5044 / #F5DEE8 | 6.14 | #BEAF9A / #3A1A30 | 7.14 |
| `ink-2` / `warning-soft` | #5C5044 / #F5E4B8 | 6.21 | #BEAF9A / #3A2C0E | 6.33 |
| `on-primary` / `primary` | #FFFBF4 / #1D1813 | 17.07 | #14110E / #F2EADC | 15.75 |
| `on-primary` / `primary-pressed` | #FFFBF4 / #3A322A | 12.19 | #14110E / #D9D0C2 | 12.32 |
| `on-peni` / `peni` | #FFFFFF / #A5531E | 5.45 | #1A0F07 / #E3955A | 7.81 |
| `peni-ink` / `bg` | #93461A / #F4EEE2 | 5.80 | #EDA36A / #14110E | 9.00 |
| `peni-ink` / `surface` | #93461A / #FFFBF4 | 6.50 | #EDA36A / #1E1915 | 8.34 |
| `peni-ink` / `surface-2` | #93461A / #EAE1D0 | 5.17 | #EDA36A / #29221C | 7.50 |
| `peni-ink` / `peni-soft` | #93461A / #F4E0CB | 5.23 | #EDA36A / #3A2618 | 6.83 |
| `on-aski` / `aski` | #FFFBF4 / #0A6670 | 6.47 | #14110E / #55C4CC | 9.10 |
| `on-aski` / `aski-pressed` | #FFFBF4 / #0D5961 | 7.77 | #14110E / #47AEB6 | 7.16 |
| `aski-ink` / `bg` | #085A63 / #F4EEE2 | 6.85 | #6CCDD4 / #14110E | 10.14 |
| `aski-ink` / `surface` | #085A63 / #FFFBF4 | 7.67 | #6CCDD4 / #1E1915 | 9.39 |
| `aski-ink` / `aski-soft` | #085A63 / #D2EAEC | 6.30 | #6CCDD4 / #10303A | 7.52 |
| `on-masa` / `masa` | #FFFBF4 / #7B2457 | 9.12 | #14110E / #E6A0CF | 9.22 |
| `masa-ink` / `bg` | #7B2457 / #F4EEE2 | 8.14 | #EBAAD5 / #14110E | 10.07 |
| `masa-ink` / `surface` | #7B2457 / #FFFBF4 | 9.12 | #EBAAD5 / #1E1915 | 9.33 |
| `masa-ink` / `masa-soft` | #7B2457 / #F5DEE8 | 7.39 | #EBAAD5 / #3A1A30 | 8.20 |
| `on-success` / `success` | #FFFFFF / #2C6A3F | 6.48 | #0F1F14 / #86C998 | 8.82 |
| `on-success-2` / `success` | #DCEEDF / #2C6A3F | 5.35 | #1E3A27 / #86C998 | 6.40 |
| `success-ink` / `bg` | #2A6339 / #F4EEE2 | 6.18 | #93D1A3 / #14110E | 10.65 |
| `success-ink` / `surface` | #2A6339 / #FFFBF4 | 6.92 | #93D1A3 / #1E1915 | 9.87 |
| `success-ink` / `success-soft` | #2A6339 / #DAEBD9 | 5.73 | #93D1A3 / #173222 | 7.84 |
| `danger` / `bg` | #A9241C / #F4EEE2 | 6.15 | #FF8B7B / #14110E | 8.27 |
| `danger` / `surface` | #A9241C / #FFFBF4 | 6.89 | #FF8B7B / #1E1915 | 7.66 |
| `danger` / `danger-soft` | #A9241C / #F8DCD7 | 5.48 | #FF8B7B / #401C17 | 6.61 |
| `warning-ink` / `bg` | #7A5200 / #F4EEE2 | 5.99 | #E9BC62 / #14110E | 10.60 |
| `warning-ink` / `surface` | #7A5200 / #FFFBF4 | 6.71 | #E9BC62 / #1E1915 | 9.82 |
| `warning-ink` / `warning-soft` | #7A5200 / #F5E4B8 | 5.49 | #E9BC62 / #3A2C0E | 7.65 |
| `on-press` / `press` | #F2EADC / #1D1813 | 14.74 | same | 14.74 |
| `on-press-2` / `press` | #BEAF9A / #1D1813 | 8.21 | same | 8.21 |
| cream / zeytin, lacivert, mürekkep, patlıcan | #FBF4E6 | 8.72, 12.42, 14.36, 12.16 | same | same |
| cream-2 `#E4D6BD` / the four colourways | | 6.66, 9.49, 10.97, 9.29 | same | same |

**Non-text (≥ 3:1)**

| Pair (fg / bg) | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| `line-strong` / `bg` | #8A7B67 / #F4EEE2 | 3.56 | #7C6C5A / #14110E | 3.72 |
| `line-strong` / `surface` | #8A7B67 / #FFFBF4 | 3.98 | #7C6C5A / #1E1915 | 3.44 |
| `line-strong` / `surface-2` | #8A7B67 / #EAE1D0 | 3.17 | #7C6C5A / #29221C | 3.10 |
| `hook` / `bg` | #6F6252 / #F4EEE2 | 5.13 | #A08E78 / #14110E | 5.94 |
| `hook` / `surface` | #6F6252 / #FFFBF4 | 5.74 | #A08E78 / #1E1915 | 5.51 |
| `hook` / `surface-2` | #6F6252 / #EAE1D0 | 4.56 | #A08E78 / #29221C | 4.95 |
| `hook` / `aski-soft` | #6F6252 / #D2EAEC | 4.72 | #A08E78 / #10303A | 4.41 |
| `aski` cup / `surface` | #0A6670 / #FFFBF4 | 6.47 | #55C4CC / #1E1915 | 8.43 |
| `aski` cup / `aski-soft` | #0A6670 / #D2EAEC | 5.31 | #55C4CC / #10303A | 6.74 |
| `masa` seat / `surface` | #7B2457 / #FFFBF4 | 9.12 | #E6A0CF / #1E1915 | 8.54 |
| `masa` / `masa-soft` | #7B2457 / #F5DEE8 | 7.39 | #E6A0CF / #3A1A30 | 7.51 |
| `peni` toggle / `surface` | #A5531E / #FFFBF4 | 5.28 | #E3955A / #1E1915 | 7.23 |
| `warning` bar / `surface` | #9A6A00 / #FFFBF4 | 4.59 | #E9BC62 / #1E1915 | 9.82 |
| `success` / `surface` | #2C6A3F / #FFFBF4 | 6.28 | #86C998 / #1E1915 | 8.98 |
| `focus` / `bg`, `surface`, `surface-2` | #1D1813 | 15.24, 17.07, 13.57 | #F2EADC | 15.75, 14.59, 13.12 |
| `focus` / `peni-soft`, `aski-soft`, `masa-soft`, `warning-soft` | #1D1813 | 13.73, 14.02, 13.84, 13.98 | #F2EADC | 11.96, 11.67, 12.83, 11.37 |
| focus on the Hazır fiş (`on-success` / `success`) | #FFFFFF / #2C6A3F | 6.48 | #0F1F14 / #86C998 | 8.82 |
| focus in the press header (`on-press` / `press`) | #F2EADC / #1D1813 | 14.74 | same | 14.74 |

**Hue separation (OKLCH ΔE).** At ≥0.08, two colours read as different at a glance.

| Pair | Light ΔE / Δhue | Dark ΔE / Δhue | Note |
|---|---|---|---|
| `masa` vs `danger` | 0.130 / 40° | 0.113 / 50° | Separated. This was 1.04:1 in Broadside. |
| `masa` vs `peni` | 0.179 / 61° | 0.149 / 77° | |
| `aski` vs `success` | 0.082 / 56° | 0.085 / 50° | |
| `danger` vs `peni` | 0.087 / 21° | 0.071 / 28° | Danger always has an icon, and is never a fill |
| `peni` vs `warning` | 0.065 / 28° | 0.098 / 26° | Warning always has `Timer` or `CirclePause` and appears mostly on staff screens |
| colourway pairs | 0.084–0.160 | — | patlıcan vs masa: 0.121 |

**Coin (decorative).** Legend `#4A2209` on the flat band `#CF8A50` is 4.86:1. Emboss "p" `#5B2A0D` is 4.16:1 on the mid face. The coin edge is 4.71:1 against the light page and 3.45:1 against the dark page.

### 3.4 Contrast test

`packages/brand/test/contrast.test.ts` recomputes every row above from `tokens.ts` and fails the build if any pair drops below its minimum. It uses the WCAG relative-luminance formula: linearise each channel (`c ≤ .04045 ? c/12.92 : ((c+.055)/1.055)^2.4`), compute `L = .2126R + .7152G + .0722B`, then the ratio `(L1+.05)/(L2+.05)`. Any token change must keep this test green.

### 3.5 `apps/web/src/app/tokens.css`

This file is generated from `tokens.ts` by `pnpm brand:css` and checked by `pnpm brand:css --check` in CI. The output must be exactly this structure:

```css
:root {
  color-scheme: light;
  --bg:#F4EEE2; --surface:#FFFBF4; --surface-2:#EAE1D0;
  --ink:#1D1813; --ink-2:#5C5044; --line:#DCD1BD; --line-strong:#8A7B67;
  --primary:#1D1813; --on-primary:#FFFBF4; --primary-pressed:#3A322A;
  --peni:#A5531E; --on-peni:#FFFFFF; --peni-ink:#93461A; --peni-soft:#F4E0CB;
  --aski:#0A6670; --on-aski:#FFFBF4; --aski-pressed:#0D5961; --aski-ink:#085A63; --aski-soft:#D2EAEC; --hook:#6F6252;
  --masa:#7B2457; --on-masa:#FFFBF4; --masa-ink:#7B2457; --masa-soft:#F5DEE8;
  --success:#2C6A3F; --on-success:#FFFFFF; --on-success-2:#DCEEDF; --success-ink:#2A6339; --success-soft:#DAEBD9;
  --danger:#A9241C; --danger-soft:#F8DCD7;
  --warning:#9A6A00; --warning-ink:#7A5200; --warning-soft:#F5E4B8;
  --focus:#1D1813;
  --press:#1D1813; --on-press:#F2EADC; --on-press-2:#BEAF9A;
  --plate-text:#FBF4E6; --plate-text-2:#E4D6BD;
  --hue-zeytin:#3D4A22; --hue-lacivert:#1B2C57; --hue-murekkep:#2B211B; --hue-patlican:#45243F;
  --plate-ring: transparent;
  --elev-1: 0 0 0 1px oklch(30% .04 60 / .10), 0 1px 2px oklch(30% .05 60 / .06), 0 8px 16px -8px oklch(30% .06 60 / .14), inset 0 1px 0 oklch(100% 0 0 / .7);
  --elev-2: 0 0 0 1px oklch(30% .04 60 / .10), 0 18px 36px -14px oklch(30% .06 60 / .22), 0 40px 64px -32px oklch(30% .06 60 / .18);
  --fis-shadow: drop-shadow(0 1px 1px oklch(30% .05 60 / .10)) drop-shadow(0 8px 12px oklch(30% .06 60 / .12));
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
/* DARK — the same block is emitted twice */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark block */ }
}
:root[data-theme="dark"] { /* dark block */ }
```

Dark block, emitted in both places:

```css
color-scheme: dark;
--bg:#14110E; --surface:#1E1915; --surface-2:#29221C;
--ink:#F2EADC; --ink-2:#BEAF9A; --line:#383029; --line-strong:#7C6C5A;
--primary:#F2EADC; --on-primary:#14110E; --primary-pressed:#D9D0C2;
--peni:#E3955A; --on-peni:#1A0F07; --peni-ink:#EDA36A; --peni-soft:#3A2618;
--aski:#55C4CC; --on-aski:#14110E; --aski-pressed:#47AEB6; --aski-ink:#6CCDD4; --aski-soft:#10303A; --hook:#A08E78;
--masa:#E6A0CF; --on-masa:#14110E; --masa-ink:#EBAAD5; --masa-soft:#3A1A30;
--success:#86C998; --on-success:#0F1F14; --on-success-2:#1E3A27; --success-ink:#93D1A3; --success-soft:#173222;
--danger:#FF8B7B; --danger-soft:#401C17;
--warning:#E9BC62; --warning-ink:#E9BC62; --warning-soft:#3A2C0E;
--focus:#F2EADC;
--plate-ring: oklch(100% 0 0 / .12);
--elev-1: 0 0 0 1px oklch(100% 0 0 / .08), inset 0 1px 0 oklch(100% 0 0 / .05);
--elev-2: 0 0 0 1px oklch(100% 0 0 / .10), 0 18px 36px -14px oklch(0% 0 0 / .55);
--fis-shadow: drop-shadow(0 0 1px oklch(100% 0 0 / .22));
--grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .035 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
```

Also emit `:root[data-theme="light"] { color-scheme: light; }`. The press tokens, plate tokens and hues don't change in dark mode.

---

## 4. Typography and Turkish text

### 4.1 Families and files

Every file was checked with fontTools for `çÇğĞıİöÖşŞüÜâÂîû₺`: nothing is missing. Each has `tnum`, `lnum` and a `latn/TRK` language system with `locl` (Turkish i).

| Role | Family | Web (Fontsource, npm 16 Oct 2026) | Mobile (`@expo-google-fonts`, npm 16 Oct 2026) |
|---|---|---|---|
| Display: headings ≥20px, order code, balances, question italic | **Brygada 1918** | `@fontsource-variable/brygada-1918@5.3.0`, family `"Brygada 1918 Variable"`, wght 400–700, normal and italic | `@expo-google-fonts/brygada-1918@0.4.2`: `Brygada1918_600SemiBold` (155KB), `Brygada1918_500Medium_Italic` (156KB) |
| UI, body, every price, timer and count | **Archivo** | `@fontsource-variable/archivo@5.3.0`, the **wdth** files (wght 100–900, `font-stretch` 62–125%), family `"Archivo Variable"` | `@expo-google-fonts/archivo@0.4.2`: `Archivo_400Regular` (116KB), `Archivo_600SemiBold` (117KB) |
| Condensed caps (`plate`, staff code) | Archivo at `font-stretch: 75%` | the same wdth file | `@expo-google-fonts/archivo-narrow@0.4.2`: `ArchivoNarrow_600SemiBold` (62KB) |

- Neither family has ☞, ❦ or ✓, and the web subsets lack ≈ and →. Draw these as SVG (§6.7) or use lucide.
- Only two weights are used per family: Brygada 600 and 500 italic; Archivo 400 and 600. **NEVER** use Brygada below 20px, except the 13px dateline, which is `plate` in Archivo. A serif on a 13px button means a rule was broken.
- **Brygada never sets prices.** Prices, peni in rows, timers and counts use Archivo with `tabular-nums`. Big balances and the order code use Brygada with `lining-nums tabular-nums`.

### 4.2 Web loading (self-hosted and preloaded)

`apps/web/scripts/copy-fonts.mjs` runs in `predev` and `prebuild`. It copies these six files from `node_modules/@fontsource-variable/*/files/` to `apps/web/public/fonts/` (the folder is gitignored):

| File | Size |
|---|---|
| `archivo-latin-wdth-normal.woff2` | 88KB |
| `archivo-latin-ext-wdth-normal.woff2` | 88KB |
| `brygada-1918-latin-wght-normal.woff2` | 24KB |
| `brygada-1918-latin-ext-wght-normal.woff2` | 36KB |
| `brygada-1918-latin-wght-italic.woff2` | 24KB |
| `brygada-1918-latin-ext-wght-italic.woff2` | 36KB |

`apps/web/src/app/fonts.css`:

```css
/* LATIN = U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
   LATIN-EXT = U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF
   (verbatim from the packages; ı is in LATIN; İ ğ ş ₺ are in LATIN-EXT — NEVER drop latin-ext) */
@font-face{font-family:"Archivo Variable";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;
  src:url(/fonts/archivo-latin-wdth-normal.woff2) format("woff2-variations");unicode-range:/* LATIN */}
@font-face{font-family:"Archivo Variable";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;
  src:url(/fonts/archivo-latin-ext-wdth-normal.woff2) format("woff2-variations");unicode-range:/* LATIN-EXT */}
@font-face{font-family:"Brygada 1918 Variable";font-style:normal;font-display:swap;font-weight:400 700;
  src:url(/fonts/brygada-1918-latin-wght-normal.woff2) format("woff2-variations");unicode-range:/* LATIN */}
@font-face{font-family:"Brygada 1918 Variable";font-style:normal;font-display:swap;font-weight:400 700;
  src:url(/fonts/brygada-1918-latin-ext-wght-normal.woff2) format("woff2-variations");unicode-range:/* LATIN-EXT */}
@font-face{font-family:"Brygada 1918 Variable";font-style:italic;font-display:swap;font-weight:400 700;
  src:url(/fonts/brygada-1918-latin-wght-italic.woff2) format("woff2-variations");unicode-range:/* LATIN */}
@font-face{font-family:"Brygada 1918 Variable";font-style:italic;font-display:swap;font-weight:400 700;
  src:url(/fonts/brygada-1918-latin-ext-wght-italic.woff2) format("woff2-variations");unicode-range:/* LATIN-EXT */}
```

Write the actual range strings in place of the comments. In `layout.tsx`, preload exactly three files with `<link rel="preload" as="font" type="font/woff2" crossOrigin="">`: Archivo latin, Archivo latin-ext, and Brygada latin normal. The italic loads on demand, when the Masa section renders. Keep `<html lang="tr">`, so CSS `uppercase` gives "SİPARİŞ" and both fonts apply `i.loclTRK`.

### 4.3 Mobile loading

In `src/app/_layout.tsx`:

```ts
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Brygada1918_600SemiBold, Brygada1918_500Medium_Italic } from "@expo-google-fonts/brygada-1918";
import { Archivo_400Regular, Archivo_600SemiBold } from "@expo-google-fonts/archivo";
import { ArchivoNarrow_600SemiBold } from "@expo-google-fonts/archivo-narrow";
SplashScreen.preventAutoHideAsync();
// const [loaded] = useFonts({ Brygada1918_600SemiBold, Brygada1918_500Medium_Italic, Archivo_400Regular, Archivo_600SemiBold, ArchivoNarrow_600SemiBold });
// hide the splash once fonts are loaded AND the persisted mode (§8.4) is read.
```

- Each weight is its own family name. **NEVER** set `fontWeight` together with these families (Android would fake bold).
- This works in Expo Go and in dev builds.
- **NEVER** use `textTransform`. Caps go through `trUpper()` (§4.6).

### 4.4 Web type scale: Tailwind v4 `@theme` names

| Token (class) | Font | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `text-legend` | sans, normal width, caps | 13 / 16 | 600 | .08em | Functional labels: categories, section legends, tags |
| `text-plate` | sans, `font-stretch:75%`, caps | 13 / 16 | 600 | .06em | Dateline, stamps, date-block lines, nameplates |
| `text-meta` | sans | 13 / 18 | 400 | 0 | Times, hints, secondary lines (the 13px floor; there is no 11 or 12px text) |
| `text-body` | sans | 15 / 22 | 400 | 0 | Default |
| `text-body-lg` | sans | 16 / 24 | 400 | 0 | Long text and the hero subline, with `text-wrap:pretty` |
| `text-button` | sans | 15 / 20 | 600 | 0 | Buttons |
| `text-item` | sans | 17 / 22 | 600 | −.005em | Menu item names, ticket lines |
| `text-h3` | display | 22 / 26 | 600 | −.01em | Card and section titles |
| `text-h2` | display | 30 / 34 | 600 | −.015em | Page titles |
| `text-h1` | display | `clamp(2.25rem, 1.6rem + 3.2vw, 3.5rem)` / 1.02 | 600 | −.02em | Hero and café masthead, with `text-wrap:balance` |
| `text-question` | display italic | 22 / 28 (≥768: 26 / 32) | 500 | 0 | Günün sorusu |
| `text-balance` | display, lining tabular | 40 / 1 | 600 | −.01em | Wallet balances |
| `text-code` | display, lining tabular | 72 / .9 | 600 | −.02em | P-003 on the fiş |
| `text-ticket` | sans, `font-stretch:75%`, tabular | 40 / 1 | 600 | 0 | Staff order code |

Headings use `text-wrap: balance` and paragraphs use `text-wrap: pretty`. Price class: `font-sans font-semibold tabular-nums`.

### 4.5 Mobile type scale (`T` component variants)

| Variant | Family | Size / LH | letterSpacing | maxFontSizeMultiplier | Notes |
|---|---|---|---|---|---|
| `legend` | Archivo_600SemiBold | 13 / 16 | 1.0 | 1.6 | `trUpper` |
| `plate` | ArchivoNarrow_600SemiBold | 13 / 16 | 0.8 | 1.4 | `trUpper` |
| `meta` | Archivo_400Regular | 13 / 18 | 0 | 1.6 | |
| `body` | Archivo_400Regular | 16 / 22 | 0 | 1.6 | |
| `strong` | Archivo_600SemiBold | 16 / 22 | 0 | 1.6 | |
| `button` | Archivo_600SemiBold | 16 / 20 | 0 | 1.4 | |
| `item` | Archivo_600SemiBold | 17 / 22 | −0.1 | 1.6 | |
| `price` | Archivo_600SemiBold | 15 / 20 | 0 | 1.6 | `fontVariant:['tabular-nums']` |
| `h3` | Brygada1918_600SemiBold | 22 / 26 | −0.2 | 1.3 | |
| `h2` | Brygada1918_600SemiBold | 28 / 32 | −0.4 | 1.3 | |
| `question` | Brygada1918_500Medium_Italic | 20 / 26 | 0 | 1.3 | |
| `balance` | Brygada1918_600SemiBold | 40 / 44 | −0.4 | 1.3 | `['lining-nums','tabular-nums']` |
| `code` | Brygada1918_600SemiBold | 64 / 64 | −1 | 1.2 | same |
| `ticket` | ArchivoNarrow_600SemiBold | 40 / 44 | 0 | 1.2 | `tabular-nums` |
| large title | Brygada1918_600SemiBold | 34 | — | — | Set through `headerLargeTitleStyle` |
| header title | Archivo_600SemiBold | 17 | — | — | Set through `headerTitleStyle` |

### 4.6 Turkish text helpers (`packages/brand/src/format.ts`)

| Helper | Rule |
|---|---|
| `trUpper(s)` | `s.replace(/i/g,"İ").replace(/ı/g,"I").toLocaleUpperCase("tr")`. Use it for every caps string on mobile and inside SVG `<text>` on web. HTML on web may use CSS `uppercase` because `lang="tr"` is set. |
| `formatTL(kurus)` | `Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY", minimumFractionDigits: kurus%100?2:0, maximumFractionDigits:2})`. Gives "₺120" and "₺30,50". Negative amounts are written `"−" + formatTL(abs)` with a true minus (U+2212). Replaces `formatKurus` in the UI. |
| `formatPeni(n)` | `"1.240 peni"` (tr-TR grouping) |
| `goods(peni, refItems)` | `n = floor(peni / ceil(priceKurus/100))` for the cheapest reference item. Returns `"3 çay"` (lower-cased with `toLocaleLowerCase("tr")`). Returns `null` when n < 1. A second item is added for the two-item line: "3 çay · 1 Türk kahvesi". On web it renders after `<Approx/>`, and on mobile after "≈ ". Screen readers read "yaklaşık". |
| `dativeName(first)` | Picks `'a` or `'e` from the last vowel (a ı o u → a; e i ö ü → e), with a y buffer when the name ends in a vowel: Mehmet'e, Ayşe'ye, Can'a, Öykü'ye. |
| `dativeTime("14:30")` | Takes the suffix from the last spoken number: if the minutes are non-zero, use the minutes, otherwise the hour. For that number, if its unit digit is non-zero, look the unit up in {1:"e",2:"ye",3:"e",4:"e",5:"e",6:"ya",7:"ye",8:"e",9:"a"}; if the unit digit is 0 (and the number isn't 0), look the tens up in {10:"a",20:"ye",30:"a",40:"a",50:"ye"}; 0 itself → "a". So 14:30 → 14:30'a, 18:00 → 18:00'e, 12:00 → 12:00'ye, 16:00 → 16:00'ya, 10:00 → 10:00'a. |
| `locativeTime("14:30")` | Same "last spoken number" rule, with its own table, because 3, 4, 5 and 40 harden to t: units {1:"de",2:"de",3:"te",4:"te",5:"te",6:"da",7:"de",8:"de",9:"da"}, tens {10:"da",20:"de",30:"da",40:"ta",50:"de"}, 0 → "da". So 14:30'da, 15:00'te, 13:00'te, 14:00'te, 18:00'de, 16:00'da, 09:40'ta. |
| `relDay(iso)` | "bugün", "dün", a weekday name within 7 days ("Pazartesi"), otherwise "12 Eki" |
| `initials(name)` | Up to 2 letters, using `trUpper` |
| `cafeHue(slug)` / `cafeDevice(slug)` | djb2 hash: `h=5381; for each code point h=((h<<5)+h+c)>>>0`. The hue is `["zeytin","lacivert","murekkep","patlican"][h%4]` and the device is `["cezve","glass","fincan"][(h>>>2)%3]`. So moda → mürekkep + glass, and kuzguncuk → zeytin + fincan. |
| `earnPreview(dueKurus, rate)` | `Math.floor(dueKurus * rate / 10000)` |
| `usablePeni({balance, subtotalKurus, askidaKurus, maxRedeemSharePercent})` | `min(balance, floor((subtotal−askida) × share / 10000))`, and never more than `(subtotal − askida)/100` |
| `greeting(date)` | 05–11 "Günaydın", 11–17 "İyi günler", 17–22 "İyi akşamlar", 22–05 "İyi geceler" |

**NEVER** attach a suffix to a dynamic café name. Rephrase with "için" or put the name in a legend, unless the café has stored name forms [gap G10].

---

## 5. Space, shape, depth, texture, icons

**Spacing.** Base unit 4px (Tailwind default scale).

- Page gutter: 16px on phone, 24px from 640px, 32px from 1024px.
- Card padding: 16px on phone, 20px from 768px.
- Row padding: 12px vertical, 16px horizontal; row min-height 56px.
- Stack gaps: 4, 8, 12, 16, 24. Gap between sections: 32px on phone, 48px on desktop.
- Content max widths: 1120px (app), 640px (reading), 440px (order fiş), 400px (sign-in).

**Layout variables**

| Variable | Value |
|---|---|
| `--header-h` | 56px (<768), 64px (≥768) |
| `--nav-h` | 64px + `env(safe-area-inset-bottom)` |
| `--seg-h` | 48px |
| `--cartbar-h` | 64px + safe area |

`scroll-margin-top` on café sections = `calc(var(--header-h) + var(--seg-h) + 8px)`.

**Z-index.** Segmented 20, header 30, bottom nav and cart bar 40, sheet 50, toast 60.

**Breakpoints.** Tailwind defaults: `sm` 640, `md` 768 (top nav replaces the bottom nav), `lg` 1024 (café cart sidebar), `xl` 1280. `CafeCard`, `MenuRow` and `StaffTicket` sit in an `@container` and change layout at `@md` (≥448px container).

**Radii**

| Radius | Used for |
|---|---|
| 4px | Tags, stamps, date blocks |
| 10px | Buttons, inputs, banners, the segmented track (rectangles, not pills) |
| 14px | Cards, fiş top corners, covers |
| 22px | Sheet top corners |
| full | Only the coin, avatars, 44px icon buttons, stepper buttons, seats and the switch |

**Elevation.** Three levels; no other shadows exist.

| Level | Web | Mobile |
|---|---|---|
| flat | `shadow-none`, rows separated by a 1px `line` | — |
| raised (cards) | `shadow-raised` = `--elev-1` | iOS `{shadowColor:'#3A2A1A', shadowOpacity:.12, shadowRadius:8, shadowOffset:{width:0,height:4}}`; Android `elevation:2`; both with a 1px `line` border. Dark: no shadow, 1px `line` border. |
| floating (sheets, toasts, cart bar) | `shadow-floating` = `--elev-2` | iOS opacity .22, radius 18, offset 0/10; Android elevation 8 |

- **Cards NEVER nest inside cards.** A raised card holds flat rows.
- Tinted panels (`aski-soft`, `masa-soft`, `peni-soft`, `warning-soft`) are flat, with no shadow and no border.
- The fiş is masked, so its shadow goes on a wrapper with `filter: var(--fis-shadow)`.

**Texture (web only).** `body { background: var(--grain), var(--bg); }`. The tile is a static 180px SVG, never animated, never placed on cards, and does not affect contrast. Mobile has no grain.

**Rules**

- `.rule-oxford`: `height:6px; background: linear-gradient(currentColor 0 0) top/100% 3px no-repeat, linear-gradient(currentColor 0 0) bottom/100% 1px no-repeat; color: var(--ink)`. That is 3px, a 2px gap, then 1px. Oxford rules appear **ONLY** at the top of the café masthead and at the head of an order or gift fiş.
- `.rule-hair`: a 1px `line` border.
- `.rule-ink`: a 1px `ink` border (Masa dateline).

**Icons**

- Web: `lucide-react@1.58.0`. Mobile content: `lucide-react-native@1.58.0`. Mobile native chrome (tab bar, header toolbar) uses SF Symbols and Material Symbols names.
- Sizes and strokes: `strokeWidth={1.75}` at 20 and 24px; `strokeWidth={1.5}` at 32px and above (empty states); 16px uses `absoluteStrokeWidth`.
- Icons are `aria-hidden`, and the text label or `aria-label` is always present. No emoji anywhere.

Icon map, with names verified in 1.58:

| Meaning | Icon |
|---|---|
| Kafeler | `Coffee` |
| Siparişler | `ReceiptText` |
| Cüzdan | custom `CoinGlyph` |
| Profil | `UserRound` |
| Peni kodum | `QrCode` |
| Close | `X` |
| Back | `ChevronLeft` |
| Add, remove | `Plus`, `Minus` |
| Heart | `Heart` |
| Share | `Share2` |
| Takvime ekle | `CalendarPlus` |
| Elapsed time (0–4, 5–9, ≥10 min) | `Clock`, `Timer`, `AlarmClock` |
| Error | `CircleAlert` |
| Info | `Info` |
| Pause, resume | `CirclePause`, `CirclePlay` |
| Sound on, off | `Volume2`, `VolumeX` |
| Note | `StickyNote` |
| Done | `Check` |
| Returned | `Undo2` |
| Link arrow | `ArrowRight` |
| Çıkış | `LogOut` |
| Theme | `Monitor`, `Sun`, `Moon` |
| Ismarla | `Gift` |
| Address | `MapPin` |
| Members | `Users` |
| Loading | `LoaderCircle` |

Custom brand glyphs on the same 24 grid (§6.7): coin, cezve, glass, fincan, simit, hook, long table, manicule, approx.

---

## 6. Signature elements

All path data lives once in `packages/brand/src/shapes.ts` as exported strings and helper functions. Web renders them with React SVG; mobile renders them with `react-native-svg` (`Svg`, `Path`, `Circle`, `G`, `Text`, `TextPath`, `Defs`, `RadialGradient`, `Stop`). Every motif is `aria-hidden` (`accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"` on mobile) and always has real text beside it. Gradient and path IDs MUST be unique per instance (`useId()`).

### 6.1 Peni jetonu (the coin)

`<Coin size={16|28|56|96} cafe={{ name, district, city, slug }} face="front"|"back" backLabel="+30" />`. The viewBox is `0 0 64 64` at every size.

| Size | Where | What is drawn |
|---|---|---|
| 16 | Inline with amounts, wordmark (20) | Face + embossed "p" |
| 28 | Rows, cart, post avatar | Face + 36 beads + hairline + "p" |
| 56 | Wallet cards | Face + beads + hairline + café device + initials triad |
| 96 | Earn moment, Peni kodum, sign-in (generic) | Everything above + flat band + rim legend |

Base, at every size:

```svg
<defs><radialGradient id="{id}-face" cx="38%" cy="32%" r="75%">
  <stop offset="0" stop-color="#E2A46B"/><stop offset=".45" stop-color="#CF8A50"/><stop offset="1" stop-color="#A5531E"/>
</radialGradient></defs>
<circle cx="32" cy="32" r="31" fill="url(#{id}-face)"/>
<!-- dark theme only: --> <circle cx="32" cy="32" r="31.5" fill="none" stroke="#F2EADC" stroke-opacity=".12"/>
```

Beads (≥28): 36 circles with `r="1.15"`, fill `#7A3A12`, at `(32 + 28.5·cos(i·10°), 32 + 28.5·sin(i·10°))` for i = 0…35 (`beads()` helper), plus `<circle cx="32" cy="32" r="26.25" fill="none" stroke="#7A3A12" stroke-width=".75"/>`.

Embossed "p" (16 and 28). `P_GLYPH` is the outline of Brygada 1918 SemiBold "p", 30 units tall, centred at (32, 33):

```svg
<g fill-rule="evenodd">
  <path d="{P_GLYPH}" transform="translate(-.5 -.5)" fill="#F3C79A" fill-opacity=".6"/>
  <path d="{P_GLYPH}" fill="#5B2A0D"/>
</g>
```

```
P_GLYPH = "M34.5 18Q37.1 18 39 19.2Q41 20.4 42.1 22.7Q43.3 24.9 43.3 28Q43.3 31 42.1 33.3Q41 35.6 39 36.9Q37.1 38.1 34.5 38.1Q32.1 38.1 30.5 37Q29 35.9 28.2 34.3V46.3L28.5 46.6H32.5V48H20.7V46.6H23.3L23.6 46.3V20.2L23.3 19.9H20.7V18.4Q21.8 18.4 23 18.4Q24.1 18.4 25.3 18.3Q26.5 18.2 27.6 18.1L27.8 18.4V21.8H28.2Q29 20.3 30.6 19.2Q32.2 18 34.5 18ZM33.6 36.1Q35.6 36.1 36.9 34.3Q38.3 32.5 38.3 28.5Q38.3 24.4 36.9 22.2Q35.6 20 33.6 20Q32.2 20 30.7 21.1Q29.3 22.2 28.2 24.8V31.3Q29.3 34 30.7 35Q32.2 36.1 33.6 36.1Z"
```

Device and initials (56). The device is `cafeDevice(slug)` (§6.7), drawn as an emboss stroke:

```svg
<g transform="translate(23 12) scale(.75)" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="{DEVICE}" stroke="#F3C79A" stroke-opacity=".6" transform="translate(-.6 -.6)"/>
  <path d="{DEVICE}" stroke="#5B2A0D"/>
</g>
<text x="32" y="42.5" text-anchor="middle" font-family="Brygada 1918 Variable" font-weight="600" font-size="9" fill="#5B2A0D">{trUpper(name[0])}</text>
<text x="32" y="50" text-anchor="middle" font-family="Archivo Variable" font-weight="600" font-size="5.5" letter-spacing=".6" fill="#5B2A0D">{trUpper(district[0])} · {trUpper(city[0])}</text>
```

The initials triad is the café initial on top and the district and city initials below: "M" over "K · İ". If district or city is missing, show only the top initial. On mobile, `fontFamily` is `Brygada1918_600SemiBold` and `Archivo_600SemiBold`, with no `fontWeight`.

Legend (96 only). It replaces the hairline at 26.25 with a band:

```svg
<circle cx="32" cy="32" r="22.25" fill="none" stroke="#CF8A50" stroke-width="6.5"/>       <!-- flat band r 19–25.5 -->
<circle cx="32" cy="32" r="25.6" fill="none" stroke="#7A3A12" stroke-width=".6"/>
<circle cx="32" cy="32" r="18.9" fill="none" stroke="#7A3A12" stroke-width=".6"/>
<path id="{id}-rim" d="M10.8 32a21.2 21.2 0 1 1 42.4 0a21.2 21.2 0 1 1-42.4 0" fill="none"/>
<text font-family="Archivo Variable" font-weight="600" font-stretch="75%" font-size="5" letter-spacing=".45" fill="#4A2209">
  <textPath href="#{id}-rim" startOffset="25%" text-anchor="middle">{legend}</textPath>
</text>
```

- `legend` = `trUpper(name) + " · " + trUpper(district)`, for example "MODA KAHVESİ · KADIKÖY". Over 30 characters, use the name only. Over 30 again, truncate with "…".
- At 96, the device moves to `translate(25 15) scale(.58)` and the initials to `y=37.5`, size 7 (top) and `y=43.5`, size 4.5 (bottom).
- Mobile uses ArchivoNarrow_600SemiBold. If `TextPath` with letterSpacing renders badly on any Android test device, omit the legend on Android. It is decorative.

Back face (only seen during the flip). Same face and beads, then:

```svg
<text x="32" y="36" text-anchor="middle" font-family="Brygada 1918 Variable" font-weight="600" font-size="20" fill="#5B2A0D">{backLabel ?? "1"}</text>
<text x="32" y="46" text-anchor="middle" font-family="Archivo Variable" font-weight="600" font-stretch="75%" font-size="6" letter-spacing="1.2" fill="#5B2A0D">PENİ</text>
```

- Generic coin (sign-in, app icon, cafés without data): the 96 layout with the legend "PENİ · MAHALLENİN MASASI", no device, and the "p" in the centre at `scale(.8)` around (32, 30).
- Animations: `coin-strike` and `coin-flip` (§7.2). Mobile wraps the Svg in an `Animated.View` and animates that View. It NEVER uses `useAnimatedProps` on `G`. Wrap `Coin` in `React.memo`.

### 6.2 Askı rafı (the hook rail)

`<AskiRail count={itemsAvailable} item="glass"|"fincan"|"simit" size="sm"|"md" maxSlots? hangSignal? />`

- The item comes from `referenceItemName`. A name containing "çay" maps to `glass`; "simit" maps to `simit`; anything else maps to `fincan`. **The glyph must match the caption**: "7 çay" is drawn as tea glasses.
- Geometry, in user units:

| | md | sm |
|---|---|---|
| Slot pitch `p` | 28 | 21 (md scaled .75) |
| Height `H` | 40 | 30 |
| Slots | `min(12, floor(width/28))` | 6 |

- `W = slots × p` and `cx(i) = p/2 + i·p`.
- Rail: `<rect x="1" y="3" width="{W-2}" height="3" rx="1.5" fill="var(--hook)"/>`, plus finials `<circle cx="2.5" cy="4.5" r="2.5"/>` and `<circle cx="{W-2.5}" cy="4.5" r="2.5"/>` in `--hook`.
- Hook, for every slot: `<path d="M{cx+4} 6v7a4 4 0 0 1-8 0v-1.5" fill="none" stroke="var(--hook)" stroke-width="1.5" stroke-linecap="round"/>`. The pivot (lowest point of the curl) is `(cx, 17)`.
- Items. `drawn = min(count, slots)`; if `count > slots`, the last slot shows a `+N` tag with N = count − slots + 1. Items fill from the left, and empty hooks stay drawn ("waiting", not "broken"). Each item is anchored with its top-centre at the pivot (`translate(cx 17)`):

```svg
<!-- glass (ince belli) -->
<path d="M-4.5 0h9c0 4.4-2.8 6.2-2.8 9 0 2.5 2.8 3.9 2.8 7v1h-9v-1c0-3.1 2.8-4.5 2.8-7 0-2.8-2.8-4.6-2.8-9Z" fill="var(--aski)" stroke="var(--ink)" stroke-width="1.25" stroke-linejoin="round"/>
<path d="M-6.5 19.5h13" stroke="var(--ink)" stroke-width="1.25" stroke-linecap="round"/>
<path d="M-2.6 2.2v4" stroke="var(--on-aski)" stroke-opacity=".5" stroke-width="1" stroke-linecap="round"/>
<!-- fincan -->
<path d="M-7 0h12.5v4a5.5 5.5 0 0 1-5.5 5.5h-1.5A5.5 5.5 0 0 1-7 4Z" fill="var(--aski)" stroke="var(--ink)" stroke-width="1.25" stroke-linejoin="round"/>
<path d="M5.5 1.2h1.3a2.3 2.3 0 0 1 0 4.6H5.3M-9 12h16.5" fill="none" stroke="var(--ink)" stroke-width="1.25" stroke-linecap="round"/>
<!-- simit: group translated by (0,-4.5) so the hole's top sits on the pivot; draw the hook AFTER the simit -->
<path fill-rule="evenodd" d="M0 0a8 8 0 1 1 0 16A8 8 0 0 1 0 0Zm0 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="var(--aski)" stroke="var(--ink)" stroke-width="1.25"/>
<g fill="var(--on-aski)" fill-opacity=".7"><circle cx="4.98" cy="5.13" r=".7"/><circle cx="-4.98" cy="5.13" r=".7"/><circle cx="4.98" cy="10.88" r=".7"/><circle cx="-4.98" cy="10.88" r=".7"/><circle cx="0" cy="2.25" r=".7"/><circle cx="0" cy="13.75" r=".7"/></g>
<!-- +N tag -->
<g transform="translate(0 2) rotate(-4)"><rect x="-10" y="0" width="20" height="14" rx="3" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.25"/>
<text x="0" y="10.2" text-anchor="middle" font-size="9" font-weight="600" fill="var(--ink)" style="font-variant-numeric:tabular-nums">+5</text></g>
```

- Structure.
  - Web: one `<svg aria-hidden>`, with each item in an `m.g` that has `style={{ originX: .5, originY: 0 }}`.
  - Mobile: one background `Svg` for the rail and hooks, plus one absolutely positioned `Animated.View` per item (`left = i·p`, `top = 17`, `width = p`, `transformOrigin: 'top'`). Each holds its own `Svg viewBox="{-p/2} 0 {p} 24"`.
- Text. The SVG is `aria-hidden`; the caption under it is the accessible text (it is never duplicated as an `aria-label`).
  - Line 1, `text-item`: **"Askıda 7 çay bekliyor"** (from `itemsAvailable` and the lower-cased reference name). When the pool is empty: "Askı şu an boş."
  - Line 2, `meta ink-2`: "İsteyen alır, günde bir tane." (`claimsPerDay` 2 → "günde iki tane").
  - Line 3, `meta ink-2`: "Bu hafta 12 ikram içildi · 235 peni bırakıldı". Drop the ikram part when `claimedLast7Days < 3`. Drop the peni part when `donatedLast7DaysPeni = 0`.
- Motion (§7.2):
  - `cup-hang` runs **only** on the donor's own screen, after their own successful donation, and on the staff till.
  - `cup-take` runs **only** inside the taker's take sheet.
  - Everyone else's rail re-renders with no animation.
  - **The hook never sways.**

### 6.3 Fiş (the printed slip)

`<Fis variant="order"|"gift"|"ticket" tone="default"|"ready" legend="MODA KAHVESİ · SİPARİŞ">`

- Web markup: `<div className="fis-shadow"><div className="fis">…</div></div>`.
  - `.fis`: `background: var(--surface); border-radius: 14px 14px 0 0; padding: 20px 20px 28px; -webkit-mask: radial-gradient(6px at 50% 100%, #0000 97%, #000) 50% / 16px 100%; mask: radial-gradient(6px at 50% 100%, #0000 97%, #000) 50% / 16px 100%;`
  - `.fis-shadow`: `filter: var(--fis-shadow)` (a mask clips box-shadow, so the shadow sits on the wrapper).
  - `.fis[data-tone=ready]`: `background: var(--success); color: var(--on-success); --focus: var(--on-success); --ink: var(--on-success); --ink-2: var(--on-success-2); --line-strong: var(--on-success-2); transition: background-color 300ms var(--ease-out-strong), color 300ms var(--ease-out-strong);`
- Mobile: a `View` with `borderTopLeftRadius/RightRadius 14`, and a bottom `Svg` 6pt tall with `circle cx=8+16i cy=6 r=6` filled with the colour **behind** the fiş (`bg`).
- Head (order, gift): `.rule-oxford` in `ink`, 8px gap, then the legend in `text-plate`.
- Totals are separated by `border-top: 1.5px dashed var(--line-strong)`.
- `variant="ticket"` (staff) has no Oxford rule and no scallop; it is a raised card with a 4px top band in the café colourway.

**StatusTrack** `<StatusTrack status submittedAt acceptedAt readyAt closedAt />`

- Four stops, evenly spaced: "İletildi", "Hazırlanıyor", "Hazır", "Teslim". Labels are `text-meta` 600 under the stop, and the tapped time (`14:02`, `tabular-nums`, `ink-2`) is under the label. A stop with no tapped time shows no time.
- Track: 2px `line-strong`. Done segments: 3px `ink`.
- Stops:
  - Done: a 14px `ink` disc with a 10px `Check` in `on-primary`.
  - Current: a 22px ring (2px `ink`) with an 8px `ink` centre. It moves with `layoutId="stage"`.
  - Future: a 12px ring, 1.5px `line-strong`.
- It has `role="list"`; each stop is a `listitem`, and the current stop has `aria-current="step"`.

**HazirStamp.** It appears on the fiş when the status is `ready`.

```tsx
<span aria-hidden className="plate inline-block rotate-[-4deg] rounded-[6px] border-[3px] border-double border-current px-3 py-1 text-[22px] leading-none">HAZIR</span>
```

On mobile this is a `View` with `borderWidth:3, borderStyle:'solid'`, plus an inner 1px `View` inset 2 to fake the double rule, `transform:[{rotate:'-4deg'}]` and `T variant="plate" style={{fontSize:22}}`.

### 6.4 Manşet (café masthead) and café cover

`<CafeCover cafe size="card"|"hero" />`

- Card: aspect 16/7. Hero: 160px tall on phone, 200px from 768px. Radius 14 (card: top corners only).
- If `coverImageUrl` is set: `next/image` (web) or `expo-image` (mobile) with `contentFit="cover"`, `transition={200}` on mobile, `alt=""`, and a 4px café-hue bottom border.
- Otherwise, a deterministic pattern:

```svg
<svg width="100%" height="100%" aria-hidden="true"><defs>
  <pattern id="{id}" width="56" height="56" patternUnits="userSpaceOnUse">
    <g fill="none" stroke="#FBF4E6" stroke-opacity=".16" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="{DEVICE}" transform="translate(4 4)"/><path d="{DEVICE}" transform="translate(32 32)"/>
    </g></pattern></defs>
  <rect width="100%" height="100%" fill="var(--hue-{cafeHue})"/><rect width="100%" height="100%" fill="url(#{id})"/>
</svg>
```

- Add `box-shadow: 0 0 0 1px var(--plate-ring)` (visible in dark mode only).
- The cover is the shared-element target. Web: `<ViewTransition name={`cafe-${slug}`} share="morph" default="none">` on both the card cover and the hero cover. iOS: `Link.AppleZoom` / `Link.AppleZoomTarget`.

`<Masthead cafe date greeting? compact? />`, in this order:

1. `.rule-oxford`, then 12px gap.
2. The café name: `text-h1` on the café page, or `text-h3` when `compact`.
3. 8px gap, then `.rule-ink`, then 6px gap.
4. The dateline in `text-plate ink-2`: `"{trUpper(name)} GAZETESİ · {16 EKİM 2026} · {trUpper(district)}"` (date from Intl tr-TR `{day:"numeric",month:"long",year:"numeric"}`, upper-cased).
5. Optional greeting in `text-body ink-2`: "Günaydın Ayşe."

`compact` is used at the top of Masa: no Oxford rule, no café name, only `.rule-ink` and the dateline "{CAFÉ} GAZETESİ · {DATE}".

### 6.5 Uzun masa (long table) and date block

`<LongTable capacity={14} seats={[{initials:"AK"},{initials:null},{me:true,initials:"VS"}]} count={6} />`

- `drawn = min(capacity, 16)`; `top = ceil(drawn/2)`; `bottom = drawn − top`.
- Pitch 32. `W = 16 + top×32`. `viewBox="0 0 {W} 92"`. At capacity 14, W = 240; it fits in the 296px card interior at 360px.
- Table: `<rect x="8" y="30" width="{W-16}" height="32" rx="8" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="1.5"/>`
- Chairs: `circle r=12` at `cx = 24 + i·32`, `cy = 14` (top row) and `cy = 78` (bottom row).
  - Taken: fill `masa`, with initials in Archivo 600, 11 units, `on-masa`, centred at `cy+4`, shown only if the member's profile is visible.
  - Me: fill `masa` plus a ring `r=14.5` with a 2px `ink` stroke.
  - Empty: fill `surface` with a 1.5px `line-strong` stroke.
- Fill order alternates top and bottom from the left: T0, B0, T1, B1, …
- Above 16 chairs, the last bottom chair becomes a "+N" label (Archivo 600, 11, `ink-2`).
- The SVG is `aria-hidden`. Required visible text: **"6/14 yer dolu"**, plus " · sen de geliyorsun" when RSVPed, or **"Masa doldu"** when full.
- Declines are never drawn or listed.
- Until attendees exist [gap G4], draw `rsvpCount` taken chairs with no initials (plus "me" when `rsvpedByMe`).

`<DateBlock date size="md"|"sm" />` is HTML (or a `View`):

- md: 56×64; sm: 40×48. Radius 4, `bg-masa text-on-masa`, grid centred.
- Line 1: weekday short, `trUpper(Intl tr-TR {weekday:"short"})` → "PER", in `text-plate`.
- Line 2: day number in Brygada 600, 26px (sm 18), `tabular-nums` → "22".
- Line 3: month short → "EKİ", in `text-plate`.
- The time goes beside the block, never inside it: "19:00" in `text-item tabular-nums`.

### 6.6 Café colourway band

`<CafeHueBand slug hue? />` is a 6px strip in `var(--hue-*)`, plus the `--plate-ring` in dark mode. It sits on top of wallet coin cards, on top of staff tickets (4px), under the press header (2px), and as the 3px left edge of café posts. It is never a text background except on covers and the press-header café name.

### 6.7 Glyphs on the 24-grid

All are stroke glyphs: `fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`, with `viewBox="0 0 24 24"`.

```
CEZVE   = "M8 9h7l1.6 9.8a1.8 1.8 0 0 1-1.8 2.2H8.2a1.8 1.8 0 0 1-1.8-2.2Z M8 9 6.5 7.5 M15.3 11 22 7.5"
GLASS   = "M7.5 2.5h9c0 4.4-2.8 6.2-2.8 9 0 2.5 2.8 3.9 2.8 7v1h-9v-1c0-3.1 2.8-4.5 2.8-7 0-2.8-2.8-4.6-2.8-9Z M4.5 21.5h15"
FINCAN  = "M4 8.5h12.5v4a5.5 5.5 0 0 1-5.5 5.5h-1.5A5.5 5.5 0 0 1 4 12.5Z M16.5 10h1.3a2.3 2.3 0 0 1 0 4.6h-1.6 M2.5 21h17"
HOOK    = "M3 3h18 M14 3v7a4 4 0 0 1-8 0v-1.5"                         (askı legend icon)
TABLE   = "M3 10.5h18v3H3Z M6 6.5a1.5 1.5 0 1 0 0 .01 M12 6.5a1.5 1.5 0 1 0 0 .01 M18 6.5a1.5 1.5 0 1 0 0 .01 M6 17.5a1.5 1.5 0 1 0 0 .01 M12 17.5a1.5 1.5 0 1 0 0 .01 M18 17.5a1.5 1.5 0 1 0 0 .01"
MANICULE= "M2.5 9.5h3v6h-3z M5.5 10h3.2l1.6-1.8h10.2a1.4 1.4 0 0 1 0 2.8h-7.3 M13.2 11h1.6a1.3 1.3 0 0 1 0 2.6h-1.6 M12.8 13.6h1.4a1.3 1.3 0 0 1 0 2.6H9.5c-2.2 0-4-1-4-1"
COIN_GLYPH = circle r=9 + circle r=6.5 (stroke 1.25) + "p" stem "M10.5 16.5V8.5 M10.5 9.2c.8-.6 1.7-.9 2.6-.9a2.6 2.6 0 0 1 0 5.2c-.9 0-1.8-.3-2.6-.9"
```

- `Approx` (web only, inline ≈): `<svg viewBox="0 0 10 12" width=".6em" height=".72em" aria-hidden className="inline-block align-[-.05em]"><path d="M1 4.6c1.2-1 2.4-1 3.6 0s2.4 1 3.6 0M1 8.2c1.2-1 2.4-1 3.6 0s2.4 1 3.6 0" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg><span className="sr-only">yaklaşık </span>`.
- The manicule appears at most once per screen, only on the "Neden peni?" link.

---

## 7. Motion and haptics

### 7.1 Tokens

```css
@theme {
  --ease-out-strong: cubic-bezier(.23,1,.32,1);
  --ease-drawer: cubic-bezier(.32,.72,0,1);
}
:root { --dur-press:150ms; --dur-ui:200ms; --dur-move:250ms; --dur-state:300ms; --dur-sheet:450ms; }
```

`apps/web/src/lib/motion.ts`:

```ts
export const ease = { outStrong: [0.23, 1, 0.32, 1], drawer: [0.32, 0.72, 0, 1] } as const;
export const spring = {
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0.15 },
  tap:    { type: "spring", visualDuration: 0.25, bounce: 0.3 },
  strike: { type: "spring", visualDuration: 0.35, bounce: 0.35 },
  hang:   { type: "spring", stiffness: 380, damping: 16 },
  seat:   { type: "spring", visualDuration: 0.3, bounce: 0.3 },
} as const;
export const tween = {
  ui:    { duration: 0.2,  ease: ease.outStrong },
  move:  { duration: 0.25, ease: ease.outStrong },
  state: { duration: 0.3,  ease: ease.outStrong },
} as const;
```

Mobile `src/lib/motion.ts`, using Reanimated 4.7.1:

```ts
export const EASE_OUT_STRONG = Easing.bezier(0.23, 1, 0.32, 1);
export const springs = {
  snappy: { duration: 250, dampingRatio: 0.85 },
  tap:    { duration: 250, dampingRatio: 0.6 },
  strike: { duration: 350, dampingRatio: 0.55 },
  hang:   { stiffness: 380, damping: 16, mass: 1 },
  seat:   { duration: 300, dampingRatio: 0.6 },
};
```

**Rules**

- UI motion is ≤300ms.
- Exceptions: sheets 450ms, the coin flip 420ms, and sonner's built-in toast transition.
- No scroll reveals, no list staggers, and no infinite loops. The only exception is `LoaderCircle` spinning while a request is in flight; under reduced motion it is static, with the text "Gönderiliyor…".
- Web is wrapped in `<MotionConfig reducedMotion="user">` inside `<LazyMotion features={loadFeatures} strict>`, where `loadFeatures = () => import("./motion-features").then(r => r.default)` and `motion-features.ts` is `export { domMax as default } from "motion/react"`. Components use `m.*` from `motion/react-m`.
- CSS transitions use `motion-reduce:transition-none`.
- Mobile: every Reanimated **CSS** animation or transition is gated by `useReducedMotion()`. Layout animations (`entering`/`exiting`) get `.reduceMotion(ReduceMotion.System)`. JS callbacks use `scheduleOnRN` (from `react-native-worklets`), never `runOnJS`.

### 7.2 Named animations

| # | Name | Trigger | Web (motion/react) | Mobile (Reanimated) | Reduced motion |
|---|---|---|---|---|---|
| A1 | `press` | Pointer down on any button or row | `transition-transform duration-150 ease-out-strong active:scale-[.97]` | `PressableScale`: `withTiming(.97,{duration:100,easing:EASE_OUT_STRONG})` in and out | No scale. Background steps to `primary-pressed`, `aski-pressed` or `surface-2`. |
| A2 | `stepper-tap` | +/− | `whileTap={{scale:.94}}`, `transition={spring.tap}`; count rolls with NumberFlow | `withSpring(.94→1, springs.tap)` | No scale; the number swaps |
| A3 | `plus-expand` | Quantity 0→1 | − and the count fade and slide in (`x:8→0`, `opacity:0→1`, `tween.ui`) inside the fixed 116px slot, so nothing shifts | `entering={FadeIn.duration(200)}` | Instant |
| A4 | `cartbar-swap` | Cart 0↔≥1 on the phone café page | Bottom nav `y:0→100%` (`tween.ui`), then cart bar `y:100%→0` (250ms, `ease.drawer`). On every add: bar scale `1→1.03→1` with `spring.snappy`; total rolls. | `SlideInDown.duration(250)`; bump via `withSequence` | 150ms crossfade, no bump |
| A5 | `sheet` | Open or close | Base UI Drawer popup `[transform:translateY(var(--drawer-swipe-movement-y,0px))] transition-transform duration-[450ms] ease-drawer data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-swiping:transition-none`; backdrop `opacity-[calc(.35*(1-var(--drawer-swipe-progress)))]`. Dialog (≥768): `scale .96→1` + opacity, 200ms. | Native formSheet | Opacity 150ms only |
| A6 | `coin-strike` | Peni earned: collected order with `earnedPeni` [G7], or a wallet balance higher than last seen (stored per café in localStorage or SecureStore) | Coin `initial={{y:-14,scale:1.2,opacity:0}} animate={{y:0,scale:1,opacity:1}} transition={spring.strike}`; on complete `scaleY [0.94,1]` over 90ms; NumberFlow `trend={1}` starts on landing | `Animated.View` `withSpring(…, springs.strike)`, then `withSequence(withTiming(.94,{duration:45}), withTiming(1,{duration:45}))` on scaleY; CountWheel; haptic `success` | Opacity 0→1 over 150ms; the number swaps |
| A7 | `coin-flip` | Gift accepted | `rotateY 0→180→360` over 420ms (`ease.outStrong`); front and back faces use `backface-visibility:hidden`; the back shows "+30 / PENİ" | `rotateY` on `Animated.View` with `{perspective:600}`; haptic `success` | 150ms crossfade |
| A8 | `cup-hang` | **Own** donation success; staff till success | New item `initial={{y:-18,rotate:10,opacity:0}} animate={{y:0,rotate:0,opacity:1}}`, `transition={{...spring.hang, opacity:{duration:.12}}}`, origin top-centre. A café-match whole item hangs 120ms later. | `withSpring(0, springs.hang)` on translateY and rotate; haptic `success` | Opacity 150ms |
| A9 | `cup-take` | Confirm inside the **taker's** take sheet | The mini-rail item `y:0→-8`, `opacity:1→0`, 200ms `ease.outStrong`; then the sheet closes | Same with `withTiming` | Opacity 150ms |
| A10 | `stage-advance` | Order status changes | Current ring `layoutId="stage"`, `tween.state`; done segment `scaleX 0→1` (origin left), `tween.state` | `withTiming(…, {duration:300, easing:EASE_OUT_STRONG})` | Instant |
| A11 | `hazir` | Status → ready | Fiş `data-tone="ready"` (CSS colour transition 300ms); stamp `initial={{scale:1.6,opacity:0}} animate={{scale:1,opacity:1}}`, 240ms `ease.outStrong` | Background colour transition gated by reduced motion; stamp `withTiming`; haptic `success`; `AccessibilityInfo.announceForAccessibility` | Instant colour; the stamp just appears |
| A12 | `ticket-move` | Staff bump | `layout` + `<AnimatePresence mode="popLayout">`, `tween.move`; the ticket gets `pointer-events:none` until `onLayoutAnimationComplete` (taps never land on a moving ticket) | `layout={LinearTransition.duration(250)}` | Instant |
| A13 | `new-ticket` | New order arrives | A 4px `warning` left bar, fully visible for 10s, then opacity 1→0 over 600ms. No flashing, no pulse. | Same | The bar stays 10s, then disappears without a fade |
| A14 | `seat-take` | RSVP "Geliyorum" | My chair `scale .6→1` with `spring.seat` (origin centre); initials fade in over 150ms | `withSpring(1, springs.seat)`; haptic `tap` | Fade 150ms |
| A15 | `segment` | Segmented or tab change | Underline `layoutId="seg-{id}"` with `spring.snappy` (bounce 0) | `withTiming(x,{duration:200})` | Instant |
| A16 | `cafe-morph` | Card → café page | React `<ViewTransition name share="morph" default="none">`; CSS `::view-transition-group(*){animation-duration:300ms;animation-timing-function:var(--ease-out-strong)}`; header `view-transition-name:site-header` with `animation:none`; `::view-transition{pointer-events:none}` | iOS 18+ `Link.AppleZoom`; Android default push | `@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation-duration:0s}}` |
| A17 | `number-roll` | Any peni or TL change | `@number-flow/react` `<NumberFlow value locales="tr-TR" />` (respects reduced motion by default) | Bluesky CountWheel pattern: digits keyed by value; `entering`/`exiting` worklets with translateY ±18 and opacity over 400ms (`Easing.out(Easing.cubic)`); `LayoutAnimationConfig skipEntering` on first mount | Swap |
| A18 | `toast` | Async outcome | sonner default transition | `ToastHost`: `FadeInUp.duration(200)` / `FadeOutUp.duration(150)`, `.reduceMotion(ReduceMotion.System)` | Fade |

### 7.3 Haptics (mobile, `src/lib/haptics.ts`)

`haptic(intent)` does nothing on web or when the user has turned "Titreşim" off in Profil, and swallows every rejection with `.catch(() => {})`.

| Intent | iOS (`expo-haptics`) | Android | Used for |
|---|---|---|---|
| `tap` | `impactAsync(ImpactFeedbackStyle.Light)` | `performAndroidHapticsAsync(AndroidHaptics.Context_Click)` | "+", "Askıdan al", Geliyorum, heart |
| `selection` | `selectionAsync()` | `AndroidHaptics.Segment_Tick` | Segmented control, preset chips, peni toggle, pull-to-refresh |
| `confirm` | `impactAsync(ImpactFeedbackStyle.Medium)` | `AndroidHaptics.Confirm` | Order sent, gift sent, staff bump |
| `success` | `notificationAsync(NotificationFeedbackType.Success)` | `AndroidHaptics.Confirm` | Peni earned, gift accepted, order **Hazır**, cup hung |
| `warning` | `notificationAsync(NotificationFeedbackType.Warning)` | `AndroidHaptics.Reject` | New order in Kafe modu; order rejected (customer) |
| `error` | `notificationAsync(NotificationFeedbackType.Error)` | `AndroidHaptics.Reject` | Any failed request |

---

## 8. Navigation and layout

### 8.1 Web route structure

The URLs stay the same; only the folders change.

```
src/app/layout.tsx                       <html lang="tr">, fonts.css + globals.css, preload links, theme script, <Providers>
src/app/(customer)/layout.tsx            TopBar, BottomNav (<768), <main>, footer only on "/"
src/app/(customer)/page.tsx              /                Home
src/app/(customer)/giris/page.tsx        /giris
src/app/(customer)/k/[slug]/page.tsx     /k/[slug]        Café
src/app/(customer)/siparis/[id]/page.tsx /siparis/[id]    Order fiş
src/app/(customer)/siparisler/page.tsx   /siparisler      NEW
src/app/(customer)/cuzdan/page.tsx       /cuzdan
src/app/(customer)/profil/page.tsx       /profil          NEW
src/app/(customer)/masa-kurallari/page.tsx /masa-kurallari NEW
src/app/(customer)/hediye/[id]/page.tsx  /hediye/[id]     NEW, gift landing [G11]
src/app/(customer)/not-found.tsx, error.tsx
src/app/(staff)/kafe/[slug]/layout.tsx   Press-room shell (no customer chrome)
src/app/(staff)/kafe/[slug]/page.tsx     /kafe/[slug]     Café panel
```

- Providers, in order: `LazyMotion`, `MotionConfig`, sonner `Toaster`, `ActiveOrderProvider` (customer group only).
- Theme script: an inline `<script>` in `<head>` reads `localStorage["peni-theme"]` inside try/catch and sets `data-theme` before paint.
- Remove "Kafe paneli" from `layout.tsx:28`. Customers never see a staff link.

### 8.2 Web customer chrome

**Desktop (≥768)**

- Top bar, 64px, sticky, solid `bg` with a bottom `line` and `view-transition-name: site-header`.
  - Left: the wordmark, a 20px coin plus "peni" in Brygada 600 24px (a link to "/").
  - Centre: "Kafeler · Siparişlerim · Cüzdan". The active link is `ink` 600 with a 2px `ink` underline (`layoutId="nav"`). Inactive links are `ink-2`. Each link is at least 44px tall.
  - Right: the `ActiveOrderChip` when present, a "Peni kodum" secondary button with `QrCode`, and a 44px avatar button that opens a menu with "Profil" and "Çıkış yap".
- Container 1120px.

**Phone (<768)**

- Top bar, 56px: the wordmark on the left, and on the right the `ActiveOrderChip` (if any) and a 44px `IconButton` "Peni kodum". When the chip is visible below 390px, the wordmark shrinks to the coin only (link `aria-label="peni ana sayfa"`).
- **BottomNav**, 64px + safe area, `bg-surface shadow-floating`, four equal items:
  - Items: Kafeler `Coffee` · Siparişler `ReceiptText` · Cüzdan `CoinGlyph` · Profil `UserRound`.
  - Each item: 24px icon over a 13px label.
  - Active: `ink` label 600 with a 2px `ink` bar above the icon (`layoutId`), `aria-current="page"`. Inactive: `ink-2`.
  - Siparişler shows an 8px `masa` dot when an order is active. The dot is decorative; the chip carries the text.
- **The floating-layer budget is one.** On `/k/[slug]`, as soon as the cart has ≥1 item, the bottom nav is replaced by the **CartBar** (A4), and the bottom nav comes back when the cart is empty. Sheets overlay everything. There is no floating active-order pill on web.

**`ActiveOrderChip`.**

- Shown on every customer page except `/siparis/[id]`, when `orders.mine()` has a status in `submitted | accepted | ready`. The newest order is shown.
- A 36px-tall chip with a 44px hit area: dot + "P-003 · Hazırlanıyor".
- When the status is `ready`: `bg-success text-on-success`, "P-003 · Hazır".
- Polls every 20s while the document is visible, and stops when there are no active orders.
- Links to the fiş.

**Footer.** Only on "/": "Masa kuralları" link, plus one line: "1554 Tahtakale'den 1652 Londra'ya: bir fincanın etrafında aynı masa."

### 8.3 Web staff chrome

`PressHeader` is 56px, `bg-press text-on-press`, `--focus: var(--on-press)`, with a 2px café-hue bottom band. It holds:

- The café name in Archivo 600 17px.
- A live clock (`HH:MM`, tabular, updated each minute).
- The **pause pill**: "Uygulama siparişleri: Açık" (success dot) or "Uygulama siparişleri: Durdu" (warning icon).
- The sound toggle: an `IconButton` `Volume2`/`VolumeX` with the label "Ses açık"/"Ses kapalı".
- "Çıkış" (forgets the staff key).

Below it, a segmented control **Tezgâh · Askı · Rapor**, then the content at max-width 1280px. There is no customer header, bottom nav or footer.

### 8.4 Mobile app structure

```
src/app/_layout.tsx            fonts + splash, ThemeProvider(navTheme(tokens)), SessionProvider, CartProvider, ToastHost, ModeProvider
                               <Stack> with:
                                 <Stack.Protected guard={mode==="customer"}><Stack.Screen name="(customer)" options={{headerShown:false}}/></Stack.Protected>
                                 <Stack.Protected guard={mode==="staff"}><Stack.Screen name="(staff)" options={{headerShown:false}}/></Stack.Protected>
                                 kafe/[slug], siparis/[id], giris (modal), masa-kurallari, peni-kodum (fullScreenModal),
                                 sheets: sepet, katil, askidan-al, askiya-birak, ismarla, iptal, reddet, durdur, kafe-modu (formSheet)
src/app/(customer)/_layout.tsx NativeTabs (expo-router/native-tabs)
src/app/(customer)/(kafeler)/_layout.tsx + index.tsx        "/"
src/app/(customer)/(siparisler)/_layout.tsx + siparisler.tsx
src/app/(customer)/(cuzdan)/_layout.tsx + cuzdan.tsx
src/app/(customer)/(profil)/_layout.tsx + profil.tsx
src/app/(staff)/_layout.tsx    NativeTabs
src/app/(staff)/(tezgah)/…/tezgah.tsx, (aski)/kafe-aski.tsx, (rapor)/rapor.tsx, (ayarlar)/ayarlar.tsx
```

- **Mode.** The value `"customer" | "staff"` is persisted in `expo-secure-store` under the key `peni.mode`. It is read **before** the navigator mounts, and the splash stays up until it is read.
  - Profil → "Kafe moduna geç" (or the staff-key sheet) sets `staff` and calls `router.replace("/tezgah")`.
  - Ayarlar → "Müşteri moduna dön" sets `customer` and calls `router.replace("/")`.
  - Tabs are never hidden dynamically.
- `navTheme(t)`: `{dark, colors:{primary:t.ink, background:t.bg, card:t.bg, text:t.ink, border:t.line, notification:t.masa}, fonts:{regular:{fontFamily:"Archivo_400Regular",fontWeight:"normal"}, medium:{fontFamily:"Archivo_600SemiBold",fontWeight:"normal"}, bold:{fontFamily:"Archivo_600SemiBold",fontWeight:"normal"}, heavy:{fontFamily:"Brygada1918_600SemiBold",fontWeight:"normal"}}}`.
- Our token hook is named **`useTokens()`**, because `expo-router` already exports a `useTheme`.
- Install `expo-system-ui` so Android follows `userInterfaceStyle: "automatic"`.

**Customer NativeTabs**

- `tintColor={DynamicColorIOS({light:"#1D1813", dark:"#F2EADC"})}`, `minimizeBehavior="onScrollDown"`. On Android, `indicatorColor` and `rippleColor` are both `surface2` (copper is for peni only, so it is not used here).
- Tabs:

| Trigger | Label | SF Symbol (default / selected) | Material |
|---|---|---|---|
| `(kafeler)` | "Kafeler" | `cup.and.saucer` / `cup.and.saucer.fill` | `local_cafe` |
| `(siparisler)` | "Siparişler" | `list.bullet.rectangle` | `receipt_long` |
| `(cuzdan)` | "Cüzdan" | `circle.circle` / `circle.circle.fill` | `toll` |
| `(profil)` | "Profil" | `person.crop.circle` / `person.crop.circle.fill` | `account_circle` |

- When an order is active: `NativeTabs.Trigger.Badge` on Siparişler, showing "1".

**Staff NativeTabs**

| Trigger | Label | SF Symbol | Material |
|---|---|---|---|
| `(tezgah)` | "Tezgâh" | `tray.full` | `inbox` |
| `(aski)` | "Askı" | `cup.and.saucer` | `coffee` |
| `(rapor)` | "Rapor" | `chart.bar` | `bar_chart` |
| `(ayarlar)` | "Ayarlar" | `gearshape` | `settings` |

The Tezgâh badge shows the number of new orders.

**Headers.** Each tab has its own `Stack` with these options:

- `headerLargeTitleEnabled: true` (never the deprecated `headerLargeTitle`).
- `headerLargeTitleStyle: {fontFamily:"Brygada1918_600SemiBold", fontSize:34, color:t.ink}`.
- `headerTitleStyle: {fontFamily:"Archivo_600SemiBold", fontSize:17, color:t.ink}`.
- `headerStyle: {backgroundColor:t.bg}`, `headerShadowVisible:false`, `contentStyle:{backgroundColor:t.bg}`, `headerBackTitle:"Geri"`.
- The `ScrollView` is the first child of every tab screen.

**Active order.**

- iOS 26: `NativeTabs.BottomAccessory`. Its state lives outside the accessory, and it branches on `NativeTabs.BottomAccessory.usePlacement()`. Content: "P-003 · Hazırlanıyor" with a 20pt progress ring.
- Android and iOS <26: a floating pill 8pt above the tab bar, on tab screens only.
- Both are hidden on root-stack screens (café, order), which have no tab bar. That keeps the café screen to one floating layer: the cart bar.

**Sheets.** `presentation:"formSheet"`, `sheetGrabberVisible:true`, `sheetCornerRadius:22`. The title goes inside the content, because Android has no native header in a sheet.

| Sheet | `sheetAllowedDetents` |
|---|---|
| `sepet`, `ismarla` | `[0.6, 1]` |
| `askiya-birak` | `[0.75, 1]` |
| `katil`, `askidan-al`, `iptal`, `reddet`, `durdur`, `kafe-modu` | `"fitToContents"` (explicit heights, never `flex:1`) |

`peni-kodum` uses `presentation:"fullScreenModal"`.

**Tablet.** `ios.supportsTablet` stays `false`. Staff tablets use the web panel, which has three columns from 768px.

---

## 9. Web screens

Every screen supports light and dark, works at 360–430px with no horizontal scroll, uses 44px minimum targets, and shows focus with `focus-visible:outline-2 outline-offset-2 outline-[var(--focus)]`. Loading uses skeletons with the final geometry (`bg-surface-2`, static, radius of the real element). Errors are inline and never wipe the page.

### 9.1 Home `/`

**Layout (phone)**

1. Hero, max 640px.
   - h1 `text-h1`: "Mahallenin masası."
   - Body `text-body-lg ink-2`: "Siparişini önceden ver, kasada öde. Her harcamada o kafeye özel peni biriktir, askıya bir çay bırak."
   - Link `text-button`: "Neden peni?" + `Manicule` 18px. It goes to `/masa-kurallari`.
2. Signed out only: a flat strip on `surface-2`, radius 10, padding 12. Text: "Kafeye katıl, peni biriktir." with a quiet button "Giriş yap" (→ `/giris?returnTo=/`).
3. `text-h2` "Kafeler", then the grid: 1 column; 2 from 640; 3 from 1024; gap 16.

**`CafeCard`** (a raised card that is a link; the whole card is the target, `aria-label` = café name):

- Cover (card size, ViewTransition).
- Body, padding 16:
  - Legend `ink-2`: "KADIKÖY · İSTANBUL".
  - `text-h3`: the café name.
  - Rows, with an 8px gap:
    - Members: 16px coin + "Sende **90 peni**" (`peni-ink` 600) + " · ≈ 3 çay" (`meta ink-2`) [G1]. Fallback: "Üyesin" with a `Check` icon.
    - Askı: `AskiRail size="sm"` (6 slots) + "Askıda 7 çay" (`meta`), or "Askı boş" with empty hooks only. No coin.
    - Next event: a chip `bg-masa-soft text-masa-ink` with `DateBlock` sm-style text, "Per 19:00 · Peni masası" [G2]; hidden without data.
    - Status: a `Chip` with "Sipariş alıyor" (success dot) or "Şu an sipariş almıyor" (`CirclePause`, `warning-ink`).

**States**

- Loading: three skeleton cards (cover 16/7, then 16/22/16px bars).
- Empty: `EmptyState` with `Store` and "Yakında burada mahallenin kafeleri olacak." (no action).
- Error: `Banner tone="danger"` "Kafeler yüklenemedi." + "Tekrar dene".

**Desktop.** The hero is left-aligned, and the grid runs under it at 3 columns.

### 9.2 Sign-in `/giris`

- A centred raised card, max 400px: generic 96px coin, h2 "Hoş geldin", body `ink-2` "Telefon numaranla giriş yap. Şifre yok; SMS ile 6 haneli bir kod gelir."
- **Phone step.**
  - `Field label="Telefon numaran"`: "+90" as a fixed prefix outside the input, mask `5xx xxx xx xx`, `inputMode="tel"`, `autoComplete="tel-national"`, 48px.
  - Primary button "Kod gönder".
  - Error: "Numara 5 ile başlamalı ve 10 haneli olmalı."
- **Code step.**
  - Meta: "+90 532 123 45 67 numarasına bir kod gönderdik."
  - `CodeInput`: six 48×56 boxes, `inputMode="numeric"`, `autoComplete="one-time-code"`. Pasting fills all boxes. Group label: "SMS ile gelen kod".
  - Under the boxes: a quiet "Kodu tekrar gönder (0:42)" that counts down 60s and is disabled until then, and a quiet "Numarayı değiştir".
  - Errors: "Kod tutmadı. Tekrar dener misin?"; after 5 attempts: "Çok fazla hatalı deneme oldu. Yeni bir kod iste."; network: "Bağlantı kurulamadı. Tekrar dene."
- **Name step** (new customer [G8]): h3 "Adın ne?", `Field label="Adın"` with hint "Siparişin hazır olunca bu adla çağrılırsın.", button "Devam".
- After success: `router.replace(returnTo ?? "/")`. `returnTo` must be a same-origin path.
- **Demo.** Only when `NEXT_PUBLIC_DEMO=1`: a dashed 1.5px `line-strong` box with a "DENEME" `Stamp`, the text "Deneme hesaplarıyla tek dokunuşla gir.", and the persona buttons (secondary). Remove "Demo:" hints from production copy.

### 9.3 Café page `/k/[slug]`

**Phone order, top to bottom**

1. `CafeCover size="hero"`.
2. `Masthead`, with the greeting for members.
3. Meta: `MapPin` + "Moda Cd. No: 42 · Kadıköy". Next line `meta ink-2`: "Her harcamada %5 peni · 1 peni = ₺1, yalnız bu kafede".
4. Membership row:
   - Member: a `peni-soft` chip with a 16px coin, "Sende **90 peni**", and "≈ 3 çay". Next to it, a quiet button with `Gift`: "Bir çay ısmarla" (opens the gift sheet with this café preselected).
   - Non-member: primary "Kafeye katıl" with meta "Üyelik ücretsiz. Sipariş verir, her harcamada peni biriktirirsin."
   - Signed out: primary "Giriş yap ve katıl" (→ `/giris?returnTo=/k/moda`).
5. **"Bugün masada" strip** (only when there is an upcoming event or a question): `masa-soft`, radius 10, padding 12, legend `masa-ink` "BUGÜN MASADA". Up to two rows, each a button that scrolls to Masa:
   - sm `DateBlock` + "Peni masası · 19:00" (`meta`) + the topic (`text-item`).
   - The question in `text-question` at 17px italic, clamped to one line.
6. **Segmented** (sticky, `top: var(--header-h)`, `bg-bg`, bottom `line`): "Menü · Askı · Masa". It scroll-spies with IntersectionObserver and scrolls smoothly (instant under reduced motion).
7. **Menü** section (`id="menu"`).
8. **Askı** section (`id="aski"`).
9. **Masa** section (`id="masa"`).

**Desktop (≥1024).** Grid `1fr 360px`, gap 48. The right column holds a sticky `CartPanel` fiş (`top: calc(64px + 24px)`). Tablet 768–1023 is single column with CartBar and Sheet (Dialog).

**Menü**

- Legend "MENÜ" is not shown; the segmented control names it.
- Per category: a legend (the category name, upper-cased by CSS, for example "YİYECEK"), then one raised card of flat rows.
- **MenuRow** (`@container`, min-height 72):
  - Left column (flex 1, min-w 0): name `text-item`; under it `meta`: price `tabular-nums` (`₺30`) + " · " + description in `ink-2`.
  - Right: a **fixed 116px slot**. Quantity 0: a 44px round secondary `IconButton` `Plus` (`aria-label="Latte ekle"`), right-aligned. Quantity >0: `Stepper` (− 44, count 28 `text-item tabular-nums`, + 44).
  - Sold out: the row stays at full contrast and the price stays plain (never struck through). A "TÜKENDİ" tag (legend, `ink-2` on `surface-2`, radius 4) replaces the slot content.
- **Ordering blocked** (one banner above the first category; the steppers are hidden, so the state is never silent):
  - Café paused or closed (`!acceptingOrders`): `Banner tone="warning"` `CirclePause` "Kafe şu an uygulamadan sipariş almıyor. Kasaya uğrayabilirsin."
  - Member pre-order off (`membership.preorderEnabled === false`): `Banner tone="warning"` "Son iki siparişin teslim alınmadığı için burada önden sipariş şimdilik kapalı. Kafeye uğradığında baristaya söylemen yeterli; yeniden açabilir." [G5 adds the strike count]
- **Non-member "+"** opens the join sheet:
  - Title "Kafeye katıl".
  - Body: "Moda Kahvesi üyesi olunca sipariş verir, her harcamada peni biriktirirsin. Üyelik ücretsiz."
  - Primary "Katıl ve ekle" (joins, then adds the item). Quiet "Vazgeç".
  - Signed out, the primary is "Giriş yap ve katıl" → `/giris?returnTo=/k/moda?ekle=latte`, and the sheet re-opens on return.
- Query `?sepet=latte:1,simit:1` (from "Her zamanki" or "Yeniden sipariş ver") pre-fills the cart with available items. If something was dropped: `Banner tone="info"` "Simit şu an tükendi; sepetine eklemedik."

**Cart** (`CartPanel` on desktop; `CartBar` + Sheet on smaller screens)

- **CartBar** (phone and tablet): 64px + safe area, `bg-surface shadow-floating`, a full-width button.
  - Left: "2 ürün" (`text-button`) + " · " + the due total (NumberFlow, `tabular-nums`, 600).
  - Right: "Sepeti gör" + `ArrowRight`.
  - It opens the cart sheet.
- **Cart content**, in this order. On desktop the title is h3 "Siparişin" inside a fiş with the legend "MODA KAHVESİ · SEPET"; in the sheet the title is "Siparişin".
  1. Lines (flat rows): "1 × Latte" and `₺120` on the right, with a stepper (44) per line in the sheet.
  2. An askı line, if taken: "İkram" in `ink-2`, "Çay", and "−₺30". Styled exactly like the peni line, with no colour.
  3. **Peni toggle** (only if `usablePeni > 0`): a Base UI `Switch` row (56px).
     - Label: "{usable} penini kullan". Value at the right: "−₺{usable}" in `peni-ink` `tabular-nums`.
     - Track off: `surface-2` + 1.5px `line-strong`. Track on: `peni`. Thumb: `surface`.
     - When capped below the balance, a hint: "Bu siparişte en fazla 55 peni kullanabilirsin."
  4. `Field label="Not (isteğe bağlı)"`, a textarea with 2 rows, `maxLength={200}`, placeholder "az şekerli, yulaf sütlü…". Wrap it in `Drawer.VirtualKeyboardProvider`.
  5. **Earn preview**, a flat `peni-soft` panel: 16px coin + "Kasada ödeyince **+2 peni** kazanırsın". When the toggle is on, add the meta line "Peniyle ödenen kısım peni kazandırmaz." Hidden when the result is 0.
  6. Total row: "Kasada ödenecek" with `₺55` (`text-h3 font-sans tabular-nums`: h3 size, but Archivo, never Brygada), or "Kasada ödeme yok" when it is 0.
  7. Primary full-width "Siparişi gönder · ₺55" (when due is 0: "Siparişi gönder").
     - Loading: "Gönderiliyor…" with a spinner; the button is disabled.
     - On success: `router.push("/siparis/{id}")`. **No toast.**
     - On error: inline `danger` with `CircleAlert` above the button: the API message, or "Gönderilemedi. Sepetin duruyor, tekrar dene." The cart and note are kept, and a new idempotency key is created.
  8. When ordering is blocked, the banner from Menü replaces the button.
- Empty cart (desktop): `meta ink-2` "Menüden bir şey seç. Ödemeyi kasada yaparsın."

**Askı** (a flat `aski-soft` panel, radius 14, padding 16)

- Head: legend `aski-ink` "ASKIDA KAHVE", and a quiet info button "Askı nedir?" that opens a popover: "Askı, eski mahalle sebilleri gibi: herkese açık, kimse soru sormaz. Biri bırakır, isteyen alır; kimin aldığı hiçbir yerde görünmez."
- `AskiRail size="md"` and its caption (§6.2).
- Two equal-weight buttons in a row (each at least 48px, `flex-1`):
  - **"Askıdan al"**: `variant="aski"`.
  - **"Askıya bırak"**: `variant="secondary"`.
- Donor lines (only donors who chose to be named, max 3, newest first): "Ayşe K. 1 çay bıraktı · bugün" (`meta`). Till donations and café matches are never listed per event; they appear only in the weekly line. Claims are never listed.
- **Take sheet** ("Askıdan al" when eligible):
  - Title "Askıdan bir ikram".
  - Mini rail (md, 6 slots).
  - "Hangisi?" with choice chips for the café's askı items whose price ≤ pool. Chips the pool can't cover are disabled with the reason "Askıda yeterli peni yok".
  - Body: "Siparişine eklenir, kasada ₺0 görünür. Adın kimseye görünmez."
  - Primary `aski` "Siparişime ekle", quiet "Vazgeç". No question about why, no counter, no thank-you prompt.
  - On confirm: A9 plays, the sheet closes, and the item joins the cart as an ikram line (the CartBar appears).
- **Take states**, which replace the chips and the primary [G3]:

| State | Copy |
|---|---|
| Claimed today | "Bugünkü ikramını aldın. Yarın yine gel." |
| Too new | "Askıdan almak için üyeliğinin 7 günlük olması gerekiyor. 3 gün kaldı." |
| Blocked | "Şu an askıdan alamıyorsun. Kasaya sorabilirsin." |
| Empty | "Askı şu an boş. Biri bıraktığında burada görünür." |
| Ordering blocked | "Askıdan almak için sipariş gerekiyor; kafe şu an uygulamadan sipariş almıyor." |
| Non-member | "Askıdan almak için kafeye katıl. Üyelik ücretsiz." + "Kafeye katıl" |

  Until G3 exists, a second claim fails at submit: show the API error **inside the cart**, remove the ikram line, and keep everything else.
- **Give sheet**:
  - Title "Askıya bırak", then "Ne bırakıyorsun?".
  - Choice chips from the askı items: "1 çay · 30 peni", "1 filtre kahve · 85 peni", "1 simit · 25 peni", "Başka". "Başka" reveals a `Stepper` for peni (step 5, min 1, max balance), with the label "Peni".
  - Unaffordable chips are disabled and show "Bakiyen 25".
  - `Switch` off by default: "Adım askıda görünsün", with hint "Kapalıyken bağışın adsız görünür."
  - If the café matches [G12]: meta "Kafe her bağışa %50 ekliyor."
  - Primary (ink) "1 çay bırak · 30 peni" (custom: "45 peni bırak").
  - On success: the sheet closes, A8 hangs the cup on this screen, and a toast "1 çay askıya asıldı." appears. With a match, the toast also says "Kafe de 15 peni ekledi." The mobile `success` haptic fires.
  - Errors stay inline in the sheet.

**Masa** (`id="masa"`)

- h2 "Masa", then `Masthead compact`.
- The feed is chronological, newest first, with pinned items on top.
- **Günün sorusu** (pinned question): a flat `masa-soft` card, radius 14, padding 16.
  - Legend `masa-ink` "GÜNÜN SORUSU" and the time `meta`.
  - The question in `text-question`.
  - The 3 newest answers as notes on `surface`: "Ayşe K. · 09:12" (`meta ink-2`) and the body (`text-body`).
  - A quiet button "12 cevabın hepsini gör" expands the list in place, using `interpolate-size: allow-keywords` as progressive enhancement.
  - Members: secondary "Sen de cevapla" reveals `Field label="Cevabın"` (textarea, max 500) + "Gönder". After answering: "Bugünkü cevabın masada." [G13]
  - Non-members: "Cevap yazmak için kafeye katıl."
- **Peni masası** (event): a raised card with no fiş scallop.
  - Head row: md `DateBlock`, then the legend `masa-ink` "PENİ MASASI" with "19:00", and the topic as `text-h3` [G4 title; fallback: the first line of the body].
  - The body in `text-body`.
  - `LongTable`, then the seats text.
  - Actions: primary "Geliyorum" (`aria-pressed`). After RSVP it becomes secondary "Geliyorsun" with `Check`, and tapping again un-RSVPs with no confirm. Also secondary "Takvime ekle" (`CalendarPlus`) and a quiet `IconButton` `Share2` "Paylaş".
  - "Takvime ekle" downloads an `.ics` built in the client (DTSTART = `eventStartsAt`, 2h, SUMMARY = topic, LOCATION = address).
  - "Paylaş" uses `navigator.share`, falling back to copying the link with the toast "Bağlantı kopyalandı.".
  - Full: "Geliyorum" is disabled with the reason "Masa doldu". Past: a "GEÇTİ" tag and no actions.
  - The date appears once, in the date block.
- **Café post**: a raised card with a 3px café-hue left edge.
  - A 28px café coin + café name `text-button` + `relDay` `meta`.
  - The body.
  - Footer: `HeartButton` (44, `Heart`; filled `ink` when reacted; count `tabular-nums`; optimistic update) and "4 yorum" (expands the comments; members get the "Yorum yaz" field).
  - Non-members tapping the heart get a popover: "Kalp bırakmak için kafeye katıl." + "Katıl".
- Empty: `EmptyState` `MessageCircle` "Masa bugün sakin. Kafe yeni bir soru sorunca burada görürsün."
- Errors from `act()` show as `toast.error(message)`, and the optimistic state rolls back.

**Page states**

- Loading: skeletons for the cover, the masthead lines, the segmented bar, and 4 menu rows.
- Not found: "Bu kafe masada yok." + "Kafelere dön".
- Network error on load: `Banner tone="danger"` + "Tekrar dene". Errors after load NEVER replace the page; the old `cafe-view.tsx:55` behaviour is removed.

### 9.4 Order fiş `/siparis/[id]`

- Centred, max 440px. `Fis variant="order"` with the legend "MODA KAHVESİ · SİPARİŞ".
- Inside, in order:
  1. Code "P-003" in `text-code`.
  2. The customer name in `meta ink-2`.
  3. `StatusTrack`.
  4. The headline in an `aria-live` region (`polite`; `assertive` when the status becomes `ready`), `text-h3`.
  5. A dashed rule, then lines: "1 × Latte ₺120", "1 × Simit ₺25", "Peni −₺90", "İkram −₺30". Deduction lines use `ink-2`, the same style for peni and askı, with no green and no "(askıdan)".
  6. A dashed rule, then the total: "Kasada ödenecek ₺55" or "Kasada ödeme yok".
  7. "Peni kodun: M7K-42Q" in `plate ink-2` [G7b], hidden without data.
- **Headline by status**

| Status | Headline and behaviour |
|---|---|
| submitted | "Kafeye iletildi. Barista birazdan onaylar." |
| accepted | "Hazırlanıyor." No ETA, ever, unless the café has median data [G14]; then "Hazırlanıyor · genelde 5–8 dk". |
| ready | Tone `ready` + `HazirStamp`. h3 "Hazır!" + body "Kasada P-003 kodunu söyle, ₺55 öde." (due 0: "Kasada P-003 kodunu söyle. Ödeme yok."). The document title becomes "Hazır · P-003". |
| collected | "Afiyet olsun." With `earnedPeni` [G7], a 28px coin with A6 and "+2 peni cüzdanında". |
| rejected | "Kafe şu an yetişemiyor." + meta "Kafenin notu: {reason}" + "Kullandığın 90 penin cüzdanına döndü." (when peni was used) + "Askıdaki çay yerine döndü." (when askı was used). Primary "Yeniden sipariş ver" → `/k/{slug}?sepet=…`. |
| cancelled | "İptal edildi. Kullandığın peni cüzdanına döndü." (the second sentence only if peni was used) |
| no_show | "Teslim alınmadı." + "Kullandığın peni cüzdanına döndü. Üst üste iki sipariş teslim alınmazsa bu kafede önden sipariş kapanır." |

- **Actions** under the fiş:
  - Primary "Kafeye dön" (for rejected the primary is "Yeniden sipariş ver" and "Kafeye dön" is secondary).
  - While `submitted` only: a quiet `danger` "İptal et" that opens the confirm sheet. Title "Siparişi iptal edelim mi?", body "Barista henüz başlamadı; iptal edersen kullandığın peni cüzdanına döner." Buttons: `danger-quiet` "İptal et" and primary "Vazgeç". Errors are inline in the sheet.
- **Polling.** Every 4s while visible; stops at `collected | rejected | cancelled | no_show`.
- Loading: a skeleton fiş. Not found: "Bu sipariş bulunamadı." + "Siparişlerim".

### 9.5 Siparişlerim `/siparisler` (new)

- h2 "Siparişlerim".
- Legend "ŞİMDİ": active orders as compact fişes (code `text-h2` Brygada, `StatusTrack`, headline). The whole fiş links to the order.
- Legend "GEÇMİŞ": one raised card of rows grouped by `relDay`. Each row has:
  - The café name `text-button` + " · P-003".
  - Items `meta ink-2` ("Latte, Simit").
  - The total `tabular-nums`.
  - A status `Chip` with icon + word:

| Status | Chip |
|---|---|
| collected | "Teslim edildi" (`Check`, success) |
| rejected | "Kafe yetişemedi" (`Undo2`, neutral) |
| cancelled | "İptal edildi" (neutral) |
| no_show | "Teslim alınmadı" (`CircleAlert`, warning) |

- The most recent collected order per café gets a "Her zamanki: Latte + Simit" choice chip that links to `/k/{slug}?sepet=…`.
- Empty: `EmptyState` `ReceiptText` "Henüz siparişin yok. Bir kafe seç, ilk siparişini ver." + "Kafelere bak".
- Signed out: "Siparişlerini görmek için giriş yap." + "Giriş yap".
- Loading: 2 skeleton rows.

### 9.6 Cüzdan `/cuzdan`

- Header: h2 "Cüzdan", meta "2 kafede peni biriktirdin.", and on the right the secondary "Peni kodum" (`QrCode`).
- **Incoming gifts** (pending, direction in) at the very top, each a `Fis variant="gift"`:
  - Legend "ISMARLAMA · MODA KAHVESİ".
  - h3 "Ayşe sana 1 çay ısmarladı" (goods via `goods(peni)`; fallback "30 peni").
  - The note in `text-question` 17px italic, in quotes: "“Afiyet olsun!”".
  - `meta ink-2` "Yarın 14:30'a kadar kabul edebilirsin." (built with `relDay` + `dativeTime`).
  - Primary "Kabul et", quiet "Geri çevir".
  - Accept runs A7 on a 56px coin. The text becomes "Afiyet olsun! 30 peni cüzdanında." and the café card balance rolls. "Teşekkür et" appears only with [G15].
  - "Geri çevir" opens a confirm sheet: "Geri çevirelim mi?" / "Peni Ayşe'ye döner." / "Geri çevir" / "Vazgeç".
- Legend "JETON KESESİ", then one raised card per membership with `CafeHueBand` on top:
  - A 56px `Coin` + the café name `text-h3` + district legend.
  - The balance in `text-balance` ("90") followed by " peni" in `text-body`, with A6 when it increased.
  - `meta ink-2` "≈ 3 çay · 1 Türk kahvesi" [G1 reference items].
  - `meta ink-2` "1 peni = ₺1, yalnız bu kafe için."
  - Buttons: secondary "Ismarla" (`Gift`) and quiet "Kafeye git".
- Legend "HAREKETLER", grouped by `relDay`, written as sentences. Until [G16] exists, gifts only:
  - Out: "Mehmet'e 30 peni ısmarladın" + chip "bekliyor" (`Clock`, `warning-ink` on `warning-soft`), "kabul edildi" (`Check`, `success-ink` on `success-soft`) or "sana döndü" (`Undo2`, `ink-2` on `surface-2`).
  - Pending out gifts: quiet "Geri al" [G17].
  - In: "Ayşe sana 30 peni ısmarladı" + "kabul ettin" / "geri çevirdin" / "süresi doldu".
  - With [G16], also: "Sipariş P-003 · +6 peni", "Siparişte 90 peni kullandın", "Askıya 30 peni bıraktın".
- Empty (no memberships): `EmptyState` `Store` "Henüz peni yok. Bir kafeye katıl; ilk siparişinden itibaren her harcamada peni birikir." + "Kafelere bak". Don't render the gift sheet trigger.
- Signed out: "Cüzdanını görmek için giriş yap." + "Giriş yap".
- **Gift sheet `GiftSheet`** (3 steps; legend "ADIM 1/3"; back with `ChevronLeft`):
  1. "Hangi kafede?" lists only cafés with balance > 0, as rows "Moda Kahvesi · 90 peni". Skipped when the café is preselected (the counter then shows 2 steps).
  2. "Kime ısmarlıyorsun?"
     - [G6] "Son ısmarladıkların" avatar rows (initials).
     - `Field label="Telefon numarası"` with the +90 prefix and hint "Bu kafenin üyesi olmalı.". After lookup [G6] a confirm row: "Mehmet K. · bu kafenin üyesi" + primary "Devam".
     - Errors: "Bu numarayla bu kafede üye bulunamadı." / "Kendine ısmarlayamazsın."
     - Fallback without G6: send directly and show the server error inline.
  3. "Ne ısmarlıyorsun?"
     - Chips: "1 çay · 30 peni", "1 Türk kahvesi · 90 peni", "Başka" (a peni stepper). They are capped by balance ("Bakiyen 25") and by the daily limit ("Günlük sınır 200 peni").
     - `Field label="Notun (isteğe bağlı)"`, max 140, with the counter "0/140", shown inside an envelope preview (a `surface` card with a dashed `line-strong` border).
     - Meta: "Günde en fazla 200 peni ısmarlayabilirsin." and "Kabul edilmezse peni 24 saat içinde sana döner."
     - Primary "Ismarla · 30 peni".
  - **Done screen** (same sheet):
    - h3 "Mehmet'e 1 çay ısmarladın."
    - Meta "Kabul edilmezse peni yarın 14:30'da sana döner." (the suffix comes from `locativeTime`, §4.6).
    - Secondary "WhatsApp'ta haber ver" → `https://wa.me/?text=` + encoded "Sana Peni'de bir çay ısmarladım (Moda Kahvesi). 24 saat içinde kabul et: {origin}/hediye/{id}".
    - Primary "Tamam". No toast.
- **Peni kodum** (a Dialog on desktop, a full-screen Drawer on phone):
  - Title "Peni kodum".
  - Café choice chips when there is more than one membership.
  - A QR code (240px, generated with `uqr`, `ink` modules on `#FFFFFF`, quiet zone 4).
  - The code in Brygada 600 40px, tabular, letter-spaced .08em.
  - Body "Kasada bu kodu göster, peni kazan." Button "Kapat".
  - Without [G7b], the entry points are hidden everywhere.

### 9.7 Gift landing `/hediye/[id]` (new, [G11])

- A centred gift fiş with h2 "Seni bir çay bekliyor" and body "Ayşe sana Moda Kahvesi için 1 çay ısmarladı."
- The CTA depends on the visitor:
  - Signed out: "Giriş yap ve kabul et" → `/giris?returnTo=/hediye/{id}`.
  - Signed in, not a member: "Kafeye katıl ve kabul et".
  - Recipient: "Kabul et" (A7) → then "Cüzdanına git".
- Expired or declined: "Bu ısmarlamanın süresi doldu. Peni Ayşe'ye döndü."
- Uses an OG image (§15).

### 9.8 Profil `/profil` (new)

- h2 "Profil".
- A raised card of rows:
  - `Field label="Adın"` + "Kaydet" [G18].
  - `Switch` "Profilim görünsün" with hint "Açıkken Peni masasında baş harflerin, cevaplarda adın görünür." [G18].
  - "Peni kodum" → the dialog.
  - "Görünüm": a `Segmented` "Sistem · Açık · Koyu" that writes `localStorage["peni-theme"]` and `data-theme`.
  - "Masa kuralları" → page.
  - For staff sessions [G19] only: "Kafe paneline geç" → `/kafe/{slug}`.
  - `danger-quiet` "Çıkış yap" (`LogOut`).
- Signed out: "Giriş yap".

### 9.9 Masa kuralları `/masa-kurallari` (new)

A reading page, max 640px, centred.

- Legend "MASA KURALLARI", h1 "Masa kuralları", then `.rule-oxford`.
- A numbered list (Brygada numerals 22px, Archivo body 16/24):
  1. "Kapıdan giren herkes masaya oturabilir; kimse kimseden üstün değildir."
  2. "Askıdaki çay herkesin. İsteyen alır, kimse sormaz."
  3. "Bırakan söylemez, alan teşekkür borçlu değildir."
  4. "Fikrine karşı çıkılabilir, sana değil."
  5. "Masada konuşulan masada kalır; mesaj kutusu yok."
  6. "Siparişin ancak barista dokununca ilerler; emeği görünür."
  7. "Bir fincan kahvenin kırk yıl hatırı vardır."
- h2 "Neden peni?", body: "1554'te İstanbul'da, Tahtakale'de açılan ilk kahvehanelere 'mekteb-i irfan', yani irfan mektebi denirdi. Yaklaşık yüz yıl sonra, 1652'de İzmirli Pasqua Rosée Londra'nın ilk kahvehanesini açtı. Orada bir peni veren herkes aynı masaya otururdu; tüccar da öğrenci de konuşurdu. Adı 'peni üniversitesi' olarak kaldı. Peni o masayı mahallene geri getiriyor."
- h3 "Askı neden böyle?", body: the sebil sentence from §9.3.

### 9.10 Café panel `/kafe/[slug]` (staff)

- **Gate** (no key stored): a centred card with h2 "Kafe paneli", `Field label="Personel anahtarı"` (type password), and primary "Gir". Error: "Anahtar tutmadı."
- **Shift start**: on first load per tab, a modal card. h3 "Vardiyaya hoş geldin", body "Yeni sipariş gelince ses çalsın diye bir kez dokun.", primary "Vardiyayı başlat". The tap unlocks WebAudio and requests `navigator.wakeLock.request("screen")` (re-acquired on `visibilitychange`). If it is dismissed, a persistent `Banner tone="warning"` `VolumeX` reads "Ses kapalı. Yeni siparişleri duymayabilirsin." + "Sesi aç".
- **Pause.**
  - The pill opens a sheet titled "Uygulama siparişlerini durdur", "Ne kadar durduralım?", with options "15 dakika", "30 dakika", "Gün sonuna kadar" [G20 auto-resume].
  - While paused, a persistent `Banner tone="warning"` `CirclePause` under the header: "Uygulama siparişleri durdu · 12 dk kaldı" + primary-small "Şimdi aç". Without G20 it reads "Uygulama siparişleri durdu" + "Şimdi aç".
  - Errors toast "Değiştirilemedi. Tekrar dene."
- **Tezgâh** (board).
  - ≥768: three columns with headers in legend style "YENİ · 2", "HAZIRLANIYOR · 1", "HAZIR · 0".
  - <768: `Segmented` "Yeni (2) · Hazırlanıyor (1) · Hazır (0)".
  - Column empties (`meta ink-2`, centred in a 120px-tall well): "Yeni sipariş yok. Gelince ses çalar." / "Hazırlanan sipariş yok." / "Bekleyen sipariş yok."
- **StaffTicket** (`Fis variant="ticket"`, `@container`):
  - Row 1: code "P-004" in `text-ticket`; first name `text-item`; on the right the elapsed chip, measured from `submittedAt` (from `acceptedAt` once accepted):

| Elapsed | Chip |
|---|---|
| 0–4 min | `Clock`, "3 dk", `ink-2` on `surface-2` |
| 5–9 min | `Timer`, "7 dk", `warning-ink` on `warning-soft` |
| ≥10 min | `AlarmClock`, "12 dk · gecikiyor", `danger` on `danger-soft` |

  - Lines in `text-item`: "2 × Çay". An askı line gets a neutral chip after it: `HOOK` glyph + "ikram", `ink-2` on `surface-2`. **Never turquoise; never next to the customer name.**
  - Line notes and the customer note go in a `warning-soft` block with `StickyNote`: "Not: az şekerli, yulaf sütlü".
  - Payment line, `meta`: "Kasada ₺55" / "Kasada ödeme yok".
  - **Primary action**: 56px, full width, ink, always at the bottom of the ticket. "Kabul et" (submitted) → "Hazır" (accepted) → "Ödendi, teslim edildi" (ready, standalone). On ready for Shelby cafés, an `Info` row "Kasada kapanacak" replaces it.
  - Secondary row (quiet, 44px):
    - "Yetişemiyoruz" (submitted, accepted) opens the reject sheet: "Müşteriye ne diyelim?", choice chips "Malzeme bitti", "Şu an çok yoğunuz", "Kapanmak üzereyiz", primary "Siparişi geri çevir". This replaces `window.prompt`.
    - "Gelmedi" appears only on Hazır tickets ≥10 minutes after `readyAt`.
- **Bump with undo.** Accept, ready, collect and no-show are **deferred commits**.
  - The ticket moves at once (A12) and a sonner toast reads "P-004 · Hazır" with the action "Geri al" for 5s.
  - The request is sent when the toast closes. On `pagehide`, pending commits are flushed with `fetch(…, {keepalive:true})`.
  - Undo moves the ticket back and sends nothing.
  - Reject commits immediately, because the sheet is the confirmation.
  - Errors: `toast.error("Kaydedilemedi: {message}")`, and the ticket returns to its column.
- **New order.**
  - A WebAudio chime: sine 880Hz for 120ms, then 1320Hz for 180ms, gain 0.25 with a 10ms attack and 120ms release. It only plays if sound is on and unlocked.
  - The document title becomes "(2) Yeni sipariş · Tezgâh" until no tickets are new.
  - A13 runs on the ticket.
- **Askı** section:
  - `AskiRail size="md"` and its caption.
  - h3 "Kasada askıya bırakılanlar", with one stepper row per askı item: "Çay · 30 peni" with [− n +].
  - Primary "Askıya ekle · 2 çay (60 peni)", disabled at 0.
  - Success: A8 + toast "Askıya 2 çay eklendi." Error: inline.
- **Rapor** section: h2 "Son 30 gün", then a raised card of rows. Each row is a label in `text-body` with a value in `text-h3` Archivo 600 tabular, using NumberFlow.

| Row | Example |
|---|---|
| "Dağıtılan peni" | 1.240 |
| "Harcanan peni" | 869 |
| "Henüz harcanmayan" | 371, with a sentence under it in `meta ink-2`: "Bu, müşterilerin henüz kullanmadığı ürün hakkı." |
| "Askıya gelen" | "780 peni", with `meta` "üyeler 420 · kasa 210 · kafe 150" |
| "Askıdan içilen" | "27 ikram" |
| "Üye sayısı" | 142 |

  A small "±%" against the previous 30 days appears only with [G21]. No charts.
- Polling: every 4s (existing). Loading: skeleton columns. Errors: `Banner tone="danger"` with "Tekrar dene"; the board keeps the last data.

---

## 10. Mobile screens

Every screen uses `useTokens()`, `T`, `PressableScale` (with `accessibilityRole`, a 44pt minimum through size or `hitSlop`) and a `ScrollView` as its first child, with `RefreshControl` (`tintColor={t.ink}`, `colors={[t.ink]}`, `progressBackgroundColor={t.surface}`) and the `selection` haptic on refresh. Errors appear at the trigger or as a top toast, never below the fold. Copy matches §9 exactly unless noted.

### 10.1 Kafeler (tab, "/")

- Large title "Kafeler".
- Signed out: a slim `surface2` strip at the top: "Kafeye katıl, peni biriktir." + "Giriş yap" (opens the `giris` modal).
- A list of `CafeCard`s (same anatomy as web). Each is wrapped in `<Link href={`/kafe/${slug}`} asChild><Link.AppleZoom>…</Link.AppleZoom></Link>`.
- Optional extra, iOS only: `Link.Preview` with `Link.Menu` actions "Ismarla" (opens `ismarla?kafe=`) and "Yol tarifi" (`Linking.openURL` to Apple or Google Maps with the address).
- States: as on web. The skeleton is 2 cards.

### 10.2 Kafe detail (root stack, `kafe/[slug]`)

- `headerTransparent: true`, `headerTintColor:"#FBF4E6"`, `headerUserInterfaceStyle:"dark"` (iOS), an empty title, and a top 96pt SVG `LinearGradient` scrim (rgba(0,0,0,.45) → 0) over the cover.
- `CafeCover` hero, 200pt, wrapped in `Link.AppleZoomTarget`.
- Then the masthead, meta, membership row and "Bugün masada" strip.
- The segmented control is sticky through `stickyHeaderIndices`; tapping scrolls to sections measured with `onLayout`.
- **Menü.** Categories, descriptions, "Tükendi", and the fixed 116pt stepper slot. "+" fires the `tap` haptic. A non-member "+" pushes the `katil` sheet.
- **Askı.** As on web. "Askıdan al" pushes `askidan-al`; "Askıya bırak" pushes `askiya-birak`.
- **Masa.** As on web. "Takvime ekle" opens `{API}/api/v1/cafes/{slug}/posts/{id}/ics` with `Linking` [G22]; "Paylaş" uses React Native `Share.share({message, url})`. Event dates show "22 Eki Per · 19:00" next to the date block.
- **Cart bar**: floating, 64pt + bottom inset, horizontal margin 12, radius 14.
  - On iOS 26, `GlassView` (`glassEffectStyle="regular"`), only when `isLiquidGlassAvailable() && isGlassEffectAPIAvailable()`. Otherwise `surface` + floating elevation.
  - It opens the `sepet` sheet. The peni toggle there is an RN `Switch` with `trackColor={{false:t.lineStrong, true:t.peni}}`, `thumbColor={t.surface}` and `ios_backgroundColor={t.lineStrong}`.
- Sending fires the `confirm` haptic, then `router.replace("/siparis/{id}")`.

### 10.3 Sipariş (root stack, `siparis/[id]`)

- Header title "Sipariş".
- The fiş (§6.3) full width with a 16pt gutter: same content and copy as web.
- On transition to `ready`: A11, `success` haptic, and `AccessibilityInfo.announceForAccessibility("Hazır. Kasada P-003 kodunu söyle.")`.
- Polls every 4s while focused (`useFocusEffect`) and the app is active (`AppState`); stops at terminal statuses.
- Actions: "Kafeye dön" (`router.dismissTo` the café, or push it) and "İptal et" → the `iptal` sheet.
- Later (not in v1): a Live Activity that updates only on Hazır.

### 10.4 Siparişler (tab)

Large title "Siparişler", sections "ŞİMDİ" and "GEÇMİŞ", chips, "Her zamanki" (pushes the café with `?sepet=`), empty and signed-out states as in §9.5.

### 10.5 Cüzdan (tab)

- Large title "Cüzdan".
- `Stack.Toolbar placement="right"` with `Stack.Toolbar.Button icon="qrcode"` and the accessibility label "Peni kodum", which opens `peni-kodum`.
- Content as in §9.6: incoming gift fişes (A7 + `success` haptic on accept), "JETON KESESİ" coin cards (the balance uses the CountWheel), "HAREKETLER".
- The `ismarla` sheet follows the same 3 steps. The phone field is labelled with `T variant="legend"` "TELEFON NUMARASI" plus `accessibilityLabel="Telefon numarası"`, and the note field "Notun (isteğe bağlı)" has max 140.
- "WhatsApp'ta haber ver" uses `Linking.openURL("whatsapp://send?text=…")`, falling back to `Share.share`.
- Results show in `ToastHost` at the top and in the sheet's done screen, never below the form.

### 10.6 Peni kodum (`peni-kodum`, fullScreenModal)

- As on web, with the 96pt generic or café coin above the QR code.
- `expo-brightness`: `setBrightnessAsync(1)` on focus, then restore the previous value on blur or unmount.
- A close button at the top right.

### 10.7 Profil (tab)

- Large title "Profil", then rows:
  - The name field and "Kaydet" [G18].
  - "Profilim görünsün" `Switch` [G18].
  - "Peni kodum".
  - "Titreşim" `Switch` (stored in SecureStore, read by `haptic()`).
  - "Masa kuralları" (push).
  - Staff sessions [G19]: "Kafe moduna geç".
  - Otherwise, at the very bottom in `meta ink-2`: "Kafede mi çalışıyorsun?" + quiet "Kafe modu", which opens the `kafe-modu` sheet. That sheet holds `Field` "Personel anahtarı" and a **café picker** (rows from `cafes.list()`; never a free-text slug). Primary "Kafe moduna geç" validates with `staff.dashboard(slug)`, stores the key and slug, sets the mode, and calls `router.replace("/tezgah")`. Error: "Anahtar tutmadı."
  - "Çıkış yap" (danger-quiet).

### 10.8 Giriş (`giris`, modal)

As in §9.2. The code field uses `textContentType="oneTimeCode"` and `autoComplete="sms-otp"`. Demo personas render only when `process.env.EXPO_PUBLIC_DEMO === "1"`. Successful sign-in calls `router.back()`, returning to where the user came from.

### 10.9 Masa kuralları (push)

The same content as §9.9, set with `T`.

### 10.10 Kafe modu (staff NativeTabs)

Every staff screen: `headerStyle:{backgroundColor:"#1D1813"}`, `headerTintColor:"#F2EADC"`, `headerUserInterfaceStyle:"dark"` (iOS), title in `#F2EADC`. Body background `bg`.

- **Tezgâh.**
  - Large title is the café name. A header subtitle row shows the clock and the pause pill (`PressableScale`) → the `durdur` sheet.
  - `Segmented` "Yeni (2) · Hazırlanıyor (1) · Hazır (0)", then one column of `StaffTicket`s with 56pt actions.
  - Bumps use the same deferred-commit and undo toast as web.
  - New order: `warning` haptic + sound (`expo-audio` `useAudioPlayer(require("@/assets/sounds/new-order.wav"))`, then `seekTo(0)` and `play()`) + the tab badge count + A13.
  - `useKeepAwake()` while focused.
  - "Ses kapalı" banner when the "Ses" toggle in Ayarlar is off.
- **Askı.** The rail plus till steppers, as in §9.10.
- **Rapor.** As in §9.10.
- **Ayarlar.**
  - The café (picker; switching re-validates).
  - "Ses" `Switch`.
  - "Personel anahtarını unut".
  - Primary-secondary "Müşteri moduna dön".

---

## 11. Copy system

**Voice.** Warm, short, *sen*. One sentence where possible. Name what happened and what to do next. No blame ("Kafe şu an yetişemiyor", never "Reddedildi"). No exclamation marks except "Hazır!" and "Afiyet olsun!".

**Glossary.** Use one word per concept everywhere.

| Concept | Word |
|---|---|
| the unit | peni (lower case, not "Peni puan") |
| one waiting item | ikram |
| the pool | askı |
| take | askıdan al |
| leave | askıya bırak |
| treat a friend | ısmarla / ısmarlama |
| event | Peni masası |
| daily question | Günün sorusu |
| feed section | Masa |
| staff board | Tezgâh |
| order code | kod (P-003) |
| walk-in earning code | Peni kodu / "Peni kodum" |

**Status words** (update `fulfillmentLabelsTr` in `@peni/api`):

| Status | Word |
|---|---|
| submitted | "İletildi" |
| accepted | "Hazırlanıyor" |
| ready | "Hazır" |
| collected | "Teslim edildi" |
| rejected | "Kafe yetişemedi" |
| cancelled | "İptal edildi" |
| no_show | "Teslim alınmadı" |

**Banned.** Enforced by `packages/brand/test/copy-lint.test.ts`, which greps `apps/*/src` and `packages/api/src/messages.ts`.

- `penisi`, `penisini`, `penisine`: they read as vulgar. Use "penin", "peniyi", "peniye", "peniden".
- `peni'` with an apostrophe (`peni'n`, `peni'yi`): peni is a common noun and takes no apostrophe.
- `askın`: easily misread as *aşkın*. Use "ikramın".
- `Kasada P-003 de`: use "Kasada P-003 kodunu söyle".
- `₺0 öde`: use "Ödeme yok".
- `1,5 çay`, or any fractional goods.
- `İhtiyacın varsa`, `ihtiyaç sahibi`: askı is universal.
- `Reddedildi` in customer copy.
- `Demo:` outside the fenced demo box.
- Web strings must not contain the characters `≈ → ✓ ☞ ❦` or emoji.
- Mobile sources must not contain `textTransform`.
- No suffix after a `{cafe.name}` interpolation (`}'nde`, `}'ne`, `}'den`), unless it comes from stored name forms [G10].

---

## 12. Components

### 12.1 `packages/brand` (new workspace package `@peni/brand`)

- `package.json`: `"exports": {".":"./src/index.ts","./tokens":"./src/tokens.ts","./shapes":"./src/shapes.ts","./format":"./src/format.ts","./copy":"./src/copy.ts"}`, `"type":"module"`.
- No runtime dependencies. Dev dependencies: `typescript@5.9.3`, `vitest@5.0.5`, `@resvg/resvg-js@2.6.2` (asset script only).
- Add it to `transpilePackages` in `apps/web/next.config.ts`. Metro already resolves workspace TS packages, as it does for `@peni/api`.

| Module | Exports |
|---|---|
| `tokens.ts` | `light`, `dark` (every §3.1 token in camelCase), `cafeHues`, `plateText`, `plateText2`, `coinColors`, `type Tokens`, `type CafeHue` |
| `shapes.ts` | `P_GLYPH`, `DEVICE = {cezve, glass, fincan}`, `ITEM = {glass, fincan, simit}` (§6.2 markup as data), `HOOK`, `TABLE`, `MANICULE`, `APPROX`, `COIN_GLYPH`, `beads(n,r)`, `railLayout(width,size)`, `longTableLayout(capacity, seats)`, `scallopCircles(width)` |
| `format.ts` | `formatTL`, `formatPeni`, `goods`, `goodsLine`, `trUpper`, `dativeName`, `dativeTime`, `locativeTime`, `relDay`, `initials`, `cafeHue`, `cafeDevice`, `earnPreview`, `usablePeni`, `greeting`, `dateline` |
| `copy.ts` | Shared strings used on both platforms: status words, askı copy, error fallbacks |
| `scripts/build-css.ts` | Writes `apps/web/src/app/tokens.css` (run with `node --experimental-strip-types`); `--check` exits 1 on drift |
| `scripts/make-assets.ts` | App icon, splash and favicon PNGs from `shapes.ts` via resvg (§15) |
| `test/` | `contrast.test.ts`, `copy-lint.test.ts`, `format.test.ts` (trUpper("sipariş ışık") = "SİPARİŞ IŞIK"; dativeName; dativeTime table; formatTL(12000) = "₺120"; earnPreview(5500,5) = 2) |

Root `package.json` scripts: `"brand:css": "node --experimental-strip-types packages/brand/scripts/build-css.ts"`.

### 12.2 Web primitives (`apps/web/src/components/ui/`)

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant: "primary"\|"secondary"\|"quiet"\|"aski"\|"danger-quiet"`, `size: "md"(48)\|"sm"(44)\|"lg"(56)`, `loading?`, `iconStart?`, `iconEnd?`, `fullWidth?`, `href?` (renders `Link`), native button props | Radius 10, `text-button`, px 20. Primary: `bg-primary text-on-primary hover:bg-primary-pressed`. Secondary: `bg-surface border-[1.5px] border-line-strong`. Quiet: transparent, `ink`, underline on hover. Disabled: `bg-surface-2 text-ink-2 border-transparent`, no opacity. A1 press. |
| `IconButton` | `label` (required → `aria-label`), `icon`, `variant: "secondary"\|"quiet"\|"press"`, `size=44` | Round |
| `Stepper` | `value`, `onChange`, `min=0`, `max=20`, `itemName` (for labels "Latte ekle" / "Latte azalt"), `step=1` | Fixed 116px; A2/A3; the count is `aria-live="polite"` |
| `Segmented` | `items: {id,label,count?}[]`, `value`, `onChange`, `id` | `role="tablist"` (or nav anchors on the café page), height 48, A15 |
| `Switch` | `checked`, `onCheckedChange`, `label`, `hint?`, `value?` (right-side text) | Base UI `Switch.Root`/`Thumb`, 52×32, row 56 |
| `Field` | `label`, `hint?`, `error?`, `children` | Wires `id`, `aria-describedby`, `aria-invalid`. Error line uses `CircleAlert` + `danger` text. |
| `Input` / `Textarea` / `PhoneInput` / `CodeInput` | standard + `prefix?` | 48px, radius 10, 16px text, 1.5px `line-strong` |
| `Chip` | `kind: "choice"\|"status"\|"tag"`, `tone: "neutral"\|"peni"\|"aski"\|"masa"\|"success"\|"warning"\|"danger"`, `selected?`, `disabledReason?`, `icon?` | Choice: 44px tall, radius 10; selected = `ink` border 2px + `surface`. Status: 24px, radius 4, 13px 600. Tag: `legend`. A disabled reason renders under the label. |
| `Card` | `as?`, `tone?: "raised"\|"aski"\|"masa"\|"peni"\|"warning"`, `padding?` | Raised = `bg-surface shadow-raised rounded-[14px]`; tones are flat |
| `Row`, `RowGroup` | `href?`, `onClick?`, `start?`, `end?` | Min 56px, dividers `line` |
| `Banner` | `tone: "warning"\|"danger"\|"info"\|"aski"`, `icon`, `title`, `action?` | Radius 10, padding 12, `role="status"` (danger: `role="alert"`) |
| `EmptyState` | `icon`, `text`, `action?` | 64px `surface-2` disc, lucide 32 at stroke 1.5 in `ink-2`; one sentence; one secondary button |
| `Skeleton` | `className` (exact size), `radius` | `bg-surface-2`, static, `aria-hidden`; the parent region has `aria-busy` |
| `Sheet` | `open`, `onOpenChange`, `title`, `description?`, `children`, `footer?` | <768: Base UI Drawer (handle 36×4 `line-strong`, radius 22 top, max-h 88dvh, `pb-[max(1rem,env(safe-area-inset-bottom))]`, A5). ≥768: Base UI Dialog 480px. Close `IconButton` `X` "Kapat". |
| `Toaster` / `toast` | — | `<Toaster position="top-center" offset={16} visibleToasts={1} toastOptions={{unstyled:true, classNames:{toast:"flex items-start gap-3 rounded-[14px] bg-surface p-4 shadow-floating text-ink text-body w-[min(420px,calc(100vw-32px))]", description:"text-meta text-ink-2", actionButton:"text-button underline"}}}/>`. Duration 4000; undo 5000. Toasts are only for async outcomes the screen doesn't already show. |
| `NumberRoll` | `value`, `kind: "peni"\|"tl"` | Wraps NumberFlow (`locales="tr-TR"`; TL uses `format={{style:"currency",currency:"TRY",maximumFractionDigits:2,minimumFractionDigits:0}}`) |

### 12.3 Web brand and feature components

| Component | Props |
|---|---|
| `Coin` | `size: 16\|28\|56\|96`, `cafe?`, `face?`, `backLabel?`, `animate?: "strike"\|"flip"\|null` |
| `Amount` | `peni`, `refItems?`, `size: "sm"\|"md"\|"lg"`, `coin?=true`, `goods?=true` (coin + NumberRoll + "peni" + Approx + goods) |
| `AskiRail` | `count`, `item`, `size`, `maxSlots?`, `hangSignal?: number` (increment to hang one, `{match:true}` for the match item) |
| `Fis` | `variant`, `tone`, `legend`, `children` |
| `StatusTrack` | `order: OrderDTO` |
| `HazirStamp` | — |
| `Masthead` | `cafe`, `date`, `greeting?`, `compact?` |
| `CafeCover` | `cafe: {slug,name,coverImageUrl,hue?}`, `size` |
| `CafeHueBand` | `slug`, `hue?`, `size: 2\|4\|6` |
| `DateBlock` | `date`, `size` |
| `LongTable` | `capacity`, `seats`, `count`, `rsvpedByMe` |
| `Approx`, `Manicule`, `CoinGlyph`, `DeviceGlyph` | `className?` |
| `TopBar`, `BottomNav`, `ActiveOrderChip`, `PressHeader` | — |
| `CafeCard` | `cafe: CafeSummaryDTO` |
| `MenuSection` / `MenuRow` | `item`, `qty`, `state: "orderable"\|"join"\|"blocked"\|"soldout"`, `onAdd` |
| `CartBar` / `CartPanel` | `cart`, `cafe`, `onSubmit` |
| `AskiPanel`, `AskiTakeSheet`, `AskiGiveSheet` | — |
| `MasaFeed`, `QuestionCard`, `EventInvite`, `CafePost`, `HeartButton`, `Comments` | — |
| `OrderFis`, `OrderRow` | — |
| `WalletCoinCard`, `GiftInvite`, `GiftSheet`, `HistoryList`, `PeniKoduDialog` | — |
| `StaffBoard`, `StaffTicket`, `PauseSheet`, `RejectSheet`, `TillPanel`, `ReportList`, `ShiftStart` | — |

Delete the legacy `.btn`, `.card`, `.coin` and `.input` classes, and the `copper`, `leaf`, `berry` and `--font-serif` tokens, once every screen is migrated.

### 12.4 `apps/web/src/app/globals.css`

```css
@import "tailwindcss";
@import "./fonts.css";
@import "./tokens.css";

@theme {
  --font-display: "Brygada 1918 Variable", Georgia, serif;
  --font-sans: "Archivo Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --text-legend: .8125rem;  --text-legend--line-height: 1rem;      --text-legend--letter-spacing: .08em; --text-legend--font-weight: 600;
  --text-plate: .8125rem;   --text-plate--line-height: 1rem;       --text-plate--letter-spacing: .06em;  --text-plate--font-weight: 600;
  --text-meta: .8125rem;    --text-meta--line-height: 1.125rem;
  --text-body: .9375rem;    --text-body--line-height: 1.375rem;
  --text-body-lg: 1rem;     --text-body-lg--line-height: 1.5rem;
  --text-button: .9375rem;  --text-button--line-height: 1.25rem;   --text-button--font-weight: 600;
  --text-item: 1.0625rem;   --text-item--line-height: 1.375rem;    --text-item--font-weight: 600; --text-item--letter-spacing: -.005em;
  --text-h3: 1.375rem;      --text-h3--line-height: 1.625rem;      --text-h3--font-weight: 600; --text-h3--letter-spacing: -.01em;
  --text-h2: 1.875rem;      --text-h2--line-height: 2.125rem;      --text-h2--font-weight: 600; --text-h2--letter-spacing: -.015em;
  --text-h1: clamp(2.25rem, 1.6rem + 3.2vw, 3.5rem); --text-h1--line-height: 1.02; --text-h1--font-weight: 600; --text-h1--letter-spacing: -.02em;
  --text-question: 1.375rem; --text-question--line-height: 1.75rem; --text-question--font-weight: 500;
  --text-balance: 2.5rem;   --text-balance--line-height: 1;        --text-balance--font-weight: 600; --text-balance--letter-spacing: -.01em;
  --text-code: 4.5rem;      --text-code--line-height: .9;          --text-code--font-weight: 600; --text-code--letter-spacing: -.02em;
  --text-ticket: 2.5rem;    --text-ticket--line-height: 1;         --text-ticket--font-weight: 600;
  --radius-tag: 4px; --radius-btn: 10px; --radius-card: 14px; --radius-sheet: 22px;
  --ease-out-strong: cubic-bezier(.23,1,.32,1);
  --ease-drawer: cubic-bezier(.32,.72,0,1);
}
@theme inline {
  --color-bg: var(--bg); --color-surface: var(--surface); --color-surface-2: var(--surface-2);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-line: var(--line); --color-line-strong: var(--line-strong);
  --color-primary: var(--primary); --color-on-primary: var(--on-primary); --color-primary-pressed: var(--primary-pressed);
  --color-peni: var(--peni); --color-on-peni: var(--on-peni); --color-peni-ink: var(--peni-ink); --color-peni-soft: var(--peni-soft);
  --color-aski: var(--aski); --color-on-aski: var(--on-aski); --color-aski-pressed: var(--aski-pressed); --color-aski-ink: var(--aski-ink); --color-aski-soft: var(--aski-soft); --color-hook: var(--hook);
  --color-masa: var(--masa); --color-on-masa: var(--on-masa); --color-masa-ink: var(--masa-ink); --color-masa-soft: var(--masa-soft);
  --color-success: var(--success); --color-on-success: var(--on-success); --color-on-success-2: var(--on-success-2); --color-success-ink: var(--success-ink); --color-success-soft: var(--success-soft);
  --color-danger: var(--danger); --color-danger-soft: var(--danger-soft);
  --color-warning: var(--warning); --color-warning-ink: var(--warning-ink); --color-warning-soft: var(--warning-soft);
  --color-focus: var(--focus); --color-press: var(--press); --color-on-press: var(--on-press); --color-on-press-2: var(--on-press-2);
  --shadow-raised: var(--elev-1); --shadow-floating: var(--elev-2);
}
html { background: var(--bg); color: var(--ink); -webkit-text-size-adjust: 100%; }
body { font-family: var(--font-sans); background: var(--grain), var(--bg); -webkit-font-smoothing: antialiased; }
h1,h2,h3 { text-wrap: balance; } p { text-wrap: pretty; }
@utility legend { font-family: var(--font-sans); font-size: var(--text-legend); line-height: 1rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
@utility plate  { font-family: var(--font-sans); font-stretch: 75%; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
@utility rule-oxford { height: 6px; color: var(--ink); background: linear-gradient(currentColor 0 0) top/100% 3px no-repeat, linear-gradient(currentColor 0 0) bottom/100% 1px no-repeat; }
@utility trim { padding-block: .3em; }
@supports (text-box: trim-both cap alphabetic) { .trim { text-box: trim-both cap alphabetic; padding-block: .35em; } }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
::view-transition { pointer-events: none; }
::view-transition-group(*) { animation-duration: 300ms; animation-timing-function: var(--ease-out-strong); }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 0s; }
  html:focus-within { scroll-behavior: auto; }
}
```

Pills, stamps and tags look right **without** `text-box`. Firefox has no `text-box`; the explicit padding keeps room for the marks on İ, Ç and Ş.

### 12.5 Mobile primitives (`apps/mobile/src/components/`)

| Component | Props | Notes |
|---|---|---|
| `T` | `variant` (§4.5), `color?: keyof Tokens`, `numberOfLines?`, `style?`, `children` | Applies the family, size and `maxFontSizeMultiplier`; `trUpper` for `legend` and `plate`. Never sets `fontWeight`. |
| `PressableScale` | `onPress`, `accessibilityLabel`, `accessibilityRole="button"`, `accessibilityState?`, `hitSlop?`, `disabled?`, `pressedColor?`, `style` | Bluesky pattern (A1); skips the scale under reduced motion and uses `pressedColor` instead |
| `Button` | `title`, `variant` (same as web), `size: "md"\|"sm"\|"lg"` (48/44/56), `loading?`, `icon?`, `disabled?`, `disabledReason?` | Radius 10. The old `small` (36pt) is removed. |
| `IconButton` | `label`, `icon`, `variant`, `size=44` | |
| `Stepper`, `Segmented`, `Chip`, `Card`, `Row`, `Banner`, `EmptyState`, `Skeleton` | same as web | Skeleton height = 0.7 × the line-height it replaces; `surface2`; static |
| `Field` | `label`, `hint?`, `error?`, input props | The label is real text above the input, plus `accessibilityLabel` |
| `ToastHost` / `toast(message, {action?, tone?})` | — | Top, below the safe area, 1 visible, 4s (undo 5s), `announceForAccessibility` |
| `Coin`, `Amount` (with `CountWheel`), `AskiRail`, `Fis`, `StatusTrack`, `HazirStamp`, `Masthead`, `CafeCover`, `CafeHueBand`, `DateBlock`, `LongTable` | same props as web | `react-native-svg`; animations on wrapping `Animated.View`s; `React.memo` |
| `CafeCard`, `MenuRow`, `CartBar`, `ActiveOrderPill`, `StaffTicket`, `TillPanel`, `ReportList`, `GiftInvite`, `WalletCoinCard` | — | Composition only |

Libraries: `src/lib/theme.ts` (`useTokens`, `navTheme`, `elevation`), `src/lib/haptics.ts`, `src/lib/motion.ts`, `src/lib/cart.tsx` (`CartProvider`, keyed by café slug, shared by the café screen and the `sepet` sheet), `src/lib/mode.tsx`.

---

## 13. Data gaps and fallbacks

Each gap blocks only the state named, and every gap has a fallback that ships today. Server changes are small additions to `packages/api/src/dto.ts`, `schemas.ts`, `client.ts` and `apps/web/src/server/app.ts`.

| Gap | Addition | Unblocks | Fallback until it exists |
|---|---|---|---|
| G1 | `CafeSummaryDTO.balancePeni: number\|null`, `earnRatePercent`, `refItems: {name, priceKurus}[]` (up to 2 cheapest askı or reference items); the same `refItems` on `WalletDTO.cafes[]` | "Sende 90 peni · ≈ 3 çay" on cards and the wallet | Home: "Üyesin". Wallet: no goods line. |
| G2 | `CafeSummaryDTO.nextEvent: {postId, startsAt, title}\|null` | Event chip on cards | Hidden |
| G3 | `AskidaDTO.myEligibility: {status:"ok"\|"claimed_today"\|"too_new"\|"blocked"\|"not_member", daysLeft?}` | Take-sheet states | Error at submit, shown in the cart; the ikram line is removed |
| G4 | `PostDTO.title: string\|null`, `attendees: {initials: string\|null, me: boolean}[]` (initials only when `profileVisible`) | Event headline, seat initials | First line of the body; chairs with no initials |
| G5 | `MembershipDTO.noShowStrikes` | Exact pre-order copy | Generic pre-order copy (§9.3) |
| G6 | `POST /cafes/:slug/members/lookup {phone}` → `{firstName, lastInitial}` or 404 (rate-limited); `WalletDTO.recentRecipients` | Recipient confirmation, recents | Send directly; server error inline |
| G7 | `OrderDTO.earnedPeni: number\|null`; (G7b) `MembershipDTO.memberCode: string` | Earn moment on the fiş; Peni kodum and the till code | No amount; Peni kodum hidden |
| G8 | `verifyCode` returns `isNew: boolean` | Name step | Name edited in Profil |
| G9 | `CafeSummaryDTO.hue` | Café-chosen colourway | `cafeHue(slug)` |
| G10 | `nameForms: {locative, dative}` per café | Suffixes on café names | Rephrase with "için" or a legend |
| G11 | `GET /gifts/:id/preview` (public: cafeName, fromFirstName, peni, goods, status, expiresAt) | `/hediye/[id]` | The link goes to `/cuzdan` |
| G12 | `AskidaDTO.matchPercent: number\|null` | Match note in the give sheet | Hidden; the donation response's `matchedPeni` still drives the toast |
| G13 | `PostDTO.answeredTodayByMe` | "Bugünkü cevabın masada." | Always show the input |
| G14 | `CafeDetailDTO.medianPrepMinutes` (≥20 orders) | "genelde 5–8 dk" | No ETA |
| G15 | `POST /gifts/:id/thanks` | "Teşekkür et" | Hidden |
| G16 | `WalletDTO.ledger: LedgerEntryDTO[]` `{id, at, cafeSlug, cafeName, kind:"earn"\|"redeem"\|"gift_out"\|"gift_in"\|"gift_return"\|"askida_donate"\|"refund", peni, orderNumber?}` | Full history | Gifts only |
| G17 | `POST /gifts/:id/cancel` + `GiftDTO.canCancel` | "Geri al" on pending gifts | Hidden |
| G18 | `POST /me/profile {displayName?, profileVisible?}` | Profil name and visibility | Read-only display |
| G19 | `SessionDTO.staffCafes: {slug, name, role}[]` | Staff entry for staff only | Quiet "Kafe modu" row (mobile); direct URL (web) |
| G20 | `StaffDashboardDTO.cafe.pausedUntil`; `setPaused(slug, {minutes\|"end_of_day"\|null})` | Auto-resume and countdown | Indefinite pause + "Şimdi aç" |
| G21 | `report.previous` (same fields, previous 30 days) | ±% trends | No trends |
| G22 | `GET /cafes/:slug/posts/:id/ics` | Mobile "Takvime ekle" | Web builds `.ics` client-side; mobile hides the button |

---

## 14. Packages and configuration

### 14.1 `apps/web` (npm, verified 16 Oct 2026)

```bash
pnpm --filter @peni/web add motion@14.3.0 @base-ui/react@1.9.0 sonner@2.0.8 @number-flow/react@0.6.2 \
  lucide-react@1.58.0 @fontsource-variable/brygada-1918@5.3.0 @fontsource-variable/archivo@5.3.0 uqr@0.1.3 \
  "@peni/brand@workspace:*"
# P2, for OG images only (next/og needs woff, not woff2):
pnpm --filter @peni/web add @fontsource/brygada-1918@5.3.0 @fontsource/archivo@5.3.0
```

- Peer dependencies: `@base-ui/react` lists `date-fns` and `@date-fns/tz` as optional peers, so they are not needed. All of these packages accept React 19.
- **Not used:** `vaul` (unmaintained), Motion+ `AnimateNumber` (paid tier), `@phosphor-icons/react`.
- `next.config.ts`: `transpilePackages: ["@peni/core","@peni/api","@peni/brand"]`.
- `package.json` scripts: `"predev":"node scripts/copy-fonts.mjs"`, `"prebuild":"node scripts/copy-fonts.mjs"`.
- `.gitignore`: add `apps/web/public/fonts/`.

### 14.2 `apps/mobile` (Expo SDK 58 pins from `expo@58.0.11/bundledNativeModules.json`)

```bash
cd apps/mobile && pnpm expo install expo-font expo-splash-screen expo-system-ui expo-haptics expo-image expo-symbols \
  expo-glass-effect expo-audio expo-keep-awake expo-brightness react-native-svg react-native-reanimated react-native-worklets \
  @expo-google-fonts/brygada-1918 @expo-google-fonts/archivo @expo-google-fonts/archivo-narrow lucide-react-native uqr
pnpm --filter @peni/mobile add "@peni/brand@workspace:*"
```

| Package | Version |
|---|---|
| expo-font | ~58.0.8 |
| expo-splash-screen | ~58.0.9 |
| expo-system-ui | ~58.0.6 |
| expo-haptics | ~58.0.6 |
| expo-image | ~58.0.15 |
| expo-symbols | ~58.0.4 |
| expo-glass-effect | ~58.0.3 |
| expo-audio | ~58.0.9 |
| expo-keep-awake | ~58.0.3 |
| expo-brightness | ~58.0.2 |
| react-native-svg | 15.16.0 |
| react-native-reanimated | 4.7.1 |
| react-native-worklets | 0.13.0 |
| @expo-google-fonts/brygada-1918 | 0.4.2 |
| @expo-google-fonts/archivo | 0.4.2 |
| @expo-google-fonts/archivo-narrow | 0.4.2 |
| lucide-react-native | 1.58.0 (peer `react-native-svg` ^12–15) |
| uqr | 0.1.3 (pure JS, for the QR matrix) |

- **Not added:** `expo-blur`, `expo-linear-gradient` (the scrim is react-native-svg), `react-native-gesture-handler`, `sonner-native`, `expo-notifications` (roadmap step 3).
- `babel-preset-expo` (SDK 58) adds the worklets Babel plugin when `react-native-worklets` is installed. Check that it does after install; add `react-native-worklets/plugin` only if the Reanimated setup check fails.

`app.json` changes:

```json
{
  "expo": {
    "icon": "./assets/icon.png",
    "ios": { "bundleIdentifier": "app.peni", "supportsTablet": false,
             "icon": { "light": "./assets/icon.png", "dark": "./assets/icon-dark.png", "tinted": "./assets/icon-tinted.png" } },
    "android": { "package": "app.peni", "edgeToEdgeEnabled": true,
                 "adaptiveIcon": { "foregroundImage": "./assets/adaptive-foreground.png", "monochromeImage": "./assets/adaptive-monochrome.png", "backgroundColor": "#F4EEE2" } },
    "plugins": ["expo-router", "expo-secure-store",
      ["expo-splash-screen", { "image": "./assets/splash-icon.png", "imageWidth": 160, "backgroundColor": "#F4EEE2",
        "dark": { "image": "./assets/splash-icon.png", "backgroundColor": "#14110E" } }]]
  }
}
```

---

## 15. Brand assets

All assets are generated by `packages/brand/scripts/make-assets.ts` from `shapes.ts`, using `@resvg/resvg-js@2.6.2`, and written into `apps/mobile/assets/` and `apps/web/src/app/`.

- **App icon, 1024×1024.** Background `#F4EEE2`. A centred 96-layout generic coin, but **without the legend**: face, beads, hairline and the embossed "p" scaled ×1.15. Coin diameter 72% (737px). No text and no transparency.
  - `icon-dark.png`: the same coin on `#14110E`.
  - `icon-tinted.png`: transparent background; the coin as a single luminance layer (face `#FFFFFF`, beads and "p" `#000000` at 60%), for iOS tinted mode.
- **Android adaptive.** The foreground is the coin at 60% of the 108dp canvas, inside the 66% safe zone, with a transparent background. The background colour is `#F4EEE2`. The monochrome version is the coin outline, beads and "p" in `#000000` on transparent.
- **Splash.** `splash-icon.png` is a 512px coin (the same art as the icon) on transparent. The background colours are in `app.json`.
- **Web.**
  - `src/app/icon.svg`: the 28-layout coin. Replace the Georgia "p" with `P_GLYPH`.
  - `apple-icon.png`: 180px, from the app icon.
  - `opengraph-image.tsx` (`next/og`, 1200×630): background `#F4EEE2`; on the left a 360px coin; on the right "peni" in Brygada 600 at 120px `#1D1813` and "Mahallenin masası." in Archivo 400 at 40px `#5C5044`. Satori fonts come from `@fontsource/brygada-1918` and `@fontsource/archivo` woff files, latin + latin-ext, both registered under the same name.
  - P2: per-café OG (`/k/[slug]/opengraph-image.tsx`) with a 24px café-hue band at the top, the café name in Brygada 600 88px, "Askıda 7 çay bekliyor" in Archivo 40px, and a 200px coin. Per-gift OG with "Seni bir çay bekliyor".
- **Store screenshots** (iOS 6.9", Android phone; light mode) lead, in order, with:
  1. The coin purse.
  2. The askı rail.
  3. The HAZIR fiş.
  4. The long-table invitation.
  5. The café page.
  Captions are in Archivo 600: "Her kafenin kendi jetonu.", "Askıdaki çay herkesin.", "Hazır olunca anında bilirsin.", "Mahallenin masasına otur.", "Önden sipariş ver, kasada öde."
- **Sound.** `apps/mobile/assets/sounds/new-order.wav`: 0.6s, 44.1kHz mono, 880Hz for 120ms then 1320Hz for 180ms, 10ms attack, 120ms release, peak −6dBFS. It is generated by the asset script and is the same chime the web plays with WebAudio.

---

## 16. Implementation order

Ship each step green (typecheck, tests, and the screenshots from the acceptance checklist) before starting the next.

1. **`packages/brand`.** Tokens, format, shapes, copy, the `brand:css` generator, and tests (contrast, copy-lint, format). Update `fulfillmentLabelsTr` and swap the UI from `formatKurus` to `formatTL`.
2. **Web foundation.** `copy-fonts`, `fonts.css`, `tokens.css`, `globals.css`; providers (LazyMotion, MotionConfig, Toaster, theme script); route groups `(customer)` and `(staff)`; `TopBar`, `BottomNav`, `PressHeader`; primitives (`Button`, `IconButton`, `Field` + inputs, `Card`, `Row`, `Chip`, `Banner`, `EmptyState`, `Skeleton`, `Sheet`, `Switch`, `Segmented`, `Stepper`, `NumberRoll`). Remove the staff link from customer nav.
3. **Mobile foundation.** Installs, fonts and splash, `useTokens`, `navTheme`, `ThemeProvider`, `expo-system-ui`; the mode store and `Stack.Protected` groups; customer and staff `NativeTabs` with nested Stacks; `T`, `PressableScale`, the primitives, `haptics`, `ToastHost`; replace the emoji tab icons and `textTransform`.
4. **Signature objects, both platforms, in order.** `Coin` + `Amount` → `Fis` + `StatusTrack` + `HazirStamp` → `AskiRail` → `Masthead` + `CafeCover` + `CafeHueBand` → `DateBlock` + `LongTable`.
5. **Web screens, in order.** Café page (menu, cart bar, drawer, peni toggle, earn preview, error handling, join sheet, askı sheets, masa) → order fiş → home → siparişler → cüzdan (gift sheet, Peni kodum) → giriş → profil, masa kuralları, not-found and error → staff panel (gate, shift start, pause, board with deferred commits, askı till, rapor).
6. **Mobile screens, same order.** Then Kafe modu.
7. **API gaps** (§13), in parallel, in this priority: G3, G1, G7, G20, G4, G6, G16, G17, G19, then the rest. Each one switches its screen from fallback to full.
8. **Brand assets** (§15) and OG images.
9. **QA pass** against §17 on iPhone (iOS 26 and 18), an Android 12+ phone, and Chrome, Safari and Firefox at 360, 390 and 430px and at 1280px, in light and dark.

---

## 17. Acceptance checklist

**Contrast and colour**

- [ ] `pnpm --filter @peni/brand test` passes: every pair in §3.3 meets its minimum in both themes.
- [ ] `pnpm brand:css --check` passes; `tokens.css` matches `tokens.ts`.
- [ ] No hex or rgb literals in `apps/web/src/components` or `apps/mobile/src` (grep), except inside `@peni/brand`.
- [ ] Copper appears only on peni (the toggle, amounts, coins). No other button is copper.
- [ ] Every status, error and warning has an icon and a word. Danger always has `CircleAlert`.
- [ ] The focus ring is visible and ≥3:1 on every interactive element, including inside the Hazır fiş and the press header (keyboard-tab every web screen).
- [ ] Disabled controls never use opacity, and each shows its reason.

**Touch targets and layout**

- [ ] Playwright at 360px on every web route: every `button`, `a`, `input` and `[role=button]` outside running text has a bounding box ≥44×44. Staff primary actions are ≥56px tall.
- [ ] Mobile: every `PressableScale` is ≥44pt including `hitSlop` (audited with the Accessibility Inspector and Android's layout bounds).
- [ ] 360, 390 and 430px, light and dark, every web route: `document.documentElement.scrollWidth <= window.innerWidth`.
- [ ] Phone floating-layer budget: never more than one of {bottom nav, cart bar} plus the header. No floating order pill on web.
- [ ] No cards nested in cards (visual review of every screen).

**Motion**

- [ ] With `prefers-reduced-motion: reduce` (web) and Reduce Motion on (iOS and Android), no element translates, scales or rotates. The coin strike and flip are crossfades, the cup hang is a fade, view transitions are instant, and the only spinner is replaced by text.
- [ ] No infinite animation anywhere (search for `repeat: Infinity`, `animationIterationCount:'infinite'`, `animate-spin` outside the loading button).
- [ ] UI transitions ≤300ms, except sheets (450ms), the coin flip (420ms) and toasts.
- [ ] No toast duplicates a state the screen already shows. There is no toast after sending an order.

**Turkish**

- [ ] Web: in DevTools, a page containing "İĞÜŞÖÇ ığüşöç ₺ â î û" renders every glyph in Archivo or Brygada, and the network panel shows the latin-ext woff2 files loaded.
- [ ] Web: legends render "SİPARİŞ", "YİYECEK", "KADIKÖY" (`lang="tr"`). SVG text uses `trUpper`.
- [ ] Mobile, on an English-locale device: "Peni masası" renders "PENİ MASASI". No `textTransform` in the sources.
- [ ] Mobile: exactly five font families are loaded, and no `fontWeight` is set alongside them (grep).
- [ ] The copy-lint test passes (§11 banned list). `formatTL(12000)` renders "₺120" and negative amounts use "−".
- [ ] Every `dativeName` and `dativeTime` output in fixtures matches §4.6.

**Dark mode**

- [ ] Every screen is checked in dark on web (system and forced `data-theme`) and on both mobile platforms. The checkbox, select and switch are dark (`color-scheme`).
- [ ] The press header stays dark in both themes. Café colourway plates and covers show a 1px ring in dark.
- [ ] The status track and empty hooks are visible in dark (≥3:1).

**Askı dignity** (review blocker)

- [ ] No taker name, initial, avatar or per-claim timestamp on any surface, API response or report.
- [ ] Other viewers' rails never animate on a claim, and the hook never sways.
- [ ] Weekly ikram counts are hidden below 3.
- [ ] The receipt line reads "İkram −₺30", styled exactly like the peni line.
- [ ] The staff askı marker is the neutral "ikram" chip and never appears on a customer-facing surface.
- [ ] The take sheet asks no question, shows no counter and asks for no thanks.

**Behaviour**

- [ ] A failed order, join, feed action, till donation, pause or cancel never wipes the page; the cart and inputs are preserved.
- [ ] Sold-out items are not orderable on either platform. `preorderEnabled=false` and `acceptingOrders=false` each show their own banner.
- [ ] The earn preview equals `floor(dueKurus × earnRatePercent / 10000)` live, and the peni toggle shows the capped amount.
- [ ] The gift flow chooses the café first, and the daily limit and the self-gift rule show before submit.
- [ ] On the staff board: taps never land on a moving ticket, undo works for 5s, `pagehide` flushes pending commits, Shelby tickets show "Kasada kapanacak", sound needs a shift-start tap, and wake lock is held.
- [ ] Order and staff polling stop at terminal states and while hidden.
- [ ] There is no staff link anywhere in customer chrome.
