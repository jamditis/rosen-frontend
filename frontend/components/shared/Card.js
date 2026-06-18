// Card.js - Universal card component
import { html } from '../../html.js?v=3.4.2';

/**
 * Universal card component
 * @param {Object} props
 * @param {string} [props.title] - Card title
 * @param {string} [props.subtitle] - Card subtitle/date/meta
 * @param {string} [props.image] - Image URL
 * @param {string} [props.badge] - Badge text (top-right corner)
 * @param {string} [props.badgeColor='stone'] - Badge color: 'stone', 'blue', 'green', 'red', 'amber'
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.href] - If provided, renders as link
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.hover=true] - Whether to show hover effects
 * @param {*} props.children - Card content
 */
const Card = ({
  title,
  subtitle,
  image,
  badge,
  badgeColor = 'stone',
  onClick,
  href,
  className = '',
  hover = true,
  children
}) => {
  // Badge color classes
  const badgeColors = {
    stone: 'bg-stone-100 text-stone-700 border-stone-200',
    blue: 'bg-sky-100 text-sky-700 border-sky-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200'
  };

  // Base classes
  const baseClasses = `
    bg-white
    border-2 border-stone-200
    shadow-[2px_2px_0px_0px_rgba(28,25,23,0.2)]
    rounded-sm
    overflow-hidden
    transition-all duration-300
    ${hover ? 'hover:border-stone-400 hover:shadow-[8px_8px_0px_0px_rgba(28,25,23,0.2)] hover:-translate-y-1' : ''}
    ${onClick || href ? 'cursor-pointer' : ''}
    ${className}
  `;

  const content = html`
    ${badge && html`
      <div className="absolute top-3 right-3 z-10">
        <span className="${badgeColors[badgeColor]} px-2 py-1 text-xs font-bold uppercase rounded border">
          ${badge}
        </span>
      </div>
    `}

    ${image && html`
      <div className="aspect-video bg-stone-100 overflow-hidden">
        <img
          src=${image}
          alt=${title || ''}
          className="w-full h-full object-cover"
        />
      </div>
    `}

    <div className="p-6">
      ${subtitle && html`
        <div className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
          ${subtitle}
        </div>
      `}

      ${title && html`
        <h3 className="text-xl font-display font-bold text-stone-900 mb-3 leading-tight">
          ${title}
        </h3>
      `}

      <div className="font-body text-stone-600 leading-relaxed">
        ${children}
      </div>
    </div>
  `;

  // Render as link if href provided
  if (href) {
    return html`
      <a
        href=${href}
        className="${baseClasses} block relative"
      >
        ${content}
      </a>
    `;
  }

  // Render as clickable div if onClick provided
  if (onClick) {
    return html`
      <div
        onClick=${onClick}
        className="${baseClasses} relative"
        role="button"
        tabIndex="0"
        onKeyPress=${(e) => e.key === 'Enter' && onClick(e)}
      >
        ${content}
      </div>
    `;
  }

  // Render as static card
  return html`
    <div className="${baseClasses} relative">
      ${content}
    </div>
  `;
};

export default Card;
