import gspread
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
gc = gspread.service_account(filename=os.path.join(BASE_DIR, 'google_credentials.json'))
sh = gc.open(os.environ.get('SPREADSHEET_NAME'))
ws = sh.worksheet('entities_deduplicated')

headers = ws.row_values(1)
print('Headers in entities_deduplicated:')
print(headers)

print('\nSample rows (first 5):')
all_data = ws.get_all_values()
for row in all_data[1:6]:
    print(row)

print(f"\nTotal rows: {len(all_data) - 1}")
