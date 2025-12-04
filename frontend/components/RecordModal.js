
import { useEffect, useState } from 'react';
import { html } from '../html.js?v=2.0.2';
import { X, ExternalLink, ArrowLeft, ArrowRight, Quote, CheckCircle, Link, Share2, Loader2 } from 'lucide-react';
import { fetchRecordDetails } from '../services/archiveService.js?v=2.0.2';
import { ThreadModal } from './ThreadModal.js?v=2.0.2';

const TagGroup = ({title, tags}) => {
    if (!tags || tags.length === 0) return null;
    return html`
        <div className="mb-6">
            <h5 className="text-xs font-bold uppercase text-stone-400 mb-2">${title}</h5>
            <div className="flex flex-wrap gap-2">
                ${tags.map(t => html`
                    <span key=${t} className="bg-stone-100 text-stone-700 px-2 py-1 rounded text-xs border border-stone-200">
                        ${t}
                    </span>
                `)}
            </div>
        </div>
    `;
}

const RecordModal = ({ record, allRecords, isOpen, onClose, onNext, onPrev, onSelectRecord, hasPrev, hasNext, currentIndex, total }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [relatedWorks, setRelatedWorks] = useState([]);

  // State for lazy-loaded details
  const [fullRecord, setFullRecord] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  // Find related works based on loaded details
  useEffect(() => {
    if (fullRecord && allRecords) {
      let related = [];
      if (fullRecord.relatedIds && fullRecord.relatedIds.length > 0) {
          related = allRecords.filter(r => fullRecord.relatedIds.includes(r.id));
      }

      if (related.length < 4) {
          const more = allRecords.filter(r =>
            r.id !== fullRecord.id &&
            !related.some(rel => rel.id === r.id) &&
            (r.categories || []).some(c => (fullRecord.categories || []).includes(c))
          ).slice(0, 4 - related.length);
          related = [...related, ...more];
      }

      setRelatedWorks(related);
    }
  }, [fullRecord, allRecords]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasPrev, hasNext, onPrev, onNext]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300);
  };

  const showNotification = (msg) => {
      setToastMessage(msg);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
  };

  const handleCopyCitation = () => {
    if (!fullRecord) return;
    const text = `${fullRecord.author} (${fullRecord.year}). "${fullRecord.title}". ${fullRecord.pub}. Retrieved from ${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => showNotification("Citation copied to clipboard"));
  };

  const handleShare = () => {
      if(!record) return;
      const url = `${window.location.origin}${window.location.pathname}?record=${record.id}`;
      navigator.clipboard.writeText(url).then(() => showNotification("Link copied to clipboard"));
  };

  if (!isOpen || !record) return null;

  // Use fullRecord for display (with details), fallback to record for basic info
  const displayRecord = fullRecord || record;
  const isVideo = (displayRecord.url || '').includes('youtube') || (displayRecord.url || '').includes('vimeo');
  const youtubeId = (displayRecord.url || '').match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];

  return html`
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
      <div className=${`fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-stone-800 text-white px-6 py-3 rounded shadow-lg z-[90] transition-all duration-300 flex items-center gap-3 ${showToast ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
        <${CheckCircle} className="w-4 h-4 text-green-400" />
        <span className="text-sm font-bold">${toastMessage}</span>
      </div>

      <div 
        className=${`absolute inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick=${handleClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div className=${`
          bg-[#fdfbf7] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl pointer-events-auto 
          border border-stone-200 transform transition-all duration-300
          ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}>
          
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-stone-200 bg-white/50">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-stone-400 tracking-widest">
              <span>${displayRecord.date}</span>
              <span>•</span>
              <span>${isVideo ? 'Video' : 'Article'}</span>
              ${loadingDetails && html`
                <span className="ml-2 flex items-center gap-1 text-stone-500">
                  <${Loader2} className="w-3 h-3 animate-spin" /> Loading...
                </span>
              `}
            </div>
            <div className="flex items-center gap-2">
              <button onClick=${handleShare} className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded transition-colors" title="Share Link">
                <${Share2} className="w-5 h-5" />
              </button>
              <button onClick=${handleCopyCitation} className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded transition-colors" title="Copy citation">
                <${Quote} className="w-5 h-5" />
              </button>
              <button onClick=${handleClose} className="p-2 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                <${X} className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-6 sm:p-10 font-body leading-relaxed space-y-8">
            <div>
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-stone-900 mb-2 leading-tight">${displayRecord.title}</h2>

                <div className="text-lg text-stone-600 mb-4 font-display">
                    By ${displayRecord.author || 'Jay Rosen'}
                </div>

                ${displayRecord.url && displayRecord.url !== '#' && html`
                  <a href=${displayRecord.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold text-sm inline-flex items-center gap-1 mb-6">
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

            ${!youtubeId && displayRecord.quote && html`
               <blockquote className="border-l-4 border-stone-800 pl-6 py-2 my-8 italic text-xl text-stone-700 font-display bg-stone-50/50 rounded-r-lg">
                  "${displayRecord.quote}"
               </blockquote>
            `}

            ${/* Check if this is a thread record - display ThreadModal or standard summary */
              (() => {
                if (displayRecord.id?.startsWith('THREAD-')) {
                  console.log('[RecordModal] THREAD record detected:', displayRecord.id);
                  console.log('[RecordModal] Has thread_data:', !!displayRecord.thread_data);
                  console.log('[RecordModal] thread_data keys:', displayRecord.thread_data ? Object.keys(displayRecord.thread_data) : 'none');
                }
                return displayRecord.id?.startsWith('THREAD-') && displayRecord.thread_data;
              })() ? html`
              <${ThreadModal} record=${displayRecord} />
            ` : html`
              <div className="prose prose-stone max-w-none">
                <p className="text-lg text-stone-800 leading-relaxed">${displayRecord.summary || displayRecord.summaryPreview || ''}</p>
              </div>
            `}

            <hr className="my-8 border-stone-200" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <${TagGroup} title="Thematic categories" tags=${displayRecord.categories} />
               <${TagGroup} title="Tags" tags=${displayRecord.tags} />
               <${TagGroup} title="Key concepts" tags=${displayRecord.concepts} />

               <div>
                  <h5 className="text-xs font-bold uppercase text-stone-400 mb-2">Era</h5>
                  <span className="inline-block px-3 py-1 bg-stone-800 text-white text-xs font-bold rounded">${displayRecord.era}</span>
               </div>
            </div>
            
            ${relatedWorks.length > 0 && html`
                <div className="border-t border-stone-200 pt-8">
                    <h3 className="text-xl font-display font-bold text-stone-900 mb-4 flex items-center gap-2">
                        <${Link} className="w-5 h-5 text-stone-400" /> Related Works
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${relatedWorks.map(rel => html`
                            <button 
                                key=${rel.id}
                                onClick=${() => onSelectRecord(rel.id)}
                                className="text-left p-4 bg-stone-50 border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all rounded-sm group w-full"
                            >
                                <div className="text-xs font-bold text-stone-400 mb-1 uppercase tracking-wider">${rel.date}</div>
                                <h4 className="text-sm font-bold text-stone-800 group-hover:text-blue-800 leading-tight mb-1 line-clamp-2">
                                    ${rel.title}
                                </h4>
                                <div className="text-xs text-stone-500 truncate">${rel.pub}</div>
                            </button>
                        `)}
                    </div>
                </div>
            `}
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
