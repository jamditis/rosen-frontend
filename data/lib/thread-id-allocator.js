const THREAD_ID_PATTERN = /^THREAD-(\d{5})$/;

function compareStableText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function threadNumber(threadId) {
  const match = THREAD_ID_PATTERN.exec(threadId);
  if (!match || Number(match[1]) < 1) {
    throw new Error(`noncanonical thread ID ${threadId}`);
  }
  return Number(match[1]);
}

function threadRootId(record) {
  const threadId = record?.id;
  threadNumber(threadId);

  const rootId = record?.thread_data?.thread_id;
  if (typeof rootId !== 'string' || !rootId.trim()) {
    throw new Error(`${threadId} has no thread root ID`);
  }
  if (rootId !== rootId.trim()) {
    throw new Error(`${threadId} has a noncanonical thread root ID`);
  }

  const firstPostId = record?.thread_data?.posts?.[0]?.id;
  if (firstPostId && firstPostId !== rootId) {
    throw new Error(`${threadId} root ${rootId} disagrees with first post ${firstPostId}`);
  }
  return rootId;
}

function assertRecordList(records, label) {
  if (!Array.isArray(records)) throw new Error(`${label} must be an array`);
}

function isVerifiedSourceRow(row) {
  const value = row?.verified ?? row?.Verified;
  return value === true || value === 'TRUE' || value === 'true' || value === 'Yes';
}

function supportsNewJayThread(post) {
  const row = post?.row;
  const text = value => String(value ?? '').trim();
  return text(row?.author).toLowerCase() === 'jay rosen'
    && text(row?.platform) === 'Bluesky'
    && /^https:\/\/bsky\.app\/profile\/jayrosen\.bsky\.social\/post\/[^/?#]+\/?$/.test(text(row?.url))
    && text(row?.permissions) === 'Public Post'
    && text(row?.date_processed).length > 0
    && ['TRUE', 'FALSE'].includes(text(row?.verified).toUpperCase())
    && text(row?.raw_text || row?.excerpt).length > 0;
}

function supportedThreadCandidate(candidate) {
  if (candidate?.alreadyCovered === true) return candidate;
  const posts = candidate?.posts ?? [];
  const retained = [];
  const includedAncestors = [];
  for (const post of posts) {
    // Depth follows the source reply path. A dropped parent also keeps its
    // descendants outside the container, without inventing a replacement link.
    includedAncestors.length = post.depth;
    const parentIncluded = post.depth === 0 || includedAncestors[post.depth - 1] === true;
    const included = parentIncluded && supportsNewJayThread(post);
    includedAncestors.push(included);
    if (included) retained.push(post);
  }
  return retained.length === posts.length ? candidate : {
    ...candidate,
    posts: retained,
    postIds: retained.map(post => post.row.id || post.row.ID),
  };
}

/**
 * Keep existing thread coverage and require an admitted member for new threads.
 * Context-only members remain available inside a mixed admitted thread, but an
 * all-context chain does not receive an ID or enter the public member filter.
 * Media-only and unsupported historical branches stay ungrouped; they cannot
 * form a source-supported text thread or suppress otherwise admitted posts.
 */
export function selectPublishableThreadCandidates(candidates) {
  assertRecordList(candidates, 'threadCandidates');
  return candidates.map(supportedThreadCandidate).filter(candidate => (
    candidate?.alreadyCovered === true
    || (candidate?.posts?.length >= 3
      && candidate.posts.some(post => isVerifiedSourceRow(post?.row)))
  ));
}

/**
 * Assign stable container IDs to detected Bluesky thread roots.
 *
 * The prior runtime artifact is the identity registry. Current source THREAD
 * rows also reserve their IDs. Known roots keep their prior ID. New roots get
 * monotonically increasing IDs in root-ID order, so input order cannot change
 * the result.
 */
export function assignStableThreadIds({
  priorRuntimeRecords,
  sourceThreadRecords,
  detectedRootIds,
}) {
  assertRecordList(priorRuntimeRecords, 'priorRuntimeRecords');
  assertRecordList(sourceThreadRecords, 'sourceThreadRecords');
  assertRecordList(detectedRootIds, 'detectedRootIds');

  const rootByThreadId = new Map();
  const threadIdByRoot = new Map();
  let maxThreadNumber = 0;

  const register = record => {
    const threadId = record?.id;
    const number = threadNumber(threadId);
    const rootId = threadRootId(record);
    const existingRoot = rootByThreadId.get(threadId);
    const existingThreadId = threadIdByRoot.get(rootId);

    if (existingRoot && existingRoot !== rootId) {
      throw new Error(`${threadId} maps to both ${existingRoot} and ${rootId}`);
    }
    if (existingThreadId && existingThreadId !== threadId) {
      throw new Error(`root ${rootId} maps to both ${existingThreadId} and ${threadId}`);
    }

    rootByThreadId.set(threadId, rootId);
    threadIdByRoot.set(rootId, threadId);
    maxThreadNumber = Math.max(maxThreadNumber, number);
  };

  for (const record of priorRuntimeRecords) register(record);
  for (const record of sourceThreadRecords) register(record);

  const currentRoots = new Set();
  for (const rootId of detectedRootIds) {
    if (typeof rootId !== 'string' || !rootId.trim()) {
      throw new Error('empty thread root ID');
    }
    if (rootId !== rootId.trim()) {
      throw new Error(`noncanonical thread root ID ${rootId}`);
    }
    if (currentRoots.has(rootId)) {
      throw new Error(`duplicate current thread root ${rootId}`);
    }
    currentRoots.add(rootId);
  }

  const assignments = new Map();
  for (const rootId of [...currentRoots].sort(compareStableText)) {
    let threadId = threadIdByRoot.get(rootId);
    if (!threadId) {
      maxThreadNumber += 1;
      if (maxThreadNumber > 99_999) throw new Error('THREAD ID range is exhausted');
      threadId = `THREAD-${String(maxThreadNumber).padStart(5, '0')}`;
      rootByThreadId.set(threadId, rootId);
      threadIdByRoot.set(rootId, threadId);
    }
    assignments.set(rootId, threadId);
  }

  return assignments;
}
