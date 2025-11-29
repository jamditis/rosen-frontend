import { MindMapNodeData } from '../MindMap/types';

// Full dissertation node structure based on the Table of Contents
// Summaries, quotes, and related records can be filled in later

export interface DissertationNodeConfig extends MindMapNodeData {
  parentId: string | null;
  childIds: string[];
}

export const DISSERTATION_NODES: DissertationNodeConfig[] = [
  // ROOT
  {
    id: 'root',
    type: 'root',
    label: 'The Impossible Press',
    subtitle: 'American Journalism and the Decline of Public Life',
    pageStart: 1,
    parentId: null,
    childIds: ['intro', 'part-1', 'part-2', 'conclusion'],
    summary: 'Jay Rosen\'s 1986 PhD dissertation exploring the decline of the "public" as a social group and the rise of the mass audience. It contrasts the democratic ideal of a "universal town meeting" with the realities of modern communication.',
    keyConcepts: ['Public Sphere', 'Mass Society', 'Objectivity', 'Professionalism'],
    keyFigures: ['Walter Lippmann', 'John Dewey', 'Robert Park', 'Tocqueville']
  },

  // INTRODUCTION
  {
    id: 'intro',
    type: 'intro',
    label: 'Introduction',
    subtitle: 'Journalism as a Transaction',
    pageStart: 5,
    pageEnd: 12,
    parentId: 'root',
    childIds: [],
    summary: 'Sets up the central argument: journalism is not merely a profession or industry, but a transaction between press and public that shapes democratic life.',
    pullQuote: undefined, // To be filled in
    keyConcepts: ['Journalism as Transaction', 'Press-Public Relationship']
  },

  // PART ONE
  {
    id: 'part-1',
    type: 'part',
    label: 'Part One',
    subtitle: 'The Making of the Modern Public',
    pageStart: 13,
    pageEnd: 197,
    parentId: 'root',
    childIds: ['ch-1', 'ch-2', 'ch-3', 'ch-4', 'ch-5'],
    summary: 'Traces the historical emergence of the "public" as a political concept and social reality, examining how modern communication technologies and urban life transformed the nature of public participation.',
    keyConcepts: ['Modern Public', 'Democratic Participation', 'Mass Communication']
  },

  // Chapter 1
  {
    id: 'ch-1',
    type: 'chapter',
    label: 'Chapter 1',
    subtitle: 'Democracy and Distance',
    pageStart: 13,
    pageEnd: 41,
    parentId: 'part-1',
    childIds: [],
    summary: 'Examines the fundamental problem of scale in democracy: how can self-governance work when citizens are separated by vast distances and cannot directly deliberate together?',
    keyConcepts: ['Democracy and Distance', 'Scale of Democracy', 'Representation'],
    keyFigures: ['Tocqueville', 'James Gordon Bennett'],
    pullQuote: undefined // To be filled in
  },

  // Chapter 2
  {
    id: 'ch-2',
    type: 'chapter',
    label: 'Chapter 2',
    subtitle: 'Two Views of News',
    pageStart: 42,
    pageEnd: 89,
    parentId: 'part-1',
    childIds: [],
    summary: 'Contrasts competing conceptions of what news is and what it should do—presenting the fundamental tension between news as commodity and news as democratic resource.',
    keyConcepts: ['News as Commodity', 'News as Democratic Resource', 'Penny Press'],
    keyFigures: ['James Gordon Bennett', 'Joseph Pulitzer'],
    pullQuote: undefined
  },

  // Chapter 3
  {
    id: 'ch-3',
    type: 'chapter',
    label: 'Chapter 3',
    subtitle: 'The Universal Town Meeting',
    pageStart: 90,
    pageEnd: 116,
    parentId: 'part-1',
    childIds: [],
    summary: 'Explores the idealistic vision of mass media as a "universal town meeting" that could unite dispersed citizens in common deliberation, and why this vision proved impossible.',
    keyConcepts: ['Universal Town Meeting', 'Public Sphere', 'Democratic Ideal'],
    keyFigures: ['Tocqueville'],
    pullQuote: undefined
  },

  // Chapter 4
  {
    id: 'ch-4',
    type: 'chapter',
    label: 'Chapter 4',
    subtitle: 'From Crowd to Public',
    pageStart: 117,
    pageEnd: 151,
    parentId: 'part-1',
    childIds: [],
    summary: 'Analyzes the sociological distinction between crowds and publics, tracing how early social scientists understood the transformation of collective behavior in modern society.',
    keyConcepts: ['Crowd Psychology', 'Public Formation', 'Mass Society'],
    keyFigures: ['Robert Park', 'Gabriel Tarde'],
    pullQuote: undefined
  },

  // Chapter 5
  {
    id: 'ch-5',
    type: 'chapter',
    label: 'Chapter 5',
    subtitle: 'Communication Without Community',
    pageStart: 152,
    pageEnd: 197,
    parentId: 'part-1',
    childIds: [],
    summary: 'Examines the paradox of modern communication: technologies that connect us across distances may actually undermine the local communities necessary for genuine public life.',
    keyConcepts: ['Communication vs Community', 'Media Effects', 'Social Isolation'],
    keyFigures: ['Robert Park', 'John Dewey'],
    pullQuote: undefined
  },

  // PART TWO
  {
    id: 'part-2',
    type: 'part',
    label: 'Part Two',
    subtitle: 'The Public and the Professionalized Press',
    pageStart: 198,
    pageEnd: 373,
    parentId: 'root',
    childIds: ['ch-6', 'ch-7', 'ch-8'],
    summary: 'Analyzes how the professionalization of journalism created new relationships between press and public, and how this transformation both enabled and constrained democratic participation.',
    keyConcepts: ['Professionalization', 'Journalistic Authority', 'Press-Public Relations']
  },

  // Chapter 6
  {
    id: 'ch-6',
    type: 'chapter',
    label: 'Chapter 6',
    subtitle: 'The Impossible Press',
    pageStart: 198,
    pageEnd: 267,
    parentId: 'part-2',
    childIds: [],
    summary: 'The titular chapter argues that the press was given an impossible task: to create an informed citizenry capable of self-governance through objective reporting alone.',
    keyConcepts: ['Impossible Press', 'Objectivity', 'Informed Citizenry', 'Professional Journalism'],
    keyFigures: ['Walter Lippmann'],
    pullQuote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.'
  },

  // Chapter 7
  {
    id: 'ch-7',
    type: 'chapter',
    label: 'Chapter 7',
    subtitle: 'The Myth of the Omnicompetent Citizen',
    pageStart: 268,
    pageEnd: 329,
    parentId: 'part-2',
    childIds: [],
    summary: 'Critiques the assumption underlying much democratic theory: that citizens can and should be informed about all public matters. Traces how Lippmann demolished this myth.',
    keyConcepts: ['Omnicompetent Citizen', 'Democratic Theory', 'Public Opinion', 'Expertise'],
    keyFigures: ['Walter Lippmann', 'John Dewey'],
    pullQuote: undefined
  },

  // Chapter 8
  {
    id: 'ch-8',
    type: 'chapter',
    label: 'Chapter 8',
    subtitle: 'The Art and Science of Forming a Public',
    pageStart: 330,
    pageEnd: 373,
    parentId: 'part-2',
    childIds: [],
    summary: 'Presents Dewey\'s response to Lippmann: the public must be actively formed through communication and inquiry, not merely informed through journalism.',
    keyConcepts: ['Public Formation', 'Dewey vs Lippmann', 'Democratic Communication', 'Inquiry'],
    keyFigures: ['John Dewey', 'Walter Lippmann'],
    pullQuote: undefined
  },

  // CONCLUSION
  {
    id: 'conclusion',
    type: 'conclusion',
    label: 'Conclusion',
    subtitle: 'Toward an Ecological View of Press and Public',
    pageStart: 374,
    pageEnd: 415,
    parentId: 'root',
    childIds: [],
    summary: 'Proposes an "ecological" understanding of the press-public relationship that moves beyond the impossible demands of objectivity toward a more realistic and democratic vision.',
    keyConcepts: ['Ecological View', 'Press Reform', 'Democratic Future'],
    pullQuote: undefined
  }
];

// Helper to get a node by ID
export const getNodeById = (id: string): DissertationNodeConfig | undefined => {
  return DISSERTATION_NODES.find(node => node.id === id);
};

// Helper to get children of a node
export const getChildNodes = (parentId: string): DissertationNodeConfig[] => {
  return DISSERTATION_NODES.filter(node => node.parentId === parentId);
};

// Helper to get root node
export const getRootNode = (): DissertationNodeConfig => {
  return DISSERTATION_NODES.find(node => node.id === 'root')!;
};

// Get all nodes at a specific level (for progressive disclosure)
export const getNodesAtLevel = (level: number): DissertationNodeConfig[] => {
  if (level === 0) return [getRootNode()];

  let currentLevel = [getRootNode()];
  for (let i = 0; i < level; i++) {
    const nextLevel: DissertationNodeConfig[] = [];
    currentLevel.forEach(node => {
      nextLevel.push(...getChildNodes(node.id));
    });
    currentLevel = nextLevel;
  }
  return currentLevel;
};
