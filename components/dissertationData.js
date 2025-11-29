
// Full dissertation node structure with rich content from the breakdown
// Jay Rosen, Ph.D., New York University, 1986

export const DISSERTATION_METADATA = {
  author: 'Jay Rosen',
  degree: 'Ph.D., New York University, 1986',
  committee: 'Neil Postman (Chair), Christine Nystrom, Henry Perkinson',
  program: 'Media Ecology, School of Education, Health, Nursing, and Arts Professions',
  centralThesis: 'The idea that "the press informs the public" is an impoverished view of journalism that treats information as something "in" the news rather than as a relationship between people and their environment. Journalism should be understood as a transaction between producers and consumers, not merely as an activity conducted by journalists.'
};

export const DISSERTATION_NODES = [
  // ROOT
  {
    id: 'root',
    type: 'root',
    label: 'The Impossible Press',
    subtitle: 'American Journalism and the Decline of Public Life',
    pageStart: 1,
    parentId: null,
    summary: 'A critical examination of the foundational assumption in democratic theory that "the press informs the public." Rosen argues this phrase obscures far more than it reveals, and that understanding the relationship between press and public requires examining factors that conventional press criticism ignores. The dissertation traces how modern conditions—urbanization, mass communication, professionalization—have made the classical ideal of an informed democratic public increasingly "impossible" to achieve.',
    pullQuote: 'Journalism is not an activity conducted solely by journalists; or, to put it another way, journalism is communication and communication is something that takes place between people. It is not an action but a transaction.',
    keyConcepts: ['Journalism as Transaction', 'Information as Relation', 'The Impossible Press', 'Scale of Democracy', 'Communication Without Community'],
    keyFigures: ['Walter Lippmann', 'John Dewey', 'Neil Postman', 'Gabriel Tarde', 'Robert Park']
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
    summary: 'Establishes the central argument: the phrase "the press informs the public" obscures more than it reveals. Rosen argues that journalism must be understood as a transaction between producers and consumers, not merely as an activity conducted by journalists. The introduction sets up the dissertation\'s critique of professional journalism\'s assumptions about its democratic function.',
    pullQuote: 'Journalism is not an activity conducted solely by journalists; or, to put it another way, journalism is communication and communication is something that takes place between people. It is not an action but a transaction.',
    keyConcepts: ['Journalism as Transaction', 'Press-Public Relationship', 'Democratic Function of Press']
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
    summary: 'Examines how modern conditions challenge traditional conceptions of press and public, with particular focus on the penny press revolution of the 1830s. Traces the historical emergence of the "public" as a political concept and social reality, examining how urbanization, mass communication technologies, and the expansion of democratic participation transformed the nature of public life.',
    keyConcepts: ['Modern Public', 'Penny Press Revolution', 'Democratic Participation', 'Mass Communication', 'Urban Society']
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
    summary: 'News arises from distance. The need for journalism only emerges when events unfold beyond the reach of direct experience. The Romans were the first to need news because their empire extended beyond the spoken word. The American republic created a public whose scale demanded newspaper communication. Jefferson understood that an informed public was only possible in a small, self-contained community—he advocated for ward republics precisely because he knew democracy required limits on scale.',
    pullQuote: 'News arrives from a distance. It crosses the space between individuals and events.',
    keyConcepts: ['News as Function of Distance', 'The Imagined Community', 'Jefferson\'s Dilemma', 'Scale of Democracy', 'Ward Republics'],
    keyFigures: ['Thomas Jefferson', 'Alexis de Tocqueville', 'James Gordon Bennett']
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
    summary: 'There are fundamentally two types of news with different functions—news as information (requiring action) and news as drama (requiring only spectation). For news to function as information, three conditions must be met: structure (an ordered understanding), action (a feeling of participation), and contingency (unpredictable outcomes). The human interest story functions not as information but as drama—the journalist becomes a dramatist; the audience becomes spectators rather than participants.',
    pullQuote: 'Information is not really "in" the items which come over the wire... It is "in" the relations between people and a changing environment.',
    keyConcepts: ['Information vs Identification', 'News as Drama', 'Human Interest Story', 'Sensationalism', 'Three Conditions for Information'],
    keyFigures: ['James Gordon Bennett', 'Joseph Pulitzer', 'Roland Barthes']
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
    summary: 'The telegraph and penny press inspired utopian visions of democracy restored—a "universal town meeting"—but these visions ignored fundamental problems with extending communication across distances where no genuine community existed. Each new communication technology inspired hopes that it would restore the scale of democratic participation possible in small communities.',
    pullQuote: 'Improvements in communication also make communication more difficult because they ensure that there will be more to communicate about.',
    keyConcepts: ['Technological Utopianism', 'Universal Town Meeting', 'Communication Paradox', 'Thoreau\'s Skepticism'],
    keyFigures: ['Henry David Thoreau', 'Alexis de Tocqueville']
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
    summary: 'The mass circulation newspaper created a new kind of social body—neither a traditional community nor merely a crowd—with ambiguous properties that alarmed social theorists. The public is the social body that emerges from the newspaper form. As a way of tying people together the newspaper has a dissolving as well as a connecting tendency—it weakens local ties while creating abstract, unstable bonds.',
    pullQuote: 'As a way of tying people together the newspaper has a dissolving as well as a connecting tendency.',
    keyConcepts: ['Crowd Psychology', 'Public Formation', 'Mass Circulation', 'Stable vs Unstable Publics', 'Communication Outruns Community'],
    keyFigures: ['Gabriel Tarde', 'Gustave Le Bon', 'Robert Park']
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
    summary: 'The modern public is gathered together without actually meeting—a fundamental fact that changes the nature of public life and the function of the press. Our system of communication is not addressed at the public but at private individuals. We have evolved a radical form of mobilized privacy: the individual hooked into long lines of communication from remote sources. The press begins to structure events according to its own demands—drama, conflict, brevity, consumability.',
    pullQuote: 'Our system of communication is not addressed at the public but at private individuals. We have evolved a radical form of mobilized privacy: the individual hooked into long lines of communication from remote sources.',
    keyConcepts: ['Public Transmission Private Reception', 'Mobilized Privacy', 'Attention Economy', 'The Front Page', 'Eclipse of Content'],
    keyFigures: ['Robert Park', 'John Dewey', 'Hannah Arendt', 'Richard Sennett']
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
    summary: 'Analyzes the professional attitude journalism developed in the twentieth century and contrasts it with the critiques offered by Walter Lippmann and John Dewey. Examines how the professionalization of journalism after 1900 was an attempt to reconcile the contradiction between journalism as a business and journalism as a public service.',
    keyConcepts: ['Professionalization', 'Objectivity', 'Yellow Journalism Crisis', 'Press Criticism Golden Age']
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
    summary: 'The titular chapter argues that the professionalization of journalism after 1900 was an attempt to reconcile the contradiction between journalism as a business and journalism as a public service—but the professional attitude obscured fundamental problems in the relationship between press and public. Yellow journalism put a sharper edge on the conflict between private profits and public duties. Professional standards (objectivity, accuracy, fairness, completeness) became the standards journalists adopted to prove their public responsibility, but they assume too much and ignore fundamental questions about what a public is.',
    pullQuote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
    keyConcepts: ['The Impossible Press', 'Professional Standards', 'Yellow Journalism Crisis', 'Public as Abstraction', 'First Amendment Battles'],
    keyFigures: ['Walter Lippmann', 'Joseph Pulitzer', 'William Randolph Hearst']
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
    summary: 'Lippmann was the first to recognize that the classical democratic ideal of the informed citizen was incompatible with modern conditions. People respond not to the world itself but to "pictures in their heads"—representations that may have little to do with reality. The stereotype is a form of perception that works from private belief toward reality: we define first and then see. The expectation that average citizens can have informed opinions on all public questions is "entirely unworkable."',
    pullQuote: 'One could free all the facts in the world and still not be informing the public, for the important question was not what was released into the environment, but what took shape in the beliefs and behavior of the average citizen.',
    keyConcepts: ['Pseudo-environment', 'Stereotypes', 'Omnicompetence Myth', 'Manufacture of Consent', 'Pictures in Our Heads'],
    keyFigures: ['Walter Lippmann', 'Thomas Jefferson']
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
    summary: 'Dewey agreed with Lippmann\'s diagnosis but rejected his elitist solution, arguing instead for the reconstruction of community as the basis for a revitalized public. There is no public out there waiting to be informed—a public is something that must be created through shared understanding of common problems. Communication is an art: seeds are sown not by being thrown out at random, but by being distributed to take root and grow. Till the Great Society is converted into a Great Community, the Public will remain in eclipse.',
    pullQuote: 'Seeds are sown not by being thrown out at random, but by being so distributed as to take root and have a chance of growth.',
    keyConcepts: ['Public Must Be Formed', 'Communication as Art', 'Great Community', 'Journalism and Propaganda', 'Sowing Seeds Model'],
    keyFigures: ['John Dewey', 'Walter Lippmann']
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
    summary: 'Proposes an "ecological" understanding of the press-public relationship. Identifies five factors that must be inserted between "press" and "public" for an adequate understanding: (1) the size and scale of the world to be informed about, (2) the character of the social bond among audience members, (3) structural characteristics of mass media, (4) the nature of language and symbols, and (5) the professional attitude. The most important finding is that the professional attitude is a very limited view of press and public.',
    pullQuote: 'Presenting "all the news" is therefore an impossible goal, and the press that avows it can only be an impossible press.',
    keyConcepts: ['Ecological View', 'Five Factors', 'Scale Problem', 'Social Bond', 'Structural Characteristics', 'Language Bias', 'Professional Attitude Limits'],
    keyFigures: ['Neil Postman', 'Harold Innis', 'Marshall McLuhan', 'James Carey']
  }
];

// Notable quotations for the archive
export const NOTABLE_QUOTATIONS = [
  {
    quote: 'Journalism is not an activity conducted solely by journalists; or, to put it another way, journalism is communication and communication is something that takes place between people. It is not an action but a transaction.',
    context: 'Central thesis of the dissertation'
  },
  {
    quote: 'Information is not really "in" the items which come over the wire and make their way into the newspaper. It is "in" the relations between people and a changing environment.',
    context: 'On the relational nature of information'
  },
  {
    quote: 'Sensationalism is not a perverse appetite for the crude and spectacular, but the increasing difficulty of interesting a population which does not act on its world in a way which requires a constant supply of fresh information.',
    context: 'Explaining sensationalism'
  },
  {
    quote: 'For any press anywhere, making things public does not a public make.',
    context: 'On the limits of publicity'
  },
  {
    quote: 'Presenting "all the news" is therefore an impossible goal, and the press that avows it can only be an impossible press.',
    context: 'On the impossibility of comprehensive coverage'
  },
  {
    quote: 'The same conditions which make citizens dependent on the press for information have other consequences as well... It is no accident that the beginning of professional propaganda began with the beginnings of professional journalism.',
    context: 'On propaganda and journalism'
  }
];

// Key recurring themes
export const KEY_THEMES = [
  {
    theme: 'Journalism as transaction, not action',
    description: 'The meaning of journalism lies not in what journalists do but in what happens between journalists and their audiences.'
  },
  {
    theme: 'Information is relational',
    description: 'Information is not "in" the news but "in" the relationship between people and their changing environment.'
  },
  {
    theme: 'The impossibility of the informed citizen',
    description: 'Modern conditions make the classical democratic ideal of the generally competent, naturally informed citizen impossible to achieve.'
  },
  {
    theme: 'Scale matters',
    description: 'Democratic theory was developed for small, self-contained communities; extending it to a continental republic creates problems the press cannot solve.'
  },
  {
    theme: 'Communication does not equal community',
    description: 'Linking people through media does not create the conditions for genuine public life.'
  },
  {
    theme: 'The competition for attention transforms public life',
    description: 'When attention must be gained rather than granted, the content of public discourse is eclipsed by the struggle to be heard.'
  },
  {
    theme: 'The professional attitude obscures fundamental problems',
    description: 'By focusing exclusively on accuracy and fairness, journalism criticism misses the structural factors that determine whether the press can inform the public.'
  }
];

// Helper to get a node by ID
export const getNodeById = (id) => {
  return DISSERTATION_NODES.find(node => node.id === id);
};

// Helper to get children of a node
export const getChildNodes = (parentId) => {
  return DISSERTATION_NODES.filter(node => node.parentId === parentId);
};

// Helper to get root node
export const getRootNode = () => {
  return DISSERTATION_NODES.find(node => node.id === 'root');
};
