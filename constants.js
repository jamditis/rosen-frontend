
// Base Google Sheet URL
const SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-XqQXvMJNaBXVWlmXu1EyOpa_Cc6ur-pklWX1mbrWIFybZjmbE6UTIteSoCSvf0a7j5r8A6earp3H/pub';

// YOU MUST REPLACE THESE GIDS WITH THE ACTUAL GID FROM YOUR GOOGLE SHEET URL FOR EACH TAB
export const DATA_CONFIG = {
    test_runs: `${SHEET_BASE}?gid=928818664&single=true&output=csv`, // Main records
    social_posts: `${SHEET_BASE}?gid=0&single=true&output=csv`,      // Social media records (Replace gid=0)
    entities: `${SHEET_BASE}?gid=0&single=true&output=csv`,          // Extracted entities (Replace gid=0)
    relationships: `${SHEET_BASE}?gid=0&single=true&output=csv`      // Extracted relationships (Replace gid=0)
};

export const ITEMS_PER_PAGE = 24;

export const COLORS = [
    { bg: '#e0f2fe', text: '#075985', border: '#bae6fd' }, // Sky
    { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }, // Green
    { bg: '#fffbeb', text: '#92400e', border: '#fde68a' }, // Amber
    { bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8' }, // Pink
    { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe' }, // Violet
    { bg: '#fff7ed', text: '#9a3412', border: '#ffedd5' }  // Orange
];

export const ERAS = [
  "Public Journalism (90s)",
  "Web & Blogging (00s)",
  "View from Nowhere (10s)",
  "Democracy in Crisis (20s)"
];

export const FEATURED_WORKS = [
  {
    id: 'feat-dissertation',
    title: 'The Impossible Press (1986)',
    description: 'Rosen\'s PhD dissertation exploring the decline of the "public" as a social group and the rise of the mass audience. It contrasts the democratic ideal of a "universal town meeting" with the realities of modern communication.',
    image: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&q=80&w=800',
    link: '/tools/dissertation-reader/dist/',
    type: 'PhD Dissertation'
  },
  {
    id: 'feat-1',
    title: 'The View from Nowhere',
    description: 'A seminal critique of the claim to objectivity in journalism, arguing that the "view from nowhere" is a bid for trust that actually disconnects journalists from the public.',
    image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=800',
    link: 'https://pressthink.org/2010/11/the-view-from-nowhere-questions-and-answers/',
    type: 'Key Concept'
  },
  {
    id: 'feat-2',
    title: 'What Are Journalists For?',
    description: 'Rosen\'s influential book exploring the Public Journalism movement of the 1990s, arguing for a press that helps communities solve their own problems.',
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=800',
    link: 'https://yalebooks.yale.edu/book/9780300089072/what-are-journalists-for/',
    type: 'Book'
  },
  {
    id: 'feat-3',
    title: 'PressThink',
    description: 'The long-running blog where Rosen has chronicled the decline of the legacy press and the rise of the web.',
    image: 'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?auto=format&fit=crop&q=80&w=800',
    link: 'https://pressthink.org/',
    type: 'Blog'
  },
  {
    id: 'feat-4',
    title: 'The Church of the Savvy',
    description: 'A critique of political journalism that focuses on strategy, optics, and "who\'s winning" rather than the substance of policy.',
    image: 'https://effectivechurch.com/wp-content/uploads/2014/12/ChurchSmall.jpg',
    link: 'https://pressthink.org/2011/06/the-church-of-the-savvy/',
    type: 'Key Concept'
  },
  {
    id: 'feat-5',
    title: 'Audience Atomization',
    description: 'The theory that the broadcast era treated the audience as disconnected individuals, which the internet disrupted.',
    image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=800',
    link: 'https://pressthink.org/2006/06/the-people-formerly-known-as-the-audience/',
    type: 'Key Concept'
  }
];
