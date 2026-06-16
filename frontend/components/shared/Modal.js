// Modal.js - Universal modal component
import { useEffect, useRef } from 'react';
import { html } from '../../html.js?v=3.4.1';
import { X } from 'lucide-react';

/**
 * Universal modal component
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to call when modal should close
 * @param {string} props.title - Modal title
 * @param {string} [props.size='md'] - Modal size: 'sm', 'md', 'lg', 'xl'
 * @param {boolean} [props.showCloseButton=true] - Whether to show the X button
 * @param {boolean} [props.closeOnBackdrop=true] - Whether clicking backdrop closes modal
 * @param {boolean} [props.closeOnEscape=true] - Whether ESC key closes modal
 * @param {*} props.children - Modal content
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children
}) => {
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Size mapping
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
  };

  // Body scroll lock when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Focus on close button when modal opens
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTabKey);
    return () => modal.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return html`
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in"
      onClick=${handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref=${modalRef}
        className="${sizeClasses[size]} w-full max-h-[90vh] bg-[#fdfbf7] border-2 border-stone-800 shadow-[8px_8px_0px_0px_rgba(28,25,23,1)] flex flex-col animate-scale-in"
      >
        <!-- Header -->
        <div className="flex items-center justify-between p-6 border-b border-stone-200 bg-white/50">
          <h2 id="modal-title" className="text-2xl font-display font-bold text-stone-900">
            ${title}
          </h2>
          ${showCloseButton && html`
            <button
              ref=${closeButtonRef}
              onClick=${onClose}
              className="p-2 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              aria-label="Close modal"
            >
              <${X} className="w-6 h-6" />
            </button>
          `}
        </div>

        <!-- Content -->
        <div className="overflow-y-auto p-6 font-body">
          ${children}
        </div>
      </div>
    </div>
  `;
};

export default Modal;
