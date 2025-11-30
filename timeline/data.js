// Timeline: From Dissertation to Public Journalism and Beyond
// Tracing how 1986 ideas evolved over 40 years

export const TIMELINE_METADATA = {
  title: 'From Dissertation to Now',
  subtitle: 'How "The Impossible Press" Ideas Evolved Over 40 Years',
  introduction: '<em>The Impossible Press</em> was not an endpoint but a beginning. The ideas Jay Rosen developed in 1986 would evolve through the public journalism movement, PressThink, and ongoing work on the press-public relationship. This timeline traces that intellectual journey.'
};

export const TIMELINE_ENTRIES = [
  {
    id: 'dissertation',
    year: 1986,
    type: 'milestone',
    title: 'The Impossible Press',
    subtitle: 'Ph.D. Dissertation, NYU',
    description: 'Rosen completes his doctoral dissertation under Neil Postman, arguing that professional journalism cannot solve problems rooted in the structure of mass communication itself. The phrase "the press informs the public" obscures more than it reveals.',
    keyIdeas: [
      'Journalism as transaction, not action',
      'Information as relation, not substance',
      'Making things public ≠ making a public',
      'The professional attitude as inadequate solution'
    ],
    dissertationConnection: 'The foundational document. All later work builds on these insights.',
    link: '/tools/dissertation-reader/dist/'
  },
  {
    id: 'nyu-appointment',
    year: 1986,
    type: 'career',
    title: 'Joins NYU Faculty',
    subtitle: 'Department of Journalism',
    description: 'Rosen begins teaching at NYU, where he would remain for his entire career. Teaching journalism while critiquing its foundational assumptions creates productive tension.',
    dissertationConnection: 'The classroom becomes a laboratory for testing and refining dissertation ideas.'
  },
  {
    id: 'public-journalism-begins',
    year: 1993,
    type: 'milestone',
    title: 'Public Journalism Emerges',
    subtitle: 'A reform movement takes shape',
    description: 'Rosen becomes a leading voice in "public journalism" (also called "civic journalism") — a reform movement arguing that newspapers should actively help citizens participate in public life, not just report on it.',
    keyIdeas: [
      'Journalism should help form publics, not just inform them',
      'Citizens are participants, not just audiences',
      'The press has obligations beyond objectivity'
    ],
    dissertationConnection: 'Direct application of dissertation\'s argument that "making things public does not a public make." If a public must be formed, journalism should help form it.'
  },
  {
    id: 'getting-the-connections-right',
    year: 1996,
    type: 'publication',
    title: 'Getting the Connections Right',
    subtitle: 'Book on Public Journalism',
    description: 'Rosen\'s book-length treatment of public journalism, arguing that the press must see itself as a participant in public life, not a detached observer. The "connections" are between press, public, and politics.',
    keyIdeas: [
      'The press as participant in democracy',
      'Beyond the "journalism of information"',
      'Reconnecting journalism to civic life'
    ],
    dissertationConnection: 'Extends Chapter 8\'s argument that "a public is something that must be created through shared understanding of common problems."'
  },
  {
    id: 'what-are-journalists-for',
    year: 1999,
    type: 'publication',
    title: 'What Are Journalists For?',
    subtitle: 'Defining the profession\'s purpose',
    description: 'Another major book, asking the question the dissertation showed was never adequately answered: what is journalism actually supposed to accomplish in a democracy?',
    keyIdeas: [
      'Journalism\'s purpose is contested, not given',
      'The public as something to be made, not found',
      'Professional norms need rethinking'
    ],
    dissertationConnection: 'Directly continues the dissertation\'s critique of "the impossible press" — a press that promises what it cannot deliver.'
  },
  {
    id: 'pressthink-launches',
    year: 2003,
    type: 'milestone',
    title: 'PressThink Launches',
    subtitle: 'Blogging as press criticism',
    description: 'Rosen starts PressThink, one of the first academic blogs and among the most influential in media criticism. The blog becomes a vehicle for developing and disseminating ideas that began in the dissertation.',
    keyIdeas: [
      'Real-time press criticism',
      'Direct engagement with journalists and readers',
      'Testing ideas in public dialogue'
    ],
    dissertationConnection: 'The blog form itself enacts dissertation insights about the transactional nature of communication. Writing becomes dialogue.',
    link: 'https://pressthink.org'
  },
  {
    id: 'view-from-nowhere',
    year: 2003,
    type: 'concept',
    title: '"The View from Nowhere"',
    subtitle: 'A concept enters the discourse',
    description: 'Rosen coins "the view from nowhere" to describe the stance of artificial neutrality that professional journalism adopts. The phrase becomes widely used in media criticism.',
    keyIdeas: [
      'Objectivity as a performance, not a reality',
      'The false claim to stand outside politics',
      'Neutrality as a form of bias'
    ],
    dissertationConnection: 'Extends Chapter 6\'s critique of "the professional attitude" — the belief that professional norms can solve structural problems.'
  },
  {
    id: 'audience-atomization',
    year: 2009,
    type: 'concept',
    title: '"Audience Atomization Overcome"',
    subtitle: 'Understanding social media\'s potential',
    description: 'Rosen argues that the internet has overcome "audience atomization" — the condition where audience members are connected to the media but not to each other. This changes everything about the press-public relationship.',
    keyIdeas: [
      'Audiences can now connect horizontally',
      'The one-to-many broadcast model is broken',
      'New possibilities for public formation'
    ],
    dissertationConnection: 'Directly updates Chapter 5\'s analysis of "communication without community" and "mobilized privacy." Technology has changed the conditions.'
  },
  {
    id: 'people-formerly-known',
    year: 2006,
    type: 'concept',
    title: '"The People Formerly Known as the Audience"',
    subtitle: 'A manifesto goes viral',
    description: 'Rosen\'s blog post declaring that the passive audience of the broadcast era is over becomes one of the most-cited pieces of digital media criticism.',
    keyIdeas: [
      'Audiences are now producers too',
      'The broadcast model is finished',
      'Power has shifted from institutions to networks'
    ],
    dissertationConnection: 'The transformation the dissertation couldn\'t anticipate: what happens when audiences can talk back and publish themselves?',
    link: 'https://pressthink.org/2006/06/the-people-formerly-known-as-the-audience/'
  },
  {
    id: 'studio-20',
    year: 2010,
    type: 'career',
    title: 'Studio 20 Program',
    subtitle: 'Teaching entrepreneurial journalism',
    description: 'Rosen launches Studio 20 at NYU, a graduate program focused on journalism innovation and new business models. The program takes seriously that the old model is broken.',
    dissertationConnection: 'If "the impossible press" was built on an unsustainable model, what comes next? Studio 20 explores alternatives.'
  },
  {
    id: 'trump-era',
    year: 2016,
    type: 'period',
    title: 'The Trump Era',
    subtitle: 'The professional model faces crisis',
    description: 'The 2016 election and its aftermath become a stress test for professional journalism. Rosen\'s critiques of "the view from nowhere" and false balance gain new urgency.',
    keyIdeas: [
      'Both-sides journalism fails asymmetric situations',
      'The professional model wasn\'t built for this',
      'Trust collapse accelerates'
    ],
    dissertationConnection: 'The crisis the dissertation predicted: professional standards cannot solve political epistemology problems. The impossible press meets impossible politics.'
  },
  {
    id: 'subscriber-model',
    year: 2017,
    type: 'concept',
    title: 'The Subscriber Model of Trust',
    subtitle: 'Rethinking the business-public relationship',
    description: 'As news organizations shift to subscription models, Rosen analyzes how this changes the relationship between press and public. Subscribers are a different kind of public than advertisers\' audiences.',
    dissertationConnection: 'A new answer to the dissertation\'s question about the relationship between journalism as business and journalism as public service.'
  },
  {
    id: 'pandemic-journalism',
    year: 2020,
    type: 'period',
    title: 'Pandemic and Information Crisis',
    subtitle: 'When getting it right matters',
    description: 'COVID-19 creates urgent questions about how journalism can inform a public about complex, evolving scientific questions when misinformation spreads faster than facts.',
    dissertationConnection: 'The pandemic tests every dissertation insight: pseudo-environments, the limits of "informing," the gap between publication and understanding.'
  },
  {
    id: 'dissertation-release',
    year: 2025,
    type: 'milestone',
    title: 'Dissertation Released Publicly',
    subtitle: 'December 2025',
    description: 'Nearly 40 years after its completion, "The Impossible Press" is made publicly available for the first time, allowing readers to see the intellectual foundations of Rosen\'s later work.',
    dissertationConnection: 'The origin document becomes available, revealing how much of the later work was already present in embryonic form.',
    link: '/tools/dissertation-reader/dist/'
  }
];

export const RECURRING_THEMES = [
  {
    theme: 'The press cannot solve problems it didn\'t create',
    instances: [
      { year: 1986, context: 'The impossible press thesis' },
      { year: 1996, context: 'Public journalism\'s realistic aims' },
      { year: 2016, context: 'Trump coverage limitations' }
    ]
  },
  {
    theme: 'A public must be formed, not just informed',
    instances: [
      { year: 1986, context: 'Dewey vs. Lippmann analysis' },
      { year: 1993, context: 'Public journalism rationale' },
      { year: 2009, context: 'Audience atomization overcome' }
    ]
  },
  {
    theme: 'Professional norms are insufficient',
    instances: [
      { year: 1986, context: 'Critique of professional attitude' },
      { year: 2003, context: 'View from nowhere' },
      { year: 2016, context: 'Both-sides-ism critique' }
    ]
  }
];

export const ENTRY_TYPES = {
  milestone: { label: 'Milestone', color: 'amber' },
  publication: { label: 'Publication', color: 'sky' },
  concept: { label: 'Key Concept', color: 'emerald' },
  career: { label: 'Career', color: 'violet' },
  period: { label: 'Period', color: 'rose' }
};
