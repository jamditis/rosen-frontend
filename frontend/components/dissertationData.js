
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
  },

  // ==========================================
  // CHAPTER 1 CONCEPTS: Democracy and Distance (pp. 13-41)
  // ==========================================
  {
    id: 'c1-distance',
    type: 'concept',
    label: 'News as Distance',
    subtitle: 'The spatial origins of journalism',
    pageStart: 13,
    pageEnd: 20,
    parentId: 'ch-1',
    summary: 'News only becomes necessary when events occur beyond direct experience. The need for journalism is fundamentally a function of distance—geographic, social, and experiential.',
    pullQuote: 'News arrives from a distance. It crosses the space between individuals and events.',
    pageRef: 'p. 13'
  },
  {
    id: 'c1-distance-roman',
    type: 'figure',
    label: 'Roman Precedent',
    subtitle: 'Empire creates need for news',
    pageRef: 'pp. 14-15',
    parentId: 'c1-distance',
    summary: 'The Romans were the first civilization to systematically need news because their empire extended beyond what could be communicated by word of mouth.'
  },
  {
    id: 'c1-distance-modern',
    type: 'figure',
    label: 'Modern Scale',
    subtitle: 'Continental democracy',
    pageRef: 'pp. 16-18',
    parentId: 'c1-distance',
    summary: 'The American republic created a public whose geographic scale made newspaper communication essential to democratic participation.'
  },
  {
    id: 'c1-jefferson',
    type: 'concept',
    label: "Jefferson's Dilemma",
    subtitle: 'Democracy requires limits on scale',
    pageStart: 21,
    pageEnd: 30,
    parentId: 'ch-1',
    summary: 'Jefferson understood that genuine democratic deliberation was only possible in small communities. His advocacy for ward republics reflected his belief that democracy required limits on scale.',
    keyFigures: ['Thomas Jefferson']
  },
  {
    id: 'c1-jefferson-wards',
    type: 'figure',
    label: 'Ward Republics',
    subtitle: 'Small-scale democracy',
    pageRef: 'pp. 24-26',
    parentId: 'c1-jefferson',
    summary: 'Jefferson proposed dividing counties into small wards where citizens could meet face-to-face and deliberate on public matters directly.'
  },
  {
    id: 'c1-jefferson-press',
    type: 'figure',
    label: 'Press as Substitute',
    subtitle: 'Mediated democracy',
    pageRef: 'pp. 27-30',
    parentId: 'c1-jefferson',
    summary: 'The newspaper became a substitute for the direct communication possible in small communities—but could it truly replace face-to-face deliberation?'
  },
  {
    id: 'c1-imagined',
    type: 'concept',
    label: 'Imagined Community',
    subtitle: 'Readers as abstract public',
    pageStart: 31,
    pageEnd: 41,
    parentId: 'ch-1',
    summary: 'Newspaper readers form an "imagined community"—they share a sense of connection without ever meeting, bound together only by consuming the same information.'
  },
  {
    id: 'c1-imagined-limits',
    type: 'figure',
    label: 'Limits of Imagination',
    subtitle: 'Abstract bonds are weak',
    pageRef: 'pp. 35-38',
    parentId: 'c1-imagined',
    summary: 'The imagined community lacks the thick bonds of actual community—shared history, mutual obligation, face-to-face accountability.'
  },

  // ==========================================
  // CHAPTER 2 CONCEPTS: Two Views of News (pp. 42-89)
  // ==========================================
  {
    id: 'c2-information',
    type: 'concept',
    label: 'News as Information',
    subtitle: 'Requires action and contingency',
    pageStart: 42,
    pageEnd: 65,
    parentId: 'ch-2',
    summary: 'For news to function as information, three conditions must be met: structure (ordered understanding), action (participation), and contingency (unpredictable outcomes).',
    pullQuote: 'Information is not really "in" the items which come over the wire and make their way into the newspaper. It is "in" the relations between people and a changing environment.',
    pageRef: 'p. 58'
  },
  {
    id: 'c2-info-structure',
    type: 'figure',
    label: 'Structure',
    subtitle: 'Ordered understanding',
    pageRef: 'pp. 55-58',
    parentId: 'c2-information',
    summary: 'Information requires a framework of understanding—without structure, facts are meaningless data points.'
  },
  {
    id: 'c2-info-action',
    type: 'figure',
    label: 'Action',
    subtitle: 'Feeling of participation',
    pageRef: 'pp. 59-62',
    parentId: 'c2-information',
    summary: 'True information connects to potential action—the reader must feel they can do something with what they learn.'
  },
  {
    id: 'c2-info-contingency',
    type: 'figure',
    label: 'Contingency',
    subtitle: 'Unpredictable outcomes',
    pageRef: 'pp. 63-65',
    parentId: 'c2-information',
    summary: 'Information matters when outcomes are uncertain—when the future depends on decisions yet to be made.'
  },
  {
    id: 'c2-drama',
    type: 'concept',
    label: 'News as Drama',
    subtitle: 'Spectation replaces participation',
    pageStart: 66,
    pageEnd: 89,
    parentId: 'ch-2',
    summary: 'The human interest story transforms readers from participants into spectators. The journalist becomes a dramatist; news becomes entertainment.',
    pullQuote: 'The journalist becomes a dramatist; the audience becomes spectators rather than participants.',
    pageRef: 'p. 72'
  },
  {
    id: 'c2-drama-human',
    type: 'figure',
    label: 'Human Interest',
    subtitle: 'Stories without stakes',
    pageRef: 'pp. 66-75',
    parentId: 'c2-drama',
    summary: 'Human interest stories engage emotions without requiring action—readers consume them as they would fiction.'
  },
  {
    id: 'c2-drama-sensation',
    type: 'figure',
    label: 'Sensationalism',
    subtitle: 'Difficulty of engagement',
    pageRef: 'pp. 76-89',
    parentId: 'c2-drama',
    summary: 'Sensationalism emerges from the difficulty of engaging an audience that has no stake in the outcome of events.',
    pullQuote: 'Sensationalism is not a perverse appetite for the crude and spectacular, but the increasing difficulty of interesting a population which does not act on its world.',
    pageRef: 'p. 80'
  },

  // ==========================================
  // CHAPTER 3 CONCEPTS: Universal Town Meeting (pp. 90-116)
  // ==========================================
  {
    id: 'c3-utopianism',
    type: 'concept',
    label: 'Tech Utopianism',
    subtitle: 'Each medium promises restoration',
    pageStart: 90,
    pageEnd: 103,
    parentId: 'ch-3',
    summary: 'Every new communication technology—telegraph, radio, television, internet—inspires hopes that it will restore small-scale democratic participation.',
    pullQuote: 'Improvements in communication also make communication more difficult because they ensure that there will be more to communicate about.',
    pageRef: 'p. 95'
  },
  {
    id: 'c3-utopia-telegraph',
    type: 'figure',
    label: 'Telegraph Dreams',
    subtitle: 'Instant connection',
    pageRef: 'pp. 90-94',
    parentId: 'c3-utopianism',
    summary: 'The telegraph inspired visions of a world united by instant communication—a "universal town meeting" spanning continents.'
  },
  {
    id: 'c3-utopia-pattern',
    type: 'figure',
    label: 'Recurring Pattern',
    subtitle: 'Hope then disappointment',
    pageRef: 'pp. 98-103',
    parentId: 'c3-utopianism',
    summary: 'Each new medium follows the same pattern: utopian hopes followed by the realization that technology cannot solve social problems.'
  },
  {
    id: 'c3-paradox',
    type: 'concept',
    label: 'Communication Paradox',
    subtitle: 'More connection, more to communicate',
    pageStart: 104,
    pageEnd: 116,
    parentId: 'ch-3',
    summary: 'Improvements in communication create more to communicate about, making the task of informing the public ever more impossible.',
    pullQuote: 'The newspaper constitutes a universal town meeting for politics.',
    pageRef: 'p. 108'
  },
  {
    id: 'c3-paradox-thoreau',
    type: 'figure',
    label: "Thoreau's Skepticism",
    subtitle: 'Nothing worth saying',
    pageRef: 'pp. 110-114',
    parentId: 'c3-paradox',
    summary: 'Thoreau questioned whether faster communication served any purpose: "We are in great haste to construct a magnetic telegraph from Maine to Texas; but Maine and Texas, it may be, have nothing important to communicate."',
    keyFigures: ['Henry David Thoreau']
  },

  // ==========================================
  // CHAPTER 4 CONCEPTS: From Crowd to Public (pp. 117-151)
  // ==========================================
  {
    id: 'c4-crowd',
    type: 'concept',
    label: 'Crowd Psychology',
    subtitle: 'Mass behavior and irrationality',
    pageStart: 117,
    pageEnd: 134,
    parentId: 'ch-4',
    summary: 'Late 19th century theorists worried that mass society created irrational crowds susceptible to manipulation and contagion.',
    keyFigures: ['Gustave Le Bon', 'Gabriel Tarde']
  },
  {
    id: 'c4-crowd-lebon',
    type: 'figure',
    label: 'Le Bon\'s Crowd',
    subtitle: 'Irrational masses',
    pageRef: 'pp. 117-125',
    parentId: 'c4-crowd',
    summary: 'Le Bon argued that individuals in crowds lose their rational faculties and become susceptible to suggestion and emotion.'
  },
  {
    id: 'c4-crowd-tarde',
    type: 'figure',
    label: 'Tarde\'s Public',
    subtitle: 'Dispersed crowd',
    pageRef: 'pp. 126-134',
    parentId: 'c4-crowd',
    summary: 'Tarde distinguished the "public" from the crowd—a dispersed group connected by shared attention to the same media rather than physical proximity.'
  },
  {
    id: 'c4-formation',
    type: 'concept',
    label: 'Public Formation',
    subtitle: 'How newspapers create publics',
    pageStart: 135,
    pageEnd: 151,
    parentId: 'ch-4',
    summary: 'The public is not a pre-existing entity but something created by mass media. Newspapers gather together people who would otherwise have no connection.',
    pullQuote: 'As a way of tying people together the newspaper has a dissolving as well as a connecting tendency.',
    pageRef: 'p. 140'
  },
  {
    id: 'c4-formation-dissolve',
    type: 'figure',
    label: 'Dissolving Bonds',
    subtitle: 'Weakening local ties',
    pageRef: 'pp. 138-144',
    parentId: 'c4-formation',
    summary: 'While connecting people across distances, newspapers weaken local community bonds by directing attention outward.'
  },
  {
    id: 'c4-formation-unstable',
    type: 'figure',
    label: 'Unstable Publics',
    subtitle: 'Attention is fleeting',
    pageRef: 'pp. 145-151',
    parentId: 'c4-formation',
    summary: 'Media-created publics are inherently unstable—they form around events and dissolve when attention shifts.'
  },

  // ==========================================
  // CHAPTER 5 CONCEPTS: Communication Without Community (pp. 152-197)
  // ==========================================
  {
    id: 'c5-privacy',
    type: 'concept',
    label: 'Mobilized Privacy',
    subtitle: 'Private reception of public messages',
    pageStart: 152,
    pageEnd: 175,
    parentId: 'ch-5',
    summary: 'Modern mass communication addresses private individuals, not the public as a collective. We receive public transmissions in private spaces.',
    pullQuote: 'Our system of communication is not addressed at the public but at private individuals. We have evolved a radical form of mobilized privacy: the individual hooked into long lines of communication from remote sources.',
    pageRef: 'p. 160'
  },
  {
    id: 'c5-privacy-home',
    type: 'figure',
    label: 'Private Reception',
    subtitle: 'News consumed alone',
    pageRef: 'pp. 155-162',
    parentId: 'c5-privacy',
    summary: 'Unlike the public square, mass media is consumed in isolation—reading the newspaper or watching TV at home, alone.'
  },
  {
    id: 'c5-privacy-passive',
    type: 'figure',
    label: 'Passive Consumption',
    subtitle: 'No response channel',
    pageRef: 'pp. 163-175',
    parentId: 'c5-privacy',
    summary: 'Mass media creates a one-way flow—the audience can receive but cannot respond or participate.'
  },
  {
    id: 'c5-attention',
    type: 'concept',
    label: 'Attention Economy',
    subtitle: 'Competition for eyeballs',
    pageStart: 176,
    pageEnd: 197,
    parentId: 'ch-5',
    summary: 'When attention must be captured rather than granted, the content of communication is shaped by the struggle to be heard.',
    pullQuote: 'When there is an indefinite supply of available information, attention is scarce. The battle for attention is then the very substance of communication.',
    pageRef: 'p. 180'
  },
  {
    id: 'c5-attention-eclipse',
    type: 'figure',
    label: 'Eclipse of Content',
    subtitle: 'Form over substance',
    pageRef: 'pp. 182-190',
    parentId: 'c5-attention',
    summary: 'The competition for attention elevates presentation over substance—what captures attention may not be what informs.'
  },
  {
    id: 'c5-attention-front',
    type: 'figure',
    label: 'The Front Page',
    subtitle: 'Structured for impact',
    pageRef: 'pp. 191-197',
    parentId: 'c5-attention',
    summary: 'The front page is designed to grab attention in a crowded marketplace—headlines, images, and layout serve this commercial function.'
  },

  // ==========================================
  // CHAPTER 6 CONCEPTS: The Impossible Press (pp. 198-267)
  // ==========================================
  {
    id: 'c6-professional',
    type: 'concept',
    label: 'Professional Standards',
    subtitle: 'Objectivity as solution',
    pageStart: 198,
    pageEnd: 235,
    parentId: 'ch-6',
    summary: 'Journalism adopted professional standards—objectivity, accuracy, fairness—to prove its public responsibility and distinguish itself from yellow journalism.',
    pullQuote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
    pageRef: 'p. 220'
  },
  {
    id: 'c6-pro-objectivity',
    type: 'figure',
    label: 'Objectivity',
    subtitle: 'View from nowhere',
    pageRef: 'pp. 210-220',
    parentId: 'c6-professional',
    summary: 'Objectivity promised neutrality and truth, but it was a method for managing controversy rather than achieving understanding.'
  },
  {
    id: 'c6-pro-limits',
    type: 'figure',
    label: 'Limits of Standards',
    subtitle: 'Cannot solve structural problems',
    pageRef: 'pp. 221-235',
    parentId: 'c6-professional',
    summary: 'Professional standards assume the public exists and is ready to be informed—they cannot create a public where none exists.'
  },
  {
    id: 'c6-yellow',
    type: 'concept',
    label: 'Yellow Journalism',
    subtitle: 'Crisis of credibility',
    pageStart: 236,
    pageEnd: 267,
    parentId: 'ch-6',
    summary: 'The sensationalism of Pulitzer and Hearst created a crisis that drove the professionalization movement.',
    keyFigures: ['Joseph Pulitzer', 'William Randolph Hearst'],
    pullQuote: 'Yellow journalism put a sharper edge on the conflict between private profits and public duties.',
    pageRef: 'p. 240'
  },
  {
    id: 'c6-yellow-spanish',
    type: 'figure',
    label: 'Spanish-American War',
    subtitle: 'Manufacturing consent',
    pageRef: 'pp. 245-255',
    parentId: 'c6-yellow',
    summary: 'Yellow journalism\'s role in promoting the Spanish-American War became a cautionary tale about press power and responsibility.'
  },
  {
    id: 'c6-yellow-reaction',
    type: 'figure',
    label: 'Professional Reaction',
    subtitle: 'Birth of journalism schools',
    pageRef: 'pp. 256-267',
    parentId: 'c6-yellow',
    summary: 'The yellow journalism crisis led to journalism schools, professional associations, and codes of ethics—an attempt to restore credibility.'
  },

  // ==========================================
  // CHAPTER 7 CONCEPTS: Omnicompetent Citizen (pp. 268-329)
  // ==========================================
  {
    id: 'c7-pseudo',
    type: 'concept',
    label: 'Pseudo-environment',
    subtitle: 'Pictures in our heads',
    pageStart: 268,
    pageEnd: 300,
    parentId: 'ch-7',
    summary: 'Lippmann argued that people respond not to reality but to representations of reality—"pictures in their heads" that may bear little resemblance to the actual world.',
    keyFigures: ['Walter Lippmann'],
    pullQuote: 'One could free all the facts in the world and still not be informing the public, for the important question was not what was released into the environment, but what took shape in the beliefs and behavior of the average citizen.',
    pageRef: 'p. 280'
  },
  {
    id: 'c7-pseudo-stereotype',
    type: 'figure',
    label: 'Stereotypes',
    subtitle: 'We define first, then see',
    pageRef: 'pp. 275-285',
    parentId: 'c7-pseudo',
    summary: 'Stereotypes are mental shortcuts that filter perception—we see what we expect to see based on pre-existing categories.',
    pullQuote: 'The stereotype is a form of perception that works from private belief toward reality: we define first and then see.',
    pageRef: 'p. 282'
  },
  {
    id: 'c7-pseudo-gap',
    type: 'figure',
    label: 'Reality Gap',
    subtitle: 'World vs. picture',
    pageRef: 'pp. 286-300',
    parentId: 'c7-pseudo',
    summary: 'The gap between the world and our picture of it creates systematic misunderstanding—the press cannot simply bridge this gap.'
  },
  {
    id: 'c7-omni',
    type: 'concept',
    label: 'Omnicompetence Myth',
    subtitle: 'The informed citizen ideal',
    pageStart: 301,
    pageEnd: 329,
    parentId: 'ch-7',
    summary: 'Democratic theory assumes citizens can have informed opinions on all public questions—an expectation Lippmann called "entirely unworkable."',
    pullQuote: 'The press is like the beam of a searchlight that moves restlessly about, bringing one episode and then another out of darkness into vision. Men cannot do the work of the world by this light alone.',
    pageRef: 'p. 310'
  },
  {
    id: 'c7-omni-complexity',
    type: 'figure',
    label: 'Complexity',
    subtitle: 'Too much to know',
    pageRef: 'pp. 305-315',
    parentId: 'c7-omni',
    summary: 'Modern society is too complex for any individual to understand fully—specialization is necessary but creates gaps in public understanding.'
  },
  {
    id: 'c7-omni-attention',
    type: 'figure',
    label: 'Limited Attention',
    subtitle: 'Citizens have lives',
    pageRef: 'pp. 316-329',
    parentId: 'c7-omni',
    summary: 'Citizens cannot devote unlimited attention to public affairs—they have jobs, families, and private concerns that compete for their time.',
    pullQuote: 'The trouble lies deeper than the press, and so does the remedy.',
    pageRef: 'p. 320'
  },

  // ==========================================
  // CHAPTER 8 CONCEPTS: Forming a Public (pp. 330-373)
  // ==========================================
  {
    id: 'c8-dewey',
    type: 'concept',
    label: 'Public Must Be Formed',
    subtitle: 'No natural public',
    pageStart: 330,
    pageEnd: 355,
    parentId: 'ch-8',
    summary: 'Dewey argued there is no pre-existing public waiting to be informed—a public must be actively created through shared understanding of common problems.',
    keyFigures: ['John Dewey'],
    pullQuote: 'Seeds are sown not by being thrown out at random, but by being so distributed as to take root and have a chance of growth.',
    pageRef: 'p. 345'
  },
  {
    id: 'c8-dewey-community',
    type: 'figure',
    label: 'Great Community',
    subtitle: 'Reconstructing connection',
    pageRef: 'pp. 335-345',
    parentId: 'c8-dewey',
    summary: 'Dewey\'s solution was rebuilding community—converting the "Great Society" into a "Great Community" through face-to-face association.',
    pullQuote: 'Till the Great Society is converted into a Great Community, the Public will remain in eclipse.',
    pageRef: 'p. 340'
  },
  {
    id: 'c8-dewey-local',
    type: 'figure',
    label: 'Local is Key',
    subtitle: 'Start where people are',
    pageRef: 'pp. 346-355',
    parentId: 'c8-dewey',
    summary: 'Public life must begin locally, where people can experience consequences directly and participate meaningfully.'
  },
  {
    id: 'c8-art',
    type: 'concept',
    label: 'Communication as Art',
    subtitle: 'Sowing seeds model',
    pageStart: 356,
    pageEnd: 373,
    parentId: 'ch-8',
    summary: 'Effective public communication is an art, not a science—it requires understanding audiences and contexts, not just transmitting facts.',
    pullQuote: 'Unless there are methods for detecting the energies at work and tracing them through an intricate network of interactions to their consequences, what passes for public opinion will be "opinion" only in its derogatory sense.',
    pageRef: 'p. 360'
  },
  {
    id: 'c8-art-cultivation',
    type: 'figure',
    label: 'Cultivation',
    subtitle: 'Growing understanding',
    pageRef: 'pp. 360-367',
    parentId: 'c8-art',
    summary: 'Like a farmer, the communicator must prepare the soil, plant seeds carefully, and nurture growth over time.'
  },
  {
    id: 'c8-art-context',
    type: 'figure',
    label: 'Context Matters',
    subtitle: 'Same message, different effects',
    pageRef: 'pp. 368-373',
    parentId: 'c8-art',
    summary: 'The same information can inform or confuse depending on how it\'s presented and received—context shapes meaning.'
  },

  // ==========================================
  // CONCLUSION CONCEPTS: Ecological View (pp. 374-415)
  // ==========================================
  {
    id: 'conc-factors',
    type: 'concept',
    label: 'Five Factors',
    subtitle: 'Between press and public',
    pageStart: 374,
    pageEnd: 395,
    parentId: 'conclusion',
    summary: 'Understanding the press-public relationship requires inserting five factors: scale, social bonds, media structure, language/symbols, and professional attitude.',
    pullQuote: 'Providing information is not all there is to informing the public.',
    pageRef: 'p. 380'
  },
  {
    id: 'conc-factors-scale',
    type: 'figure',
    label: 'Scale',
    subtitle: 'Size of world to know',
    pageRef: 'pp. 378-382',
    parentId: 'conc-factors',
    summary: 'The sheer size and complexity of modern society makes comprehensive understanding impossible for any individual.'
  },
  {
    id: 'conc-factors-bonds',
    type: 'figure',
    label: 'Social Bonds',
    subtitle: 'Character of audience',
    pageRef: 'pp. 383-388',
    parentId: 'conc-factors',
    summary: 'Whether the audience forms a genuine community or merely an aggregate of isolated individuals fundamentally affects how communication works.'
  },
  {
    id: 'conc-factors-structure',
    type: 'figure',
    label: 'Media Structure',
    subtitle: 'Form shapes content',
    pageRef: 'pp. 389-395',
    parentId: 'conc-factors',
    summary: 'The structural characteristics of mass media—one-to-many, commercial pressures, format constraints—shape what can be communicated.'
  },
  {
    id: 'conc-ecological',
    type: 'concept',
    label: 'Ecological View',
    subtitle: 'Systems thinking',
    pageStart: 396,
    pageEnd: 415,
    parentId: 'conclusion',
    summary: 'An ecological approach sees press and public as part of a larger system—changes in one element affect all others.',
    keyFigures: ['Neil Postman', 'Marshall McLuhan'],
    pullQuote: 'For any press anywhere, making things public does not a public make.',
    pageRef: 'p. 400'
  },
  {
    id: 'conc-eco-media',
    type: 'figure',
    label: 'Media Ecology',
    subtitle: 'Environment of communication',
    pageRef: 'pp. 400-408',
    parentId: 'conc-ecological',
    summary: 'Media ecology studies how communication technologies create environments that shape human perception, understanding, and action.'
  },
  {
    id: 'conc-eco-bias',
    type: 'figure',
    label: 'Medium Bias',
    subtitle: 'Every medium has tendencies',
    pageRef: 'pp. 409-415',
    parentId: 'conc-ecological',
    summary: 'Each medium has inherent biases—toward speed or permanence, emotion or reason, entertainment or information—that shape public discourse.',
    pullQuote: 'Presenting "all the news" is therefore an impossible goal, and the press that avows it can only be an impossible press.',
    pageRef: 'p. 412'
  }
];

// Notable quotations for the archive
export const NOTABLE_QUOTATIONS = [
  {
    quote: 'Journalism is not an activity conducted solely by journalists; or, to put it another way, journalism is communication and communication is something that takes place between people. It is not an action but a transaction.',
    context: 'Central thesis of the dissertation',
    pageRef: 'Introduction, pp. 5-6'
  },
  {
    quote: 'Information is not really "in" the items which come over the wire and make their way into the newspaper. It is "in" the relations between people and a changing environment.',
    context: 'On the relational nature of information',
    pageRef: 'Chapter 2, p. 58'
  },
  {
    quote: 'Sensationalism is not a perverse appetite for the crude and spectacular, but the increasing difficulty of interesting a population which does not act on its world in a way which requires a constant supply of fresh information.',
    context: 'Explaining sensationalism',
    pageRef: 'Chapter 2, p. 80'
  },
  {
    quote: 'For any press anywhere, making things public does not a public make.',
    context: 'On the limits of publicity',
    pageRef: 'Conclusion, p. 400'
  },
  {
    quote: 'Presenting "all the news" is therefore an impossible goal, and the press that avows it can only be an impossible press.',
    context: 'On the impossibility of comprehensive coverage',
    pageRef: 'Conclusion, p. 412'
  },
  {
    quote: 'The same conditions which make citizens dependent on the press for information have other consequences as well... It is no accident that the beginning of professional propaganda began with the beginnings of professional journalism.',
    context: 'On propaganda and journalism',
    pageRef: 'Chapter 6, p. 250'
  },
  {
    quote: 'Our system of communication is not addressed at the public but at private individuals. We have evolved a radical form of mobilized privacy: the individual hooked into long lines of communication from remote sources.',
    context: 'On mobilized privacy and mass communication',
    pageRef: 'Chapter 5, p. 160'
  },
  {
    quote: 'The press is like the beam of a searchlight that moves restlessly about, bringing one episode and then another out of darkness into vision. Men cannot do the work of the world by this light alone.',
    context: 'Quoting Lippmann on the limits of press coverage',
    pageRef: 'Chapter 7, p. 310'
  },
  {
    quote: 'Seeds are sown not by being thrown out at random, but by being so distributed as to take root and have a chance of growth.',
    context: 'Dewey on the art of communication',
    pageRef: 'Chapter 8, p. 345'
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
