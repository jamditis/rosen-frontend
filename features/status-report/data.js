/**
 * Status Report Data
 *
 * Pre-computed metrics from archive data review report (2026-01-06)
 * Source: data/archive_review_report_20260106_215318.txt
 */

export const STATUS_METRICS = {
  // Core record counts
  totalRecords: 869,
  verifiedRecords: 640,
  verifiedPercent: 73.6,
  categorizedRecords: 667,
  categorizedPercent: 76.8,

  // Entity extraction results
  totalEntities: 5736,
  totalRelationships: 7489,

  // Data quality gaps
  missingCategories: 202,
  missingCategoriesPercent: 23.2,
  missingConcepts: 335,
  missingConceptsPercent: 38.6,
  missingSummary: 10,
  missingSummaryPercent: 1.2,
  unverifiedRecords: 229,
  unverifiedPercent: 26.4,
  missingEra: 1,
  missingEraPercent: 0.1,

  // Queue status
  urlsInScrapeQueue: 841,

  // Last updated
  reportDate: '2026-01-06',
  lastUpdated: '2026-01-21'
};

export const ERA_DISTRIBUTION = [
  { era: 'Peak blogging & citizen journalism (2005-2009)', count: 288, percent: 33.1 },
  { era: 'Blogging launch & digital disruption (2000-2004)', count: 267, percent: 30.7 },
  { era: 'Social media & financial crisis (2010-2015)', count: 158, percent: 18.2 },
  { era: 'Platform transition & future models (2021-Present)', count: 75, percent: 8.6 },
  { era: 'Early career & public journalism (1990-1999)', count: 51, percent: 5.9 },
  { era: 'Trump era & democratic crisis (2016-2020)', count: 29, percent: 3.3 }
];

export const ENTITY_TYPES = [
  { type: 'Person', count: 2214 },
  { type: 'Organization', count: 1310 },
  { type: 'Concept', count: 931 },
  { type: 'Work', count: 858 },
  { type: 'Event', count: 224 },
  { type: 'Location', count: 199 }
];

export const RELATIONSHIP_TYPES = [
  { type: 'Affiliated with', count: 2136 },
  { type: 'Discusses', count: 1662 },
  { type: 'Mentions', count: 1126 },
  { type: 'Founded by', count: 569 },
  { type: 'Criticizes', count: 511 },
  { type: 'Published in', count: 312 },
  { type: 'Pioneered', count: 295 },
  { type: 'Inspired by', count: 222 },
  { type: 'Originated by', count: 160 },
  { type: 'Owned by', count: 138 }
];

export const CATEGORY_DISTRIBUTION = [
  { category: 'Press & media criticism', count: 620, percent: 71.3 },
  { category: 'Politics & democracy', count: 455, percent: 52.4 },
  { category: 'Technology & digital media', count: 417, percent: 48.0 },
  { category: 'Journalism theory & practice', count: 410, percent: 47.2 },
  { category: 'Audience & public engagement', count: 124, percent: 14.3 },
  { category: 'Journalism education', count: 27, percent: 3.1 }
];

export const CHECKLIST_ITEMS = [
  { id: 1, label: 'Data pipeline operational', status: 'complete', icon: 'check' },
  { id: 2, label: 'Frontend deployed', status: 'complete', icon: 'check' },
  { id: 3, label: 'Dissertation pages published', status: 'complete', icon: 'check' },
  { id: 4, label: 'Entity extraction complete', status: 'complete', icon: 'check' },
  { id: 5, label: 'Category coverage', status: 'in_progress', icon: 'partial',
    current: 76.8, target: 90, note: '76.8% → target 90%' },
  { id: 6, label: 'Record verification', status: 'in_progress', icon: 'partial',
    current: 73.6, target: 90, note: '73.6% → target 90%' },
  { id: 7, label: 'Final data review', status: 'pending', icon: 'circle' },
  { id: 8, label: 'Launch announcement', status: 'pending', icon: 'circle' },
  { id: 9, label: 'February 2026 publication', status: 'pending', icon: 'circle' }
];

export const TIMELINE_MILESTONES = [
  { date: 'Dec 2025', label: 'Soft launch', status: 'complete', description: 'Dissertation tools published' },
  { date: 'Jan 2026', label: 'Data quality sprint', status: 'current', description: 'Category & verification push' },
  { date: 'Feb 2026', label: 'Full archive launch', status: 'pending', description: 'Public announcement' }
];

export const FIELD_COMPLETENESS = {
  tier1: {
    name: 'Tier 1: Critical fields',
    fields: [
      { name: 'Title', complete: 100 },
      { name: 'URL', complete: 100 },
      { name: 'Publication date', complete: 99.9 }
    ]
  },
  tier2: {
    name: 'Tier 2: Core metadata',
    fields: [
      { name: 'Summary', complete: 98.8 },
      { name: 'Era', complete: 99.9 },
      { name: 'Type', complete: 100 }
    ]
  },
  tier3: {
    name: 'Tier 3: Enrichment',
    fields: [
      { name: 'Categories', complete: 76.8 },
      { name: 'Verified', complete: 73.6 },
      { name: 'Concepts', complete: 61.4 }
    ]
  },
  tier4: {
    name: 'Tier 4: Entity links',
    fields: [
      { name: 'Entity links', complete: 85 },
      { name: 'Relationship links', complete: 85 }
    ]
  }
};

export const ACTION_ITEMS = [
  {
    title: 'Records needing categories',
    count: 202,
    description: 'Assign thematic categories to uncategorized records',
    priority: 'high'
  },
  {
    title: 'URLs in scrape queue',
    count: 841,
    description: 'Process pending URLs for content extraction',
    priority: 'medium'
  },
  {
    title: 'Missing summaries',
    count: 10,
    description: 'Generate AI summaries for remaining records',
    priority: 'low'
  }
];
