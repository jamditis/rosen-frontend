import { html } from '../html.js?v=3.8.14';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { sanitizeHref } from '../utils/sanitizeHref.js?v=3.8.14';
import { splitUrlsForLinkify } from '../utils/linkify.js?v=3.8.14';

const linkifyText = (text) => {
  const parts = splitUrlsForLinkify(text);
  if (parts === null) return null;
  return parts.map((part, index) => {
    if (part.type === 'url') {
      return html`
        <a key=${index} href=${part.value} target="_blank" rel="noopener noreferrer" className="archive-inline-link">
          ${part.value}
        </a>
      `;
    }
    return part.value;
  });
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const ThreadPost = ({ post, totalPosts }) => {
  const depth = Math.max(0, Number(post.depth) || 0);
  const postUrl = sanitizeHref(post.url);

  return html`
    <article
      className="archive-thread-post"
      style=${{ '--thread-depth': Math.min(depth, 5), '--thread-accent': `var(--archive-thread-depth-${Math.min(depth, 3)})` }}
      aria-labelledby=${`thread-post-${post.number}`}
    >
      <header>
        <h4 id=${`thread-post-${post.number}`}>Post ${post.number} of ${totalPosts}</h4>
        ${post.date && html`<time dateTime=${post.date}>${formatDate(post.date)}</time>`}
      </header>

      ${post.content ? html`
        <p>${linkifyText(post.content)}</p>
      ` : html`
        <p className="archive-thread-post__missing">No content is available for this post.</p>
      `}

      ${postUrl !== '#' && html`
        <a href=${sanitizeHref(post.url)} target="_blank" rel="noopener noreferrer">
          View on Bluesky <${ExternalLink} aria-hidden="true" />
        </a>
      `}
    </article>
  `;
};

/** Display a Bluesky thread as one archival reading sequence. */
export const ThreadModal = ({ record }) => {
  const threadData = record.thread_data;
  const posts = Array.isArray(threadData?.posts) ? threadData.posts : [];

  if (posts.length === 0) {
    return html`
      <div className="archive-thread archive-thread--unavailable" role="status">
        <${MessageSquare} aria-hidden="true" />
        <div>
          <h3>Thread unavailable</h3>
          <p>The archive record exists, but its individual posts are not available.</p>
        </div>
      </div>
    `;
  }

  const totalPosts = Number(threadData.total_posts) || posts.length;
  const maxDepth = Number(threadData.max_depth) || Math.max(...posts.map(post => Number(post.depth) || 0));

  return html`
    <section className="archive-thread" aria-labelledby="archive-thread-title">
      <header className="archive-thread__header">
        <div>
          <${MessageSquare} aria-hidden="true" />
          <h3 id="archive-thread-title">Bluesky thread</h3>
        </div>
        <p>${totalPosts} posts <span aria-hidden="true">•</span> ${maxDepth} levels deep</p>
      </header>

      <div className="archive-thread__posts">
        ${posts.map(post => html`
          <${ThreadPost} key=${post.id || post.number} post=${post} totalPosts=${totalPosts} />
        `)}
      </div>
    </section>
  `;
};

export default ThreadModal;
