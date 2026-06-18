// LoadingState.js - Universal loading component
import { useState, useEffect } from 'react';
import { html } from '../../html.js?v=3.4.2';
import { BookOpen } from 'lucide-react';

// Curated quotes from the dissertation for loading states
const DISSERTATION_QUOTES = [
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

/**
 * Universal loading state component
 * @param {Object} props
 * @param {string} [props.message='Loading...'] - Loading message
 * @param {boolean} [props.showQuotes=false] - Whether to show rotating dissertation quotes
 * @param {string} [props.size='md'] - Size: 'sm', 'md', 'lg'
 */
const LoadingState = ({
  message = 'Loading...',
  showQuotes = false,
  size = 'md'
}) => {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * DISSERTATION_QUOTES.length)
  );
  const [isVisible, setIsVisible] = useState(true);

  // Rotate quotes
  useEffect(() => {
    if (!showQuotes) return;

    const interval = setInterval(() => {
      // Fade out
      setIsVisible(false);

      // After fade out, change quote and fade in
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % DISSERTATION_QUOTES.length);
        setIsVisible(true);
      }, 300);
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [showQuotes]);

  // Size classes
  const sizeClasses = {
    sm: {
      container: 'py-8',
      spinner: 'w-10 h-10',
      icon: 'w-5 h-5',
      dot: 'w-1.5 h-1.5',
      text: 'text-xs'
    },
    md: {
      container: 'py-16',
      spinner: 'w-16 h-16',
      icon: 'w-8 h-8',
      dot: 'w-2 h-2',
      text: 'text-sm'
    },
    lg: {
      container: 'py-24',
      spinner: 'w-20 h-20',
      icon: 'w-10 h-10',
      dot: 'w-2.5 h-2.5',
      text: 'text-base'
    }
  };

  const classes = sizeClasses[size];
  const current = DISSERTATION_QUOTES[currentIndex];

  return html`
    <div className="flex flex-col items-center justify-center ${classes.container} px-4">
      <!-- Spinner -->
      <div className="relative mb-8">
        <div className="${classes.spinner} rounded-full bg-stone-100 flex items-center justify-center">
          <${BookOpen} className="${classes.icon} text-stone-400 animate-pulse" />
        </div>
        <div
          className="absolute inset-0 ${classes.spinner} border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin"
          style=${{ animationDuration: '1.5s' }}
        />
      </div>

      ${showQuotes ? html`
        <!-- Quote rotation -->
        <div
          className="max-w-xl text-center transition-opacity duration-300"
          style=${{ opacity: isVisible ? 1 : 0 }}
        >
          <blockquote className="text-stone-600 ${classes.text} md:text-base leading-relaxed italic mb-3">
            "${current.quote}"
          </blockquote>
          <cite className="text-xs text-stone-400 not-italic">
            — The Impossible Press, ${current.source}
          </cite>
        </div>
      ` : html`
        <!-- Simple message -->
        <p className="text-stone-500 ${classes.text} font-body">
          ${message}
        </p>
      `}

      <!-- Animated dots -->
      <div className="mt-8 flex items-center gap-2">
        <div className="flex gap-1">
          <span className="${classes.dot} bg-stone-300 rounded-full animate-bounce" style=${{ animationDelay: '0ms' }} />
          <span className="${classes.dot} bg-stone-300 rounded-full animate-bounce" style=${{ animationDelay: '150ms' }} />
          <span className="${classes.dot} bg-stone-300 rounded-full animate-bounce" style=${{ animationDelay: '300ms' }} />
        </div>
      </div>

      ${showQuotes && html`
        <p className="text-xs text-stone-300 mt-6">
          Tip: Records are cached for faster loading next time
        </p>
      `}
    </div>
  `;
};

export default LoadingState;
