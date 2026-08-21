
import { useState } from 'react';
import { html } from '../html.js?v=3.8.24';
import { BookOpen, ExternalLink, ArrowLeft, Calendar, GraduationCap } from 'lucide-react';
import MindMap from './MindMap.js?v=3.8.24';
import DetailPanel from './DetailPanel.js?v=3.8.24';
import { DISSERTATION_NODES } from './dissertationData.js?v=3.8.24';
import { resolveSitePath } from '../utils/pathResolver.js?v=3.8.24';

const DissertationPage = ({ onBack, embedded = false }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // Resolve for the current environment so the link works in local preview and
  // GitHub Pages, not only production.
  const dissertationPdfUrl = resolveSitePath('dissertation/reader/');

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
    <div className=${embedded
      ? 'desktop-dissertation-surface archive-dissertation-route is-embedded'
      : 'archive-dissertation-route'}>
      ${!embedded && html`<header className="archive-dissertation-header">
        <div className="archive-dissertation-header__inner">
          <div className="archive-dissertation-header__primary">
            ${onBack && html`
              <button
                type="button"
                onClick=${onBack}
                aria-label="Back to archive"
                className="archive-action archive-action--quiet archive-dissertation-header__back"
              >
                <${ArrowLeft} aria-hidden="true" />
                <span>Back to archive</span>
              </button>
            `}
            <div className="archive-dissertation-header__identity">
              <div className="archive-dissertation-header__mark">
                <${BookOpen} aria-hidden="true" />
              </div>
              <div>
                <p className="archive-dissertation-header__title">
                  The Impossible Press
                </p>
                <p className="archive-dissertation-header__meta">PhD dissertation, 1986</p>
              </div>
            </div>
          </div>

          <div className="archive-dissertation-header__metadata">
            <div>
              <${GraduationCap} aria-hidden="true" />
              <span>Jay Rosen</span>
            </div>
            <div>
              <${Calendar} aria-hidden="true" />
              <span>New York University, 1986</span>
            </div>
          </div>

          <a
            href=${dissertationPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="archive-action archive-action--primary archive-dissertation-header__read"
          >
            <span>Read full text</span>
            <${ExternalLink} aria-hidden="true" />
          </a>
        </div>
      </header>`}

      <div className="archive-dissertation-intro">
        <div className="archive-dissertation-intro__inner">
          <div className="archive-dissertation-intro__layout">
            <div className="archive-dissertation-intro__title">
              <h1
                data-route-entry-focus=${embedded ? undefined : true}
                tabIndex=${embedded ? undefined : '-1'}
              >
                The Impossible Press
              </h1>
              <h2>
                American Journalism and the Decline of Public Life
              </h2>
            </div>
            <div
              className="archive-dissertation-terms"
              role="region"
              tabIndex="0"
              aria-label="Dissertation index terms"
            >
              ${['Public Sphere', 'Objectivity', 'Lippmann', 'Dewey'].map(tag => html`
                <span
                  key=${tag}
                  className="archive-index-term"
                >
                  ${tag}
                </span>
              `)}
            </div>
          </div>
        </div>
      </div>

      <div className="archive-dissertation-guide">
        <div className="archive-dissertation-guide__inner">
          <div>
            <strong>Navigate:</strong>
            Click any node to expand and see details.
          </div>
          <div className="archive-dissertation-legend" aria-label="Map legend">
            <span>
              <i className="archive-dissertation-legend__key is-part" aria-hidden="true" /> Parts
            </span>
            <span>
              <i className="archive-dissertation-legend__key is-chapter" aria-hidden="true" /> Chapters
            </span>
            <span>
              <i className="archive-dissertation-legend__key is-bookend" aria-hidden="true" /> Intro/conclusion
            </span>
          </div>
        </div>
      </div>

      <div className=${embedded ? 'desktop-dissertation-map archive-dissertation-map' : 'archive-dissertation-map'}>
        <${MindMap}
          nodes=${DISSERTATION_NODES}
          onNodeSelect=${handleNodeSelect}
          isPanelOpen=${detailPanelOpen}
          minimumZoom=${embedded ? 44 / 72 : 0.3}
          className=${embedded ? '' : 'absolute inset-0'}
        />
      </div>

      <${DetailPanel}
        node=${selectedNode}
        isOpen=${detailPanelOpen}
        onClose=${closeDetailPanel}
        contained=${embedded}
      />

      ${!embedded && html`<footer className="archive-dissertation-footer">
        <div className="archive-dissertation-footer__inner">
          <div>
            Part of <strong>Jay Rosen's Internet Archive</strong>
          </div>
          <div>
            <a
              href="https://twitter.com/jayrosen_nyu"
              target="_blank"
              rel="noopener noreferrer"
            >
              @jayrosen_nyu
            </a>
            <span aria-hidden="true">|</span>
            <a
              href="https://pressthink.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              PressThink
            </a>
          </div>
        </div>
      </footer>`}
    </div>
  `;
};

export default DissertationPage;
