// ErrorState.js - Universal error display component
import { html } from '../../html.js?v=3.3.0';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Universal error state component
 * @param {Object} props
 * @param {string} [props.title='Something went wrong'] - Error title
 * @param {string} [props.message] - Error message/description
 * @param {Function} [props.onRetry] - Retry function (shows retry button if provided)
 * @param {string} [props.retryLabel='Try Again'] - Retry button label
 * @param {string} [props.size='md'] - Size: 'sm', 'md', 'lg'
 */
const ErrorState = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  size = 'md'
}) => {
  // Size classes
  const sizeClasses = {
    sm: {
      container: 'py-8',
      icon: 'w-8 h-8',
      title: 'text-lg',
      message: 'text-xs',
      button: 'px-4 py-2 text-sm'
    },
    md: {
      container: 'py-16',
      icon: 'w-12 h-12',
      title: 'text-xl',
      message: 'text-sm',
      button: 'px-6 py-2.5 text-base'
    },
    lg: {
      container: 'py-24',
      icon: 'w-16 h-16',
      title: 'text-2xl',
      message: 'text-base',
      button: 'px-8 py-3 text-lg'
    }
  };

  const classes = sizeClasses[size];

  return html`
    <div className="flex flex-col items-center justify-center ${classes.container} px-4 text-center">
      <!-- Error icon -->
      <div className="mb-6 p-4 rounded-full bg-red-50 border-2 border-red-200">
        <${AlertCircle} className="${classes.icon} text-red-500" />
      </div>

      <!-- Title -->
      <h3 className="font-display ${classes.title} font-bold text-red-700 mb-2">
        ${title}
      </h3>

      <!-- Message -->
      ${message && html`
        <p className="text-red-600 ${classes.message} mb-6 max-w-md font-body">
          ${message}
        </p>
      `}

      <!-- Retry button -->
      ${onRetry && html`
        <button
          onClick=${onRetry}
          className="
            inline-flex items-center gap-2
            ${classes.button}
            bg-red-600 text-white
            font-display font-bold
            rounded
            hover:bg-red-700
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
          "
        >
          <${RefreshCw} className="w-4 h-4" />
          ${retryLabel}
        </button>
      `}

      <!-- Additional help text -->
      <p className="text-stone-400 text-xs mt-6">
        If the problem persists, please try refreshing the page
      </p>
    </div>
  `;
};

export default ErrorState;
