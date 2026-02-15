# Design System Quick Reference

## Import in CSS
```css
@import url('./design-system/tokens.css');
```

## Colors - Quick Copy
```css
/* Base */
background: var(--color-paper);           /* #fdfbf7 */
background: var(--color-card);            /* #ffffff */

/* Text */
color: var(--color-text-primary);         /* #1c1917 */
color: var(--color-text-secondary);       /* #57534e */
color: var(--color-text-tertiary);        /* #78716c */

/* Borders */
border-color: var(--color-border-light);  /* #e7e5e4 */
border-color: var(--color-border-medium); /* #d6d3d1 */

/* Accents */
color: var(--color-accent-sky);           /* #0ea5e9 */
color: var(--color-accent-green);         /* #22c55e */
color: var(--color-accent-amber);         /* #f59e0b */
color: var(--color-accent-pink);          /* #ec4899 */
color: var(--color-accent-violet);        /* #8b5cf6 */
color: var(--color-accent-orange);        /* #f97316 */
```

## Typography - Quick Copy
```css
/* Fonts */
font-family: var(--font-display);         /* Special Elite */
font-family: var(--font-body);            /* Roboto Mono */

/* Sizes */
font-size: var(--font-size-xs);           /* 12px */
font-size: var(--font-size-sm);           /* 14px */
font-size: var(--font-size-base);         /* 16px */
font-size: var(--font-size-lg);           /* 18px */
font-size: var(--font-size-xl);           /* 20px */
font-size: var(--font-size-2xl);          /* 24px */
font-size: var(--font-size-3xl);          /* 30px */
font-size: var(--font-size-4xl);          /* 36px */

/* Weights */
font-weight: var(--font-weight-normal);   /* 400 */
font-weight: var(--font-weight-bold);     /* 700 */
```

## Spacing - Quick Copy
```css
padding: var(--space-1);   /* 4px */
padding: var(--space-2);   /* 8px */
padding: var(--space-3);   /* 12px */
padding: var(--space-4);   /* 16px */
padding: var(--space-6);   /* 24px */
padding: var(--space-8);   /* 32px */
padding: var(--space-12);  /* 48px */
```

## Shadows - Quick Copy
```css
box-shadow: var(--shadow-sm);             /* Subtle */
box-shadow: var(--shadow-md);             /* Medium */
box-shadow: var(--shadow-lg);             /* Large */
box-shadow: var(--shadow-offset);         /* 8px 8px typewriter */
```

## Borders - Quick Copy
```css
border-radius: var(--radius-sm);          /* 2px */
border-radius: var(--radius-md);          /* 6px */
border-radius: var(--radius-lg);          /* 8px */
border-radius: var(--radius-full);        /* Pill/circle */
```

## Transitions - Quick Copy
```css
transition: var(--transition-colors);     /* Colors */
transition: var(--transition-all);        /* All properties */
transition-duration: var(--duration-fast);    /* 150ms */
transition-duration: var(--duration-normal);  /* 200ms */
```

## Z-Index - Quick Copy
```css
z-index: var(--z-dropdown);        /* 10 */
z-index: var(--z-modal-backdrop);  /* 40 */
z-index: var(--z-modal);           /* 50 */
z-index: var(--z-tooltip);         /* 70 */
```

## Utility Classes - Quick Copy
```html
<!-- Buttons -->
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-ghost">Ghost</button>
<button class="btn btn-danger">Danger</button>

<!-- Sizes -->
<button class="btn btn-primary btn-sm">Small</button>
<button class="btn btn-primary btn-lg">Large</button>

<!-- Cards -->
<div class="card">
  <div class="card-header">Header</div>
  <div class="card-body">Content</div>
  <div class="card-footer">Footer</div>
</div>

<!-- Hoverable Card -->
<div class="card card-hover">Clickable</div>

<!-- Offset Card -->
<div class="card-offset">Typewriter style</div>

<!-- Badges -->
<span class="badge badge-sky">Sky</span>
<span class="badge badge-amber">Amber</span>
<span class="badge badge-emerald">Emerald</span>

<!-- Pills -->
<button class="pill">Filter</button>
<button class="pill active">Active</button>

<!-- Visibility -->
<div class="hide-mobile">Desktop only</div>
<div class="sr-only">Screen reader only</div>

<!-- Text -->
<p class="truncate">Truncate with ellipsis</p>
<p class="line-clamp-2">Limit to 2 lines</p>
```

## Common Patterns

### Button with Icon
```html
<button class="btn btn-primary">
  <svg>...</svg>
  <span>Click me</span>
</button>
```

### Modal
```html
<div class="modal-backdrop">
  <div class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title">Title</h2>
    </div>
    <div class="modal-body">Content</div>
    <div class="modal-footer">
      <button class="btn btn-ghost">Cancel</button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

### Themed Component
```css
.my-component {
  background: var(--color-card);
  color: var(--color-text-primary);
  padding: var(--space-6);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-all);
}

.my-component:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
```

### Responsive Layout
```css
.container {
  padding: var(--space-4);
}

@media (min-width: 768px) {
  .container {
    padding: var(--space-8);
  }
}

@media (min-width: 1024px) {
  .container {
    padding: var(--space-12);
  }
}
```

## Migration Checklist

- [ ] Replace hardcoded colors with `var(--color-*)`
- [ ] Replace hardcoded spacing with `var(--space-*)`
- [ ] Replace hardcoded font sizes with `var(--font-size-*)`
- [ ] Replace hardcoded shadows with `var(--shadow-*)`
- [ ] Use utility classes for buttons, cards, badges
- [ ] Add `:focus-visible` states for accessibility
- [ ] Test in multiple browsers
- [ ] Verify responsive behavior

## Resources

- **Full Documentation**: `README.md`
- **Visual Demo**: `demo.html` (open in browser)
- **Source Code**: `tokens.css`
