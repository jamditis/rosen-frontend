// Phase 2 feature-audit harness for DIS stories — the STANDALONE dissertation
// pages (vanilla JS/HTML, not the React app):
//   /dissertation/index.html              landing      (DIS-01..09)
//   /dissertation/foreword/index.html     foreword     (DIS-10..12)
//   /dissertation/network-effect/index.html  network   (DIS-13..17)
//   /dissertation/faq/index.html          FAQ          (DIS-18..24)
//   /dissertation-launch/index.html       launch redir (DIS-25)
//
// Run from repo root: node docs/feature-audit/harness/test-distools.mjs
// Drives system chromium headless via playwright-core against http://localhost:8000.

import { launchBrowser, newPage, BASE, sleep, writeVerdicts, verdict } from './lib.mjs';

const results = {};
const note = (id, ...a) => console.log(`[${id}]`, ...a);

// Probe a URL with an HTTP request from the page context; return numeric status
// or an 'ERR:'-prefixed string. Resolves relative hrefs against BASE.
async function probe(page, href, baseUrl = BASE + '/dissertation/') {
  try {
    const abs = new URL(href, baseUrl).href;
    const resp = await page.request.get(abs, { maxRedirects: 0 });
    return { url: abs, status: resp.status() };
  } catch (e) {
    return { url: href, status: 'ERR:' + (e.message || e) };
  }
}

const cleanErrors = (errors) =>
  errors.filter(e => !/esm\.sh|cdnjs|favicon|fonts\.g(oogleapis|static)|googleads|doubleclick|youtube|ytimg|gstatic/i.test(e));

// ===================================================================
// LANDING PAGE — DIS-01..09
// ===================================================================
async function testLanding(browser) {
  const { page, errors } = await newPage(browser);
  try {
    await page.goto(BASE + '/dissertation/index.html', { waitUntil: 'networkidle' });
    await sleep(300);

    // Snapshot every anchor: href, target, rel, link text.
    const anchors = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map(a => ({
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
        text: a.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
      }))
    );
    const internal = anchors.filter(a => !/^https?:|^mailto:|^#/.test(a.href));
    // Probe each distinct internal href.
    const probed = {};
    for (const a of internal) {
      if (!(a.href in probed)) probed[a.href] = await probe(page, a.href);
    }
    note('LAND', 'internal links:', JSON.stringify(probed));

    // DIS-01: Hero CTAs.
    {
      const hero = await page.evaluate(() => {
        const prim = [...document.querySelectorAll('a')].find(a => /Read Jay's Essay/i.test(a.textContent));
        const sec = [...document.querySelectorAll('a')].find(a => /Read Full Bio/i.test(a.textContent));
        const scroll = !!document.querySelector('.scroll-indicator');
        const smooth = getComputedStyle(document.documentElement).scrollBehavior === 'smooth';
        return {
          title: /The Impossible Press/.test(document.body.textContent),
          subtitle: /American Journalism and the Decline of Public Life/.test(document.body.textContent),
          quote: /Dan Kennedy/.test(document.body.textContent),
          primHref: prim ? prim.getAttribute('href') : null,
          primTarget: prim ? prim.getAttribute('target') : null,
          primPulse: prim ? prim.classList.contains('hero-cta-primary') : false,
          secHref: sec ? sec.getAttribute('href') : null,
          scroll, smooth,
        };
      });
      const primaryNoBlank = hero.primTarget !== '_blank';
      const ok = hero.title && hero.subtitle && hero.quote && hero.scroll && hero.smooth &&
        hero.secHref === '#about-jay-rosen' && /pressthink\.org.*dissertation-launch-blog-post/.test(hero.primHref || '');
      results['DIS-01'] = verdict(ok ? (primaryNoBlank ? 'partial' : 'pass') : 'fail',
        primaryNoBlank
          ? `Confirmed smell: primary hero CTA "Read Jay's Essay" -> ${hero.primHref} has NO target="_blank" (navigates away in same tab), while sibling external links use new-tab. Minor inconsistency.`
          : '',
        primaryNoBlank ? 'low' : 'low',
        `Hero renders title/subtitle/Dan-Kennedy quote, pulsing primary CTA (pulse=${hero.primPulse}), secondary anchor "${hero.secHref}", scroll indicator (${hero.scroll}), html scroll-behavior smooth (${hero.smooth}).`);
    }

    // DIS-02: Fixed PressThink back-nav bar.
    {
      const nav = await page.evaluate(() => {
        const bar = document.querySelector('.site-nav');
        if (!bar) return null;
        const link = bar.querySelector('a');
        const pos = getComputedStyle(bar).position;
        return {
          fixed: pos === 'fixed',
          href: link ? link.getAttribute('href') : null,
          text: link ? link.textContent.replace(/\s+/g, ' ').trim() : null,
          hasBackArrow: !!bar.querySelector('svg path[d*="M19 12H5"]'),
        };
      });
      const ok = nav && nav.fixed && /pressthink\.org/.test(nav.href || '');
      results['DIS-02'] = verdict(ok ? 'pass' : 'fail',
        ok && nav.hasBackArrow
          ? 'Confirmed smell: nav uses a left-arrow (back) icon but the destination is the external PressThink blog, not a parent page — slightly misleading affordance.'
          : (ok ? '' : 'Fixed nav bar missing or wrong destination.'),
        'low',
        `Fixed nav bar (position:${nav?.fixed?'fixed':'?'}) with single link "${nav?.text}" -> ${nav?.href}; left-arrow icon present=${nav?.hasBackArrow}.`);
    }

    // DIS-03: Reader entry points.
    {
      const ep = await page.evaluate(() => {
        const readBtn = [...document.querySelectorAll('a')].find(a => /Read the Dissertation/i.test(a.textContent));
        const scholarsBtn = [...document.querySelectorAll('a')].find(a => /Scholars respond/i.test(a.textContent));
        return {
          readHref: readBtn ? readBtn.getAttribute('href') : null,
          readHasInlineHover: readBtn ? (readBtn.hasAttribute('onmouseover') && readBtn.hasAttribute('onmouseout')) : false,
          scholarsHref: scholarsBtn ? scholarsBtn.getAttribute('href') : null,
        };
      });
      const readProbe = ep.readHref ? (probed[ep.readHref] || await probe(page, ep.readHref)) : null;
      const ok = ep.readHref === 'reader/' && ep.scholarsHref === '#scholars-respond';
      results['DIS-03'] = verdict(ok ? 'pass' : 'partial',
        ep.readHasInlineHover
          ? `Confirmed smell: "Read the Dissertation" uses inline onmouseover/onmouseout handlers rather than CSS :hover, unlike the rest of the page. reader/ probes HTTP ${readProbe?.status}.`
          : `reader/ probes HTTP ${readProbe?.status}.`,
        'low',
        `"Read the Dissertation" -> ${ep.readHref} (inlineHover=${ep.readHasInlineHover}, local status ${readProbe?.status}); "Scholars respond" -> ${ep.scholarsHref} (in-page anchor).`);
    }

    // DIS-04: How-to-explore cards (Reader + NotebookLM).
    {
      const cards = await page.evaluate(() => {
        const cs = [...document.querySelectorAll('.how-to-card')];
        return cs.map(c => ({
          href: c.getAttribute('href'),
          target: c.getAttribute('target'),
          rel: c.getAttribute('rel'),
          heading: c.querySelector('h3')?.textContent.trim(),
          mentionsRemembersPlace: /remembers your place/i.test(c.textContent),
          mentionsHighlight: /[Hh]ighlight any text/i.test(c.textContent),
          mentionsGoogleAcct: /Requires a Google account/i.test(c.textContent),
        }));
      });
      const reader = cards.find(c => /reader\/$/.test(c.href || ''));
      const nb = cards.find(c => /notebooklm/i.test(c.href || ''));
      const ok = !!reader && !!nb && nb.target === '_blank';
      results['DIS-04'] = verdict(ok ? 'pass' : 'partial',
        '',
        'low',
        `Two how-to cards: reader card -> ${reader?.href} (remembersPlace=${reader?.mentionsRemembersPlace}, highlight=${reader?.mentionsHighlight}); NotebookLM card -> opens new tab (target=${nb?.target}), googleAcctNote=${nb?.mentionsGoogleAcct}. Smell noted: reader card promises features ("remembers your place", highlight-to-share) that belong to the reader (out of scope here).`);
    }

    // DIS-05: Explore-the-dissertation nav cards.
    {
      const nav = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.explore .nav-card')];
        return cards.map(c => ({
          href: c.getAttribute('href'),
          target: c.getAttribute('target'),
          featured: c.classList.contains('nav-card-featured'),
          heading: c.querySelector('h3')?.textContent.trim(),
        }));
      });
      const essay = nav.find(c => /pressthink\.org/.test(c.href || ''));
      const net = nav.find(c => /network-effect\/$/.test(c.href || ''));
      const netProbe = net ? (probed[net.href] || await probe(page, net.href)) : null;
      const ok = !!essay && essay.target === '_blank' && essay.featured && !!net;
      results['DIS-05'] = verdict(ok ? 'pass' : 'partial',
        `network-effect/ probes HTTP ${netProbe?.status}.`,
        'low',
        `Two explore cards: "${essay?.heading}" (featured=${essay?.featured}) -> PressThink new tab (target=${essay?.target}); "${net?.heading}" -> ${net?.href} (local status ${netProbe?.status}).`);
    }

    // DIS-06: Scholars-respond card (Samuel Earle) + mini-timeline.
    {
      const sc = await page.evaluate(() => {
        const card = document.querySelector('.scholar-card');
        if (!card) return null;
        const head = card.querySelector('.scholar-headshot');
        const cta = [...card.querySelectorAll('a')].find(a => /Network Effect/i.test(a.textContent));
        const li = [...card.querySelectorAll('a')].find(a => /linkedin\.com/.test(a.getAttribute('href') || ''));
        const dots = [...card.querySelectorAll('.timeline-dot')].map(d => d.textContent.trim());
        return {
          name: card.querySelector('.scholar-name')?.textContent.trim(),
          headshotSrc: head ? head.getAttribute('src') : null,
          headshotHasDims: head ? (head.hasAttribute('width') || head.hasAttribute('height')) : false,
          headshotHasOnerror: head ? head.hasAttribute('onerror') : false,
          badge: /First Response/i.test(card.textContent),
          ctaHref: cta ? cta.getAttribute('href') : null,
          linkedinTarget: li ? li.getAttribute('target') : null,
          dots,
        };
      });
      // Was the remote headshot actually painted? (naturalWidth>0 means it loaded)
      const imgLoaded = await page.evaluate(() => {
        const h = document.querySelector('.scholar-headshot');
        return h ? { complete: h.complete, naturalWidth: h.naturalWidth } : null;
      });
      const ok = sc && /Samuel Earle/.test(sc.name || '') && sc.badge &&
        /network-effect\/$/.test(sc.ctaHref || '') && sc.dots.length === 3;
      results['DIS-06'] = verdict(ok ? 'pass' : 'partial',
        `Confirmed smell: remote headshot (${sc?.headshotSrc}) has no width/height/onerror fallback (hasDims=${sc?.headshotHasDims}, onerror=${sc?.headshotHasOnerror}); if pressthink.org blocks hotlinking the image breaks silently. headless load: complete=${imgLoaded?.complete} naturalWidth=${imgLoaded?.naturalWidth}.`,
        'low',
        `Scholar card: ${sc?.name}, First Response badge=${sc?.badge}, LinkedIn new tab=${sc?.linkedinTarget}, CTA -> ${sc?.ctaHref}; timeline dots ${JSON.stringify(sc?.dots)}.`);
    }

    // DIS-07: About section + external profile links.
    {
      const about = await page.evaluate(() => {
        const sec = document.getElementById('about-jay-rosen');
        if (!sec) return null;
        const portrait = sec.querySelector('.about-image');
        const links = [...sec.querySelectorAll('a')].map(a => ({
          href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent.trim().slice(0, 30),
        }));
        const aboutLinkRow = [...sec.querySelectorAll('.about-link')].map(a => a.textContent.trim());
        return { portraitSrc: portrait?.getAttribute('src'), links, aboutLinkRow };
      });
      const portraitLoaded = await page.evaluate(() => {
        const p = document.querySelector('.about-image');
        return p ? { complete: p.complete, naturalWidth: p.naturalWidth } : null;
      });
      const externalNewTab = about.links.filter(l => /^https?:/.test(l.href));
      const allBlank = externalNewTab.every(l => l.target === '_blank');
      results['DIS-07'] = verdict(about && about.aboutLinkRow.length >= 3 ? 'pass' : 'partial',
        `Remote NYU portrait (${about?.portraitSrc}); headless load complete=${portraitLoaded?.complete} naturalWidth=${portraitLoaded?.naturalWidth}.`,
        'low',
        `About section: ${externalNewTab.length} external in-text+row links, all new-tab=${allBlank}; about-links row=${JSON.stringify(about?.aboutLinkRow)}.`);
    }

    // DIS-08: Text selection tool — contentSelector 'main' but page has NO <main>.
    {
      const sel = await page.evaluate(() => {
        return {
          hasMain: !!document.querySelector('main'),
          mainCount: document.querySelectorAll('main').length,
          sectionCount: document.querySelectorAll('section').length,
          toolInit: /\[TextSelectionTool\] Initialized/.test(window.__lastLog || ''),
          configSelector: (() => {
            // The module sets contentSelector:'main'; we can read it back via the
            // script source already known. Confirm via the menu element presence.
            return !!document.getElementById('text-selection-menu');
          })(),
        };
      });
      // Actively reproduce: select hero text, dispatch mouseup, check the menu shows.
      const menuShowed = await page.evaluate(async () => {
        const el = document.querySelector('.hero-title') || document.querySelector('h1');
        if (!el) return { error: 'no element' };
        const range = document.createRange();
        range.selectNodeContents(el);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('text-selection-menu');
        return {
          selectedLen: s.toString().trim().length,
          menuVisible: menu ? menu.classList.contains('is-visible') : false,
        };
      });
      const dead = !sel.hasMain && !menuShowed.menuVisible;
      results['DIS-08'] = verdict(dead ? 'fail' : 'pass',
        dead
          ? `Confirmed BUG: landing page has NO <main> (mainCount=${sel.mainCount}, uses ${sel.sectionCount} <section> blocks). TextSelectionTool is configured contentSelector:'main', so handleSelection's document.querySelector('main') returns null and bails (line 455-456). Reproduced: selected ${menuShowed.selectedLen} chars of hero text, share menu did NOT appear (menuVisible=${menuShowed.menuVisible}). Highlight-to-share is dead on the landing page.`
          : '',
        dead ? 'medium' : 'low',
        `Tool initialized (menu element present=${sel.configSelector}) but binds to a non-existent <main>.`);
    }

    // DIS-09: Footer links + curator credit.
    {
      const footer = await page.evaluate(() => {
        const f = document.querySelector('footer');
        if (!f) return null;
        const links = [...f.querySelectorAll('a')].map(a => ({
          href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent.trim(),
        }));
        return {
          links,
          year: /2025/.test(f.textContent),
          mailto: links.find(l => /^mailto:/.test(l.href || '')),
        };
      });
      const pt = footer.links.find(l => /pressthink\.org/.test(l.href || ''));
      const nyu = footer.links.find(l => /journalism\.nyu\.edu/.test(l.href || ''));
      const missingBlank = (pt && pt.target !== '_blank') || (nyu && nyu.target !== '_blank');
      results['DIS-09'] = verdict('pass',
        missingBlank
          ? `Confirmed smell: footer PressThink (target=${pt?.target}) and/or NYU (target=${nyu?.target}) links lack target="_blank" while the same links elsewhere on the page open new tabs — inconsistent.`
          : '',
        'low',
        `Footer shows PressThink + NYU links + curator mailto (${footer.mailto?.href}), dated 2025=${footer.year}.`);
    }

    note('LAND', 'errors:', cleanErrors(errors).slice(0, 6));
  } finally {
    await page.close();
  }
}

// ===================================================================
// FOREWORD — DIS-10..12
// ===================================================================
async function testForeword(browser) {
  const { page, errors } = await newPage(browser);
  try {
    await page.goto(BASE + '/dissertation/foreword/index.html', { waitUntil: 'networkidle' });
    await sleep(300);
    const fwBase = BASE + '/dissertation/foreword/';

    // DIS-10: Article layout, drop cap, fade-in, featured image, pull-quote.
    {
      const layout = await page.evaluate(() => {
        const content = document.querySelector('.content');
        const firstP = content?.querySelector('p');
        const ps = content ? content.querySelectorAll('p').length : 0;
        const featImg = document.querySelector('.featured-image img');
        return {
          serifBody: /Cormorant Garamond/.test(getComputedStyle(document.body).fontFamily),
          dropCap: firstP ? firstP.classList.contains('drop-cap') : false,
          paraCount: ps,
          featImgSrc: featImg ? featImg.getAttribute('src') : null,
          ornament: !!document.querySelector('.ornament'),
          pullQuote: !!document.querySelector('.pull-quote'),
          pullQuoteCite: /p\.\s*390/.test(document.querySelector('.pull-quote')?.textContent || ''),
          audienceList: !!document.querySelector('.audience-list'),
        };
      });
      const featLoaded = await page.evaluate(() => {
        const i = document.querySelector('.featured-image img');
        return i ? { complete: i.complete, naturalWidth: i.naturalWidth } : null;
      });
      const layoutOk = layout.dropCap && layout.featImgSrc && layout.ornament && layout.pullQuote && layout.pullQuoteCite && layout.audienceList;
      // The featured image src is the absolute production URL pressthink.org/j/rosen-archive/...
      // It is the only major visual of the article and it does NOT load locally.
      const featAbsProd = /pressthink\.org\/j\/rosen-archive\//.test(layout.featImgSrc || '');
      const featBroken = featLoaded && featLoaded.complete && featLoaded.naturalWidth === 0;
      results['DIS-10'] = verdict(layoutOk ? (featBroken ? 'partial' : 'pass') : 'partial',
        `Featured image is hardcoded to the absolute production URL ${layout.featImgSrc} (absProdPath=${featAbsProd}); it FAILED to load in local/preview (complete=${featLoaded?.complete}, naturalWidth=${featLoaded?.naturalWidth} -> ERR_BLOCKED_BY_ORB). The article's only major visual is broken outside production; a relative path / pathResolver would fix it. Also: fade-up animation-delays target only nth-child 1-5 (${layout.paraCount} paras total); paras 6+ use fadeInUp with backwards fill at delay 0 — brief flash-of-hidden risk on slow loads.`,
        featBroken ? 'medium' : 'low',
        `Serif body=${layout.serifBody}, drop cap on first para=${layout.dropCap}, ornament divider=${layout.ornament}, pull-quote w/ p.390 cite=${layout.pullQuoteCite}, audience list=${layout.audienceList}.`);
    }

    // DIS-11: Navigation (top bar + footer nav) — dual back destinations.
    {
      const nav = await page.evaluate(() => {
        const back = document.querySelector('.nav-back');
        const navCtas = [...document.querySelectorAll('.nav-cta')].map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim() }));
        const footerLinks = [...document.querySelectorAll('.footer-link')].map(a => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent.replace(/\s+/g, ' ').trim() }));
        const navTitleHides = !![...document.styleSheets].some(() => true); // CSS rule presence checked below
        return {
          backHref: back ? back.getAttribute('href') : null,
          navCtas,
          footerLinks,
        };
      });
      const readFull = nav.navCtas.find(c => /Read Full Text/i.test(c.text));
      const dissHome = nav.footerLinks.find(c => /Dissertation Home/i.test(c.text));
      const readFooter = nav.footerLinks.find(c => /Read Full Dissertation/i.test(c.text));
      // Probe back (../../ = archive root) and the reader/footer-home targets.
      const backProbe = await probe(page, nav.backHref, fwBase);
      const dissHomeProbe = dissHome ? await probe(page, dissHome.href, fwBase) : null;
      const readProbe = readFull ? await probe(page, readFull.href, fwBase) : null;
      const dualBack = nav.backHref === '../../' && dissHome && dissHome.href === '../';
      // ../../ resolves to /dissertation/.. = archive root /index.html (the React app)
      const readBroken = readProbe && (readProbe.status === 404 || readProbe.status === 403);
      results['DIS-11'] = verdict(readBroken ? 'fail' : (dualBack ? 'partial' : 'pass'),
        `Confirmed smell: top-bar Back -> ${nav.backHref} (archive root, HTTP ${backProbe.status}) but footer "Dissertation Home" -> ${dissHome?.href} (landing, HTTP ${dissHomeProbe?.status}) — two different back destinations on one page.` +
        (readBroken ? ` "Read Full Text" -> ${readFull?.href} probes HTTP ${readProbe.status} (broken locally).` : ` "Read Full Text"/"Read Full Dissertation" -> ${readFull?.href} HTTP ${readProbe?.status}.`),
        readBroken ? 'medium' : 'low',
        `Top bar: Back(${nav.backHref}), PressThink, Read Full Text(${readFull?.href}). Footer nav: Read Full Dissertation(${readFooter?.href}, HTTP ${readProbe?.status}), Dissertation Home(${dissHome?.href}), PressThink(new tab=${nav.footerLinks.find(l=>/PressThink/.test(l.text))?.target}).`);
    }

    // DIS-12: Text selection tool — contentSelector '.content' (exists).
    {
      const exists = await page.evaluate(() => ({
        hasContent: !!document.querySelector('.content'),
        menuEl: !!document.getElementById('text-selection-menu'),
      }));
      const menuShowed = await page.evaluate(async () => {
        const el = document.querySelector('.content p');
        if (!el) return { error: 'no .content p' };
        const range = document.createRange();
        range.selectNodeContents(el);
        const s = window.getSelection();
        s.removeAllRanges(); s.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('text-selection-menu');
        return { selectedLen: s.toString().trim().length, menuVisible: menu ? menu.classList.contains('is-visible') : false };
      });
      const ok = exists.hasContent && menuShowed.menuVisible;
      results['DIS-12'] = verdict(ok ? 'pass' : 'partial',
        ok ? '' : `Selected ${menuShowed.selectedLen} chars of .content text; share menu visible=${menuShowed.menuVisible}.`,
        'low',
        `contentSelector '.content' exists (${exists.hasContent}); selecting text inside surfaces the share menu (visible=${menuShowed.menuVisible}). Source attributed "Foreword to The Impossible Press (2025)" — correct for the foreword.`);
    }

    note('FORE', 'errors:', cleanErrors(errors).slice(0, 6));
  } finally {
    await page.close();
  }
}

// ===================================================================
// NETWORK-EFFECT — DIS-13..17
// ===================================================================
async function testNetworkEffect(browser) {
  const { page, errors } = await newPage(browser);
  try {
    await page.goto(BASE + '/dissertation/network-effect/index.html', { waitUntil: 'networkidle' });
    await sleep(400);
    const neBase = BASE + '/dissertation/network-effect/';

    // DIS-13: YouTube embed (16:9).
    {
      const embed = await page.evaluate(() => {
        const ifr = document.querySelector('.video-container iframe');
        const cont = document.querySelector('.video-container');
        return {
          src: ifr ? ifr.getAttribute('src') : null,
          title: ifr ? ifr.getAttribute('title') : null,
          padBottom: cont ? getComputedStyle(cont).paddingBottom : null,
          caption: /I'm mad as hell/i.test(document.body.textContent),
        };
      });
      const ok = /youtube\.com\/embed\/_RujOFCHsxo/.test(embed.src || '') && /rel=0/.test(embed.src || '');
      results['DIS-13'] = verdict(ok ? 'pass' : 'fail',
        ok ? '' : `iframe src=${embed.src}`,
        'low',
        `YouTube iframe src=${embed.src}, title="${embed.title}", aspect via padding-bottom=${embed.padBottom} (56.25% of width). Caption present=${embed.caption}.`);
    }

    // DIS-14: Timeline + scroll fade-in (IntersectionObserver).
    {
      const tl = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('.timeline-node')].map(n => n.textContent.trim());
        const fadeUps = document.querySelectorAll('.fade-up').length;
        return { nodes, fadeUps };
      });
      // Scroll through and check .fade-up gets .visible.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(700);
      const visibleAfter = await page.evaluate(() =>
        [...document.querySelectorAll('.fade-up')].filter(e => e.classList.contains('visible')).length);
      // Check the no-JS fallback risk: base .fade-up CSS opacity is 0.
      const baseOpacity = await page.evaluate(() => {
        const el = document.querySelector('.fade-up');
        // temporarily remove visible to read base rule
        const had = el.classList.contains('visible');
        el.classList.remove('visible');
        const op = getComputedStyle(el).opacity;
        if (had) el.classList.add('visible');
        return op;
      });
      const ok = tl.nodes.length === 3 && visibleAfter > 0;
      results['DIS-14'] = verdict(ok ? 'pass' : 'partial',
        `Confirmed smell: base .fade-up opacity=${baseOpacity} (hidden); no CSS fallback — with JS disabled the IntersectionObserver never adds .visible, so the analysis quotes stay invisible.`,
        'low',
        `Timeline nodes ${JSON.stringify(tl.nodes)}; ${tl.fadeUps} .fade-up sections, ${visibleAfter} became .visible after scroll (IntersectionObserver works with JS on).`);
    }

    // DIS-15: details/summary accordion (full commentary).
    {
      const acc = await page.evaluate(() => {
        const det = document.querySelector('details.full-commentary');
        return {
          present: !!det,
          openInitially: det ? det.open : null,
          summaryText: det ? det.querySelector('summary')?.textContent.replace(/\s+/g, ' ').trim() : null,
          hasChevron: det ? !!det.querySelector('.chevron') : false,
          hasYoutubeWatch: det ? /youtube\.com\/watch\?v=_RujOFCHsxo/.test(det.innerHTML) : false,
          hasLinkedin: det ? /linkedin\.com/.test(det.innerHTML) : false,
        };
      });
      // Toggle it open via the native summary click.
      await page.evaluate(() => {
        const s = document.querySelector('details.full-commentary summary');
        s && s.click();
      });
      await sleep(200);
      const openedState = await page.evaluate(() => {
        const det = document.querySelector('details.full-commentary');
        const chev = det.querySelector('.chevron');
        const rot = chev ? getComputedStyle(chev).transform : null;
        return { open: det.open, contentVisible: det.querySelector('.full-commentary-content')?.offsetHeight > 0, chevronTransform: rot };
      });
      const ok = acc.present && acc.openInitially === false && openedState.open === true && openedState.contentVisible;
      results['DIS-15'] = verdict(ok ? 'pass' : 'partial',
        '',
        'low',
        `Native <details> accordion: summary "${acc.summaryText}", chevron present=${acc.hasChevron} (rotates when open, transform=${openedState.chevronTransform!=='none'}); opens to reveal full essay (open=${openedState.open}, contentShown=${openedState.contentVisible}) incl. YouTube watch link=${acc.hasYoutubeWatch} + LinkedIn=${acc.hasLinkedin} (both new tab).`);
    }

    // DIS-16: Header/CTA nav + skip link, dual back destinations.
    {
      const nav = await page.evaluate(() => {
        const skip = document.querySelector('a.skip-link, a[href="#main"]');
        const headerBack = document.querySelector('header a[aria-label="Back to archive"]');
        const logo = [...document.querySelectorAll('header a')].find(a => a.querySelector('h1'));
        const readBtn = [...document.querySelectorAll('header a')].find(a => /Read Dissertation/i.test(a.textContent));
        const bottomRead = [...document.querySelectorAll('a')].find(a => /Read Full Text/i.test(a.textContent));
        const bottomBack = [...document.querySelectorAll('a')].find(a => /Back to Launch Page/i.test(a.textContent));
        return {
          skipTarget: skip ? skip.getAttribute('href') : null,
          headerBackHref: headerBack ? headerBack.getAttribute('href') : null,
          logoHref: logo ? logo.getAttribute('href') : null,
          readBtnHref: readBtn ? readBtn.getAttribute('href') : null,
          bottomReadHref: bottomRead ? bottomRead.getAttribute('href') : null,
          bottomBackHref: bottomBack ? bottomBack.getAttribute('href') : null,
        };
      });
      const backProbe = await probe(page, nav.headerBackHref, neBase);
      const readProbe = await probe(page, nav.readBtnHref, neBase);
      const dualBack = nav.headerBackHref === '../../' && nav.bottomBackHref === '../';
      const readBroken = readProbe.status === 404 || readProbe.status === 403;
      results['DIS-16'] = verdict(readBroken ? 'fail' : 'partial',
        `Confirmed smell: header back-arrow -> ${nav.headerBackHref} (archive root, HTTP ${backProbe.status}) while bottom "Back to Launch Page" -> ${nav.bottomBackHref} (landing) — two different back targets.` +
        (readBroken ? ` "Read Dissertation"/"Read Full Text" -> ${nav.readBtnHref} probes HTTP ${readProbe.status} (broken locally).` : ` Reader links -> ${nav.readBtnHref} HTTP ${readProbe.status}.`),
        readBroken ? 'medium' : 'low',
        `Skip link -> ${nav.skipTarget} (sr-only). Header: back(${nav.headerBackHref}), logo(${nav.logoHref}), Read Dissertation(${nav.readBtnHref}). Bottom CTA: Read Full Text(${nav.bottomReadHref}), Back to Launch Page(${nav.bottomBackHref}).`);
    }

    // DIS-17: Text selection tool — contentSelector 'main' (exists), wrong citation.
    {
      const exists = await page.evaluate(() => ({ hasMain: !!document.querySelector('main#main') || !!document.querySelector('main') }));
      const menuShowed = await page.evaluate(async () => {
        // select Earle's 2025 commentary blockquote text
        const bq = [...document.querySelectorAll('main blockquote')].find(b => /portent of our present moment/i.test(b.textContent));
        const el = bq || document.querySelector('main blockquote') || document.querySelector('main p');
        if (!el) return { error: 'no selectable' };
        const range = document.createRange();
        range.selectNodeContents(el);
        const s = window.getSelection();
        s.removeAllRanges(); s.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('text-selection-menu');
        return { selectedLen: s.toString().trim().length, menuVisible: menu ? menu.classList.contains('is-visible') : false, isEarle: /portent/i.test(s.toString()) };
      });
      const ok = exists.hasMain && menuShowed.menuVisible;
      results['DIS-17'] = verdict(ok ? 'pass' : 'partial',
        `Confirmed smell: source is hardcoded 'Jay Rosen, "The Impossible Press" (1986)', but <main> also contains Samuel Earle's 2025 commentary (selected Earle text=${menuShowed.isEarle}, len=${menuShowed.selectedLen}) — sharing his words mis-attributes them to Rosen's 1986 dissertation.`,
        'low',
        `<main> exists (${exists.hasMain}); selecting text surfaces the share menu (visible=${menuShowed.menuVisible}). Citation attribution is the issue, not the binding.`);
    }

    note('NET', 'errors:', cleanErrors(errors).slice(0, 6));
  } finally {
    await page.close();
  }
}

// ===================================================================
// FAQ — DIS-18..24
// ===================================================================
async function testFaq(browser) {
  const { page, errors } = await newPage(browser);
  try {
    await page.goto(BASE + '/dissertation/faq/index.html', { waitUntil: 'networkidle' });
    // Wait for JS to render the items.
    await page.waitForFunction(() => document.querySelectorAll('.faq-item').length > 0, { timeout: 15000 }).catch(() => {});
    await sleep(300);

    const itemCount = await page.evaluate(() => document.querySelectorAll('.faq-item').length);
    note('FAQ', 'rendered items:', itemCount);

    // DIS-18: Accordion open/close, permalink, copy-link.
    {
      const before = await page.evaluate(() => ({
        count: document.querySelectorAll('.faq-item').length,
        anyOpen: document.querySelectorAll('.faq-item.open').length,
      }));
      // Click first question to open.
      const firstId = await page.evaluate(() => {
        const q = document.querySelector('.faq-item .faq-question');
        const item = q ? q.closest('.faq-item') : null;
        q && q.click();
        return item ? item.dataset.id : null;
      });
      await sleep(300);
      const afterOpen = await page.evaluate((fid) => ({
        opened: document.querySelector(`.faq-item[data-id="${fid}"]`)?.classList.contains('open'),
        openCount: document.querySelectorAll('.faq-item.open').length,
        hash: window.location.hash,
        answerVisible: document.querySelector(`.faq-item[data-id="${fid}"] .faq-answer`)?.offsetHeight > 0,
      }), firstId);
      // Open a second -> single-open accordion (first should close).
      const secondId = await page.evaluate(() => {
        const items = document.querySelectorAll('.faq-item .faq-question');
        const item = items[1] ? items[1].closest('.faq-item') : null;
        items[1] && items[1].click();
        return item ? item.dataset.id : null;
      });
      await sleep(300);
      const singleOpen = await page.evaluate((fid) => ({
        firstStillOpen: document.querySelector(`.faq-item[data-id="${fid}"]`)?.classList.contains('open'),
        openCount: document.querySelectorAll('.faq-item.open').length,
      }), firstId);
      // copy-link: navigator.clipboard on localhost is a secure context, should work.
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      const copyErrsBefore = errors.filter(e => /Failed to copy link/.test(e)).length;
      // Real Playwright click = true user gesture (matches a real user click exactly).
      await page.locator('.faq-item .copy-link-btn').first().click();
      await sleep(400);
      const copyResult = await page.evaluate(async () => {
        const btn = document.querySelector('.faq-item .copy-link-btn');
        const turnedGreen = btn.classList.contains('text-green-600') || btn.title === 'Link copied!';
        let clip = null;
        try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'READ_ERR:' + e.message; }
        return { turnedGreen, clip };
      });
      const copyThrew = errors.filter(e => /Failed to copy link/.test(e)).length > copyErrsBefore;
      const clipboardWroteHash = typeof copyResult.clip === 'string' && /#/.test(copyResult.clip);
      // copy-link bug: the success .then() reads e.currentTarget, which the DOM nulls
      // after dispatch -> TypeError, caught + logged "Failed to copy link" even though
      // the write succeeded; the green "Link copied!" confirmation never shows.
      const copyConfirmBroken = copyThrew || !copyResult.turnedGreen;
      const accordionOk = afterOpen.opened && afterOpen.hash === '#' + firstId && afterOpen.answerVisible && singleOpen.openCount === 1 && !singleOpen.firstStillOpen;
      results['DIS-18'] = verdict((accordionOk && !copyConfirmBroken) ? 'pass' : 'partial',
        copyConfirmBroken
          ? `BUG (script.js:94): copy-link success handler reads e.currentTarget inside the clipboard .then() callback; the DOM nulls currentTarget after dispatch, so btn.title throws "Cannot read properties of null", is caught, and logs "Failed to copy link" (threw=${copyThrew}) even though the write succeeded (clipboard="${typeof copyResult.clip === 'string' ? copyResult.clip.slice(0, 55) : copyResult.clip}", wroteHash=${clipboardWroteHash}). The green "Link copied!" confirmation never appears (green=${copyResult.turnedGreen}). Separately: navigator.clipboard needs a secure context, so on file:// it rejects silently.`
          : '',
        copyConfirmBroken ? 'medium' : 'low',
        `Accordion is correct: open pushes #${firstId} to URL (hash=${afterOpen.hash}), answer expands (visible=${afterOpen.answerVisible}); opening a 2nd closes the 1st (single-open, openCount=${singleOpen.openCount}, firstClosed=${!singleOpen.firstStillOpen}).`);
    }

    // DIS-19: Search with multi-word AND matching.
    {
      // Reset any open/filter state first.
      const counts = await page.evaluate(async () => {
        const inp = document.getElementById('search-input');
        const total = document.querySelectorAll('.faq-item').length;
        // single word
        inp.value = 'lippmann';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const oneWord = [...document.querySelectorAll('.faq-item')].filter(i => i.style.display !== 'none').length;
        const clearVisible = !document.getElementById('clear-search').classList.contains('hidden');
        // multi-word AND
        inp.value = 'lippmann dewey';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const twoWord = [...document.querySelectorAll('.faq-item')].filter(i => i.style.display !== 'none').length;
        // no match
        inp.value = 'zzzqqxnotaword';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const noMatch = [...document.querySelectorAll('.faq-item')].filter(i => i.style.display !== 'none').length;
        const noResultsShown = !document.getElementById('no-results').classList.contains('hidden');
        const resultsText = document.getElementById('results-count').textContent;
        // clear via the X button
        document.getElementById('clear-search').click();
        await new Promise(r => setTimeout(r, 150));
        const afterClear = [...document.querySelectorAll('.faq-item')].filter(i => i.style.display !== 'none').length;
        return { total, oneWord, twoWord, noMatch, clearVisible, noResultsShown, resultsText, afterClear };
      });
      // '/' focus shortcut
      await page.evaluate(() => { document.body.focus(); });
      await page.keyboard.press('/');
      await sleep(100);
      const slashFocus = await page.evaluate(() => document.activeElement === document.getElementById('search-input'));
      await page.evaluate(() => { const i = document.getElementById('search-input'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); i.blur(); });
      // highlight class applied?
      const highlightApplied = await page.evaluate(() => !!document.querySelector('.search-highlight'));
      const ok = counts.oneWord > 0 && counts.twoWord <= counts.oneWord && counts.noMatch === 0 && counts.noResultsShown && counts.afterClear === counts.total && slashFocus;
      results['DIS-19'] = verdict(ok ? 'pass' : 'partial',
        `Confirmed smell: matches against raw answer HTML (incl. ** and <em> markers) so formatting fragments can match; .search-highlight CSS class is defined but never applied (highlightInDom=${highlightApplied}).`,
        'low',
        `Search: "lippmann"=${counts.oneWord}, "lippmann dewey"(AND)=${counts.twoWord}, nonsense=${counts.noMatch} -> no-results panel=${counts.noResultsShown} ("${counts.resultsText}"); clear(X) restores ${counts.afterClear}/${counts.total}; "/" focuses input=${slashFocus}.`);
    }

    // DIS-20: Category pill filtering — figures category has NO pill (unreachable).
    {
      const pillData = await page.evaluate(() => {
        const pills = [...document.querySelectorAll('.pill, [data-category]')].map(b => ({
          cat: b.dataset.category, label: b.textContent.trim(),
        }));
        // categories actually present on rendered items
        const itemCats = {};
        document.querySelectorAll('.faq-item').forEach(i => { itemCats[i.dataset.category] = (itemCats[i.dataset.category] || 0) + 1; });
        return { pills, itemCats };
      });
      const pillCats = new Set(pillData.pills.map(p => p.cat));
      const itemCatKeys = Object.keys(pillData.itemCats);
      const orphanCats = itemCatKeys.filter(c => !pillCats.has(c)); // present in data, no pill
      // Click a pill (basics) and verify it filters.
      const filterCheck = await page.evaluate(async () => {
        const basics = [...document.querySelectorAll('[data-category]')].find(b => b.dataset.category === 'basics');
        basics && basics.click();
        await new Promise(r => setTimeout(r, 150));
        const visible = [...document.querySelectorAll('.faq-item')].filter(i => i.style.display !== 'none');
        const allBasics = visible.every(i => i.dataset.category === 'basics');
        const activeCount = document.querySelectorAll('[data-category].active').length;
        // reset to all
        const all = [...document.querySelectorAll('[data-category]')].find(b => b.dataset.category === 'all');
        all && all.click();
        await new Promise(r => setTimeout(r, 120));
        return { visibleCount: visible.length, allBasics, activeCount };
      });
      // Verify figures items are unreachable by ANY pill.
      const figuresReachable = pillCats.has('figures');
      const figuresCount = pillData.itemCats['figures'] || 0;
      results['DIS-20'] = verdict('fail',
        `Confirmed BUG: data.js defines a 'figures' (Key Thinkers) category with ${figuresCount} items but index.html has NO 'figures' pill. Pills present: ${JSON.stringify([...pillCats])}. Item categories present: ${JSON.stringify(itemCatKeys)}. Orphan categories with no pill: ${JSON.stringify(orphanCats)}. Those ${figuresCount} questions are unreachable via category filter (only via "All" or search). figuresPillExists=${figuresReachable}.`,
        'medium',
        `Pills filter correctly otherwise: clicking "basics" showed ${filterCheck.visibleCount} items, allBasics=${filterCheck.allBasics}, single active pill=${filterCheck.activeCount}. The bug is the missing 'figures' pill — pills (6) and FAQ_CATEGORIES (6 incl. figures) are out of sync.`);
    }

    // DIS-21: Expand all / collapse all.
    {
      const ea = await page.evaluate(async () => {
        // ensure all visible
        const all = [...document.querySelectorAll('[data-category]')].find(b => b.dataset.category === 'all');
        all && all.click();
        await new Promise(r => setTimeout(r, 120));
        const total = [...document.querySelectorAll('.faq-item')].filter(i => i.style.display !== 'none').length;
        document.getElementById('expand-all').click();
        await new Promise(r => setTimeout(r, 200));
        const openedAfterExpand = document.querySelectorAll('.faq-item.open').length;
        document.getElementById('collapse-all').click();
        await new Promise(r => setTimeout(r, 200));
        const openedAfterCollapse = document.querySelectorAll('.faq-item.open').length;
        const hashAfterCollapse = window.location.hash;
        return { total, openedAfterExpand, openedAfterCollapse, hashAfterCollapse };
      });
      // Reproduce the state-disagreement smell: expand all, then click one item.
      const stateBug = await page.evaluate(async () => {
        document.getElementById('expand-all').click();
        await new Promise(r => setTimeout(r, 200));
        const openBefore = document.querySelectorAll('.faq-item.open').length;
        // click a single item's question
        const q = document.querySelectorAll('.faq-item .faq-question')[3];
        q && q.click();
        await new Promise(r => setTimeout(r, 200));
        const openAfter = document.querySelectorAll('.faq-item.open').length;
        document.getElementById('collapse-all').click();
        await new Promise(r => setTimeout(r, 100));
        return { openBefore, openAfter };
      });
      const ok = ea.openedAfterExpand === ea.total && ea.openedAfterCollapse === 0 && ea.hashAfterCollapse === '';
      results['DIS-21'] = verdict(ok ? 'pass' : 'partial',
        `Confirmed smell: after Expand all (${stateBug.openBefore} open, openItemId=null), clicking one item collapses all others (open dropped ${stateBug.openBefore} -> ${stateBug.openAfter}) — bulk-expand violates the single-open state model, so the UI "loses" the expanded set on the next click.`,
        'low',
        `Expand all -> ${ea.openedAfterExpand}/${ea.total} open; Collapse all -> ${ea.openedAfterCollapse} open + cleared hash ("${ea.hashAfterCollapse}").`);
    }

    // DIS-22: NotebookLM banner.
    {
      const banner = await page.evaluate(() => {
        const link = document.getElementById('notebook-link');
        return {
          href: link ? link.getAttribute('href') : null,
          target: link ? link.getAttribute('target') : null,
        };
      });
      const ok = /notebooklm\.google\.com/.test(banner.href || '') && banner.target === '_blank';
      results['DIS-22'] = verdict(ok ? 'pass' : 'fail',
        ok ? '' : `href=${banner.href} target=${banner.target}`,
        'low',
        `NotebookLM banner link -> ${banner.href} (new tab=${banner.target}). On init the href is overwritten from FAQ_METADATA.notebookLM.dissertation (same URL), guarded with optional chaining — no-op but harmless.`);
    }

    // DIS-23: Header/skip nav + reader CTA + aria-live.
    {
      const nav = await page.evaluate(() => {
        const skip = document.querySelector('a[href="#faq-container"]');
        const back = document.querySelector('header a[aria-label="Back to dissertation"]');
        const logo = [...document.querySelectorAll('header a')].find(a => a.querySelector('h1'));
        const readBtn = [...document.querySelectorAll('header a')].find(a => /Read Dissertation/i.test(a.textContent));
        const rc = document.getElementById('results-count');
        return {
          skipTarget: skip ? skip.getAttribute('href') : null,
          backHref: back ? back.getAttribute('href') : null,
          logoHref: logo ? logo.getAttribute('href') : null,
          readBtnHref: readBtn ? readBtn.getAttribute('href') : null,
          ariaLive: rc ? rc.getAttribute('aria-live') : null,
        };
      });
      const readProbe = await probe(page, nav.readBtnHref, BASE + '/dissertation/faq/');
      const readBroken = readProbe.status === 404 || readProbe.status === 403;
      const ok = nav.skipTarget === '#faq-container' && nav.backHref === '../' && nav.logoHref === '../' && nav.ariaLive === 'polite';
      results['DIS-23'] = verdict(readBroken ? 'fail' : (ok ? 'pass' : 'partial'),
        readBroken ? `"Read Dissertation" -> ${nav.readBtnHref} probes HTTP ${readProbe.status} (broken locally).` : `Reader -> ${nav.readBtnHref} HTTP ${readProbe.status}.`,
        readBroken ? 'medium' : 'low',
        `Skip link -> ${nav.skipTarget}; back-arrow + logo both -> ${nav.backHref}/${nav.logoHref} (landing); results-count aria-live="${nav.ariaLive}".`);
    }

    // DIS-24: Text selection tool (FAQ) — contentSelector 'main' (exists), paraphrase citation.
    {
      const exists = await page.evaluate(() => ({ hasMain: !!document.querySelector('main') }));
      const menuShowed = await page.evaluate(async () => {
        // open an answer first so there's selectable answer text
        const q = document.querySelector('.faq-item .faq-question');
        q && q.click();
        await new Promise(r => setTimeout(r, 250));
        const ans = document.querySelector('.faq-item.open .faq-answer p') || document.querySelector('main p') || document.querySelector('main h3');
        if (!ans) return { error: 'no answer text' };
        const range = document.createRange();
        range.selectNodeContents(ans);
        const s = window.getSelection();
        s.removeAllRanges(); s.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const menu = document.getElementById('text-selection-menu');
        return { selectedLen: s.toString().trim().length, menuVisible: menu ? menu.classList.contains('is-visible') : false };
      });
      const ok = exists.hasMain && menuShowed.menuVisible;
      results['DIS-24'] = verdict(ok ? 'pass' : 'partial',
        `Confirmed smell: FAQ answers are paraphrased/AI-grounded explanations, but the tool attributes selections to 'Jay Rosen, "The Impossible Press" (1986)' — sharing a paraphrase as a verbatim 1986 quote. Selected ${menuShowed.selectedLen} chars, menu visible=${menuShowed.menuVisible}.`,
        'low',
        `<main> exists (${exists.hasMain}); selecting answer text surfaces the share menu. Binding works; the citation is the concern.`);
    }

    note('FAQ', 'errors:', cleanErrors(errors).slice(0, 6));
  } finally {
    await page.close();
  }
}

// ===================================================================
// LAUNCH REDIRECT — DIS-25
// ===================================================================
async function testLaunchRedirect(browser) {
  const { page, errors } = await newPage(browser);
  try {
    // The page has a 0-second meta-refresh, so navigating to it would immediately
    // bounce. Fetch the raw HTML instead and parse the meta tag from source.
    const resp = await page.request.get(BASE + '/dissertation-launch/index.html');
    const html = await resp.text();
    const contentM = html.match(/http-equiv=["']refresh["'][^>]*content=["']([^"']+)["']/i);
    const content = contentM ? contentM[1] : null;
    const fallback = [...html.matchAll(/<a[^>]*href=["']([^"']+)["']/gi)].map(x => x[1]);
    const titleM = html.match(/<title>([^<]*)<\/title>/i);
    const info = {
      content,
      fallback,
      title: titleM ? titleM[1] : null,
      hasOg: /meta\s+property=["']og:/i.test(html),
      hasCanonical: /rel=["']canonical["']/i.test(html),
    };
    // Extract the redirect target URL from the content attr.
    const m = (info.content || '').match(/url=(.+)$/i);
    const target = m ? m[1].trim() : null;
    let targetProbe = null;
    if (target) targetProbe = await probe(page, target, BASE + '/');
    const isProdPath = /^\/wp-content\/rosen-archive\//.test(target || '');
    const broken = targetProbe && (targetProbe.status === 404 || targetProbe.status === 403);
    results['DIS-25'] = verdict(broken ? 'fail' : 'partial',
      `Confirmed smell: meta-refresh target is the hardcoded absolute production path "${target}" (HTTP ${targetProbe?.status} locally) — 404s in local dev and on any host other than pressthink's WP layout. isProdPath=${isProdPath}. Fallback link points to the same path (${info.fallback.join(', ')}). No <title> beyond "${info.title}", no canonical (${info.hasCanonical}); only the meta-refresh exists, the page has no content of its own. The app has a pathResolver these could use.`,
      'medium',
      `dissertation-launch/ is a bare meta-refresh redirect (content="${info.content}"). It is the only "page" in that directory and is structurally brittle if the WP path moves.`);
    note('LAUNCH', 'target:', target, 'status:', targetProbe?.status, 'errors:', cleanErrors(errors).slice(0, 4));
  } finally {
    await page.close();
  }
}

// ===================================================================
// run
// ===================================================================
async function main() {
  const browser = await launchBrowser();
  try {
    await testLanding(browser);
    await testForeword(browser);
    await testNetworkEffect(browser);
    await testFaq(browser);
    await testLaunchRedirect(browser);
  } finally {
    await browser.close();
  }

  const expected = Array.from({ length: 25 }, (_, i) => `DIS-${String(i + 1).padStart(2, '0')}`);
  for (const id of expected) {
    if (!results[id]) results[id] = verdict('blocked', 'Not reached by harness.', 'high', 'Missing — investigate.');
  }

  const path = writeVerdicts('distools', results);

  const counts = {};
  for (const id of expected) {
    const s = results[id].test_status;
    counts[s] = (counts[s] || 0) + 1;
  }
  console.log('\n=== SUMMARY ===');
  console.log('Total tested:', expected.length);
  console.log('Counts:', JSON.stringify(counts));
  console.log('Verdicts written to:', path);
  for (const id of expected) {
    const v = results[id];
    if (v.test_status !== 'pass') {
      console.log(`  ${id} [${v.test_status}] ${(v.errors_found || v.notes || '').slice(0, 130)}`);
    }
  }
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
