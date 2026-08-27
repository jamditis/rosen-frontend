import { html } from '../html.js?v=3.8.33';
import { Sparkles } from 'lucide-react';

/**
 * The opt-in semantic search switch that sits beside the archive search box
 * (#279).
 *
 * Off by default, and off costs nothing: no model, no vectors, no extra bytes.
 * Turning it on downloads a language model once, so the off state says so
 * before the reader commits to it.
 *
 * The archive holds far more records than the semantic index covers, and only
 * articles are embedded, so the on state names the covered set rather than
 * implying the whole archive is ranked by meaning.
 *
 * A plain checkbox, not a custom widget: it is keyboard operable, announces its
 * own state, and takes the app's focus ring for free. `describedBy` ties the
 * status line to the control so a screen reader hears the cost and the current
 * state with the label.
 */
const SemanticSearchToggle = ({
  enabled,
  status = 'idle',
  coverage = null,
  onToggle,
  inputId = 'semantic-search',
}) => {
  const hintId = `${inputId}-hint`;
  const covered = Number.isFinite(coverage) && coverage > 0
    ? coverage.toLocaleString()
    : null;

  let hint;
  if (status === 'error') {
    hint = 'Semantic search is not available right now. Keyword search still works.';
  } else if (!enabled) {
    hint = 'Also find records that match what you mean, not just the words you typed. Downloads a language model (about 30 MB) the first time.';
  } else if (status === 'loading') {
    hint = 'Loading the language model. The first time takes a few seconds.';
  } else if (status === 'searching') {
    hint = 'Finding records by meaning...';
  } else {
    hint = covered
      ? `Ranking ${covered} articles by meaning. Results are marked kw, sem, or kw·sem.`
      : 'Ranking articles by meaning. Results are marked kw, sem, or kw·sem.';
  }

  return html`
    <div className="archive-semantic-toggle">
      <label className="archive-semantic-toggle__control" htmlFor=${inputId}>
        <input
          id=${inputId}
          type="checkbox"
          checked=${Boolean(enabled)}
          onChange=${event => onToggle(event.target.checked)}
          aria-describedby=${hintId}
        />
        <${Sparkles} className="archive-semantic-toggle__icon" aria-hidden="true" />
        <span>Semantic</span>
      </label>
      <p id=${hintId} className="archive-semantic-toggle__hint" role="status">
        ${hint}
      </p>
    </div>
  `;
};

export default SemanticSearchToggle;
