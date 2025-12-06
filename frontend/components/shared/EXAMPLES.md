# Shared Components - Usage Examples

Complete examples showing how to use the shared components in real scenarios.

## Example 1: Feature Page with Header, Cards, and Modal

```javascript
import { useState } from 'react';
import { html } from '../../html.js';
import { Header, Card, Modal, Button } from './shared/index.js';
import { Download, Share2 } from 'lucide-react';

const FeaturePage = () => {
  const [selectedItem, setSelectedItem] = useState(null);

  const items = [
    { id: 1, title: 'Item One', description: 'Description here' },
    { id: 2, title: 'Item Two', description: 'Another description' }
  ];

  return html`
    <div>
      <${Header}
        title="Feature Gallery"
        subtitle="Browse our collection of featured works"
        backLink="/archive"
        actions=${[
          { label: 'Download All', icon: Download, href: '/download.zip' },
          { label: 'Share', icon: Share2, onClick: () => alert('Sharing!') }
        ]}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${items.map(item => html`
            <${Card}
              key=${item.id}
              title=${item.title}
              subtitle="2025"
              badge="New"
              badgeColor="green"
              onClick=${() => setSelectedItem(item)}
            >
              <p>${item.description}</p>
            <//>
          `)}
        </div>
      </div>

      <${Modal}
        isOpen=${!!selectedItem}
        onClose=${() => setSelectedItem(null)}
        title=${selectedItem?.title || ''}
        size="lg"
      >
        <p>Details about ${selectedItem?.title}</p>
        <${Button} variant="primary" onClick=${() => setSelectedItem(null)}>
          Close
        <//>
      <//>
    </div>
  `;
};
```

## Example 2: Loading and Error States

```javascript
import { useState, useEffect } from 'react';
import { html } from '../../html.js';
import { LoadingState, ErrorState, Card } from './shared/index.js';

const DataFetcher = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchData()
      .then(result => {
        setData(result);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchData()
      .then(result => {
        setData(result);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  if (loading) {
    return html`
      <${LoadingState}
        message="Loading archive records..."
        showQuotes=${true}
        size="md"
      />
    `;
  }

  if (error) {
    return html`
      <${ErrorState}
        title="Failed to Load Records"
        message=${error}
        onRetry=${handleRetry}
        retryLabel="Retry Loading"
      />
    `;
  }

  return html`
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      ${data.map(item => html`
        <${Card} key=${item.id} title=${item.title}>
          <p>${item.summary}</p>
        <//>
      `)}
    </div>
  `;
};
```

## Example 3: Button Variants Showcase

```javascript
import { html } from '../../html.js';
import { Button } from './shared/index.js';
import { Download, Trash2, Send, Settings } from 'lucide-react';

const ButtonShowcase = () => {
  return html`
    <div className="space-y-6 p-8">
      <!-- Primary buttons -->
      <div className="flex gap-4 items-center">
        <${Button} variant="primary" size="sm">Small Primary<//>
        <${Button} variant="primary" size="md">Medium Primary<//>
        <${Button} variant="primary" size="lg">Large Primary<//>
      </div>

      <!-- Secondary buttons -->
      <div className="flex gap-4 items-center">
        <${Button} variant="secondary">Secondary Button<//>
        <${Button} variant="secondary" icon=${Settings}>With Icon<//>
        <${Button} variant="secondary" loading=${true}>Loading...<//>
      </div>

      <!-- Ghost buttons -->
      <div className="flex gap-4 items-center">
        <${Button} variant="ghost">Ghost Button<//>
        <${Button} variant="ghost" icon=${Send} iconPosition="right">
          Send Message
        <//>
      </div>

      <!-- Danger buttons -->
      <div className="flex gap-4 items-center">
        <${Button} variant="danger" icon=${Trash2}>Delete<//>
        <${Button} variant="danger" disabled=${true}>Disabled<//>
      </div>

      <!-- Link buttons -->
      <div className="flex gap-4 items-center">
        <${Button} variant="primary" href="/download" icon=${Download}>
          Download PDF
        <//>
      </div>
    </div>
  `;
};
```

## Example 4: Complex Modal with Footer Actions

```javascript
import { useState } from 'react';
import { html } from '../../html.js';
import { Modal, Button } from './shared/index.js';
import { Save, X } from 'lucide-react';

const FormModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setIsOpen(false);
    }, 2000);
  };

  return html`
    <div>
      <${Button} onClick=${() => setIsOpen(true)}>
        Open Form
      <//>

      <${Modal}
        isOpen=${isOpen}
        onClose=${() => setIsOpen(false)}
        title="Edit Record"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-stone-700 mb-2">
              Title
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-stone-500"
              placeholder="Enter title..."
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-stone-700 mb-2">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-stone-500"
              rows="4"
              placeholder="Enter description..."
            />
          </div>

          <!-- Footer actions -->
          <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
            <${Button}
              variant="ghost"
              onClick=${() => setIsOpen(false)}
              disabled=${saving}
            >
              Cancel
            <//>
            <${Button}
              variant="primary"
              onClick=${handleSave}
              loading=${saving}
              icon=${Save}
            >
              Save Changes
            <//>
          </div>
        </div>
      <//>
    </div>
  `;
};
```

## Example 5: Card Grid with Images

```javascript
import { html } from '../../html.js';
import { Card, Header } from './shared/index.js';

const ImageGallery = () => {
  const works = [
    {
      id: 1,
      title: 'The Impossible Press',
      year: '1986',
      image: '/images/dissertation.jpg',
      description: 'NYU Dissertation on journalism'
    },
    {
      id: 2,
      title: 'What Are Journalists For?',
      year: '1999',
      image: '/images/book.jpg',
      description: 'Book on public journalism'
    }
  ];

  return html`
    <div>
      <${Header}
        title="Featured Works"
        subtitle="Jay Rosen's most important contributions"
      />

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          ${works.map(work => html`
            <${Card}
              key=${work.id}
              title=${work.title}
              subtitle=${work.year}
              image=${work.image}
              badge="Featured"
              badgeColor="amber"
              href=${`/works/${work.id}`}
            >
              <p className="text-sm">${work.description}</p>
            <//>
          `)}
        </div>
      </div>
    </div>
  `;
};
```

## Example 6: Responsive Header with Actions

```javascript
import { html } from '../../html.js';
import { Header } from './shared/index.js';
import { Download, Share2, Printer, BookOpen } from 'lucide-react';

const DissertationPage = () => {
  return html`
    <div>
      <${Header}
        title="The Impossible Press"
        subtitle="American Journalism and the Decline of Public Life (1986)"
        backLink="/archive"
        backLabel="Back to Archive"
        actions=${[
          {
            label: 'Download PDF',
            href: '/dissertation.pdf',
            icon: Download
          },
          {
            label: 'Share',
            onClick: () => navigator.share({ title: 'The Impossible Press' }),
            icon: Share2
          },
          {
            label: 'Print',
            onClick: () => window.print(),
            icon: Printer
          },
          {
            label: 'NotebookLM',
            href: 'https://notebooklm.google.com',
            icon: BookOpen
          }
        ]}
      />

      <main className="container mx-auto px-4 py-8">
        <p className="text-lg leading-relaxed">
          Dissertation content here...
        </p>
      </main>
    </div>
  `;
};
```

## Tips

1. **Always import from the shared directory:**
   ```javascript
   import { Modal, Button } from './components/shared/index.js';
   ```

2. **Use size prop consistently:**
   - 'sm' for tight spaces, mobile
   - 'md' for standard usage
   - 'lg' for prominent features
   - 'xl' for full-screen experiences

3. **Combine components:**
   - Use `LoadingState` inside `Modal` for async operations
   - Use `ErrorState` as fallback in data components
   - Wrap `Card` grids with `Header` for context

4. **Follow the design system:**
   - All components already use the correct fonts, colors, and spacing
   - Add custom styles via `className` prop when needed
   - Maintain 2px borders and 8px shadow aesthetic

5. **Accessibility:**
   - All components include ARIA attributes
   - Keyboard navigation built-in (Tab, ESC, Enter)
   - Focus management for modals
   - Screen reader friendly
