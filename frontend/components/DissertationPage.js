
import { useState } from 'react';
import { html } from '../html.js?v=2.0.2';
import { BookOpen, ExternalLink, ArrowLeft, Calendar, GraduationCap } from 'lucide-react';
import MindMap from './MindMap.js?v=2.0.2';
import DetailPanel from './DetailPanel.js?v=2.0.2';
import { DISSERTATION_NODES } from './dissertationData.js?v=2.0.2';

const DissertationPage = ({ onBack }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  const dissertationPdfUrl = '/wp-content/rosen-archive/features/dissertation-reader/';

  const handleNodeSelect = (node) => {
    if (node) {
      setSelectedNode(node);
      setDetailPanelOpen(true);
    } else {
      // Node was deselected (from MindMap)
      setSelectedNode(null);
      setDetailPanelOpen(false);
    }
  };

  const closeDetailPanel = () => {
    setSelectedNode(null);
    setDetailPanelOpen(false);
  };

  return html`
    <div className="h-screen w-screen bg-paper flex flex-col overflow-hidden max-w-full">
      <header className="flex-shrink-0 z-30 w-full bg-paper border-b border-stone-200">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            ${onBack && html`
              <button
                onClick=${onBack}
                className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors text-sm"
              >
                <${ArrowLeft} className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Archive</span>
              </button>
            `}
            <div className="flex items-center gap-3">
              <div className="bg-stone-900 text-white p-1.5">
                <${BookOpen} className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-display font-bold text-stone-900 leading-tight">
                  The Impossible Press
                </h1>
                <p className="text-[10px] text-stone-500">PhD Dissertation, 1986</p>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <${GraduationCap} className="w-4 h-4" />
              <span>Jay Rosen</span>
            </div>
            <div className="h-4 w-px bg-stone-200" />
            <div className="flex items-center gap-2">
              <${Calendar} className="w-4 h-4" />
              <span>New York University, 1986</span>
            </div>
          </div>

          <a
            href=${dissertationPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-stone-800 text-white px-4 py-2 text-xs font-bold hover:bg-stone-700 transition-colors"
          >
            <span>Read Full Text</span>
            <${ExternalLink} className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      <div className="flex-shrink-0 bg-gradient-to-r from-stone-50 to-stone-100 border-b border-stone-200">
        <div className="container mx-auto px-4 py-4 md:py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="max-w-2xl">
              <h1 className="font-display text-xl md:text-2xl font-bold text-stone-900 leading-tight">
                The Impossible Press
              </h1>
              <h2 className="text-sm md:text-base text-stone-600">
                American Journalism and the Decline of Public Life
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              ${['Public Sphere', 'Objectivity', 'Lippmann', 'Dewey'].map(tag => html`
                <span
                  key=${tag}
                  className="text-[9px] uppercase font-bold px-2 py-1 bg-white border border-stone-200 text-stone-500 tracking-wide rounded"
                >
                  ${tag}
                </span>
              `)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-b border-stone-200">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            <span className="font-bold uppercase tracking-wider text-stone-400 mr-2">Navigate:</span>
            Click any node to expand and see details.
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[10px] text-stone-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border-2 border-amber-400" /> Parts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-sky-100 border-2 border-sky-400" /> Chapters
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-stone-100 border-2 border-stone-400" /> Intro/Conclusion
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <${MindMap}
          nodes=${DISSERTATION_NODES}
          onNodeSelect=${handleNodeSelect}
          isPanelOpen=${detailPanelOpen}
          className="absolute inset-0"
        />
      </div>

      <${DetailPanel}
        node=${selectedNode}
        isOpen=${detailPanelOpen}
        onClose=${closeDetailPanel}
      />

      <footer className="bg-stone-50 border-t border-stone-200 py-2 flex-shrink-0">
        <div className="container mx-auto px-4 flex items-center justify-between text-xs text-stone-400">
          <div>
            Part of the <span className="font-semibold text-stone-600">Jay Rosen Internet Archive</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://twitter.com/jayrosen_nyu"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-600 transition-colors"
            >
              @jayrosen_nyu
            </a>
            <span className="text-stone-300">|</span>
            <a
              href="https://pressthink.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-600 transition-colors"
            >
              PressThink
            </a>
          </div>
        </div>
      </footer>
    </div>
  `;
};

export default DissertationPage;
