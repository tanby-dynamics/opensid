# OpenSid Style Guide

OpenSid uses a warm parchment aesthetic — earthy, calm, and analogue in feel. The palette draws from aged paper, chestnut wood, and amber honey. Tailwind CSS v4 with a custom `@theme` block in `index.css` defines all tokens.

---

## Color Palette

### Page & Surface

| Token | Hex | Usage |
|---|---|---|
| `page` | `#faf5e8` | Page background (applied to `body`) |
| `surface` | `#fffef9` | Cards, modals, dropdowns |
| `rim` | `#e5d9c0` | Borders, dividers, separators |

### Brown — Primary Brand

| Token | Hex | Usage |
|---|---|---|
| `brown-50` | `#fdf5ef` | Hover background on icon buttons |
| `brown-100` | `#f5e8d8` | Skeleton shimmer cells |
| `brown-200` | `#e0c4a0` | — |
| `brown-300` | `#c49a72` | Icon button default color |
| `brown-400` | `#a87550` | Muted text (dates, placeholders, empty states) |
| `brown-500` | `#8b6340` | Secondary text (categories, table headers) |
| `brown-600` | `#7a5230` | Primary buttons, links, interactive text |
| `brown-700` | `#6a4220` | Hovered links, secondary button text |
| `brown-800` | `#563418` | Stronger body text |
| `brown-900` | `#4e3218` | Primary body text, headings |

### Gold — Accent

| Token | Hex | Usage |
|---|---|---|
| `gold-50` | `#fdf9ec` | — (reserved for future highlights) |
| `gold-100` | `#faefc0` | — |
| `gold-300` | `#eecb50` | — |
| `gold-400` | `#e8b93a` | Decorative accents |
| `gold-500` | `#d4a520` | Hover accent |

### Sage — Income / Positive

| Token | Hex | Usage |
|---|---|---|
| `sage-50` | `#eef4ee` | Income badge background |
| `sage-100` | `#d4e8d4` | — |
| `sage-600` | `#4a7c59` | Positive balances, income amounts, income badge text |
| `sage-700` | `#3a6a49` | — |

### Rust — Expense / Negative

| Token | Hex | Usage |
|---|---|---|
| `rust-50` | `#f5ebe8` | Expense badge background, delete hover background |
| `rust-100` | `#ecd4d0` | — |
| `rust-600` | `#9b3a3a` | Negative balances, expense amounts, expense badge text, delete icon hover |
| `rust-700` | `#8a2a2a` | Delete button hover background |

---

## Typography

| Element | Classes |
|---|---|
| App title / Page headings | `font-serif font-bold text-brown-900` |
| Modal / dialog titles | `font-serif font-bold text-brown-900` |
| Balance figures | `font-serif font-semibold` |
| Body / UI text | System sans-serif (default) |
| Labels | `text-xs font-medium text-brown-700` |
| Secondary / muted text | `text-brown-400` or `text-brown-500` |
| Error messages | `text-xs text-rust-600` |

The serif stack is `Georgia, 'Times New Roman', serif`, defined as `--font-serif` in the `@theme` block and applied with the `font-serif` Tailwind utility.

---

## Components

### Cards

```
rounded-xl border border-rim bg-surface p-4 shadow-sm
```

### Modals / Dialogs

Backdrop:
```
fixed inset-0 z-50 flex items-center justify-center bg-black/30
```

Panel:
```
bg-surface rounded-xl shadow-lg p-6 w-full max-w-sm border border-rim
```

### Buttons

| Variant | Classes |
|---|---|
| Primary | `px-4 py-2 text-sm rounded-lg bg-brown-600 text-surface hover:bg-brown-700` |
| Secondary | `px-4 py-2 text-sm rounded-lg border border-rim text-brown-700 hover:bg-page` |
| Danger | `px-4 py-2 text-sm rounded-lg bg-rust-600 text-surface hover:bg-rust-700` |
| Icon (default) | `rounded p-1 text-brown-300 hover:text-brown-600 hover:bg-brown-50` |
| Icon (destructive) | `rounded p-1 text-brown-300 hover:text-rust-600 hover:bg-rust-50` |

### Form Inputs

```
w-full border border-rim rounded-lg px-3 py-2 text-sm bg-page text-brown-900
placeholder-brown-300 focus:outline-none focus:ring-2 focus:ring-brown-400
```

### Transaction Type Toggle

```
flex rounded-lg overflow-hidden border border-rim
```

- **Expense active**: `bg-rust-600 text-surface`
- **Income active**: `bg-sage-600 text-surface`
- **Inactive**: `bg-surface text-brown-600 hover:bg-page`

### Badges

| Type | Classes |
|---|---|
| Income | `bg-sage-50 text-sage-600 px-2 py-0.5 rounded text-xs font-medium` |
| Expense | `bg-rust-50 text-rust-600 px-2 py-0.5 rounded text-xs font-medium` |

### Tables

- Header row: `border-b border-rim text-left`
- Header cells: `text-xs font-medium text-brown-500`
- Body rows: `border-b border-rim last:border-0`
- Date cells: `text-sm text-brown-400`
- Description cells: `text-sm text-brown-900`

### Skeleton / Loading

Skeleton cards mirror live card structure with `animate-pulse`, using `bg-rim` for primary shimmer blocks and `bg-brown-100` for list-item rows.

---

## Design Tokens Reference (`index.css`)

```css
@theme {
  --color-page: #faf5e8;
  --color-surface: #fffef9;
  --color-rim: #e5d9c0;

  --color-brown-50:  #fdf5ef;
  --color-brown-100: #f5e8d8;
  --color-brown-200: #e0c4a0;
  --color-brown-300: #c49a72;
  --color-brown-400: #a87550;
  --color-brown-500: #8b6340;
  --color-brown-600: #7a5230;
  --color-brown-700: #6a4220;
  --color-brown-800: #563418;
  --color-brown-900: #4e3218;

  --color-gold-50:  #fdf9ec;
  --color-gold-100: #faefc0;
  --color-gold-300: #eecb50;
  --color-gold-400: #e8b93a;
  --color-gold-500: #d4a520;

  --color-sage-50:  #eef4ee;
  --color-sage-100: #d4e8d4;
  --color-sage-600: #4a7c59;
  --color-sage-700: #3a6a49;

  --color-rust-50:  #f5ebe8;
  --color-rust-100: #ecd4d0;
  --color-rust-600: #9b3a3a;
  --color-rust-700: #8a2a2a;

  --font-serif: Georgia, 'Times New Roman', serif;
}
```
