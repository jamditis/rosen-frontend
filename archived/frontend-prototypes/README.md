# Frontend prototypes

This directory preserves product-shaped frontend experiments that are no longer shipped.

## River of News

`RiverOfNews.js` was implemented as a live, relative-time feed but never wired into the archive. The current corpus is historical rather than continuously fresh, so its default Today / Yesterday / This week groups render no useful starting view. Issue #584 archives the source, removes its globally shipped CSS, and makes the full deploy prune any stale public module.
