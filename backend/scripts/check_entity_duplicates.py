# Check for duplicate entity IDs in extracted_entities sheet

import gspread
import os
from dotenv import load_dotenv
from collections import Counter

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Connect to sheets
gc = gspread.service_account(filename=os.path.join(BASE_DIR, 'google_credentials.json'))
sh = gc.open(os.environ.get('SPREADSHEET_NAME'))
ws = sh.worksheet('extracted_entities')

# Get all data
data = ws.get_all_values()
headers = data[0]
rows = data[1:]

# Analyze entity IDs
entity_ids = [row[0] for row in rows if row[0]]
entity_id_counts = Counter(entity_ids)
duplicates = {eid: count for eid, count in entity_id_counts.items() if count > 1}

print(f"Total entity rows: {len(entity_ids)}")
print(f"Unique entity_ids: {len(set(entity_ids))}")
print(f"Duplicate entity_ids: {len(duplicates)}")

if duplicates:
    print("\nSample duplicate entity_ids:")
    for eid in list(duplicates.keys())[:10]:
        matching_rows = [row for row in rows if row[0] == eid]
        entity_names = set([row[2] for row in matching_rows])  # entity_name is column 2
        print(f"  {eid} ({duplicates[eid]} occurrences): {entity_names}")
else:
    print("\nNo duplicate entity_ids found!")

# Check for same entity name with different IDs
print("\n" + "="*80)
print("Checking for same entity names with different IDs...")

entity_name_to_ids = {}
for row in rows:
    if row[0] and row[2]:  # entity_id and entity_name
        entity_id = row[0]
        entity_name = row[2]
        if entity_name not in entity_name_to_ids:
            entity_name_to_ids[entity_name] = []
        entity_name_to_ids[entity_name].append(entity_id)

# Find entities with multiple IDs
multi_id_entities = {name: ids for name, ids in entity_name_to_ids.items() if len(set(ids)) > 1}

print(f"Total unique entity names: {len(entity_name_to_ids)}")
print(f"Entities with multiple IDs: {len(multi_id_entities)}")

if multi_id_entities:
    print("\nSample entities with multiple IDs (needs deduplication):")
    for name in list(multi_id_entities.keys())[:10]:
        unique_ids = set(multi_id_entities[name])
        print(f"  '{name}': {len(unique_ids)} different IDs - {list(unique_ids)[:5]}")
