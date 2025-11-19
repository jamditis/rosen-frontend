
import Papa from 'papaparse';
import { DATA_CONFIG, ERAS } from '../constants.js';

export const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return Math.abs(hash);
};

const cleanTags = (str) => {
  if (!str) return [];
  return str.replace(/[\[\]"']/g, '').split(/[;,]/)
    .map(s => s.trim())
    .filter(s => s && s.length > 0 && !s.startsWith('='));
};

const formatDate = (str) => {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

const getEra = (dateStr) => {
  const y = new Date(dateStr).getFullYear();
  if (y < 2000) return ERAS[0];
  if (y < 2010) return ERAS[1];
  if (y < 2020) return ERAS[2];
  return ERAS[3];
};

const DISSERTATION_RECORD = {
  id: 'dissertation-1986',
  title: 'The Impossible Press: American Journalism and the Decline of Public Life',
  author: 'Jay Rosen',
  date: '1986-01-01',
  year: '1986',
  era: 'Public Journalism (90s)', 
  pub: 'New York University (Ph.D. Dissertation)',
  url: 'https://drive.google.com/file/d/14sIj3nYzOaV_CRHLMRvbgv9EcYbCsp4L/view?usp=sharing',
  summary: 'Rosen\'s doctoral dissertation traces the history of the idea that the function of the press is to inform the public. It argues that the rise of the mass circulation newspaper, while creating a technical ability to reach everyone, actually undermined the conditions necessary for a "universal town meeting." Drawing heavily on Walter Lippmann and John Dewey, it suggests that the professionalization of journalism ("objectivity") was a retreat from the problem of creating a genuine public life in a complex society. It contrasts news as "symptom" vs. news as "symbol" and explores how the press creates a "pseudo-environment" of public opinion.',
  quote: 'An impossible press was born, one which sought to solve the whole problem of public life simply by controlling the conduct of journalists.',
  categories: ['Journalism History', 'Democratic Theory', 'Press Criticism', 'Public Life'],
  concepts: ['Public Sphere', 'Omnicompetent Citizen', 'Objectivity', 'Mass Society', 'Professionalism', 'Communication vs Community', 'Democracy and Distance'],
  tags: ['Walter Lippmann', 'John Dewey', 'James Gordon Bennett', 'Joseph Pulitzer', 'Penny Press', 'Yellow Journalism', 'Robert Park', 'Tocqueville'],
  verified: true,
  type: 'Dissertation'
};

const fetchCSV = (url) => {
  return new Promise((resolve) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: () => resolve([]) 
    });
  });
};

export const fetchArchiveData = async () => {
  const [testRunsData, socialPostsData, relationshipsData] = await Promise.all([
    fetchCSV(DATA_CONFIG.test_runs),
    fetchCSV(DATA_CONFIG.social_posts),
    fetchCSV(DATA_CONFIG.relationships)
  ]);

  const categories = new Set();
  const publications = new Set();
  const searchTerms = new Set();
  
  const relationshipsMap = {};
  relationshipsData.forEach(rel => {
     const source = rel['Source'] || rel['source'];
     const target = rel['Target'] || rel['target'];
     if(source && target) {
         if(!relationshipsMap[source]) relationshipsMap[source] = [];
         if(!relationshipsMap[target]) relationshipsMap[target] = [];
         if(!relationshipsMap[source].includes(target)) relationshipsMap[source].push(target);
         if(!relationshipsMap[target].includes(source)) relationshipsMap[target].push(source);
     }
  });

  const processRecord = (row, index, type) => {
      const rawCats = row.Thematic_Categories || row.thematic_categories || row.Categories || '';
      const rawConcepts = row.Key_Concepts || row.key_concepts || row.Concepts || '';
      const rawTags = row.Tags || row.tags || '';
      const rawDate = row.Publication_Date || row.publication_date || row.Date || '';
      const rawPub = row.Original_Publication || row.original_publication || row.Platform || 'Unknown';
      const rawTitle = row.Title || row.title || row.Content || 'Untitled';
      const rawId = row.ID || row.id || `${type}-${index}`;
      const rawUrl = row.URL || row.url || '#';
      
      let author = (row.Author || row.author || 'Jay Rosen').trim();

      const cats = cleanTags(rawCats);
      const concepts = cleanTags(rawConcepts);
      const tags = cleanTags(rawTags);
      const date = formatDate(rawDate);
      const pub = rawPub.trim();
      const title = rawTitle.trim();
      
      const displayTitle = (type === 'social' && title.length > 100) 
          ? title.substring(0, 100) + '...' 
          : title;

      cats.forEach(c => { categories.add(c); searchTerms.add(c); });
      concepts.forEach(c => searchTerms.add(c));
      tags.forEach(t => searchTerms.add(t));
      if (pub && pub.length > 2) { publications.add(pub); searchTerms.add(pub); }
      if (displayTitle.length > 3) searchTerms.add(displayTitle);

      const directRelIds = relationshipsMap[rawId] || [];

      return {
        id: rawId,
        title: displayTitle,
        author: author,
        date: date,
        year: date ? date.split('-')[0] : '',
        era: getEra(date),
        pub: pub,
        url: rawUrl,
        summary: (row.Summary || row.summary || title), 
        quote: (row.Pull_Quote || row.pull_quote || ''),
        categories: cats,
        concepts: concepts,
        tags: tags,
        verified: (row.Verified || row.verified) === 'TRUE' || type === 'social', 
        type: type, 
        relatedIds: directRelIds
      };
  };

  const mainRecords = testRunsData.map((row, i) => processRecord(row, i, 'article'));
  const socialRecords = socialPostsData.map((row, i) => processRecord(row, i, 'social'));

  let allRecords = [...mainRecords, ...socialRecords];
  allRecords.push({ ...DISSERTATION_RECORD, relatedIds: [] });
  
  allRecords = allRecords.filter(r => r.verified && r.title);
  allRecords.sort((a, b) => b.date.localeCompare(a.date));

  DISSERTATION_RECORD.categories.forEach(c => { categories.add(c); searchTerms.add(c); });
  DISSERTATION_RECORD.concepts.forEach(c => searchTerms.add(c));
  DISSERTATION_RECORD.tags.forEach(t => searchTerms.add(t));
  searchTerms.add(DISSERTATION_RECORD.title);

  return {
    records: allRecords,
    facets: {
      categories: Array.from(categories).sort(),
      eras: ERAS,
      publications: Array.from(publications).sort()
    },
    autocompleteIndex: Array.from(searchTerms).sort()
  };
};
