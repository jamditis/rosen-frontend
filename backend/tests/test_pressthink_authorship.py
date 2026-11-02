"""Exercise source intake through the real CSV and graph schema boundaries."""

import csv
import json
import subprocess

import pytest

from scripts import pressthink_authorship as graph
from scripts import pressthink_batch_update as source


def write_csv(path, name, rows):
    with (graph.ROOT / "data" / name).open() as original:
        columns = next(csv.reader(original))
    with (path / name).open("w", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        for values in rows:
            writer.writerow({column: values.get(column, "") for column in columns})


def test_new_long_article_has_source_supported_authorship_and_stable_graph_ids(
    tmp_path,
):
    (tmp_path / "record-id-sequence.json").write_text('{"version":1,"high_water":0}')
    write_csv(
        tmp_path,
        "archive_records-public.csv",
        [
            {
                "id": "RECORD-00001",
                "title": "Existing curated article",
                "url": "https://example.test/old/",
            }
        ],
    )
    write_csv(
        tmp_path,
        "extracted_entities.csv",
        [
            {
                "entity_id": "P0005",
                "entity_type": "Person",
                "entity_name": "Jay Rosen",
                "normalized_name": "Jay Rosen",
                "first_mention_record_id": "RECORD-00001",
                "prominence_score": "1",
                "total_mentions": "1",
            }
        ],
    )
    write_csv(tmp_path, "extracted_relationships.csv", [])
    entities_before = (tmp_path / "extracted_entities.csv").read_bytes()
    item = {
        "id": 10903,
        "link": "https://pressthink.org/2017/12/new-article/",
        "status": "publish",
        "type": "post",
        "date": "2017-12-01T09:00:00",
        "date_gmt": "2017-12-01T14:00:00",
        "modified_gmt": "2017-12-02T14:00:00",
        "title": {"rendered": "A new public PressThink article"},
        "content": {
            "rendered": "<p>" + "Public journalism source text. " * 40 + "</p>",
            "protected": False,
        },
        "yoast_head_json": {"author": "Jay Rosen"},
    }
    report = source.run_batch(
        posts=[item],
        csv_path=tmp_path / "archive_records-public.csv",
        history_path=tmp_path / "versions.jsonl",
    )
    graph.run(report, data_dir=tmp_path)
    _, records = graph.read_archive_csv(tmp_path / "archive_records-public.csv")
    _, entities = graph.read_archive_csv(tmp_path / "extracted_entities.csv")
    _, relationships = graph.read_archive_csv(tmp_path / "extracted_relationships.csv")
    assert (
        (tmp_path / "extracted_entities.csv").read_bytes().startswith(entities_before)
    )
    assert len(records[-1]["raw_text"]) >= 500
    assert relationships[0]["source_record_id"] == records[-1]["id"] == "RECORD-00002"
    assert relationships[0]["relationship_type"] == "Authored By"
    assert relationships[0]["source_entity_id"] == "W0001"
    assert relationships[0]["target_entity_id"] == "P0005"
    names = ("extracted_entities.csv", "extracted_relationships.csv")
    once = [(tmp_path / name).read_bytes() for name in names]
    graph.run(report, data_dir=tmp_path)
    assert once == [(tmp_path / name).read_bytes() for name in names]

    # The actual SQLite validator enforces Work -> Person for Authored By.
    program = """
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {validateGraphDataset} = await import(pathToFileURL(process.argv[1]));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const entities = input.entities.map(e => ({id:e.entity_id,type:e.entity_type,name:e.entity_name,normalizedName:e.normalized_name,role:e.role_or_description,affiliation:e.affiliation,prominence:Number(e.prominence_score),firstMentionRecordId:e.first_mention_record_id,totalMentions:Number(e.total_mentions)}));
const ids = entities.map(e => e.id);
const schema = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const registry = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const result = await validateGraphDataset({
 policy:{entityTypes:Object.keys(schema.entity_types),acceptedRelationshipTypes:Object.keys(schema.relationship_types),relationshipTypeHolds:[],generatedPublishedRecordIds:[],relationshipTypeRegistry:registry.types},
 sourceRecords:input.records.map(r=>({id:r.id})),
 publishedRecords:[{id:'RECORD-00002',relatedIds:ids}],
 sourceEntities:entities,publishedEntities:entities,mapEntities:entities,
 relationships:input.relationships.map(r=>({id:r.relationship_id,sourceRecordId:r.source_record_id,sourceEntityId:r.source_entity_id,sourceEntityName:r.source_entity_name,type:r.relationship_type,targetEntityId:r.target_entity_id,targetEntityName:r.target_entity_name,confidence:Number(r.confidence_score)})),
 recordEntityMap:{'RECORD-00002':ids}
});
if(result.relationships!==1) throw new Error('Authorship graph did not survive validation');
"""
    subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            program,
            str(graph.ROOT / "scripts/validate-graph-data.mjs"),
            str(graph.ROOT / "backend/entity_extraction_schema_v3.json"),
            str(graph.ROOT / "data/relationship-type-registry.json"),
        ],
        input=json.dumps(
            {"records": records, "entities": entities, "relationships": relationships}
        ),
        text=True,
        check=True,
        capture_output=True,
    )


def test_conflicting_relationship_identity_is_not_overwritten():
    additions = [
        {
            "record_id": "RECORD-00002",
            "url": "https://pressthink.org/2017/12/article/",
            "title": "Article title",
        }
    ]
    row = {
        "id": "RECORD-00002",
        "author": "Jay Rosen",
        "url": additions[0]["url"],
        "title": "Article title",
        "notes": source.MANAGED_NOTE + "1",
    }
    entities = [
        {"entity_id": "P0005", "entity_type": "Person", "entity_name": "Jay Rosen"}
    ]
    relationships = [
        {
            "relationship_id": "RECORD-00002_REL_001",
            "source_record_id": "RECORD-00002",
            "relationship_type": "Mentions",
            "target_entity_id": "P0005",
        }
    ]
    with pytest.raises(ValueError, match="conflicts"):
        graph.add_authorship(additions, [row], entities, relationships, [], [])
