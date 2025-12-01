# Academic Testimonials & Commentary Feature

**Status:** Proposed — Not Yet Built
**Priority:** Post-Launch Enhancement
**Proposed By:** Joe Amditis, December 2025

---

## Overview

A system allowing pre-approved academics, journalists, and colleagues to submit feedback, testimonials, and scholarly commentary on Jay Rosen's dissertation "The Impossible Press" and the broader archive.

---

## Feature Goals

1. **Collect endorsements** — Short testimonials from notable figures for promotional use
2. **Enable scholarly dialogue** — Longer academic responses and critiques
3. **Document teaching use** — Testimonials from educators using the dissertation in courses
4. **Build credibility** — Demonstrate academic and professional interest in the work
5. **Create community** — Foster ongoing engagement with the dissertation's ideas

---

## Proposed Components

### 1. Testimonial Display Page
- Public-facing page showing approved testimonials
- Filterable by category (Academic, Journalist, Educator, etc.)
- Photos and affiliations displayed
- Links to contributors' work

### 2. Submission System
- Form for submitting testimonials (moderated)
- Pre-approval workflow for known contributors
- Option for short (tweet-length) or long (essay-length) submissions
- Fields: Name, Affiliation, Relationship to Work, Testimonial Text, Photo (optional)

### 3. Admin/Moderation Interface
- Review and approve submissions
- Edit for formatting/typos with contributor approval
- Categorize and tag testimonials
- Feature/highlight specific testimonials

---

## Testimonial Categories

| Category | Description | Target Contributors |
|----------|-------------|---------------------|
| **Academic** | Scholars commenting on intellectual contribution | J-school professors, media scholars, political scientists |
| **Professional** | Journalists reflecting on relevance | Working journalists, editors, media critics |
| **Historical** | People who knew the work when written | Committee members, contemporaries, early readers |
| **Teaching** | Educators using the dissertation | Professors who assign it, instructors using materials |
| **Student** | Graduate students engaging with the work | PhD students, MA students writing about related topics |

---

## Sample Testimonials to Solicit

### Potential Academic Contributors
- Media ecology scholars (Postman's intellectual heirs)
- Public journalism researchers
- Digital media scholars who cite Rosen's work
- Journalism historians
- Democratic theory scholars

### Potential Professional Contributors
- Journalists who've engaged with Rosen's criticism
- Editors who've worked with him
- PressThink commenters over the years
- Public journalism practitioners from the 1990s

### Potential Historical Contributors
- Christine Nystrom (committee member, if available)
- Other Postman students from that era
- Early PressThink readers

---

## Technical Implementation (Proposed)

### Option A: Static (Simple)
- Testimonials hardcoded in `data.js` file
- Manually updated by curator
- No submission form — testimonials collected via email
- Zero backend requirements

### Option B: Google Forms Integration
- Google Form for submissions
- Responses reviewed in Google Sheets
- Approved testimonials manually added to `data.js`
- Minimal backend requirements

### Option C: Full System (Future)
- Database-backed testimonial storage
- Moderation dashboard
- Automated submission workflow
- Requires backend infrastructure

**Recommended for initial launch:** Option A or B

---

## Content Structure

```javascript
// Example testimonial data structure
export const TESTIMONIALS = [
  {
    id: 'unique-id',
    name: 'Scholar Name',
    affiliation: 'University Name',
    title: 'Professor of Media Studies',
    category: 'academic',
    photo: '/assets/testimonials/scholar.jpg', // optional
    shortQuote: 'One sentence pull quote...',
    fullText: 'Longer testimonial text...',
    date: '2025-12',
    featured: true,
    link: 'https://scholar-website.edu' // optional
  }
];
```

---

## UI/UX Considerations

### Display Options
1. **Testimonial Wall** — Grid of cards with photos and quotes
2. **Carousel** — Rotating featured testimonials on homepage
3. **Dedicated Page** — Full page with all testimonials, filterable
4. **Inline** — Relevant testimonials appear alongside dissertation content

### Design Alignment
- Match existing archive aesthetic (Roboto Mono, Special Elite, paper texture)
- Consistent with other dissertation tools
- Mobile responsive
- Accessible (screen reader compatible)

---

## Launch Approach

### Phase 1: Pre-Launch (Before Dec 8)
- Identify 3-5 people Jay knows who could provide quick testimonials
- Collect via email
- Feature on launch materials if received in time

### Phase 2: Soft Launch (Dec 8-31)
- Reach out to broader academic network
- Create simple testimonials display page
- Add link from main archive

### Phase 3: Expanded (Q1 2026)
- Build submission form
- Implement moderation workflow
- Integrate with promotional materials
- Solicit testimonials from journalism schools

---

## Questions for Jay Rosen

1. **Who should we approach first?** — Names of academics or journalists who might provide testimonials
2. **Comfort level with solicitation?** — Should Joe reach out on your behalf, or would you prefer to ask directly?
3. **Review process?** — Do you want to approve all testimonials before publication?
4. **Scope?** — Just dissertation testimonials, or archive-wide?

---

## Success Metrics

- Number of testimonials collected
- Quality/prominence of contributors
- Usage in promotional materials
- Academic citations mentioning the archive
- Teaching adoptions documented

---

## Related Files

- `/release-assets/promotional/` — Where testimonials might be featured
- `/release-assets/archive-launch/press-kit/` — Press kit could include testimonials
- `/future-features/byok-chat/` — Another archived future feature for reference

---

*Proposed December 1, 2025*
*Jay Rosen Digital Archive*
