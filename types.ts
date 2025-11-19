export interface RawCsvRecord {
  ID?: string;
  id?: string;
  Title?: string;
  title?: string;
  Author?: string;
  author?: string;
  Publication_Date?: string;
  publication_date?: string;
  Original_Publication?: string;
  original_publication?: string;
  URL?: string;
  url?: string;
  Summary?: string;
  summary?: string;
  Pull_Quote?: string;
  pull_quote?: string;
  Thematic_Categories?: string;
  thematic_categories?: string;
  Key_Concepts?: string;
  key_concepts?: string;
  Tags?: string;
  tags?: string;
  Verified?: string;
  verified?: string;
}

export interface ArchiveRecord {
  id: string;
  title: string;
  author: string;
  date: string;
  year: string;
  era: string;
  pub: string;
  url: string;
  summary: string;
  quote: string;
  categories: string[];
  concepts: string[];
  tags: string[];
  verified: boolean;
  type?: string;
  relatedIds?: string[];
}

export interface FilterState {
  search: string;
  categories: string[];
  era: string | null;
  year: string | null;
  publication: string[];
  type: 'article' | 'video' | null;
}

export interface Facets {
  categories: string[];
  eras: string[];
  publications: string[];
}

export interface ThemeColor {
  bg: string;
  text: string;
  border: string;
}

export interface FeaturedWork {
  id: string;
  title: string;
  description: string;
  image: string;
  link: string;
  type: string;
}

// --- Explorer Types ---

export interface ExplorerNode extends ArchiveRecord {
  numericId: number;
  x: number;
  y: number;
  color: string;
  baseRadius: number;
  currentRadius: number;
  isPlaceholder: boolean;
  aggregateConnectionCount: number;
  clusterGroup?: string;
}

export interface ExplorerConnection {
  targetId: number;
  color: string;
  duration: number;
  startTime: number;
  horizontalFirst: boolean;
  midPointRatio: number;
  sharedValue: string;
  strength: number;
}