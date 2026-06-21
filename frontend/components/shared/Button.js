// Button.js - Universal button component
import { html } from '../../html.js?v=3.4.4';
import { Loader2 } from 'lucide-react';

/**
 * Universal button component
 * @param {Object} props
 * @param {string} [props.variant='primary'] - Button variant: 'primary', 'secondary', 'ghost', 'danger'
 * @param {string} [props.size='md'] - Button size: 'sm', 'md', 'lg'
 * @param {boolean} [props.disabled=false] - Whether button is disabled
 * @param {boolean} [props.loading=false] - Whether button is in loading state
 * @param {*} [props.icon] - Icon component (Lucide)
 * @param {string} [props.iconPosition='left'] - Icon position: 'left' or 'right'
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.href] - If provided, renders as link
 * @param {string} [props.type='button'] - Button type attribute
 * @param {string} [props.className] - Additional CSS classes
 * @param {*} props.children - Button content
 */
const Button = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  onClick,
  href,
  type = 'button',
  className = '',
  children
}) => {
  // Base classes
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-display font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

  // Variant classes
  const variantClasses = {
    primary: 'bg-stone-900 text-white hover:bg-stone-700 focus:ring-stone-500 disabled:bg-stone-400',
    secondary: 'bg-white text-stone-900 border-2 border-stone-900 hover:bg-stone-100 focus:ring-stone-500 disabled:bg-stone-100 disabled:border-stone-300 disabled:text-stone-400',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus:ring-stone-400 disabled:text-stone-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-red-300'
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-3.5 text-lg'
  };

  // Icon size classes
  const iconSizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const allClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} ${
    disabled || loading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
  }`;

  const content = html`
    ${loading && html`<${Loader2} className="${iconSizeClasses[size]} animate-spin" />`}
    ${!loading && Icon && iconPosition === 'left' && html`<${Icon} className="${iconSizeClasses[size]}" />`}
    <span>${children}</span>
    ${!loading && Icon && iconPosition === 'right' && html`<${Icon} className="${iconSizeClasses[size]}" />`}
  `;

  // Render as link if href provided
  if (href) {
    return html`
      <a
        href=${href}
        className=${allClasses}
        aria-disabled=${disabled}
        onClick=${disabled ? (e) => e.preventDefault() : onClick}
      >
        ${content}
      </a>
    `;
  }

  // Render as button
  return html`
    <button
      type=${type}
      className=${allClasses}
      disabled=${disabled || loading}
      onClick=${onClick}
    >
      ${content}
    </button>
  `;
};

export default Button;
