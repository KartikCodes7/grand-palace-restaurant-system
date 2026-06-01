---
name: Palatial Elegance
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0f0'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#775a19'
  on-secondary: '#ffffff'
  secondary-container: '#fed488'
  on-secondary-container: '#785a1a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1c19'
  on-tertiary-container: '#848480'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c176'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4201'
  tertiary-fixed: '#e4e2dd'
  tertiary-fixed-dim: '#c8c6c2'
  on-tertiary-fixed: '#1b1c19'
  on-tertiary-fixed-variant: '#474744'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 64px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '500'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.3'
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.5'
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.7'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.4'
    letterSpacing: 0.15em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 32px
  margin-mobile: 20px
  margin-desktop: 64px
  section-padding: 120px
---

## Brand & Style

The design system is engineered to evoke an atmosphere of exclusive, five-star hospitality. The brand personality is poised, authoritative, and deeply welcoming, targeting a discerning clientele that values heritage and meticulous attention to detail.

The visual style is **Modern Corporate with Luxury Editorial influences**. It leans into high-end minimalism, utilizing expansive white space to denote "digital luxury." Layouts are balanced and symmetrical, avoiding chaotic density in favor of a curated, quiet confidence. The emotional response should be one of immediate calm and perceived high value, mirroring the physical experience of entering a grand hotel lobby.

## Colors

The palette is rooted in a traditional luxury triad:
- **Primary (Deep Charcoal):** Used for primary text, deep backgrounds, and high-impact iconography. It provides the grounding weight of the design.
- **Secondary (Muted Gold):** Reserved for accents, interactive states, and sophisticated signifiers. It is never used for large surfaces, only to draw the eye to points of prestige.
- **Tertiary (Ivory/Cream):** The "Surface" color. It replaces pure white to provide a warmer, more tactile feel that is easier on the eyes and feels more "bespoke."
- **Neutral:** A range of grays used for secondary text and subtle borders.

The "surface-container" approach uses varying shades of Ivory and light Greige to create a layered effect, moving from the base page (Ivory) to elevated containers (Pure White) to inset elements (Muted Cream).

## Typography

Typography is the primary vehicle for the brand’s "sophisticated" voice. 

- **Playfair Display** (Headings): Chosen for its high-contrast strokes and classical elegance. Headlines should use "Optical Sizing" where possible to maintain hair-thin serifs.
- **Inter** (Body & UI): A functional, neutral counterpart that ensures high legibility for menus, booking flows, and descriptions. 

**Formatting Rules:**
- Large Display headers should use a slight negative letter spacing to feel tight and intentional.
- Labels and "Overlines" should always be in Inter, uppercase, with generous letter spacing (15%+) to mimic high-end fashion editorial layouts.

## Layout & Spacing

The layout follows a **fixed-grid philosophy** for desktop to maintain a cinematic, composed feel, while transitioning to a fluid model for mobile devices.

- **The 8px Grid:** All spacing is a multiple of 8px. 
- **Whitespace as Luxury:** Section vertical padding is intentionally oversized (120px+) to allow the content to "breathe," signaling that the brand is not rushed for space.
- **Breakpoints:**
    - **Desktop (1280px+):** 12-column grid, 64px margins. Content centered.
    - **Tablet (768px - 1279px):** 8-column grid, 32px margins.
    - **Mobile (Up to 767px):** 4-column grid, 20px margins. 
- **Reflow:** On mobile, side-by-side editorial images stack vertically, and navigation collapses into a full-screen "Curtain" menu to maintain the elegant aesthetic.

## Elevation & Depth

This design system avoids heavy shadows, opting instead for **Tonal Layering and Thin Outlines**.

- **Depth Tiers:** 
    - **Level 0 (Base):** Ivory (#F9F7F2).
    - **Level 1 (Card/Container):** Pure White (#FFFFFF) with a 1px border in a very light neutral (#E8E4DB).
    - **Level 2 (Floating/Modals):** Pure White with a "Signature Shadow"—an ultra-diffused, 10% opacity Charcoal shadow with a 20px blur and 4px Y-offset.
- **Glassmorphism:** Reserved exclusively for navigation bars and image overlays. Use a `backdrop-filter: blur(10px)` with a 70% opacity Ivory tint.

## Shapes

The shape language is **Structured and Soft**. 

- A "Soft" roundedness (0.25rem) is applied to buttons and input fields to ensure they feel approachable yet professional. 
- Large containers and imagery should remain sharp (0px) or use a very minimal radius (4px) to maintain a sense of architectural stability. 
- Interactive elements like "Check Availability" or "Book Now" may occasionally use a pill-shape for high-contrast emphasis, but the standard remains a soft-rectangle.

## Components

- **Buttons:**
    - *Primary:* Solid Deep Charcoal with Ivory text. No icons, or a single trailing thin arrow.
    - *Secondary:* Ghost style with a 1px Gold border and Gold text.
- **Inputs:** Underlined or lightly boxed. When focused, the bottom border transitions from light gray to Muted Gold.
- **Cards:** Use a "Float" effect. On hover, the 1px border darkens slightly and the signature shadow increases in spread. No aggressive scaling.
- **Lists:** Used for restaurant menus or amenity lists. Use "Playfair Display" for item names and "Inter" for descriptions, separated by a thin 1px horizontal rule.
- **Chips/Tags:** Small, uppercase Inter text with high letter spacing, encased in a light Ivory background with no border.
- **Booking Bar:** A persistent, thin component at the top or bottom of the viewport using Glassmorphism to remain present but unobtrusive.