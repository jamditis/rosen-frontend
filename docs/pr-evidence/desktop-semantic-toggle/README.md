# Desktop semantic toggle evidence

These screenshots compare the desktop archive before and after the semantic
search toggle was added.

- Before source: `6b198bb`
- After source: `5bb4e90`
- Route: `/#desktop/archive`
- Desktop viewport: 1440 x 900
- Phone viewport: 375 x 812, with the Filters drawer open
- Functional fixture query: `journalists explain their values`

| View | Before | After |
| --- | --- | --- |
| Desktop | `before-desktop-1440x900.png` | `after-desktop-1440x900.png` |
| Phone filter drawer | `before-phone-375x812-filters.png` | `after-phone-375x812-filters.png` |

Each capture used a new browser page. Navigation used the structured DOM: open
the route, read an accessibility snapshot, activate the referenced Filters
button for the phone view, and capture the matching viewport. No coordinate
clicks were used.

On the after source, the same structured controls enabled Search by meaning and
submitted the fixture query. The desktop showed 26,865-record coverage and
returned both `Matching words` and `Related meaning` result labels, with no
browser console errors or duplicate DOM IDs.
