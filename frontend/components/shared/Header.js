// Header.js - Universal header for feature pages
import { html } from '../../html.js';
import { ArrowLeft, Newspaper } from 'lucide-react';

/**
 * Universal header component for feature pages
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {string} [props.subtitle] - Optional subtitle/description
 * @param {string} [props.backLink] - Back navigation link (default: archive root)
 * @param {string} [props.backLabel='Back to Archive'] - Back button label
 * @param {Array} [props.actions] - Array of action buttons/links: { label, onClick?, href?, icon? }
 * @param {boolean} [props.sticky=true] - Whether header is sticky
 * @param {boolean} [props.showLogo=true] - Whether to show archive logo
 */
const Header = ({
  title,
  subtitle,
  backLink,
  backLabel = 'Back to Archive',
  actions = [],
  sticky = true,
  showLogo = true
}) => {
  // Detect environment for path generation
  const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const DEFAULT_BACK = IS_LOCAL ? '../../index.html' : '/j/rosen-archive/index.html';
  const finalBackLink = backLink || DEFAULT_BACK;

  return html`
    <header className="${sticky ? 'sticky top-0 z-50' : ''} w-full bg-[#fdfbf7] border-b-2 border-stone-800 shadow-sm">
      <div className="container mx-auto px-4">
        <!-- Top bar with logo and actions -->
        ${showLogo && html`
          <div className="flex items-center justify-between py-4 border-b border-stone-200">
            <a
              href=${finalBackLink}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="bg-stone-900 text-white p-1.5">
                <${Newspaper} className="w-5 h-5" />
              </div>
              <span className="text-sm font-display font-bold text-stone-900 hidden sm:inline">
                Jay Rosen Internet Archive
              </span>
              <span className="text-sm font-display font-bold text-stone-900 sm:hidden">
                JRIA
              </span>
            </a>

            ${actions.length > 0 && html`
              <div className="flex items-center gap-2">
                ${actions.map((action, i) => {
                  const Icon = action.icon;
                  const content = html`
                    ${Icon && html`<${Icon} className="w-4 h-4" />`}
                    <span className="hidden sm:inline">${action.label}</span>
                  `;

                  if (action.href) {
                    return html`
                      <a
                        key=${i}
                        href=${action.href}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded border border-stone-200 transition-all"
                      >
                        ${content}
                      </a>
                    `;
                  }

                  return html`
                    <button
                      key=${i}
                      onClick=${action.onClick}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded border border-stone-200 transition-all"
                    >
                      ${content}
                    </button>
                  `;
                })}
              </div>
            `}
          </div>
        `}

        <!-- Title section -->
        <div className="py-6">
          ${backLink !== null && html`
            <a
              href=${finalBackLink}
              className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-4 font-bold transition-colors"
            >
              <${ArrowLeft} className="w-4 h-4" />
              ${backLabel}
            </a>
          `}

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-stone-900 mb-2">
            ${title}
          </h1>

          ${subtitle && html`
            <p className="text-base sm:text-lg text-stone-600 font-body max-w-3xl">
              ${subtitle}
            </p>
          `}
        </div>
      </div>
    </header>
  `;
};

export default Header;
