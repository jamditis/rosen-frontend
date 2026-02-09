import { html } from '../html.js?v=3.0.1';
import { ExternalLink } from 'lucide-react';

// Convert URLs in text to clickable links
const linkifyText = (text) => {
  if (!text) return null;
  // URL regex pattern
  const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const parts = text.split(urlPattern);

  return parts.map((part, i) => {
    if (urlPattern.test(part)) {
      // Reset regex lastIndex
      urlPattern.lastIndex = 0;
      return html`<a key=${i} href=${part} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 hover:underline break-all">${part}</a>`;
    }
    return part;
  });
};

/**
 * ThreadPost - Individual post in a thread
 */
const ThreadPost = ({ post, totalPosts }) => {
    const depthColors = [
        'border-sky-500',    // depth 0 (root)
        'border-green-500',  // depth 1
        'border-amber-500',  // depth 2
        'border-pink-500',   // depth 3+
    ];

    const depthColor = depthColors[Math.min(post.depth, 3)];
    const marginLeft = post.depth > 0 ? `${Math.min(post.depth, 5) * 16}px` : '0';

    // Format date
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    return html`
        <div
            className="border-l-3 ${depthColor} pl-4 py-3 mb-3"
            style=${{ marginLeft }}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-stone-400">
                    Post ${post.number}/${totalPosts}
                </span>
                <span className="text-xs text-stone-400">
                    ${formatDate(post.date)}
                </span>
            </div>

            ${post.content ? html`
                <div className="text-sm text-stone-800 leading-relaxed mb-2 whitespace-pre-wrap">
                    ${linkifyText(post.content)}
                </div>
            ` : html`
                <div className="text-sm text-stone-400 italic mb-2">
                    [No content]
                </div>
            `}

            <a
                href=${post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 transition-colors"
            >
                View on Bluesky
                <${ExternalLink} size=${12} />
            </a>
        </div>
    `;
};

/**
 * ThreadModal - Display thread content in RecordModal
 *
 * Used when a thread record (THREAD-XXXXX) is opened.
 * Parses thread_data JSON and displays posts in threaded format.
 */
export const ThreadModal = ({ record }) => {
    // Get thread data from record (already parsed as object)
    const threadData = record.thread_data;

    if (!threadData || !threadData.posts) {
        console.log('[ThreadModal] Missing thread data:', {
            has_thread_data: !!record.thread_data,
            has_posts: threadData?.posts ? threadData.posts.length : 0,
            thread_data_type: typeof record.thread_data,
            record_id: record.id
        });
        return html`
            <div className="text-center text-stone-500 py-8">
                <p>Thread data not available</p>
            </div>
        `;
    }

    const { posts, total_posts, max_depth } = threadData;

    return html`
        <div className="thread-viewer">
            <!-- Thread Stats - compact inline version -->
            <div className="flex items-center gap-4 text-xs text-stone-500 mb-4 pb-3 border-b border-stone-200">
                <span><strong className="text-stone-700">${total_posts}</strong> posts</span>
                <span>·</span>
                <span><strong className="text-stone-700">${max_depth}</strong> levels deep</span>
                <span>·</span>
                <span>Bluesky thread</span>
            </div>

            <!-- Thread Posts -->
            <div className="thread-posts max-h-[600px] overflow-y-auto pr-2">
                ${posts.map(post => html`
                    <${ThreadPost}
                        key=${post.id}
                        post=${post}
                        totalPosts=${total_posts}
                    />
                `)}
            </div>
        </div>
    `;
};

export default ThreadModal;
