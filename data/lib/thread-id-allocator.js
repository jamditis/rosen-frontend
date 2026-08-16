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
