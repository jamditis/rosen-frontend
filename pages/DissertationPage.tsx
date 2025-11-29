import React from 'react';
import { BookOpen, ExternalLink, ArrowLeft, Calendar, GraduationCap } from 'lucide-react';
import { DissertationMindMap } from '../components/DissertationMindMap';

interface DissertationPageProps {
  onBack?: () => void;
}

const DissertationPage: React.FC<DissertationPageProps> = ({ onBack }) => {
  const dissertationPdfUrl = 'https://drive.google.com/file/d/14sIj3nYzOaV_CRHLMRvbgv9EcYbCsp4L/view?usp=sharing';

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-paper border-b border-stone-200">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Left: Back button */}
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Archive</span>
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="bg-stone-900 text-white p-1.5">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-display font-bold text-stone-900 leading-tight">
                  The Impossible Press
                </h1>
                <p className="text-[10px] text-stone-500">PhD Dissertation, 1986</p>
              </div>
            </div>
          </div>

          {/* Center: Metadata */}
          <div className="hidden md:flex items-center gap-6 text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              <span>Jay Rosen</span>
            </div>
            <div className="h-4 w-px bg-stone-200" />
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>New York University, 1986</span>
            </div>
          </div>

          {/* Right: CTA */}
          <a
            href={dissertationPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-stone-800 text-white px-4 py-2 text-xs font-bold hover:bg-stone-700 transition-colors"
          >
            <span>Read Full Text</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-stone-50 border-b border-stone-200">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="max-w-3xl">
            <h1 className="font-display text-2xl md:text-4xl font-bold text-stone-900 leading-tight mb-4">
              The Impossible Press
            </h1>
            <h2 className="text-lg md:text-xl text-stone-600 mb-6">
              American Journalism and the Decline of Public Life
            </h2>
            <p className="text-stone-600 leading-relaxed mb-6">
              Jay Rosen's 1986 PhD dissertation explores the decline of the "public" as a social
              group and the rise of the mass audience. It contrasts the democratic ideal of a
              "universal town meeting" with the realities of modern communication, tracing how
              the professionalization of journalism created an "impossible press" tasked with
              solving the problem of public life through objective reporting alone.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Public Sphere', 'Objectivity', 'Walter Lippmann', 'John Dewey', 'Mass Society'].map(tag => (
                <span
                  key={tag}
                  className="text-[10px] uppercase font-bold px-2 py-1 bg-white border border-stone-200 text-stone-600 tracking-wide"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Instructions Bar */}
      <div className="bg-white border-b border-stone-200">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            <span className="font-bold uppercase tracking-wider text-stone-400 mr-2">Navigate:</span>
            Click nodes to see details. Double-click to expand/collapse sections.
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[10px] text-stone-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-amber-50 border border-amber-200" /> Parts
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-sky-50 border border-sky-200" /> Chapters
            </span>
          </div>
        </div>
      </div>

      {/* Mind Map Container */}
      <div className="flex-grow relative">
        <DissertationMindMap className="absolute inset-0" />
      </div>

      {/* Footer */}
      <footer className="bg-stone-50 border-t border-stone-200 py-4">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <div>
            Part of the <span className="font-bold text-stone-700">Jay Rosen Digital Archive</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com/jayrosen_nyu"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-700 transition-colors"
            >
              @jayrosen_nyu
            </a>
            <span className="text-stone-300">|</span>
            <a
              href="https://pressthink.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-700 transition-colors"
            >
              PressThink
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DissertationPage;
