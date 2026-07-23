
import { useEffect, useRef, useState } from 'react';
import { html } from '../html.js?v=3.8.7';
import { X, ExternalLink, ArrowLeft, ArrowRight, Quote, CheckCircle, Link, Share2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchRecordDetails, fetchEntitiesData, areEntitiesLoaded, calculateEntityConnectionStrength, getEntitiesByRecord } from '../services/archiveService.js?v=3.8.7';
import { ThreadModal } from './ThreadModal.js?v=3.8.7';
import { splitUrlsForLinkify } from '../utils/linkify.js?v=3.8.7';
import { sanitizeHref } from '../utils/sanitizeHref.js?v=3.8.7';
import { recordNeedsReview } from '../utils/needsReview.js?v=3.8.7';
import { canonicalRecordUrl, shareRecordUrl } from '../utils/recordDeepLink.js?v=3.8.7';
import { acquireBodyScrollLock } from '../services/bodyScrollLock.js?v=3.8.7';

const linkifyText = (text) => {
  const parts = splitUrlsForLinkify(text);
  if (parts === null) return null;
  return parts.map((part, i) => {
    if (part.type === 'url') {
      return html`<a key=${i} href=${part.value} target="_blank" rel="noopener noreferrer" className="archive-inline-link">${part.value}</a>`;
    }
    return part.value;
  });
};

const TagGroup = ({ title, tags, onClick }) => {
  if (!tags || tags.length === 0) return null;
  return html`
    <section className="archive-record-tag-group">
      <h4>${title}</h4>
      <div className="archive-record-tag-list">
        ${tags.map(tag => onClick ? html`
          <button type="button" key=${tag} onClick=${() => onClick(tag)}>${tag}</button>
        ` : html`<span key=${tag}>${tag}</span>`)}
      </div>
    </section>
  `;
};

const blocksRecordNavigation = (target) => target instanceof Element && Boolean(target.closest(
  'input, select, textarea, iframe, [contenteditable="true"], .archive-record-source'
));

const getSourceName = (record) => {
  if (record?.pub) return record.pub;
  try {
    return new URL(record?.url).hostname.replace(/^www\./, '');
  } catch {
    return 'original source';
  }
};

const hasPublicSourceUrl = (record) => {
  try {
    const sourceUrl = new URL(record?.url);
    return sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

const RecordModal = ({ record, allRecords, isOpen, onClose, onNext, onPrev, onSelectRecord, onSelectEntity, onFilterCategory, onFilterSearch, onReportProblem, nestedDialogOpen = false, hasPrev, hasNext, currentIndex, total }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [relatedWorks, setRelatedWorks] = useState([]);
  const [recordEntities, setRecordEntities] = useState([]);

  // State for lazy-loaded details
  const [fullRecord, setFullRecord] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsRequestKey, setDetailsRequestKey] = useState(0);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);
  const backgroundStateRef = useRef([]);
  const hasRecord = Boolean(record);
  const currentFullRecord = fullRecord?.id === record?.id ? fullRecord : null;

  useEffect(() => {
    if (!isOpen || !hasRecord) return undefined;
    return acquireBodyScrollLock();
  }, [isOpen, hasRecord]);

  // Fetch details when modal opens
  useEffect(() => {
    let cancelled = false;

    if (!isOpen || !record) {
      setFullRecord(null);
      setDetailsError('');
      return undefined;
    }

    setIsClosing(false);
    setDetailsError('');

    if (record.summary && record.url) {
      setFullRecord(record);
      setLoadingDetails(false);
      return () => { cancelled = true; };
    }

    setFullRecord(null);
    setLoadingDetails(true);
    fetchRecordDetails(record.id)
      .then(details => {
        if (cancelled) return;
        if (!details) {
          setFullRecord({
            ...record,
            summary: record.summaryPreview || record.title,
            quote: '',
            concepts: [],
            tags: [],
            url: '#',
            author: record.author || 'Jay Rosen',
            relatedIds: []
          });
          return;
        }
        setFullRecord({ ...record, ...details });
      })
      .catch(() => {
        if (!cancelled) setDetailsError('The full record could not be loaded. The archive summary is still available.');
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, record?.id, detailsRequestKey]);

  // Find related works based on shared entities
  useEffect(() => {
    if (!currentFullRecord || !allRecords) return;

    const findRelated = async () => {
      setRecordEntities([]);
      // Ensure entity data is loaded
      if (!areEntitiesLoaded()) {
        await fetchEntitiesData();
      }

      setRecordEntities(
        getEntitiesByRecord(currentFullRecord.id)
          .sort((a, b) => (b.prominence || 0) - (a.prominence || 0))
          .slice(0, 8)
      );

      // Calculate entity-based connections to all other article records
      const connections = [];
      const candidateRecords = allRecords.filter(r =>
        r.id !== currentFullRecord.id && r.type !== 'social'
      );

      for (const candidate of candidateRecords) {
        const result = calculateEntityConnectionStrength(currentFullRecord.id, candidate.id);
        if (result.strength > 0) {
          connections.push({
            ...candidate,
            connectionStrength: result.strength,
            prominenceScore: result.prominenceScore,
            sharedEntities: result.sharedEntities
          });
        }
      }

      // Sort by connection strength, take top 6
      connections.sort((a, b) => b.connectionStrength - a.connectionStrength || b.prominenceScore - a.prominenceScore);
      let related = connections.slice(0, 6);

      // Fallback: if no entity connections, use category matching
      if (related.length === 0) {
        related = allRecords.filter(r =>
          r.id !== currentFullRecord.id &&
          r.type !== 'social' &&
          (r.categories || []).some(c => (currentFullRecord.categories || []).includes(c))
        ).slice(0, 4);
      }

      setRelatedWorks(related);
    };

    findRelated();
  }, [currentFullRecord, allRecords]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen || nestedDialogOpen) return;
      const focusInsideRecord = dialogRef.current?.contains(document.activeElement);
      if (!focusInsideRecord && document.activeElement !== document.body) return;
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (!blocksRecordNavigation(e.target) && e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        onPrev();
      }
      if (!blocksRecordNavigation(e.target) && e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNext();
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, nestedDialogOpen, hasPrev, hasNext, onPrev, onNext]);

  // The dialog lives beside the archive shell in both standard and desktop
  // routes. Preserve each sibling's prior state while the record is open so
  // pointer, keyboard, and assistive-technology navigation cannot escape into
  // the obscured surface. Active modal siblings (such as a report opened before
  // record data finishes loading) must stay available above the record.
  useEffect(() => {
    if (!isOpen || !hasRecord) return undefined;

    const dialog = dialogRef.current?.closest('.archive-record-dialog');
    const backgroundElements = dialog?.parentElement
      ? Array.from(dialog.parentElement.children).filter(element => (
          element !== dialog
          && !element.matches('[role="dialog"][aria-modal="true"]')
        ))
      : [];

    backgroundStateRef.current = backgroundElements.map(element => ({
      element,
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: element.inert
    }));

    backgroundStateRef.current.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });

    return () => {
      backgroundStateRef.current.forEach(({ element, ariaHidden, inert }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      backgroundStateRef.current = [];
    };
  }, [isOpen, hasRecord]);

  useEffect(() => {
    if (!isOpen) {
      // Browser Back can dismiss the record while its report stays open above
      // it. Leave focus and the saved opener alone until that topmost dialog
      // closes; focusing through the report would break its modal boundary.
      if (nestedDialogOpen) return undefined;

      const opener = openerRef.current;
      const openerWindow = opener?.closest('.desktop-window');
      // A history traversal can close the record and activate a different
      // desktop window in the same render. Focusing an opener in the now-
      // background window would activate it again and undo Back/Forward.
      // Standard views have no desktop-window ancestor and retain the normal
      // exact-opener return; explicit closes in the active desktop window do too.
      if (
        opener?.isConnected
        && (!openerWindow || openerWindow.classList.contains('is-active'))
      ) {
        opener.focus();
      }
      openerRef.current = null;
      return undefined;
    }

    if (!hasRecord || nestedDialogOpen) return undefined;
    if (openerRef.current) return undefined;

    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen, hasRecord, nestedDialogOpen]);

  const completeClose = (afterClose = null) => {
    onClose();
    setIsClosing(false);
    afterClose?.();
  };

  const beginClose = (afterClose = null) => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      completeClose(afterClose);
      return;
    }
    setIsClosing(true);
    setTimeout(() => completeClose(afterClose), 180);
  };

  const handleClose = () => beginClose();

  const leaveRecordFor = (action, value) => {
    // This action intentionally activates a different archive surface. Do not
    // return focus to the record opener in the now-background source window:
    // DesktopShell correctly treats that focus as window activation and would
    // otherwise undo the requested navigation after the close delay.
    openerRef.current = null;
    beginClose(() => action(value));
  };

  const showNotification = (msg) => {
      setToastMessage(msg);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
  };

  const handleCopyCitation = () => {
    if (!currentFullRecord) return;
    const recordUrl = canonicalRecordUrl(window.location.href, currentFullRecord.id);
    const citationAuthor = currentFullRecord.author || 'Jay Rosen';
    const citationYear = currentFullRecord.year || 'n.d.';
    const citationSource = currentFullRecord.pub ? ` ${currentFullRecord.pub}.` : '';
    const text = `${citationAuthor} (${citationYear}). "${currentFullRecord.title}".${citationSource} Retrieved from ${recordUrl}`;
    navigator.clipboard.writeText(text).then(() => showNotification("Citation copied to clipboard"));
  };

  // Social share previews belong to the original platform, whose source URL is
  // loaded with the detail record rather than the lightweight archive card.
  const shareRecord = record?.type === 'social'
    ? currentFullRecord || (detailsError ? record : null)
    : record;
  const sharePending = record?.type === 'social' && !shareRecord;
  const shareUsesSource = shareRecord?.type === 'social' && hasPublicSourceUrl(shareRecord);
  const shareLabel = sharePending
    ? 'Loading source post link'
    : shareUsesSource
      ? 'Copy source post link'
      : 'Copy canonical record link';
  const citationLabel = currentFullRecord
    ? 'Copy citation'
    : detailsError
      ? 'Citation unavailable without full details'
      : 'Loading citation details';

  const handleShare = () => {
      if (!shareRecord) return;
      const url = shareRecordUrl(window.location.href, shareRecord);
      navigator.clipboard.writeText(url).then(() => showNotification("Link copied to clipboard"));
  };

  if (!isOpen || !record) return null;

  // Use fullRecord for display (with details), fallback to record for basic info
  const displayRecord = currentFullRecord || record;
  const isVideo = (displayRecord.url || '').includes('youtube') || (displayRecord.url || '').includes('vimeo');
  const youtubeId = (displayRecord.url || '').match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];
  const hasSource = Boolean(displayRecord.url && sanitizeHref(displayRecord.url) !== '#');
  const sourceName = getSourceName(displayRecord);
  const contentType = isVideo
    ? 'Video'
    : displayRecord.type === 'social'
      ? (displayRecord.pub || 'Social media')
      : displayRecord.type === 'Dissertation'
        ? 'Dissertation'
        : displayRecord.id?.startsWith('THREAD-')
          ? 'Thread'
          : 'Article';
  const summary = displayRecord.summary || displayRecord.summaryPreview || '';
  const navigationIsFiltered = Array.isArray(allRecords) && total < allRecords.length;
  const positionLabel = currentIndex >= 0 && total > 0 ? `${currentIndex + 1} of ${total}` : 'Record view';

  return html`
    <div className="archive-record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
      <div
        className=${`archive-record-toast ${showToast ? 'is-visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        <${CheckCircle} aria-hidden="true" />
        <span>${toastMessage}</span>
      </div>

      <div
        className=${`archive-record-dialog__backdrop ${isClosing ? 'is-closing' : ''}`}
        onClick=${handleClose}
        aria-hidden="true"
      ></div>

      <div className="archive-record-dialog__positioner">
        <article
          ref=${dialogRef}
          tabIndex="-1"
          className=${`archive-record-sheet ${isClosing ? 'is-closing' : ''}`}
        >
          <header className="archive-record-utility">
            <div className="archive-record-utility__identity">
              ${displayRecord.date && html`<time dateTime=${displayRecord.date}>${displayRecord.date}</time>`}
              ${displayRecord.date && html`<span aria-hidden="true">•</span>`}
              <span>${contentType}</span>
            </div>
            <div className="archive-record-utility__actions">
              <button
                type="button"
                onClick=${handleShare}
                disabled=${sharePending}
                className="archive-record-utility__action"
                title=${shareLabel}
                aria-label=${shareLabel}
              >
                <${Share2} aria-hidden="true" />
                <span>Share link</span>
              </button>
              <button
                type="button"
                onClick=${handleCopyCitation}
                disabled=${!currentFullRecord}
                className="archive-record-utility__action"
                title=${citationLabel}
                aria-label=${citationLabel}
              >
                <${Quote} aria-hidden="true" />
                <span>Copy citation</span>
              </button>
              <button
                ref=${closeButtonRef}
                type="button"
                onClick=${handleClose}
                className="archive-record-utility__action archive-record-utility__close"
                title="Close record"
                aria-label="Close record"
              >
                <${X} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="archive-record-document">
            ${loadingDetails && html`
              <div className="archive-record-loading" role="status" aria-live="polite">
                <${Loader2} className="archive-record-loading__icon" aria-hidden="true" />
                <span>Loading the full record…</span>
              </div>
            `}

            ${detailsError && html`
              <div className="archive-record-error" role="alert">
                <${AlertTriangle} aria-hidden="true" />
                <div>
                  <strong>Some record details are unavailable.</strong>
                  <p>${detailsError}</p>
                </div>
                <button type="button" onClick=${() => setDetailsRequestKey(key => key + 1)}>
                  <${RefreshCw} aria-hidden="true" /> Retry details
                </button>
              </div>
            `}

            <header className="archive-record-heading">
              <h2 id="record-modal-title">${displayRecord.title}</h2>

              <!-- Read needsReview from the core record, not displayRecord:
                   details merge lets stale detail data overwrite a new flag. -->
              ${recordNeedsReview(record) && html`
                <span className="archive-record-review-state" title="Auto-submitted; pending a human review pass">
                  Needs review
                </span>
              `}

              <p className="archive-record-byline">By ${displayRecord.author || 'Jay Rosen'}</p>

              ${hasSource ? html`
                <a
                  href=${sanitizeHref(displayRecord.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="archive-record-source archive-action archive-action--primary"
                >
                  Read on ${sourceName} <${ExternalLink} aria-hidden="true" />
                </a>
              ` : !loadingDetails && !detailsError ? html`
                <p className="archive-record-source-status">
                  <${AlertTriangle} aria-hidden="true" /> Source unavailable in this archive
                </p>
              ` : null}

              <div className="archive-record-provenance">
                <span>Archive ID: ${displayRecord.id}</span>
                ${onReportProblem && html`
                  <button type="button" onClick=${() => onReportProblem(displayRecord.id)}>
                    Report a problem with this record
                  </button>
                `}
              </div>
            </header>

            ${youtubeId && html`
              <div className="archive-record-media">
                <iframe
                  src=${`https://www.youtube.com/embed/${youtubeId}`}
                  title=${`Video for ${displayRecord.title}`}
                  allowFullScreen=${true}
                ></iframe>
              </div>
            `}

            ${(() => {
              // Show quote block only if it adds information beyond the title
              if (youtubeId || !displayRecord.quote) return null;
              const quoteText = displayRecord.quote.trim();
              const titleText = (displayRecord.title || '').replace(/\.\.\.$/,'').trim();
              // Skip if quote is effectively the same as the title
              if (titleText.length > 10 && (quoteText === titleText || quoteText.startsWith(titleText) || titleText.startsWith(quoteText.substring(0, titleText.length)))) return null;
              return html`
                <blockquote className="archive-record-quotation">
                  <${Quote} aria-hidden="true" />
                  <p>“${quoteText}”</p>
                </blockquote>
              `;
            })()}

            ${displayRecord.id?.startsWith('THREAD-') && displayRecord.thread_data ? html`
              <${ThreadModal} record=${displayRecord} />
            ` : summary ? html`
              <section className="archive-record-summary" aria-labelledby="record-summary-title">
                <h3 id="record-summary-title">Summary</h3>
                <p>${linkifyText(summary)}</p>
              </section>
            ` : html`
              <p className="archive-record-incomplete">No summary is available for this record.</p>
            `}

            ${onSelectEntity && recordEntities.length > 0 && html`
              <section className="archive-record-metadata archive-record-entities" aria-labelledby="record-entities-title">
                <h3 id="record-entities-title">People and ideas in this record</h3>
                <p>Continue through the archive's canonical relationship index.</p>
                <div className="archive-record-entity-list">
                  ${recordEntities.map(entity => html`
                    <button
                      type="button"
                      key=${entity.id}
                      onClick=${() => leaveRecordFor(onSelectEntity, entity.id)}
                      aria-label=${`Explore ${entity.name} in People and ideas`}
                    >
                      <strong>${entity.name}</strong>
                      <span>${entity.type}</span>
                    </button>
                  `)}
                </div>
              </section>
            `}

            ${relatedWorks.length > 0 && html`
              <section className="archive-record-related" aria-labelledby="record-related-title">
                <h3 id="record-related-title"><${Link} aria-hidden="true" /> Related records</h3>
                <div className="archive-record-related__grid">
                  ${relatedWorks.map(rel => html`
                    <button type="button" key=${rel.id} onClick=${() => onSelectRecord(rel.id)}>
                      <span className="archive-record-related__utility">
                        <span>${rel.date}</span>
                        ${rel.connectionStrength > 0 && html`
                          <span>${rel.connectionStrength} shared ${rel.connectionStrength === 1 ? 'entity' : 'entities'}</span>
                        `}
                      </span>
                      <strong>${rel.title}</strong>
                      <span>${rel.pub}</span>
                    </button>
                  `)}
                </div>
              </section>
            `}

            <section className="archive-record-metadata" aria-labelledby="record-metadata-title">
              <h3 id="record-metadata-title">Archive metadata</h3>
              <div className="archive-record-metadata__grid">
                <${TagGroup} title="Thematic categories" tags=${displayRecord.categories} onClick=${onFilterCategory ? (cat) => leaveRecordFor(onFilterCategory, cat) : undefined} />
                <${TagGroup} title="Tags" tags=${displayRecord.tags} onClick=${onFilterSearch ? (tag) => leaveRecordFor(onFilterSearch, tag) : undefined} />
                <${TagGroup} title="Key concepts" tags=${displayRecord.concepts} onClick=${onFilterSearch ? (concept) => leaveRecordFor(onFilterSearch, concept) : undefined} />
                ${displayRecord.era && html`
                  <section className="archive-record-tag-group">
                    <h4>Era</h4>
                    <p>${displayRecord.era}</p>
                  </section>
                `}
              </div>
            </section>
          </div>

          <footer className="archive-record-navigation">
            <button
              type="button"
              onClick=${onPrev}
              disabled=${!hasPrev}
            >
              <${ArrowLeft} aria-hidden="true" /> Previous
            </button>
            <div>
              <strong>${positionLabel}</strong>
              ${navigationIsFiltered && html`
                <span className="archive-record-navigation__context">Within current filtered results</span>
              `}
            </div>
            <button
              type="button"
              onClick=${onNext}
              disabled=${!hasNext}
            >
              Next <${ArrowRight} aria-hidden="true" />
            </button>
          </footer>
        </article>
      </div>
    </div>
  `;
};

export default RecordModal;
