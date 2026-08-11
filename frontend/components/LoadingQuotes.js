// LoadingQuotes.js - Rotating dissertation quotes during loading
import { useState, useEffect } from 'react';
import { html } from '../html.js?v=3.8.20';
import { BookOpen } from 'lucide-react';

// Curated quotes from the dissertation for the loading screen
const LOADING_QUOTES = [
  {
    quote: 'Journalism is not an activity conducted solely by journalists; or, to put it another way, journalism is communication and communication is something that takes place between people. It is not an action but a transaction.',
    source: 'Introduction'
  },
  {
    quote: 'Information is not really "in" the items which come over the wire and make their way into the newspaper. It is "in" the relations between people and a changing environment.',
    source: 'Chapter 2'
  },
  {
    quote: 'For any press anywhere, making things public does not a public make.',
    source: 'Conclusion'
  },
  {
    quote: 'Presenting "all the news" is therefore an impossible goal, and the press that avows it can only be an impossible press.',
    source: 'Conclusion'
  },
  {
    quote: 'Our system of communication is not addressed at the public but at private individuals. We have evolved a radical form of mobilized privacy.',
    source: 'Chapter 5'
  },
  {
    quote: 'The press is like the beam of a searchlight that moves restlessly about, bringing one episode and then another out of darkness into vision.',
    source: 'Chapter 7'
  },
  {
    quote: 'Seeds are sown not by being thrown out at random, but by being so distributed as to take root and have a chance of growth.',
    source: 'Chapter 8'
  },
  {
    quote: 'The same conditions which make citizens dependent on the press for information have other consequences as well.',
    source: 'Chapter 6'
  },
  {
    quote: 'Sensationalism is not a perverse appetite for the crude and spectacular, but the increasing difficulty of interesting a population which does not act on its world.',
    source: 'Chapter 2'
  }
];

const ROTATION_INTERVAL = 4000; // 4 seconds per quote

const LoadingQuotes = () => {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * LOADING_QUOTES.length)
  );
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setIsVisible(false);

      // After fade out, change quote and fade in
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % LOADING_QUOTES.length);
        setIsVisible(true);
      }, 300);
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const current = LOADING_QUOTES[currentIndex];

  return html`
    <div className="archive-loading-state">
      <div className="archive-loading-state__mark" aria-hidden="true">
        <div>
          <${BookOpen} />
        </div>
        <span />
      </div>

      <div
        className="archive-loading-state__quote"
        aria-hidden="true"
        style=${{ opacity: isVisible ? 1 : 0 }}
      >
        <blockquote>
          "${current.quote}"
        </blockquote>
        <cite>
          — The Impossible Press, ${current.source}
        </cite>
      </div>

      <p className="archive-loading-state__status" role="status" aria-live="polite" aria-atomic="true">
        Loading archive...
      </p>
      <p className="archive-loading-state__tip">
        Tip: Records are cached for faster loading next time
      </p>
    </div>
  `;
};

export default LoadingQuotes;
