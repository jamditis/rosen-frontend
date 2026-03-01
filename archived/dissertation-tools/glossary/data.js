// Glossary: Key Concepts from The Impossible Press
// Interactive visual glossary of dissertation vocabulary

export const CONCEPTS = [
  {
    id: 'pseudo-environment',
    term: 'Pseudo-Environment',
    shortDef: 'The mental picture of the world that mediates between people and reality.',
    fullDef: 'Drawing on Walter Lippmann, Rosen uses this term to describe the representations of reality that citizens respond to — not the world itself, but "pictures in their heads." The press constructs this pseudo-environment, which then shapes action in the real world, even when those pictures distort reality.',
    chapter: 'Chapter 7: The Myth of the Omnicompetent Citizen',
    pages: '268-329',
    quote: 'People respond not to the world itself but to "pictures in their heads" — representations that may have little to do with reality.',
    relatedConcepts: ['stereotypes', 'omnicompetent-citizen', 'pictures-in-heads'],
    keyFigure: 'Walter Lippmann',
    contemporary: 'Algorithmic filter bubbles, personalized news feeds, AI-generated content'
  },
  {
    id: 'omnicompetent-citizen',
    term: 'The Omnicompetent Citizen',
    shortDef: 'The impossible ideal of a citizen informed about all public matters.',
    fullDef: 'The classical democratic assumption that average citizens can and should have informed opinions on all public questions. Lippmann argued this expectation is "entirely unworkable" given the scale and complexity of modern society. The press cannot make citizens omnicompetent no matter how well it performs.',
    chapter: 'Chapter 7: The Myth of the Omnicompetent Citizen',
    pages: '268-329',
    quote: 'The expectation that average citizens can have informed opinions on all public questions is "entirely unworkable."',
    relatedConcepts: ['pseudo-environment', 'scale-of-democracy', 'impossible-press'],
    keyFigure: 'Walter Lippmann',
    contemporary: 'Information overload, "do your own research," expertise vs. populism debates'
  },
  {
    id: 'impossible-press',
    term: 'The Impossible Press',
    shortDef: 'A press that promises to solve problems it structurally cannot solve.',
    fullDef: 'The central concept of the dissertation. Professional journalism after 1900 promised to reconcile business imperatives with democratic ideals by adopting professional standards (objectivity, accuracy, fairness). But these standards assume too much about the press-public relationship and ignore fundamental questions about what a public is and how it forms. The press that promises to "inform the public" is impossible because making things public does not make a public.',
    chapter: 'Chapter 6: The Impossible Press',
    pages: '198-267',
    quote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
    relatedConcepts: ['professional-attitude', 'making-public', 'journalism-as-transaction'],
    keyFigure: 'Jay Rosen',
    contemporary: 'Declining trust in media despite fact-checking, "view from nowhere" critique'
  },
  {
    id: 'journalism-as-transaction',
    term: 'Journalism as Transaction',
    shortDef: 'Journalism understood as communication between people, not just journalist activity.',
    fullDef: 'The dissertation\'s foundational reframing: journalism is not merely what journalists do, but what happens between journalists and their audiences. Information is not "in" the news but "in" the relationship between people and their changing environment. This transactional view reveals how much the phrase "the press informs the public" obscures.',
    chapter: 'Introduction',
    pages: '5-12',
    quote: 'Journalism is not an activity conducted solely by journalists; or, to put it another way, journalism is communication and communication is something that takes place between people. It is not an action but a transaction.',
    relatedConcepts: ['information-as-relation', 'impossible-press'],
    keyFigure: 'Jay Rosen',
    contemporary: 'Engagement metrics, audience analytics, participatory journalism'
  },
  {
    id: 'information-as-relation',
    term: 'Information as Relation',
    shortDef: 'Information exists in relationships, not in news items themselves.',
    fullDef: 'A key epistemological move: information is not a substance contained "in" news stories that can be transferred to audiences. Information is relational — it exists in the interaction between people and a changing environment. This means the question is never simply "what information was released?" but "what took shape in the beliefs and behavior of citizens?"',
    chapter: 'Chapter 2: Two Views of News',
    pages: '42-89',
    quote: 'Information is not really "in" the items which come over the wire... It is "in" the relations between people and a changing environment.',
    relatedConcepts: ['journalism-as-transaction', 'three-conditions'],
    keyFigure: 'Jay Rosen',
    contemporary: 'Misinformation spread despite corrections, "information doesn\'t change minds"'
  },
  {
    id: 'communication-without-community',
    term: 'Communication Without Community',
    shortDef: 'Mass communication that connects people who share no actual community.',
    fullDef: 'The modern paradox: we are linked by communication systems to millions of strangers with whom we share no genuine community. The newspaper reader, and later the TV viewer, receives public information in private. This "mobilized privacy" simulates civic connection without creating it. Communication has outrun community.',
    chapter: 'Chapter 5: Communication Without Community',
    pages: '152-197',
    quote: 'Our system of communication is not addressed at the public but at private individuals. We have evolved a radical form of mobilized privacy: the individual hooked into long lines of communication from remote sources.',
    relatedConcepts: ['mobilized-privacy', 'public-formation', 'attention-economy'],
    keyFigure: 'Robert Park, John Dewey',
    contemporary: 'Social media isolation, "alone together," parasocial relationships'
  },
  {
    id: 'mobilized-privacy',
    term: 'Mobilized Privacy',
    shortDef: 'Private individuals connected to remote information sources without genuine public life.',
    fullDef: 'The condition of modern media consumption: individuals sitting alone, receiving public transmissions in private settings. The audience is gathered together without actually meeting. This transforms the nature of public life and the function of the press — we have publicity without public-ness.',
    chapter: 'Chapter 5: Communication Without Community',
    pages: '152-197',
    quote: 'We have evolved a radical form of mobilized privacy: the individual hooked into long lines of communication from remote sources.',
    relatedConcepts: ['communication-without-community', 'public-formation'],
    keyFigure: 'Robert Park',
    contemporary: 'Doomscrolling, streaming alone, "terminally online"'
  },
  {
    id: 'attention-economy',
    term: 'Attention Economy',
    shortDef: 'When attention must be gained rather than granted, content is eclipsed by the struggle to be heard.',
    fullDef: 'As media compete for finite audience attention, the substance of what is communicated becomes secondary to the techniques of capturing notice. This "eclipse of content" reshapes public discourse — what gains attention is not necessarily what informs. The struggle to be heard overwhelms the effort to be understood.',
    chapter: 'Chapter 5: Communication Without Community',
    pages: '152-197',
    quote: 'When attention must be gained rather than granted, the content of public discourse is eclipsed by the struggle to be heard.',
    relatedConcepts: ['news-as-drama', 'sensationalism', 'eclipse-of-content'],
    keyFigure: 'Jay Rosen',
    contemporary: 'Clickbait, engagement metrics, infinite scroll, viral content'
  },
  {
    id: 'news-as-drama',
    term: 'News as Drama',
    shortDef: 'News that requires only spectation, not action.',
    fullDef: 'Rosen distinguishes between news as information (which equips citizens to act) and news as drama (which only requires watching). For news to function as information, three conditions must be met: structure, action, and contingency. The human interest story functions as drama — the journalist becomes a dramatist; the audience becomes spectators rather than participants.',
    chapter: 'Chapter 2: Two Views of News',
    pages: '42-89',
    quote: 'The human interest story functions not as information but as drama — the journalist becomes a dramatist; the audience becomes spectators rather than participants.',
    relatedConcepts: ['three-conditions', 'attention-economy', 'sensationalism'],
    keyFigure: 'Jay Rosen',
    contemporary: 'Outrage media, cable news as entertainment, doomscrolling'
  },
  {
    id: 'three-conditions',
    term: 'Three Conditions for Information',
    shortDef: 'Structure, action, and contingency — what news needs to actually inform.',
    fullDef: 'For news to function as genuine information (not just drama), three conditions must be met: (1) Structure — an ordered understanding of the situation; (2) Action — a feeling of participation and agency; (3) Contingency — unpredictable outcomes that make attention worthwhile. Without these, news becomes spectacle.',
    chapter: 'Chapter 2: Two Views of News',
    pages: '42-89',
    quote: 'For news to function as information, three conditions must be met: structure (an ordered understanding), action (a feeling of participation), and contingency (unpredictable outcomes).',
    relatedConcepts: ['news-as-drama', 'information-as-relation'],
    keyFigure: 'Jay Rosen',
    contemporary: 'Civic engagement decline, "what can I do about it?" fatalism'
  },
  {
    id: 'making-public',
    term: 'Making Things Public ≠ Making a Public',
    shortDef: 'Publishing information does not automatically create an informed public.',
    fullDef: 'One of the dissertation\'s most important insights: the act of making information public does not create a public capable of acting on it. A public is not an audience — it is a social body that forms around shared problems and the capacity for shared action. The press cannot simply "inform the public" because there is no pre-existing public waiting to be informed.',
    chapter: 'Conclusion',
    pages: '374-415',
    quote: 'For any press anywhere, making things public does not a public make.',
    relatedConcepts: ['public-formation', 'impossible-press', 'journalism-as-transaction'],
    keyFigure: 'John Dewey',
    contemporary: 'Viral exposés without accountability, "awareness" that changes nothing'
  },
  {
    id: 'public-formation',
    term: 'Public Formation',
    shortDef: 'A public must be actively created, not merely addressed.',
    fullDef: 'Drawing on Dewey, Rosen argues that a public is something that must be formed through shared understanding of common problems — it does not exist prior to this formation. The press\'s job is not to inform an existing public but to help create one. "Till the Great Society is converted into a Great Community, the Public will remain in eclipse."',
    chapter: 'Chapter 8: The Art and Science of Forming a Public',
    pages: '330-373',
    quote: 'Seeds are sown not by being thrown out at random, but by being so distributed as to take root and have a chance of growth.',
    relatedConcepts: ['making-public', 'great-community', 'communication-without-community'],
    keyFigure: 'John Dewey',
    contemporary: 'Community journalism, engagement journalism, solutions journalism'
  },
  {
    id: 'scale-of-democracy',
    term: 'Scale of Democracy',
    shortDef: 'Democratic theory was built for small communities; scale changes everything.',
    fullDef: 'Democratic theory was developed for small, self-contained communities where citizens could know each other and directly observe public affairs. Extending democracy to a continental republic creates problems the press cannot solve. Jefferson understood this — he advocated for ward republics precisely because he knew democracy required limits on scale.',
    chapter: 'Chapter 1: Democracy and Distance',
    pages: '13-41',
    quote: 'News arrives from a distance. It crosses the space between individuals and events.',
    relatedConcepts: ['omnicompetent-citizen', 'news-as-distance'],
    keyFigure: 'Thomas Jefferson',
    contemporary: 'National vs. local news collapse, hyperlocal experiments'
  },
  {
    id: 'professional-attitude',
    term: 'The Professional Attitude',
    shortDef: 'Journalism\'s professional standards as an inadequate solution to structural problems.',
    fullDef: 'The professionalization of journalism after 1900 was an attempt to reconcile journalism as a business with journalism as a public service. Professional standards (objectivity, accuracy, fairness, completeness) became the standards journalists adopted to prove their public responsibility. But these standards assume too much and ignore fundamental questions about what a public is.',
    chapter: 'Chapter 6: The Impossible Press',
    pages: '198-267',
    quote: 'Professional standards became the standards journalists adopted to prove their public responsibility, but they assume too much and ignore fundamental questions about what a public is.',
    relatedConcepts: ['impossible-press', 'objectivity'],
    keyFigure: 'Jay Rosen',
    contemporary: '"View from nowhere," both-sides-ism, objectivity debates'
  },
  {
    id: 'stereotypes',
    term: 'Stereotypes',
    shortDef: 'Mental shortcuts that work from belief toward reality: we define first, then see.',
    fullDef: 'Drawing on Lippmann, Rosen examines how stereotypes function in the press-public relationship. The stereotype is a form of perception that works from private belief toward reality — we define first and then see. This means the press cannot simply correct stereotypes by presenting facts; the very perception of facts is shaped by prior beliefs.',
    chapter: 'Chapter 7: The Myth of the Omnicompetent Citizen',
    pages: '268-329',
    quote: 'The stereotype is a form of perception that works from private belief toward reality: we define first and then see.',
    relatedConcepts: ['pseudo-environment', 'pictures-in-heads'],
    keyFigure: 'Walter Lippmann',
    contemporary: 'Confirmation bias, motivated reasoning, "facts don\'t change minds"'
  },
  {
    id: 'technological-utopianism',
    term: 'Technological Utopianism',
    shortDef: 'The recurring hope that new communication technology will restore democracy.',
    fullDef: 'Each new communication technology inspires utopian visions of democracy restored — a "universal town meeting." The telegraph, the penny press, radio, television each inspired hopes that technology would solve the scale problem of democracy. These visions consistently ignore the social conditions necessary for genuine public life.',
    chapter: 'Chapter 3: The Universal Town Meeting',
    pages: '90-116',
    quote: 'Improvements in communication also make communication more difficult because they ensure that there will be more to communicate about.',
    relatedConcepts: ['scale-of-democracy', 'communication-without-community'],
    keyFigure: 'Henry David Thoreau',
    contemporary: 'Social media utopianism, Web3 promises, AI will save journalism'
  },
  {
    id: 'lippmann-dewey-debate',
    term: 'The Lippmann-Dewey Debate',
    shortDef: 'The foundational disagreement about whether democracy can survive modern conditions.',
    fullDef: 'The intellectual core of the dissertation. Walter Lippmann argued in Public Opinion (1922) and The Phantom Public (1925) that the average citizen cannot possibly be informed enough to govern. John Dewey responded in The Public and Its Problems (1927) that the answer is not expert rule but the reconstruction of community. They agreed on the diagnosis — the omnicompetent citizen is a myth — but disagreed on the remedy. This tension structures the entire dissertation and much of Rosen\'s later work.',
    chapter: 'Chapters 7-8',
    pages: '268-373',
    quote: 'The trouble lies deeper than the press, and so does the remedy.',
    relatedConcepts: ['omnicompetent-citizen', 'great-community', 'public-formation'],
    keyFigure: 'Walter Lippmann, John Dewey',
    contemporary: 'Expertise vs. populism, "trust the science" debates, technocratic governance'
  },
  {
    id: 'eclipse-of-public',
    term: 'The Eclipse of the Public',
    shortDef: 'Dewey\'s diagnosis that the public has been overwhelmed and rendered incapable of finding itself.',
    fullDef: 'Drawing on Dewey, Rosen describes how the public has been "eclipsed" — not destroyed but rendered unable to recognize itself as a public or to act on shared problems. The sheer scale of modern society, the complexity of its systems, and the inadequacy of communication have left citizens unable to identify common interests. The public exists in theory but cannot form in practice.',
    chapter: 'Chapter 8: The Art and Science of Forming a Public',
    pages: '330-373',
    quote: 'Till the Great Society is converted into a Great Community, the Public will remain in eclipse.',
    relatedConcepts: ['great-community', 'public-formation', 'making-public'],
    keyFigure: 'John Dewey',
    contemporary: 'Voter apathy, political disengagement, "nothing I do matters" fatalism'
  },
  {
    id: 'yellow-journalism',
    term: 'Yellow Journalism',
    shortDef: 'The structural crisis that forced journalism to professionalize — and to promise more than it could deliver.',
    fullDef: 'Rosen treats yellow journalism not as a moral failing but as a structural consequence of the newspaper becoming a mass-market business. When Pulitzer and Hearst competed for readers in the 1890s, they exposed the conflict between private profits and public duties that had been latent in the press since its commercialization. The professionalization movement of the early 1900s was a direct response — an attempt to reconcile business and democracy through professional standards. This is where "the impossible press" was born.',
    chapter: 'Chapter 6: The Impossible Press',
    pages: '198-267',
    quote: 'Yellow journalism put a sharper edge on the conflict between private profits and public duties.',
    relatedConcepts: ['impossible-press', 'professional-attitude'],
    keyFigure: 'Joseph Pulitzer, William Randolph Hearst',
    contemporary: 'Clickbait, engagement-driven content, the attention economy\'s effect on editorial standards'
  },
  {
    id: 'searchlight-metaphor',
    term: 'The Searchlight Metaphor',
    shortDef: 'Lippmann\'s image of the press as a narrow beam that cannot illuminate the whole world.',
    fullDef: 'Lippmann compared the press to a searchlight that moves restlessly about, bringing one episode after another out of darkness into vision. The beam cannot illuminate everything at once. It cannot do the work of a lamp — providing steady, even light. The press can only attend to a few things at a time, which means vast areas of public life remain in darkness. This metaphor captures the structural limits of news coverage that no amount of professional effort can overcome.',
    chapter: 'Chapter 7: The Myth of the Omnicompetent Citizen',
    pages: '268-329',
    quote: 'The press is like the beam of a searchlight that moves restlessly about, bringing one episode and then another out of darkness into vision. Men cannot do the work of the world by this light alone.',
    relatedConcepts: ['omnicompetent-citizen', 'pseudo-environment', 'impossible-press'],
    keyFigure: 'Walter Lippmann',
    contemporary: 'News cycle amnesia, "breaking news" obsession, the inability to sustain coverage of slow-moving crises'
  },
  {
    id: 'great-community',
    term: 'The Great Community',
    shortDef: 'Dewey\'s vision of a revitalized public life built on genuine community, not just communication.',
    fullDef: 'Dewey\'s answer to the eclipse of the public. The Great Society — the vast, interconnected, interdependent modern world — has overwhelmed the small-scale democracy of the past. The remedy is not better information delivery but the reconstruction of community at every level. Communication must become an art, not merely a transmission system. Seeds must be planted so they can take root, not scattered at random. The press cannot create this community, but it can help or hinder its formation.',
    chapter: 'Chapter 8: The Art and Science of Forming a Public',
    pages: '330-373',
    quote: 'Seeds are sown not by being thrown out at random, but by being so distributed as to take root and have a chance of growth.',
    relatedConcepts: ['eclipse-of-public', 'public-formation', 'lippmann-dewey-debate'],
    keyFigure: 'John Dewey',
    contemporary: 'Community journalism, engagement journalism, solutions journalism, mutual aid networks'
  }
];

export const CONCEPT_CATEGORIES = [
  {
    id: 'epistemology',
    name: 'How We Know',
    description: 'Concepts about knowledge, information, and perception',
    concepts: ['pseudo-environment', 'information-as-relation', 'stereotypes', 'three-conditions']
  },
  {
    id: 'public-sphere',
    name: 'The Public',
    description: 'Concepts about public formation and public life',
    concepts: ['omnicompetent-citizen', 'making-public', 'public-formation', 'communication-without-community', 'mobilized-privacy']
  },
  {
    id: 'press-criticism',
    name: 'Press Criticism',
    description: 'Concepts critiquing journalism and media',
    concepts: ['impossible-press', 'journalism-as-transaction', 'professional-attitude', 'news-as-drama']
  },
  {
    id: 'structure',
    name: 'Structural Forces',
    description: 'Concepts about scale, technology, and attention',
    concepts: ['scale-of-democracy', 'attention-economy', 'technological-utopianism']
  }
];

export const KEY_FIGURES = [
  {
    id: 'lippmann',
    name: 'Walter Lippmann',
    role: 'Journalist, author of Public Opinion (1922)',
    relevance: 'Diagnosed the problem of the pseudo-environment and the myth of the omnicompetent citizen. First to argue that classical democratic theory was incompatible with modern conditions.',
    concepts: ['pseudo-environment', 'omnicompetent-citizen', 'stereotypes']
  },
  {
    id: 'dewey',
    name: 'John Dewey',
    role: 'Philosopher, author of The Public and Its Problems (1927)',
    relevance: 'Agreed with Lippmann\'s diagnosis but rejected his elitist solution. Argued for the reconstruction of community as the basis for a revitalized public.',
    concepts: ['public-formation', 'making-public', 'great-community']
  },
  {
    id: 'postman',
    name: 'Neil Postman',
    role: 'Media theorist, dissertation advisor',
    relevance: 'Founder of media ecology. His work on television and public discourse deeply influenced Rosen\'s analysis of how media structure shapes public life.',
    concepts: ['technological-utopianism', 'news-as-drama']
  },
  {
    id: 'park',
    name: 'Robert Park',
    role: 'Sociologist, Chicago School',
    relevance: 'Analyzed how the newspaper creates a new kind of social body — neither traditional community nor mere crowd. His work on "mobilized privacy" is central to Chapter 5.',
    concepts: ['mobilized-privacy', 'communication-without-community', 'public-formation']
  }
];

export const METADATA = {
  title: 'Glossary: The Impossible Press',
  subtitle: 'Key Concepts from Jay Rosen\'s 1986 Dissertation',
  description: 'An interactive guide to the vocabulary and ideas that structure "The Impossible Press: American Journalism and the Decline of Public Life."'
};
