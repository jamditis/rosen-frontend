import { ROUTES } from '../services/viewState.js?v=3.8.34';

const APP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const APP_GROUPS = new Set(['explore', 'research', 'help']);
const APP_SURFACES = new Set(['desktop', 'start']);
const AVAILABILITY_STATES = new Set(['ready', 'planned', 'blocked']);
const LAUNCH_KINDS = new Set(['route', 'shell', 'action', 'path']);
const TOOL_STATUSES = new Set(['ready', 'beta', 'experimental']);
const ROUTE_DESTINATIONS = new Set(Object.values(ROUTES));
const PATH_DESTINATIONS = new Set([
  'features/participate/',
  'features/winer-method/',
]);

const freezeApp = (app) => Object.freeze({
  ...app,
  surfaces: Object.freeze([...(app.surfaces || [])]),
  launch: app.launch ? Object.freeze({ ...app.launch }) : null,
});

export const DESKTOP_APPS = Object.freeze([
  {
    id: 'archive',
    label: 'Archive',
    description: 'Search and browse the canonical record collection.',
    icon: 'archive',
    group: 'explore',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'archive' },
  },
  {
    id: 'folders',
    label: 'Folders',
    description: 'Enter the collection through its thematic folders.',
    icon: 'folders',
    group: 'explore',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'folders' },
  },
  {
    id: 'start',
    label: 'Start here',
    description: 'Choose a guided path into the archive.',
    icon: 'start',
    group: 'explore',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'start' },
  },
  {
    id: 'findings',
    label: 'Selected findings',
    description: 'An authored trail through real archive records.',
    icon: 'findings',
    group: 'explore',
    surfaces: ['start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'findings' },
  },
  {
    id: 'entities',
    label: 'People & ideas',
    description: 'Trace people, organizations, concepts, and relationships.',
    icon: 'entities',
    group: 'research',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'entities' },
  },
  {
    id: 'dissertation',
    label: 'Dissertation',
    description: 'Explore The Impossible Press through its mind map.',
    icon: 'dissertation',
    group: 'research',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'dissertation' },
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'View patterns across the archive at collection scale.',
    icon: 'analytics',
    group: 'research',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'analytics' },
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Open maintained reading and research tools.',
    icon: 'tools',
    group: 'research',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'tools' },
  },
  {
    id: 'method',
    label: 'The method',
    description: 'See a bounded, evidence-backed archive method demonstration.',
    icon: 'method',
    group: 'research',
    surfaces: ['start'],
    availability: 'ready',
    launch: { kind: 'path', destination: 'features/winer-method/' },
  },
  {
    id: 'about',
    label: 'About the archive',
    description: 'Read about the collection, its scope, and its curator.',
    icon: 'about',
    group: 'help',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'route', destination: ROUTES.about },
  },
  {
    id: 'report',
    label: 'Report a problem',
    description: 'Tell the curator about a broken link or archive error.',
    icon: 'report',
    group: 'help',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'action', destination: 'report' },
  },
  {
    id: 'readme',
    label: 'Read me',
    description: 'Learn what this desktop is and how to move around it.',
    icon: 'readme',
    group: 'help',
    surfaces: ['desktop', 'start'],
    availability: 'ready',
    launch: { kind: 'shell', destination: 'readme' },
  },
  {
    id: 'participate',
    label: 'Participate',
    description: 'Approved ways to support and contribute to the archive.',
    icon: 'participate',
    group: 'help',
    surfaces: ['start'],
    availability: 'ready',
    launch: { kind: 'path', destination: 'features/participate/' },
  },
  {
    id: 'making-of',
    label: 'How it was made',
    description: 'The curator-approved making-of narrative.',
    icon: 'making-of',
    group: 'help',
    surfaces: [],
    availability: 'blocked',
    availabilityNote: 'Connect only after the interview and editorial gates are complete and the curator gives explicit publication approval.',
    launch: null,
  },
].map(freezeApp));

export const DESKTOP_TOOL_LINKS = Object.freeze([
  {
    id: 'method-demo',
    label: 'Archive method demonstration',
    description: 'Follow an independent, evidence-backed example built from 11 frozen public-source records.',
    icon: 'method',
    href: 'features/winer-method/',
    status: 'experimental',
  },
  {
    id: 'dissertation-release',
    label: 'Dissertation release',
    description: 'Context, responses, and paths through The Impossible Press.',
    icon: 'dissertation',
    href: 'dissertation/',
    status: 'ready',
  },
  {
    id: 'dissertation-reader',
    label: 'Dissertation reader',
    description: 'Read the complete 1986 dissertation with navigation and citations.',
    icon: 'readme',
    href: 'dissertation/reader/',
    status: 'ready',
  },
  {
    id: 'foreword',
    label: 'Foreword',
    description: 'Read the foreword to the public dissertation release.',
    icon: 'readme',
    href: 'dissertation/foreword/',
    status: 'ready',
  },
  {
    id: 'network-effect',
    label: 'Network and public life',
    description: 'Follow an illustrated path from the film Network to the dissertation.',
    icon: 'findings',
    href: 'dissertation/network-effect/',
    status: 'ready',
  },
  {
    id: 'faq',
    label: 'Archive FAQ',
    description: 'Answers about the archive and the dissertation.',
    icon: 'about',
    href: 'faq/',
    status: 'ready',
  },
  {
    id: 'dataviz',
    label: 'Data visualization',
    description: 'Filter the archive and inspect charts and collection statistics.',
    icon: 'analytics',
    href: 'tools/active/dataviz/dataviz.html',
    status: 'beta',
  },
].map((tool) => Object.freeze({ ...tool })));

export function validateDesktopToolLinks(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new TypeError('Desktop tool registry must be a non-empty array');
  }

  const ids = new Set();
  const destinations = new Set();
  for (const tool of tools) {
    if (!APP_ID_PATTERN.test(tool?.id || '')) {
      throw new TypeError(`Invalid desktop tool id: ${tool?.id || '(missing)'}`);
    }
    if (ids.has(tool.id)) {
      throw new TypeError(`Duplicate desktop tool id: ${tool.id}`);
    }
    ids.add(tool.id);

    for (const field of ['label', 'description', 'icon']) {
      if (typeof tool[field] !== 'string' || tool[field].trim() === '') {
        throw new TypeError(`Desktop tool ${tool.id} needs a ${field}`);
      }
    }
    if (!TOOL_STATUSES.has(tool.status)) {
      throw new TypeError(`Desktop tool ${tool.id} has an unknown status`);
    }

    const href = tool.href;
    const pathSegments = typeof href === 'string' ? href.split('/') : [];
    const hasSafePath = typeof href === 'string'
      && /^[a-z0-9][a-z0-9._/-]*$/.test(href)
      && !href.includes('//')
      && !pathSegments.some((segment) => segment === '.' || segment === '..')
      && (href.endsWith('/') || href.endsWith('.html'));
    if (!hasSafePath) {
      throw new TypeError(`Desktop tool ${tool.id} has an unsafe standalone destination`);
    }
    if (destinations.has(href)) {
      throw new TypeError(`Duplicate desktop tool destination: ${href}`);
    }
    destinations.add(href);
  }

  return true;
}

export function validateDesktopRegistry(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    throw new TypeError('Desktop app registry must be a non-empty array');
  }

  const ids = new Set();
  for (const app of registry) {
    if (!APP_ID_PATTERN.test(app?.id || '')) {
      throw new TypeError(`Invalid desktop app id: ${app?.id || '(missing)'}`);
    }
    if (ids.has(app.id)) {
      throw new TypeError(`Duplicate desktop app id: ${app.id}`);
    }
    ids.add(app.id);

    if (typeof app.label !== 'string' || app.label.trim() === '') {
      throw new TypeError(`Desktop app ${app.id} needs a label`);
    }
    if (typeof app.description !== 'string' || app.description.trim() === '') {
      throw new TypeError(`Desktop app ${app.id} needs a description`);
    }
    if (typeof app.icon !== 'string' || app.icon.trim() === '') {
      throw new TypeError(`Desktop app ${app.id} needs an icon key`);
    }
    if (!APP_GROUPS.has(app.group)) {
      throw new TypeError(`Desktop app ${app.id} has an unknown group`);
    }
    if (!AVAILABILITY_STATES.has(app.availability)) {
      throw new TypeError(`Desktop app ${app.id} has an unknown availability state`);
    }
    if (!Array.isArray(app.surfaces) || app.surfaces.some((surface) => !APP_SURFACES.has(surface))) {
      throw new TypeError(`Desktop app ${app.id} has an invalid surface`);
    }
    if (new Set(app.surfaces).size !== app.surfaces.length) {
      throw new TypeError(`Desktop app ${app.id} repeats a surface`);
    }

    if (app.availability !== 'ready') {
      if (app.surfaces.length > 0 || app.launch !== null) {
        throw new TypeError(`Unavailable desktop app ${app.id} must not be actionable`);
      }
      if (typeof app.availabilityNote !== 'string' || app.availabilityNote.trim() === '') {
        throw new TypeError(`Unavailable desktop app ${app.id} needs a dependency note`);
      }
      continue;
    }

    if (app.surfaces.length === 0) {
      throw new TypeError(`Ready desktop app ${app.id} needs a surface`);
    }
    if (!app.launch || !LAUNCH_KINDS.has(app.launch.kind)) {
      throw new TypeError(`Ready desktop app ${app.id} has an invalid launch kind`);
    }
    if (app.launch.kind === 'route' && (
      !ROUTE_DESTINATIONS.has(app.launch.destination) || app.launch.destination === ROUTES.desktop
    )) {
      throw new TypeError(`Desktop app ${app.id} has an unknown route destination`);
    }
    if (app.launch.kind === 'shell' && app.launch.destination !== app.id) {
      throw new TypeError(`Desktop app ${app.id} must use its id as the shell destination`);
    }
    if (app.launch.kind === 'action' && app.launch.destination !== 'report') {
      throw new TypeError(`Desktop app ${app.id} has an unknown action destination`);
    }
    if (app.launch.kind === 'path' && !PATH_DESTINATIONS.has(app.launch.destination)) {
      throw new TypeError(`Desktop app ${app.id} has an unknown standalone destination`);
    }
  }

  return true;
}

validateDesktopRegistry(DESKTOP_APPS);
validateDesktopToolLinks(DESKTOP_TOOL_LINKS);

export const getReadyDesktopApps = () => DESKTOP_APPS.filter((app) => app.availability === 'ready');

export const getDesktopApp = (id) => DESKTOP_APPS.find((app) => app.id === id) || null;
