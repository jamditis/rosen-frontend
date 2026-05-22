/**
 * EntityDataLoader — port for loading Archive entity data.
 *
 * The Entity Index is built from the payload this port resolves to.
 * Production wires httpCachedLoader; tests wire inMemoryLoader.
 *
 * The port has one method, loadEntityData. The Entity Index never
 * mentions fetch, sessionStorage, or localStorage — those concerns
 * live behind whichever adapter is wired at the composition root.
 *
 * @typedef {Object} EntityDataPayload
 * @property {Array<{id: string, type: string, prominence?: number, name?: string}>} entities
 *   Every Entity in the Archive. Never null. Empty array if none.
 * @property {Array<{id: string, relatedIds: string[]}>} records
 *   Record-shaped entries with their entity references. relatedIds is
 *   always an array (possibly empty — the dissertation Record has none).
 *
 * @typedef {Object} EntityDataLoader
 * @property {() => Promise<EntityDataPayload>} loadEntityData
 *   Resolves to the payload. Single-flight: concurrent calls share the
 *   same Promise. Rejects with an Error on network/parse failure —
 *   never resolves with empty arrays to mask a failure.
 */

export {};
