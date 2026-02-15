# Shared Components Architecture

## Component Hierarchy

```
frontend/components/shared/
│
├── Layout Components
│   ├── Header.js          → Page headers with navigation
│   └── Modal.js           → Overlays and dialogs
│
├── Content Components
│   └── Card.js            → Content containers
│
├── Interactive Components
│   └── Button.js          → Actions and links
│
└── Feedback Components
    ├── LoadingState.js    → Loading indicators
    └── ErrorState.js      → Error displays
```

## Dependency Graph

```
Modal.js
  └── uses: X (lucide-react)
  └── imports: html.js

Button.js
  └── uses: Loader2 (lucide-react)
  └── imports: html.js

Header.js
  └── uses: ArrowLeft, Newspaper (lucide-react)
  └── imports: html.js

Card.js
  └── imports: html.js

LoadingState.js
  └── uses: BookOpen (lucide-react)
  └── imports: html.js

ErrorState.js
  └── uses: AlertCircle, RefreshCw (lucide-react)
  └── imports: html.js
```

## Usage Patterns

### Pattern 1: Feature Page
```
Header (navigation)
  └── Container
      └── Card Grid
          └── Individual Cards
              └── Button (actions)
```

### Pattern 2: Data Loading
```
LoadingState (initial)
  ↓
ErrorState (on error)
  ↓
Content (on success)
```

### Pattern 3: Modal Flow
```
Button (trigger)
  ↓
Modal (opens)
  └── Content
  └── Button (action)
  └── Button (cancel)
```

## Component Communication

```
Parent Component
  │
  ├─→ Header
  │     └── Actions (via props.actions)
  │           └── Button callbacks
  │
  ├─→ Cards
  │     └── onClick/href navigation
  │
  └─→ Modal
        ├── isOpen (state)
        ├── onClose (callback)
        └── Children (content)
              └── Buttons (form actions)
```

## State Management

### Modal Example
```javascript
// Parent manages state
const [isOpen, setIsOpen] = useState(false);

// Modal receives state and callbacks
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
>
  <Button onClick={() => {
    // Do action
    setIsOpen(false);
  }}>
    Save
  </Button>
</Modal>
```

### Loading Example
```javascript
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);

// Components react to state
if (loading) return <LoadingState />;
if (error) return <ErrorState onRetry={retry} />;
return <Content data={data} />;
```

## Design System Integration

All components follow these principles:

1. **Consistent Spacing**
   - Internal padding: `p-6` (default)
   - Gaps: `gap-6` (grids), `gap-2` (inline)
   - Margins: `mb-6` (sections)

2. **Typography**
   - Headers: `font-display` (Special Elite)
   - Body: `font-body` (Roboto Mono)
   - Hierarchy: 3xl → 2xl → xl → lg → base → sm → xs

3. **Colors**
   - Primary: `stone-900` (dark)
   - Background: `#fdfbf7` (paper)
   - Borders: `stone-200` (light), `stone-800` (dark)
   - States: `red-*`, `green-*`, `amber-*`

4. **Effects**
   - Borders: 2px solid
   - Shadows: 8px offset box shadow
   - Transitions: 300ms ease
   - Focus: 2px ring with offset

5. **Responsiveness**
   - Mobile-first approach
   - Breakpoints: sm (640px), md (768px), lg (1024px)
   - Hidden elements: `hidden sm:inline`
   - Grid columns: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

## Accessibility Features

### Keyboard Navigation
- **Modal**: ESC to close, Tab to cycle, focus trap
- **Button**: Enter/Space to activate
- **Card**: Enter on keyboard focus (when clickable)

### ARIA Attributes
- **Modal**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- **Button**: `aria-disabled`, `aria-label`
- **Header**: Semantic `<header>` tag

### Focus Management
- **Modal**: Auto-focus on close button
- **Button**: Visible focus ring
- **All**: 2px offset ring on focus

## Performance Considerations

1. **Lazy Loading**
   - Icons imported from CDN (not bundled)
   - Components loaded on-demand

2. **Rendering**
   - No virtual DOM (HTM compiles to React.createElement)
   - Minimal re-renders (state lifted to parent)

3. **Bundle Size**
   - Zero build step = zero bundle
   - Each component ~3-5KB
   - Total shared library: ~25KB

## Testing Strategy

### Visual Testing
```javascript
// Test all variants
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Danger</Button>

// Test all sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
```

### Interaction Testing
```javascript
// Test state changes
const [loading, setLoading] = useState(false);
<Button loading={loading} onClick={() => setLoading(true)}>
  Click Me
</Button>

// Test modal lifecycle
const [open, setOpen] = useState(false);
<Modal isOpen={open} onClose={() => setOpen(false)}>
  Content
</Modal>
```

### Error Testing
```javascript
// Simulate errors
const [error, setError] = useState(null);
fetchData().catch(err => setError(err.message));

// Display error state
{error && <ErrorState message={error} onRetry={retry} />}
```

## Migration Guide

### From Inline JSX to Shared Components

**Before:**
```javascript
<div className="bg-white border-2 border-stone-200 p-6">
  <h3>{title}</h3>
  <p>{description}</p>
</div>
```

**After:**
```javascript
<Card title={title}>
  <p>{description}</p>
</Card>
```

**Before:**
```javascript
<button className="px-6 py-2 bg-stone-900 text-white" onClick={handleClick}>
  Save
</button>
```

**After:**
```javascript
<Button variant="primary" onClick={handleClick}>
  Save
</Button>
```

## Future Extensions

Potential additions to the shared library:

1. **Form Components**
   - Input, Textarea, Select
   - Checkbox, Radio
   - Form validation

2. **Layout Components**
   - Grid, Flex utilities
   - Container, Section
   - Sidebar, Nav

3. **Data Components**
   - Table, List
   - Pagination
   - Search, Filter

4. **Feedback Components**
   - Toast notifications
   - Progress bars
   - Skeleton loaders

5. **Advanced Components**
   - Dropdown, Menu
   - Tabs, Accordion
   - Tooltip, Popover
