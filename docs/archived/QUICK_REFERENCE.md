# Shared Components - Quick Reference

One-page cheat sheet for all shared components.

## Import

```javascript
import { Modal, Button, Header, Card, LoadingState, ErrorState } from './components/shared/index.js';
```

---

## Modal

```javascript
<${Modal} isOpen=${bool} onClose=${fn} title="Title" size="md|lg|xl">
  Content
<//>
```

---

## Button

```javascript
// Primary
<${Button} onClick=${fn}>Text<//>

// With icon
<${Button} icon=${Icon} iconPosition="left|right">Text<//>

// Loading
<${Button} loading=${true}>Loading...<//>

// Link
<${Button} href="/path">Link Button<//>

// Variants
<${Button} variant="primary|secondary|ghost|danger">Text<//>

// Sizes
<${Button} size="sm|md|lg">Text<//>
```

---

## Header

```javascript
<${Header}
  title="Page Title"
  subtitle="Description"
  backLink="/path"
  backLabel="Back"
  actions=${[
    { label: 'Action', onClick: fn, icon: Icon },
    { label: 'Link', href: '/path', icon: Icon }
  ]}
/>
```

---

## Card

```javascript
// Basic
<${Card} title="Title" subtitle="Meta">Content<//>

// With image
<${Card} title="Title" image="/path.jpg">Content<//>

// Clickable
<${Card} onClick=${fn}>Content<//>

// Link
<${Card} href="/path">Content<//>

// With badge
<${Card} badge="New" badgeColor="green|blue|amber|red|stone">Content<//>
```

---

## LoadingState

```javascript
// Simple
<${LoadingState} message="Loading..." />

// With quotes
<${LoadingState} showQuotes=${true} />

// Sizes
<${LoadingState} size="sm|md|lg" />
```

---

## ErrorState

```javascript
<${ErrorState}
  title="Error Title"
  message="Error description"
  onRetry=${fn}
  retryLabel="Try Again"
/>
```

---

## Common Patterns

### Feature Page
```javascript
<${Header} title="Feature" />
<div className="container mx-auto px-4 py-8">
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    <${Card}>...<//>
  </div>
</div>
```

### Modal with Form
```javascript
<${Modal} isOpen=${open} onClose=${close} title="Form">
  <form>...</form>
  <${Button} variant="primary">Submit<//>
<//>
```

### Data Fetching
```javascript
if (loading) return <${LoadingState} showQuotes=${true} />;
if (error) return <${ErrorState} onRetry=${retry} />;
return <div>Data</div>;
```

---

## Design Tokens

### Colors
- Background: `#fdfbf7` (paper)
- Text: `stone-900` / `#1c1917`
- Border: `stone-200`, `stone-800`
- Accents: sky, green, amber, pink, violet, orange

### Fonts
- Display: `Special Elite` (`.font-display`)
- Body: `Roboto Mono` (`.font-body`)

### Spacing
- Padding: `p-6` (cards), `p-4` (header)
- Gap: `gap-6` (grids), `gap-4` (flex)
- Margin: `mb-6`, `mb-4`

### Effects
- Border: `border-2`
- Shadow: `shadow-[8px_8px_0px_0px_rgba(28,25,23,1)]`
- Transition: `duration-300`

---

## Size Guide

| Component | sm | md | lg | xl |
|-----------|----|----|----|----|
| Modal | 28rem | 42rem | 56rem | 72rem |
| Button | px-3 py-1.5 | px-6 py-2.5 | px-8 py-3.5 | - |
| Icon | 3.5×3.5 | 4×4 | 5×5 | - |
| Loading | py-8 | py-16 | py-24 | - |

---

## Accessibility

All components include:
- ✅ ARIA attributes (`role`, `aria-modal`, `aria-labelledby`)
- ✅ Keyboard navigation (Tab, ESC, Enter)
- ✅ Focus indicators (`focus:ring-2`)
- ✅ Focus trapping (modals)
- ✅ Screen reader support

---

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers

Requires ES6 modules support.
