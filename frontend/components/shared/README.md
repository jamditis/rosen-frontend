# Shared Components

A collection of reusable UI components for the Jay Rosen Digital Archive. These components follow the archive's design system (Special Elite/Roboto Mono fonts, stone color palette, 2px borders, 8px shadows) and work with the zero-build React architecture.

## Components

### Modal

Universal modal wrapper with backdrop, ESC key handling, focus trapping, and body scroll lock.

```javascript
import Modal from './components/shared/Modal.js';

html`<${Modal}
  isOpen=${showModal}
  onClose=${() => setShowModal(false)}
  title="Record Details"
  size="lg"
>
  <p>Modal content here</p>
<//>`;
```

**Props:**
- `isOpen` (boolean, required) - Whether modal is open
- `onClose` (function, required) - Close handler
- `title` (string, required) - Modal title
- `size` (string) - 'sm', 'md', 'lg', 'xl' (default: 'md')
- `showCloseButton` (boolean) - Show X button (default: true)
- `closeOnBackdrop` (boolean) - Click backdrop to close (default: true)
- `closeOnEscape` (boolean) - ESC key to close (default: true)
- `children` (node) - Modal content

---

### Button

Button component with multiple variants, sizes, loading states, and icon support.

```javascript
import Button from './components/shared/Button.js';
import { Download } from 'lucide-react';

html`
  <${Button} variant="primary" onClick=${handleClick}>
    Save Changes
  <//>

  <${Button} variant="secondary" icon=${Download} loading=${isLoading}>
    Download PDF
  <//>

  <${Button} variant="ghost" href="/archive" icon=${ArrowLeft}>
    Back to Archive
  <//>
`;
```

**Props:**
- `variant` (string) - 'primary', 'secondary', 'ghost', 'danger' (default: 'primary')
- `size` (string) - 'sm', 'md', 'lg' (default: 'md')
- `disabled` (boolean) - Disabled state (default: false)
- `loading` (boolean) - Loading spinner (default: false)
- `icon` (component) - Lucide icon component
- `iconPosition` (string) - 'left' or 'right' (default: 'left')
- `onClick` (function) - Click handler
- `href` (string) - Renders as link if provided
- `type` (string) - Button type (default: 'button')
- `className` (string) - Additional CSS classes
- `children` (node) - Button content

---

### Header

Universal header for feature pages with logo, back navigation, and action buttons.

```javascript
import Header from './components/shared/Header.js';
import { Download } from 'lucide-react';

html`<${Header}
  title="Glossary"
  subtitle="Key concepts from the dissertation"
  backLink="/archive"
  backLabel="Back to Archive"
  actions=${[
    { label: 'Download PDF', href: '/dissertation.pdf', icon: Download }
  ]}
/>`;
```

**Props:**
- `title` (string, required) - Page title
- `subtitle` (string) - Optional subtitle
- `backLink` (string) - Back link (default: archive root, null to hide)
- `backLabel` (string) - Back button text (default: 'Back to Archive')
- `actions` (array) - Action buttons: `{ label, onClick?, href?, icon? }`
- `sticky` (boolean) - Sticky positioning (default: true)
- `showLogo` (boolean) - Show archive logo (default: true)

---

### Card

Card component with image, badge, hover effects, and paper texture aesthetic.

```javascript
import Card from './components/shared/Card.js';

html`
  <${Card}
    title="The Impossible Press"
    subtitle="1986"
    badge="Featured"
    badgeColor="amber"
    onClick=${() => console.log('clicked')}
  >
    <p>Card content here</p>
  <//>

  <${Card}
    title="Another Work"
    image="/path/to/image.jpg"
    href="/work/123"
  >
    <p>This card is a link</p>
  <//>
`;
```

**Props:**
- `title` (string) - Card title
- `subtitle` (string) - Subtitle/date/meta
- `image` (string) - Image URL
- `badge` (string) - Badge text (top-right)
- `badgeColor` (string) - 'stone', 'blue', 'green', 'red', 'amber' (default: 'stone')
- `onClick` (function) - Click handler
- `href` (string) - Renders as link if provided
- `className` (string) - Additional CSS classes
- `hover` (boolean) - Hover effects (default: true)
- `children` (node) - Card content

---

### LoadingState

Loading component with spinner and optional rotating dissertation quotes.

```javascript
import LoadingState from './components/shared/LoadingState.js';

html`
  <${LoadingState}
    message="Loading archive data..."
    showQuotes=${true}
    size="md"
  />

  <${LoadingState} message="Please wait..." />
`;
```

**Props:**
- `message` (string) - Loading message (default: 'Loading...')
- `showQuotes` (boolean) - Show rotating quotes (default: false)
- `size` (string) - 'sm', 'md', 'lg' (default: 'md')

---

### ErrorState

Error display component with icon, message, and retry button.

```javascript
import ErrorState from './components/shared/ErrorState.js';

html`<${ErrorState}
  title="Failed to load data"
  message="Could not connect to the server. Please check your internet connection."
  onRetry=${() => window.location.reload()}
  retryLabel="Reload Page"
  size="md"
/>`;
```

**Props:**
- `title` (string) - Error title (default: 'Something went wrong')
- `message` (string) - Error description
- `onRetry` (function) - Retry handler (shows button if provided)
- `retryLabel` (string) - Retry button text (default: 'Try Again')
- `size` (string) - 'sm', 'md', 'lg' (default: 'md')

---

## Usage

### Individual imports:
```javascript
import Modal from './components/shared/Modal.js';
import Button from './components/shared/Button.js';
```

### Batch import (using index.js):
```javascript
import { Modal, Button, Header, Card, LoadingState, ErrorState } from './components/shared/index.js';
```

## Design System

All components follow the archive's design guidelines:

- **Fonts:** Special Elite (display), Roboto Mono (body)
- **Colors:** Stone palette (#fdfbf7 paper, stone-900 text)
- **Borders:** 2px solid borders
- **Shadows:** 8px offset box shadows
- **Transitions:** 300ms duration
- **Focus:** Ring-based focus indicators

## Architecture

These components are built for the zero-build React setup:

- React 18 via ESM (`https://esm.sh/react@18.2.0`)
- HTM for JSX-like syntax
- Tailwind CSS via CDN
- Lucide icons via ESM
- No build step required

## Examples

See existing components for reference implementations:
- `WelcomeModal.js` - Modal pattern
- `RecordModal.js` - Modal with navigation
- `ToolsModal.js` - Modal with grid layout
- `LoadingQuotes.js` - Loading state with quotes
