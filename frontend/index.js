import { createRoot } from 'react-dom/client';
import { html } from './html.js?v=2.0.2';
import App from './App.js?v=2.0.2';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(html`<${App} />`);
