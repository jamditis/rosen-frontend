# Stewardship proposal contract

The separate [task-event stream contract](TASK_EVENTS.md) defines the offline,
append-only scheduler history for issue #884.

This directory defines the offline version 1 contract for issue #912. It does
not change the closed preservation-manifest schema.

`proposal.schema.json` describes immutable proposals. Object IDs use the same
path-independent `urn:rosen:object:<class>:<source-id>` convention as the
preservation contract. Proposal IDs and decision-event IDs are stable caller
identifiers. They do not claim to be content addresses.

`proposal-contract.mjs` encodes JSON by sorting object keys recursively,
preserving array order, using JSON primitive encoding, and hashing the UTF-8
bytes with SHA-256. It exposes deterministic value and proposal hashes. A
rejection fingerprint binds the object class, object ID, target, relevant
input hash, rule version, generation version, and proposed value.
An undecided proposal with the same fingerprint as a retained rejection is
suppressed even when it omits `duplicateOfProposalId`.

`replayDecisions()` treats array order as authoritative. It rejects duplicate
event IDs across the full input, missing references, stale revisions, and
invalid transitions with an input name and array index. An approval or
rejection changes only a proposed item. A supersession changes only an accepted
or rejected item and retains its full decision history and publication
references. It does not reverse an earlier publication. Projection entries are
ordered by proposal ID code unit so the result does not depend on locale.

Approval eligibility and release eligibility are separate pure checks. Both
compare the proposal input hash with a current hash supplied by the caller.
Only a proposed item is approval eligible. Only an accepted item is release
eligible. A linked successor also needs the original proposal's matching
supersession decision before it can be approved. The projection records this
as `supersessionReady`; the checks do not infer it from the successor link alone.
Only one proposal for an object target can be accepted at a time. The projection
records whether that target is free for each proposal as `targetAvailable` and
names an active reservation in `targetReservedForProposalId`. An explicit
supersession reserves the target for its linked successor. The reservation ends
when that successor is accepted or explicitly rejected.

This slice reads no network source, calls no model, writes no canonical CSV,
and publishes nothing. It provides no durable adapter, append operation,
retry-key transaction, or concurrent-append guarantee.
