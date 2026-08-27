import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { html } from '../html.js?v=3.8.36';
import { acquireBodyScrollLock } from '../services/bodyScrollLock.js?v=3.8.36';

const SemanticSearchHelpDialog = ({
  isOpen,
  onClose,
  coverage = null,
  dialogId = 'semantic-search-help',
}) => {
  const dialogRef = useRef(null);
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;
  const covered = Number.isFinite(coverage) && coverage > 0
    ? coverage.toLocaleString()
    : 'all indexed';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    return acquireBodyScrollLock();
  }, [isOpen]);

  const handleCancel = (event) => {
    event.preventDefault();
    onClose();
  };

  const handleBackdrop = (event) => {
    if (event.target === event.currentTarget) onClose();
  };

  const dialog = html`
    <dialog
      ref=${dialogRef}
      id=${dialogId}
      className="archive-semantic-help"
      aria-labelledby=${titleId}
      aria-describedby=${descriptionId}
      onCancel=${handleCancel}
      onClick=${handleBackdrop}
    >
      <div className="archive-semantic-help__panel">
        <header className="archive-semantic-help__header">
          <div>
            <p className="archive-section-label">About search by meaning</p>
            <h2 id=${titleId}>How does this work?</h2>
          </div>
          <button
            type="button"
            className="archive-semantic-help__close"
            onClick=${onClose}
            aria-label="Close semantic search explanation"
            autoFocus=${true}
          >
            <${X} aria-hidden="true" />
          </button>
        </header>

        <div id=${descriptionId} className="archive-semantic-help__body">
          <p>
            Regular search finds the words you typed. Search by meaning can also find records
            that discuss the same idea with different words.
          </p>

          <section>
            <h3>What happens in your browser</h3>
            <p>
              When you turn it on, your browser downloads about 50 MB of search files.
              A small language model turns your search into a pattern of numbers and
              compares it with stored patterns for ${covered} archive records.
            </p>
            <p>The model does not write or answer anything. It only helps rank records.</p>
          </section>

          <section>
            <h3>What the result labels mean</h3>
            <ul>
              <li><strong>Matching words</strong> means the record uses words from your search.</li>
              <li><strong>Related meaning</strong> means the record discusses the same idea with different words.</li>
              <li><strong>Words and meaning</strong> means both methods found the record.</li>
            </ul>
          </section>

          <section>
            <h3>Privacy and downloads</h3>
            <p>
              Your search stays in this browser. The first use downloads the model and
              search files from the archive and its file providers. Your browser normally
              keeps those files for later visits.
            </p>
          </section>
        </div>
      </div>
    </dialog>
  `;
  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.body);
};

export default SemanticSearchHelpDialog;
