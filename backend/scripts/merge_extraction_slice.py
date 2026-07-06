#!/usr/bin/env python3
"""Merge an entity-extraction slice proposal into the canonical entity graph.

A slice proposal is the reviewable output of an extraction run over a batch of
records (see the 9c social-post slice). It is a pair of CSVs -- proposed_entities.csv
and proposed_relationships.csv -- whose schema matches the canonical
data/extracted_entities.csv and data/extracted_relationships.csv, with entity ids
already continued from the current per-type maxima so a clean append cannot collide.

This tool applies a proposal to the canonical CSVs with hard invariants, checked
before anything is written. It refuses to write unless all of them hold, so an
inconsistent graph is never produced:

  1. Every proposed entity_id is non-blank, unique across the whole proposal, and
     disjoint from the existing canonical ids. A blank id, an id repeated across two
     proposed rows, or an id that already exists would let a relationship bind to the
     wrong entity, so any of these is a hard error.
  2. Every kept relationship_id is non-blank, unique within the kept set, and disjoint
     from the existing canonical relationship ids.
  3. Every kept relationship references two non-blank entity ids that exist in the
     merged graph (existing entities plus the kept new ones). A relationship whose
     source or target is a dropped entity -- e.g. a Concept excluded by --keep-types --
     or is blank or unknown is not a valid edge and is left out.

--keep-types filters which proposed entity types are merged. Relationships are then
filtered to those invariant 3 accepts, so dropping a type automatically drops its edges
rather than leaving them dangling.

Appended cells are formula-escaped with the canonical sanitize_csv_value (the same helper
entity_csv_writer.py uses), so a proposal value led by = + - @ -- e.g. an @handle from a
tweet -- is stored escaped like every other canonical row and unescaped again by
data/export-archive-data.js on read.

Each canonical file is replaced atomically via a temp sibling. Both successors are staged
before either is moved into place, so a failure while preparing them changes nothing, and
the two moves are adjacent. If the second move fails the first is rolled back. A hard crash
in the narrow window between the two moves can leave entities merged but relationships not;
a re-run then detects the already-present entity ids and refuses, so that state is
recoverable rather than silently corrupt. The default is a dry run that writes nothing;
pass --apply to perform the merge, then regenerate the archive JSON
(node data/export-archive-data.js) so archive-entities.json reflects the new graph.
"""

import argparse
import csv
import importlib.util
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Reuse the canonical formula-injection escape so appended rows match how every other
# canonical row is stored. Load it by file path to keep this a plain-python script,
# independent of the poetry-installed package and its heavier __init__ imports.
_CSV_SAFETY_PATH = Path(__file__).resolve().parent.parent / 'src' / 'rosen_scraper' / 'csv_safety.py'
_spec = importlib.util.spec_from_file_location('rosen_csv_safety', _CSV_SAFETY_PATH)
_csv_safety = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_csv_safety)
sanitize_csv_value = _csv_safety.sanitize_csv_value

# The canonical schemas. The proposal must present exactly these columns so an append
# is a straight row copy with no field mapping; a mismatch is a hard error, not a guess.
ENTITY_COLUMNS = [
    'entity_id', 'entity_type', 'entity_name', 'normalized_name', 'role_or_description',
    'affiliation', 'prominence_score', 'first_mention_record_id', 'total_mentions',
    'related_entities', 'notes',
]
RELATIONSHIP_COLUMNS = [
    'relationship_id', 'source_record_id', 'source_entity_id', 'source_entity_name',
    'relationship_type', 'target_entity_id', 'target_entity_name', 'context_snippet',
    'confidence_score', 'extracted_date',
]

DEFAULT_KEEP_TYPES = ['Person', 'Organization', 'Work', 'Event', 'Location']


def _read_csv(path, expected_columns, label):
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != expected_columns:
            sys.exit(
                f'{label}: column mismatch.\n  expected: {expected_columns}\n'
                f'  found:    {reader.fieldnames}'
            )
        rows = list(reader)
    # DictReader tolerates ragged rows even when the header matches: a short row leaves
    # missing cells as None (which would crash a later .strip()), and a long row collects
    # the overflow under a None key (which passes a dry run but breaks the append). Reject
    # either shape here as an explicit refusal rather than crashing or writing later.
    ncols = len(expected_columns)
    for offset, row in enumerate(rows):
        record = offset + 1
        if None in row:
            sys.exit(f'{label}: data row {record} has more columns than the {ncols}-column header')
        if any(value is None for value in row.values()):
            sys.exit(f'{label}: data row {record} has fewer columns than the {ncols}-column header')
    return rows


def _stage_appended(path, columns, new_rows):
    # Build path's successor in a temp sibling without moving it into place yet: copy the
    # existing file byte-for-byte (so committed rows keep their exact quoting and are not
    # re-serialized into a spurious diff), add a newline if the file lacked a terminal one
    # (else the first appended row would splice onto the last record), then append the new
    # rows with every cell formula-escaped so the whole file keeps one escape convention.
    # Returns (tmp, backup): the caller moves tmp into place and uses backup to roll back.
    backup = str(path) + '.premerge'
    shutil.copyfile(path, backup)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name + '.', suffix='.tmp')
    os.close(fd)
    try:
        shutil.copyfile(path, tmp)
        needs_newline = False
        if os.path.getsize(tmp) > 0:
            with open(tmp, 'rb') as probe:
                probe.seek(-1, os.SEEK_END)
                needs_newline = probe.read(1) != b'\n'
        with open(tmp, 'a', newline='', encoding='utf-8') as f:
            if needs_newline:
                f.write('\n')
            writer = csv.DictWriter(f, fieldnames=columns)
            for r in new_rows:
                writer.writerow({k: sanitize_csv_value(v) for k, v in r.items()})
    except BaseException:
        for leftover in (tmp, backup):
            if os.path.exists(leftover):
                os.unlink(leftover)
        raise
    return tmp, backup


def _apply_atomic(ent_path, ent_rows, rel_path, rel_rows):
    # Stage both successor files before moving either in, so a failure preparing them
    # changes nothing. Then the two os.replace calls are adjacent; if the second fails,
    # restore entities from its pre-merge backup so neither file is left changed. The
    # finally clears any temp or backup left behind on either the success or failure path.
    ent_tmp, ent_backup = _stage_appended(ent_path, ENTITY_COLUMNS, ent_rows)
    rel_tmp = rel_backup = None
    try:
        rel_tmp, rel_backup = _stage_appended(rel_path, RELATIONSHIP_COLUMNS, rel_rows)
        os.replace(ent_tmp, ent_path)
        ent_tmp = None  # consumed by the rename
        try:
            os.replace(rel_tmp, rel_path)
            rel_tmp = None  # consumed by the rename
        except BaseException:
            # entities already moved; put them back with an atomic rename, not a truncating
            # copy, so a failure during rollback cannot leave extracted_entities.csv empty.
            os.replace(ent_backup, ent_path)
            ent_backup = None  # consumed by the rollback rename
            raise
    finally:
        for leftover in (ent_tmp, rel_tmp, ent_backup, rel_backup):
            if leftover and os.path.exists(leftover):
                os.unlink(leftover)


def _validate_proposal_entity_ids(prop_ent, existing_ent_ids):
    # Invariant 1, checked across the whole proposal before --keep-types is applied, so
    # a dropped-type row cannot smuggle in a blank, duplicated, or already-existing id
    # that a kept relationship would then bind to the wrong entity.
    problems = []
    blank = [r for r in prop_ent if not r['entity_id'].strip()]
    if blank:
        problems.append(f'{len(blank)} proposed entities have a blank entity_id')

    seen, internal_dupes = set(), set()
    for r in prop_ent:
        eid = r['entity_id'].strip()
        if eid and eid in seen:
            internal_dupes.add(eid)
        seen.add(eid)
    if internal_dupes:
        problems.append(f'proposed entities repeat entity_id(s): {sorted(internal_dupes)[:10]}')

    existing_collisions = sorted({r['entity_id'].strip() for r in prop_ent} & existing_ent_ids)
    if existing_collisions:
        problems.append(f'proposed entity_id(s) already exist in canonical: {existing_collisions[:10]}')
    return problems


def _validate_proposal_relationship_ids(prop_rel, existing_rel_ids):
    # Invariant 2, checked across the whole proposal -- symmetric with the entity_id checks --
    # so a duplicate relationship_id cannot hide in a row that later drops for a missing or
    # dropped-type endpoint and silently mask an id-allocation bug in the slice.
    problems = []
    blank = [r for r in prop_rel if not r['relationship_id'].strip()]
    if blank:
        problems.append(f'{len(blank)} proposed relationships have a blank relationship_id')

    seen, internal_dupes = set(), set()
    for r in prop_rel:
        rid = r['relationship_id'].strip()
        if rid and rid in seen:
            internal_dupes.add(rid)
        seen.add(rid)
    if internal_dupes:
        problems.append(f'proposed relationships repeat relationship_id(s): {sorted(internal_dupes)[:10]}')

    existing_collisions = sorted({r['relationship_id'].strip() for r in prop_rel} & existing_rel_ids)
    if existing_collisions:
        problems.append(f'proposed relationship_id(s) already exist in canonical: {existing_collisions[:10]}')
    return problems


def _malformed_id_problems(prop_ent, prop_rel):
    # Every id check below compares raw stripped id strings, and relationship endpoints are
    # matched against those same strings; for that to be sound, every id must persist on disk
    # exactly as its raw stripped value. Two things break that and are refused here:
    #   - surrounding whitespace: the trimmed form validates but the padded form is written,
    #     so an appended entity can carry an id no edge matches (and vice versa);
    #   - a formula-triggering leading char (= + - @ tab CR LF): sanitize_csv_value escapes it
    #     on append, so the stored id differs from the validated one, and a later run reads the
    #     escaped canonical id without unescaping -- a raw-vs-stored id collision the checks miss.
    # Real ids are type-prefixed alphanumerics, so this only ever rejects a malformed proposal.
    problems = []
    ent_padded = sum(1 for r in prop_ent if r['entity_id'] != r['entity_id'].strip())
    if ent_padded:
        problems.append(f'{ent_padded} proposed entity row(s) have surrounding whitespace in entity_id')
    ent_escaped = sum(1 for r in prop_ent if sanitize_csv_value(r['entity_id']) != r['entity_id'])
    if ent_escaped:
        problems.append(f'{ent_escaped} proposed entity row(s) have a formula-triggering entity_id')

    rel_id_fields = ('relationship_id', 'source_entity_id', 'target_entity_id')
    rel_padded = sum(1 for r in prop_rel if any(r[f] != r[f].strip() for f in rel_id_fields))
    if rel_padded:
        problems.append(f'{rel_padded} proposed relationship row(s) have surrounding whitespace in an id field')
    rel_escaped = sum(1 for r in prop_rel if any(sanitize_csv_value(r[f]) != r[f] for f in rel_id_fields))
    if rel_escaped:
        problems.append(f'{rel_escaped} proposed relationship row(s) have a formula-triggering id field')
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--slice-dir', required=True, type=Path,
                    help='directory holding proposed_entities.csv and proposed_relationships.csv')
    ap.add_argument('--entities-csv', type=Path, default=Path('data/extracted_entities.csv'),
                    help='canonical entities CSV to append to')
    ap.add_argument('--relationships-csv', type=Path, default=Path('data/extracted_relationships.csv'),
                    help='canonical relationships CSV to append to')
    ap.add_argument('--keep-types', nargs='+', default=DEFAULT_KEEP_TYPES,
                    help='entity types to merge; other types (and their edges) are dropped')
    ap.add_argument('--apply', action='store_true',
                    help='write the append; without it this is a dry run that changes nothing')
    args = ap.parse_args()

    keep_types = set(args.keep_types)

    existing_ent = _read_csv(args.entities_csv, ENTITY_COLUMNS, 'canonical entities')
    existing_rel = _read_csv(args.relationships_csv, RELATIONSHIP_COLUMNS, 'canonical relationships')
    prop_ent = _read_csv(args.slice_dir / 'proposed_entities.csv', ENTITY_COLUMNS, 'proposed entities')
    prop_rel = _read_csv(args.slice_dir / 'proposed_relationships.csv', RELATIONSHIP_COLUMNS, 'proposed relationships')

    existing_ent_ids = {r['entity_id'].strip() for r in existing_ent}
    existing_rel_ids = {r['relationship_id'].strip() for r in existing_rel}

    problems = _malformed_id_problems(prop_ent, prop_rel)
    problems += _validate_proposal_entity_ids(prop_ent, existing_ent_ids)
    problems += _validate_proposal_relationship_ids(prop_rel, existing_rel_ids)

    kept_ent = [r for r in prop_ent if r['entity_type'] in keep_types]
    dropped_types = sorted({r['entity_type'] for r in prop_ent if r['entity_type'] not in keep_types})
    kept_ent_ids = {r['entity_id'].strip() for r in kept_ent}
    all_prop_ent_ids = {r['entity_id'].strip() for r in prop_ent}
    # merged_ids holds only non-blank ids (invariant 1 rejects blank proposed ids; an
    # existing blank id, if any, is excluded here so it cannot validate a blank endpoint).
    merged_ids = {i for i in (existing_ent_ids | kept_ent_ids) if i}
    # known_ids is every id that exists somewhere -- canonical or any proposed entity of any
    # type -- used to tell an intentionally dropped-type endpoint from a malformed one.
    known_ids = {i for i in (existing_ent_ids | all_prop_ent_ids) if i}

    # Invariant 3: keep a relationship only if both endpoints are in the merged graph. An
    # endpoint that is blank, or references an id that exists nowhere (canonical or proposal),
    # is a malformed edge -- a slice bug -- so refuse rather than silently drop it. An endpoint
    # that is a known proposed entity of a --keep-types-excluded type is dropped on purpose.
    kept_rel, dropped_type_rel, malformed_rel = [], [], []
    for r in prop_rel:
        src, tgt = r['source_entity_id'].strip(), r['target_entity_id'].strip()
        if not src or not tgt or src not in known_ids or tgt not in known_ids:
            malformed_rel.append(r)
        elif src in merged_ids and tgt in merged_ids:
            kept_rel.append(r)
        else:
            dropped_type_rel.append(r)
    if malformed_rel:
        problems.append(f'{len(malformed_rel)} proposed relationship(s) reference a blank or unknown entity id')

    print('== entity merge ==')
    print(f'  proposed: {len(prop_ent)}  keep(types={sorted(keep_types)}): {len(kept_ent)}  '
          f'drop(types={dropped_types}): {len(prop_ent) - len(kept_ent)}')
    print('== relationship merge ==')
    print(f'  proposed: {len(prop_rel)}  keep(both endpoints in merged graph): {len(kept_rel)}  '
          f'drop(endpoint is a dropped-type entity): {len(dropped_type_rel)}  '
          f'malformed(blank/unknown endpoint): {len(malformed_rel)}')
    print('== result if applied ==')
    print(f'  entities: {len(existing_ent)} + {len(kept_ent)} = {len(existing_ent) + len(kept_ent)}')
    print(f'  relationships: {len(existing_rel)} + {len(kept_rel)} = {len(existing_rel) + len(kept_rel)}')

    if problems:
        sys.exit('REFUSING to merge; fix these first:\n  - ' + '\n  - '.join(problems))

    if not args.apply:
        print('\ndry run: nothing written. Re-run with --apply to append.')
        return

    _apply_atomic(args.entities_csv, kept_ent, args.relationships_csv, kept_rel)
    print(f'\napplied: appended {len(kept_ent)} entities and {len(kept_rel)} relationships.')
    print('Regenerate JSON: node data/export-archive-data.js')


if __name__ == '__main__':
    main()
