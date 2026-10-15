# Desktop semantic toggle evidence

These screenshots compare the desktop archive before and after the semantic
search toggle was added.

- Before source: `1179d0c33b35c9b1cac4dc4a4e809a67b761533a`
- After source: `9fde729844ba32c484b577945735abe749d74a87`
- Route: `/#desktop/archive`
- Desktop viewport: 1440 x 900
- Phone viewport: 375 x 812, with the Filters drawer open
- Functional fixture query: `journalists explain their values`

| View | Before | After |
| --- | --- | --- |
| Desktop | `before-desktop-1440x900.png` | `after-desktop-1440x900.png` |
| Phone filter drawer | `before-phone-375x812-filters.png` | `after-phone-375x812-filters.png` |

Each current capture used a new browser session against an isolated loopback
preview of its exact source. Both previews loaded the same 26,865 records and
60,745 autocomplete items. Navigation used the structured DOM: open the route,
read an accessibility snapshot, activate the referenced Filters button for the
phone view, and capture the matching viewport. Chrome's sandbox stayed enabled.
No coordinate clicks were used.

On the after source, the same structured controls enabled Search by meaning and
submitted the fixture query. The desktop returned 45 records with `Words and
meaning`, `Matching words`, and `Related meaning` result labels. The standard
archive and desktop archive each kept one semantic status region and unique
control IDs. The desktop folder view kept the opt-in state with its own unique
ID. The phone control supported Tab, Space, and Escape without losing focus.
No browser console errors or duplicate DOM IDs appeared.

The final drawer guard also passed a matched browser regression: Escape closes
the nested help dialog first and restores focus to its visible help button. A
second Escape closes the drawer and restores focus to Filters. The screenshots
above remain unchanged by this keyboard-only repair.
