import { createRoot } from 'react-dom/client';
import { html } from './html.js?v=3.4.3';
import App from './App.js?v=3.4.3';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(html`<${App} />`);
