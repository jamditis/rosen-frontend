
import { useEffect, useRef, useState } from 'react';
import { html } from '../html.js?v=3.7.5';
import { X, ExternalLink, ArrowLeft, ArrowRight, Quote, CheckCircle, Link, Share2, Loader2 } from 'lucide-react';
import { fetchRecordDetails, fetchEntitiesData, areEntitiesLoaded, calculateEntityConnectionStrength, getEntitiesByRecord } from '../services/archiveService.js?v=3.7.5';
import { ThreadModal } from './ThreadModal.js?v=3.7.5';
import { splitUrlsForLinkify } from '../utils/linkify.js?v=3.7.5';
import { sanitizeHref } from '../utils/sanitizeHref.js?v=3.7.5';
import { recordNeedsReview } from '../utils/needsReview.js?v=3.7.5';
import { canonicalRecordUrl } from '../utils/recordDeepLink.js?v=3.7.5';

const linkifyText = (text) => {
  const parts = splitUrlsForLinkify(text);
  if (parts === null) return null;
  return parts.map((part, i) => {
    if (part.type === 'url') {
      return html`<a key=${i} href=${part.value} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 hover:underline break-all">${part.value}</a>`;
    }
    return part.value;
  });
};

const TagGroup = ({title, tags, onClick}) => {
    if (!tags || tags.length === 0) return null;
    return html`
        <div className="mb-6">
            <h5 className="text-xs font-bold uppercase text-stone-400 mb-2">${title}</h5>
            <div className="flex flex-wrap gap-2">
                ${tags.map(t => html`
                    <button
                      key=${t}
                      onClick=${onClick ? () => onClick(t) : undefined}
                      className=${`bg-stone-100 text-stone-700 px-2 py-1 rounded text-xs border border-stone-200 ${onClick ? 'hover:bg-stone-800 hover:text-white hover:border-stone-800 cursor-pointer transition-colors' : ''}`}
                    >
                        ${t}
                    </button>
                `)}
            </div>
        </div>
    `;
}

const RecordModal = ({ record, allRecords, isOpen, onClose, onNext, onPrev, onSelectRecord, onSelectEntity, onFilterCategory, onFilterSearch, hasPrev, hasNext, currentIndex, total }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [relatedWorks, setRelatedWorks] = useState([]);
  const [recordEntities, setRecordEntities] = useState([]);

  // State for lazy-loaded details
  const [fullRecord, setFullRecord] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);

  // Fetch details when modal opens
  useEffect(() => {
    if (isOpen && record) {
      document.body.style.overflow = 'hidden';
      setIsClosing(false);

      // Check if we already have full details (from previous load or full data)
      if (record.summary && record.url) {
        // Already have full record
        setFullRecord(record);
        setLoadingDetails(false);
      } else {
        // Need to fetch details
        setLoadingDetails(true);
        fetchRecordDetails(record.id).then(details => {
          if (details) {
            setFullRecord({ ...record, ...details });
          } else {
            // Fallback: use summaryPreview as summary
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
          }
          setLoadingDetails(false);
        });
      }
    } else {
      document.body.style.overflow = '';
      setFullRecord(null);
    }
  }, [isOpen, record?.id]);

  // Find related works based on shared entities
  useEffect(() => {
    if (!fullRecord || !allRecords) return;

    const findRelated = async () => {
      setRecordEntities([]);
      // Ensure entity data is loaded
      if (!areEntitiesLoaded()) {
        await fetchEntitiesData();
      }

      setRecordEntities(
        getEntitiesByRecord(fullRecord.id)
          .sort((a, b) => (b.prominence || 0) - (a.prominence || 0))
          .slice(0, 8)
      );

      // Calculate entity-based connections to all other article records
      const connections = [];
      const candidateRecords = allRecords.filter(r =>
        r.id !== fullRecord.id && r.type !== 'social'
      );

      for (const candidate of candidateRecords) {
        const result = calculateEntityConnectionStrength(fullRecord.id, candidate.id);
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
          r.id !== fullRecord.id &&
          r.type !== 'social' &&
          (r.categories || []).some(c => (fullRecord.categories || []).includes(c))
        ).slice(0, 4);
      }

      setRelatedWorks(related);
    };

    findRelated();
  }, [fullRecord, allRecords]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
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
  }, [isOpen, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    if (!isOpen) {
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

    if (!openerRef.current) {
      openerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

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
    setTimeout(() => completeClose(afterClose), 300);
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
    if (!fullRecord) return;
    const recordUrl = canonicalRecordUrl(window.location.href, fullRecord.id);
    const text = `${fullRecord.author} (${fullRecord.year}). "${fullRecord.title}". ${fullRecord.pub}. Retrieved from ${recordUrl}`;
    navigator.clipboard.writeText(text).then(() => showNotification("Citation copied to clipboard"));
  };

  const handleShare = () => {
      if(!record) return;
      const url = canonicalRecordUrl(window.location.href, record.id);
      navigator.clipboard.writeText(url).then(() => showNotification("Link copied to clipboard"));
  };

  if (!isOpen || !record) return null;

  // Use fullRecord for display (with details), fallback to record for basic info
  const displayRecord = fullRecord || record;
  const isVideo = (displayRecord.url || '').includes('youtube') || (displayRecord.url || '').includes('vimeo');
  const youtubeId = (displayRecord.url || '').match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];

  return html`
    <div className="archive-record-dialog fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
      <div className=${`fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-stone-800 text-white px-6 py-3 rounded shadow-lg z-[90] transition-all duration-300 flex items-center gap-3 ${showToast ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
        <${CheckCircle} className="w-4 h-4 text-green-400" />
        <span className="text-sm font-bold">${toastMessage}</span>
      </div>

      <div 
        className=${`absolute inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick=${handleClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div ref=${dialogRef} tabIndex="-1" className=${`
          bg-[#fdfbf7] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl pointer-events-auto 
          border border-stone-200 transform transition-all duration-300
          ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}>
          
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-stone-200 bg-white/50">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-stone-400 tracking-widest">
              <span>${displayRecord.date}</span>
              <span>•</span>
              <span>${isVideo ? 'Video' : displayRecord.type === 'social' ? (displayRecord.pub || 'Social Media') : displayRecord.type === 'Dissertation' ? 'Dissertation' : 'Article'}</span>
              ${loadingDetails && html`
                <span className="ml-2 flex items-center gap-1 text-stone-500">
                  <${Loader2} className="w-3 h-3 animate-spin" /> Loading...
                </span>
              `}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick=${handleShare} className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded transition-colors" style=${{ minWidth: '44px', minHeight: '44px' }} title="Copy canonical record link" aria-label="Copy canonical record link">
                <${Share2} className="w-5 h-5" aria-hidden="true" />
              </button>
              <button type="button" onClick=${handleCopyCitation} className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded transition-colors" style=${{ minWidth: '44px', minHeight: '44px' }} title="Copy citation" aria-label="Copy citation">
                <${Quote} className="w-5 h-5" aria-hidden="true" />
              </button>
              <button ref=${closeButtonRef} type="button" onClick=${handleClose} className="p-2 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" style=${{ minWidth: '44px', minHeight: '44px' }} aria-label="Close record details">
                <${X} className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-6 sm:p-10 font-body leading-relaxed space-y-8">
            <div>
                <h2 id="record-modal-title" className="text-3xl sm:text-4xl font-display font-bold text-stone-900 mb-2 leading-tight">${displayRecord.title}</h2>

                <!-- Read needsReview from the core record, not displayRecord:
                     details merge ({...record, ...details}) lets a stale
                     details.needsReview overwrite a freshly flagged core record. -->
                ${recordNeedsReview(record) && html`
                  <span
                    className="inline-block px-2 py-0.5 mb-3 rounded text-xs font-body"
                    style=${{ backgroundColor: '#fffbeb', color: '#b45309' }}
                    title="Auto-submitted; pending a human review pass"
                  >
                    needs review
                  </span>
                `}

                <div className="text-lg text-stone-600 mb-4 font-display">
                    By ${displayRecord.author || 'Jay Rosen'}
                </div>

                ${displayRecord.url && displayRecord.url !== '#' && html`
                  <a href=${sanitizeHref(displayRecord.url)} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold text-sm inline-flex items-center gap-1 mb-6">
                    Read on ${displayRecord.pub} <${ExternalLink} className="w-3 h-3" />
                  </a>
                `}
            </div>

            ${youtubeId && html`
               <div className="aspect-video bg-black rounded-lg overflow-hidden mb-8 shadow-lg">
                  <iframe
                    src=${`https://www.youtube.com/embed/${youtubeId}`}
                    allowFullScreen=${true}
                    className="w-full h-full border-0"
                  />
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
                <blockquote className="border-l-4 border-stone-800 pl-6 py-2 my-8 italic text-xl text-stone-700 font-display bg-stone-50/50 rounded-r-lg">
                  "${quoteText}"
                </blockquote>
              `;
            })()}

            ${displayRecord.id?.startsWith('THREAD-') && displayRecord.thread_data ? html`
              <${ThreadModal} record=${displayRecord} />
            ` : html`
              <div className="prose prose-stone max-w-none">
                <p className="text-lg text-stone-800 leading-relaxed">${linkifyText(displayRecord.summary || displayRecord.summaryPreview || '')}</p>
              </div>
            `}

            ${onSelectEntity && recordEntities.length > 0 && html`
              <section className="border-t border-stone-200 pt-8" aria-labelledby="record-entities-title">
                <h3 id="record-entities-title" className="text-xl font-display font-bold text-stone-900 mb-2">
                  People and ideas in this record
                </h3>
                <p className="mb-4 text-sm text-stone-600">
                  Continue through the archive's canonical relationship index.
                </p>
                <div className="flex flex-wrap gap-2">
                  ${recordEntities.map(entity => html`
                    <button
                      type="button"
                      key=${entity.id}
                      onClick=${() => leaveRecordFor(onSelectEntity, entity.id)}
                      className="inline-flex items-center gap-2 rounded border border-stone-300 bg-white px-3 py-2 text-left text-sm text-stone-800 transition-colors hover:border-stone-600 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-700 focus:ring-offset-2"
                      style=${{ minHeight: '44px' }}
                      aria-label=${`Explore ${entity.name} in People and ideas`}
                    >
                      <span className="font-bold">${entity.name}</span>
                      <span className="text-xs uppercase tracking-wide text-stone-500">${entity.type}</span>
                    </button>
                  `)}
                </div>
              </section>
            `}

            ${relatedWorks.length > 0 && html`
                <div className="border-t border-stone-200 pt-8">
                    <h3 className="text-xl font-display font-bold text-stone-900 mb-4 flex items-center gap-2">
                        <${Link} className="w-5 h-5 text-stone-400" /> Related records
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${relatedWorks.map(rel => html`
                            <button
                                key=${rel.id}
                                onClick=${() => onSelectRecord(rel.id)}
                                className="text-left p-4 bg-stone-50 border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all rounded-sm group w-full"
                            >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">${rel.date}</span>
                                  ${rel.connectionStrength > 0 && html`
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-stone-200 text-stone-600 rounded">
                                      ${rel.connectionStrength} shared ${rel.connectionStrength === 1 ? 'entity' : 'entities'}
                                    </span>
                                  `}
                                </div>
                                <h4 className="text-sm font-bold text-stone-800 group-hover:text-blue-800 leading-tight mb-1 line-clamp-2">
                                    ${rel.title}
                                </h4>
                                <div className="text-xs text-stone-500 truncate mb-2">${rel.pub}</div>
                                ${rel.sharedEntities && rel.sharedEntities.length > 0 && html`
                                  <div className="flex flex-wrap gap-1">
                                    ${rel.sharedEntities.slice(0, 4).map(entity => html`
                                      <span key=${entity.id || entity.name} className="text-[10px] px-1.5 py-0.5 bg-white border border-stone-200 rounded text-stone-500">
                                        ${entity.name}
                                      </span>
                                    `)}
                                    ${rel.sharedEntities.length > 4 && html`
                                      <span className="text-[10px] text-stone-400">+${rel.sharedEntities.length - 4}</span>
                                    `}
                                  </div>
                                `}
                            </button>
                        `)}
                    </div>
                </div>
            `}

            <hr className="my-8 border-stone-200" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <${TagGroup} title="Thematic categories" tags=${displayRecord.categories} onClick=${onFilterCategory ? (cat) => leaveRecordFor(onFilterCategory, cat) : undefined} />
               <${TagGroup} title="Tags" tags=${displayRecord.tags} onClick=${onFilterSearch ? (tag) => leaveRecordFor(onFilterSearch, tag) : undefined} />
               <${TagGroup} title="Key concepts" tags=${displayRecord.concepts} onClick=${onFilterSearch ? (concept) => leaveRecordFor(onFilterSearch, concept) : undefined} />

               <div>
                  <h5 className="text-xs font-bold uppercase text-stone-400 mb-2">Era</h5>
                  <span className="inline-block px-3 py-1 bg-stone-800 text-white text-xs font-bold rounded">${displayRecord.era}</span>
               </div>
            </div>
          </div>

          <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-between items-center text-sm">
            <button 
              onClick=${onPrev} 
              disabled=${!hasPrev}
              className="flex items-center gap-2 text-stone-600 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold"
            >
              <${ArrowLeft} className="w-4 h-4" /> Previous
            </button>
            <span className="text-stone-400 text-xs hidden sm:inline-block">${currentIndex + 1} of ${total}</span>
            <button 
              onClick=${onNext} 
              disabled=${!hasNext}
              className="flex items-center gap-2 text-stone-600 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold"
            >
              Next <${ArrowRight} className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  `;
};

export default RecordModal;
