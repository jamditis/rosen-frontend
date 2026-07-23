/**
 * Root-scope service-worker bridge.
 *
 * A worker can control only its own directory by default. Keeping the main
 * implementation under frontend/ previously limited it to /frontend/ while
 * the archive document lives one level above. Register this stable bridge at
 * the deployed site root and load the versioned implementation from there.
 */
importScripts('./frontend/sw.js');
