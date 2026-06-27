# Jay Rosen's Internet Archive - Design System

This directory contains the unified design system for Jay Rosen's Internet Archive, providing centralized design tokens and utility classes for consistent styling across the entire application.

## Overview

The design system uses **CSS custom properties** (CSS variables) to define all design decisions in one place. This ensures consistency, makes global updates easy, and improves maintainability.

### Design Philosophy
- **Typewriter aesthetic**: Special Elite font for display, Roboto Mono for body text
- **Paper texture**: Warm off-white background (#fdfbf7) with SVG noise overlay
- **Minimal, functional**: Clean cards, subtle shadows, clear hierarchy
- **Accessible**: High contrast, keyboard navigation, screen reader support

---

## Files

### `tokens.css`
The complete design system token library. Import this at the top of any CSS file to access all design tokens.

**Import in your CSS:**
```css
@import url('./design-system/tokens.css');
```

**Already imported in:**
- `frontend/index.css` (global import for the entire app)

---

## Usage Guide

### Colors

All colors are available as CSS custom properties prefixed with `--color-`:

#### Base Colors
```css
background-color: var(--color-paper);        /* Main background */
background-color: var(--color-card);          /* Card backgrounds */
background-color: var(--color-surface-muted); /* Subtle backgrounds */
```

#### Text Colors
```css
color: var(--color-text-primary);    /* Main text (#1c1917) */
color: var(--color-text-secondary);  /* Secondary text (#57534e) */
color: var(--color-text-tertiary);   /* Tertiary text (#78716c) */
color: var(--color-text-muted);      /* Muted text (#a8a29e) */
```

#### Border Colors
```css
border-color: var(--color-border-subtle);   /* #f5f5f4 */
border-color: var(--color-border-light);    /* #e7e5e4 */
border-color: var(--color-border-medium);   /* #d6d3d1 */
border-color: var(--color-border-dark);     /* #a8a29e */
border-color: var(--color-border-darkest);  /* #78716c */
```

#### Accent Colors
Each accent color has three variants: base, light (for backgrounds), dark (for text)

```css
/* Sky Blue */
color: var(--color-accent-sky);              /* #0ea5e9 */
background: var(--color-accent-sky-light);   /* #e0f2fe */
color: var(--color-accent-sky-dark);         /* #075985 */

/* Green */
color: var(--color-accent-green);
background: var(--color-accent-green-light);
color: var(--color-accent-green-dark);

/* Amber, Pink, Violet, Orange, Emerald, Rose follow same pattern */
```

#### Semantic Colors
```css
color: var(--color-link);        /* Links */
color: var(--color-error);       /* Errors */
color: var(--color-success);     /* Success states */
color: var(--color-warning);     /* Warnings */
color: var(--color-info);        /* Info messages */
```

---

### Typography

#### Font Families
```css
font-family: var(--font-display);   /* Special Elite (headings, labels) */
font-family: var(--font-body);      /* Roboto Mono (body text) */
font-family: var(--font-fallback);  /* Fallback monospace */
```

#### Font Sizes
```css
font-size: var(--font-size-xs);    /* 12px */
font-size: var(--font-size-sm);    /* 14px */
font-size: var(--font-size-base);  /* 16px */
font-size: var(--font-size-lg);    /* 18px */
font-size: var(--font-size-xl);    /* 20px */
font-size: var(--font-size-2xl);   /* 24px */
font-size: var(--font-size-3xl);   /* 30px */
font-size: var(--font-size-4xl);   /* 36px */
font-size: var(--font-size-5xl);   /* 48px */
font-size: var(--font-size-6xl);   /* 60px */
```

#### Line Heights
```css
line-height: var(--line-height-tight);    /* 1.25 */
line-height: var(--line-height-snug);     /* 1.375 */
line-height: var(--line-height-normal);   /* 1.5 */
line-height: var(--line-height-relaxed);  /* 1.625 */
line-height: var(--line-height-loose);    /* 2 */
```

#### Font Weights
```css
font-weight: var(--font-weight-normal);  /* 400 */
font-weight: var(--font-weight-medium);  /* 500 */
font-weight: var(--font-weight-bold);    /* 700 */
font-weight: var(--font-weight-black);   /* 900 */
```

---

### Spacing

Spacing follows a 4px base unit scale (Tailwind-compatible):

```css
margin: var(--space-1);    /* 4px */
padding: var(--space-2);   /* 8px */
gap: var(--space-4);       /* 16px */
padding: var(--space-6);   /* 24px */
padding: var(--space-8);   /* 32px */
margin: var(--space-12);   /* 48px */
```

**Available scales**: `--space-0` through `--space-32` (see tokens.css for full list)

---

### Shadows

```css
/* Standard shadows */
box-shadow: var(--shadow-xs);    /* Subtle shadow */
box-shadow: var(--shadow-sm);    /* Small shadow */
box-shadow: var(--shadow-md);    /* Medium shadow */
box-shadow: var(--shadow-lg);    /* Large shadow */
box-shadow: var(--shadow-xl);    /* Extra large shadow */
box-shadow: var(--shadow-2xl);   /* 2X large shadow */

/* Signature offset shadow (typewriter aesthetic) */
box-shadow: var(--shadow-offset);        /* 8px 8px 0 */
box-shadow: var(--shadow-offset-hover);  /* 12px 12px 0 */

/* Inner shadow */
box-shadow: var(--shadow-inner);

/* No shadow */
box-shadow: var(--shadow-none);
```

---

### Border Radius

```css
border-radius: var(--radius-none);  /* 0 (square corners) */
border-radius: var(--radius-sm);    /* 2px */
border-radius: var(--radius-base);  /* 4px */
border-radius: var(--radius-md);    /* 6px */
border-radius: var(--radius-lg);    /* 8px */
border-radius: var(--radius-xl);    /* 12px */
border-radius: var(--radius-2xl);   /* 16px */
border-radius: var(--radius-3xl);   /* 24px */
border-radius: var(--radius-full);  /* 9999px (pills/circles) */
```

---

### Transitions & Animations

#### Durations
```css
transition-duration: var(--duration-fast);    /* 150ms */
transition-duration: var(--duration-normal);  /* 200ms */
transition-duration: var(--duration-medium);  /* 300ms */
transition-duration: var(--duration-slow);    /* 500ms */
```

#### Easing Functions
```css
transition-timing-function: var(--ease-linear);
transition-timing-function: var(--ease-in);
transition-timing-function: var(--ease-out);
transition-timing-function: var(--ease-in-out);
transition-timing-function: var(--ease-bounce);
```

#### Pre-configured Transitions
```css
transition: var(--transition-colors);     /* Color/background/border */
transition: var(--transition-opacity);    /* Opacity */
transition: var(--transition-transform);  /* Transform */
transition: var(--transition-all);        /* All properties */
transition: var(--transition-shadow);     /* Box-shadow */
```

---

### Z-Index Scale

Use the z-index scale to manage stacking contexts:

```css
z-index: var(--z-base);            /* 0 - Default */
z-index: var(--z-dropdown);        /* 10 */
z-index: var(--z-sticky);          /* 20 */
z-index: var(--z-fixed);           /* 30 */
z-index: var(--z-modal-backdrop);  /* 40 */
z-index: var(--z-modal);           /* 50 */
z-index: var(--z-popover);         /* 60 */
z-index: var(--z-tooltip);         /* 70 */
z-index: var(--z-notification);    /* 80 */
z-index: var(--z-max);             /* 9999 */
```

---

## Utility Classes

The design system includes pre-built utility classes for common UI patterns.

### Buttons

#### Base Button
```html
<button class="btn">Click me</button>
```

#### Button Variants
```html
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-ghost">Ghost</button>
<button class="btn btn-outline">Outline</button>
<button class="btn btn-danger">Delete</button>
```

#### Button Sizes
```html
<button class="btn btn-primary btn-sm">Small</button>
<button class="btn btn-primary">Default</button>
<button class="btn btn-primary btn-lg">Large</button>
```

#### Icon Button
```html
<button class="btn btn-icon btn-ghost">
  <IconComponent />
</button>
```

---

### Cards

#### Basic Card
```html
<div class="card">
  <div class="card-header">
    <h3>Card Title</h3>
  </div>
  <div class="card-body">
    <p>Card content goes here.</p>
  </div>
  <div class="card-footer">
    <button class="btn btn-primary">Action</button>
  </div>
</div>
```

#### Interactive Card
```html
<div class="card card-hover">
  <div class="card-body">
    <p>Clickable card with hover effect</p>
  </div>
</div>
```

#### Offset Card (Typewriter Style)
```html
<div class="card-offset">
  <div class="card-body">
    <p>Card with signature offset shadow</p>
  </div>
</div>
```

---

### Modals

#### Modal Structure
```html
<div class="modal-backdrop">
  <div class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title">Modal Title</h2>
      <button class="btn btn-icon btn-ghost">×</button>
    </div>
    <div class="modal-body">
      <p>Modal content...</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost">Cancel</button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

---

### Badges & Pills

#### Badges
```html
<span class="badge badge-amber">Amber</span>
<span class="badge badge-sky">Sky</span>
<span class="badge badge-emerald">Emerald</span>
<span class="badge badge-violet">Violet</span>
<span class="badge badge-rose">Rose</span>
<span class="badge badge-stone">Stone</span>
```

#### Interactive Pills/Tags
```html
<button class="pill">Filter Tag</button>
<button class="pill active">Active Filter</button>
```

---

### Utility Classes

#### Screen Reader Only
```html
<span class="sr-only">Hidden but accessible text</span>
```

#### Fade In Animation
```html
<div class="fade-in visible">
  <p>Content with fade-in effect</p>
</div>
```

#### Text Truncation
```html
<p class="truncate">This text will truncate with ellipsis...</p>
<p class="line-clamp-2">This text will show 2 lines max...</p>
<p class="line-clamp-3">This text will show 3 lines max...</p>
```

#### Responsive Visibility
```html
<div class="hide-mobile">Hidden on mobile</div>
<div class="hide-tablet">Hidden on tablet</div>
<div class="hide-desktop">Hidden on desktop</div>
```

#### Print Utilities
```html
<div class="no-print">This won't appear when printing</div>
```

---

## Examples

### Creating a Themed Button
```css
.custom-button {
  padding: var(--space-3) var(--space-6);
  font-family: var(--font-display);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: white;
  background-color: var(--color-accent-sky);
  border: 2px solid var(--color-accent-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: var(--transition-all);
}

.custom-button:hover {
  background-color: var(--color-accent-sky-dark);
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Creating a Card with Custom Styling
```css
.feature-card {
  background-color: var(--color-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-shadow), var(--transition-transform);
}

.feature-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-4px);
}

.feature-card h3 {
  font-family: var(--font-display);
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
  margin-bottom: var(--space-3);
}

.feature-card p {
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-secondary);
}
```

---

## Best Practices

1. **Always use design tokens** instead of hardcoded values
   - ❌ `color: #1c1917;`
   - ✅ `color: var(--color-text-primary);`

2. **Use semantic naming** for custom properties
   - ❌ `--my-blue-color`
   - ✅ `--color-primary-action`

3. **Leverage utility classes** for common patterns
   - Use `.btn-primary` instead of rewriting button styles
   - Use `.card` for standard card layouts

4. **Maintain consistency** with the typewriter aesthetic
   - Use `--font-display` for headings and labels
   - Use `--font-body` for paragraphs and content
   - Keep the paper texture and stone color palette

5. **Test accessibility**
   - Ensure sufficient color contrast
   - Use `.sr-only` for screen reader text
   - Test keyboard navigation with `:focus-visible` states

6. **Be responsive**
   - Use `.hide-mobile`, `.hide-tablet`, `.hide-desktop` utilities
   - Test on different screen sizes

---

## Migration Guide

### Updating Existing Components

**Before:**
```css
.my-component {
  background: #fdfbf7;
  color: #1c1917;
  padding: 1.5rem;
  border: 1px solid #e7e5e4;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: all 0.2s ease;
}
```

**After:**
```css
.my-component {
  background: var(--color-paper);
  color: var(--color-text-primary);
  padding: var(--space-6);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-all);
}
```

### Using Utility Classes

**Before:**
```html
<button style="padding: 0.75rem 1.5rem; background: #0ea5e9; color: white; border-radius: 0.5rem;">
  Click me
</button>
```

**After:**
```html
<button class="btn btn-primary">
  Click me
</button>
```

---

## Maintenance

### Adding New Tokens

When adding new design tokens:

1. Add to the appropriate section in `tokens.css`
2. Follow naming conventions (`--category-name-variant`)
3. Document in this README
4. Test across browsers

### Updating Tokens

To update a token globally:

1. Edit the value in `tokens.css`
2. Test all pages/components
3. Update documentation if needed

---

## Browser Support

This design system uses CSS custom properties (CSS Variables), supported in:
- Chrome 49+
- Firefox 31+
- Safari 9.1+
- Edge 15+

**No IE11 support** (IE11 does not support CSS custom properties)

---

## Questions?

For questions or issues with the design system, contact the archive maintainer or open a GitHub issue.
