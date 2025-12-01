# -*- coding: utf-8 -*-
"""
Bluesky Processor
Extracts posts and threads from Bluesky using the AT Protocol public API.
Captures parent post information for replies to enable threading.
"""

import re
import requests
from typing import Dict, Optional, List
from datetime import datetime


class BlueskyProcessor:
    """Process Bluesky posts and extract thread context."""

    # Public API endpoint (no auth required for public posts)
    API_BASE = "https://public.api.bsky.app/xrpc"

    def __init__(self):
        """Initialize Bluesky processor."""
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'RosenArchive/1.0',
            'Accept': 'application/json'
        })

    def process(self, url: str) -> Dict:
        """
        Process a Bluesky URL and extract post content with thread context.

        Args:
            url: Bluesky URL (bsky.app/profile/xxx/post/yyy)

        Returns:
            Dict with processed data including parent post info for replies
        """
        print(f"  [BLUESKY] Processing: {url}")

        # Extract post identifier from URL
        post_info = self._parse_url(url)
        if not post_info:
            return {'status': 'failed', 'error': 'Could not parse Bluesky URL'}

        handle, post_id = post_info
        print(f"  [BLUESKY] Handle: {handle}, Post ID: {post_id}")

        # Resolve handle to DID if needed
        did = self._resolve_handle(handle)
        if not did:
            return {'status': 'failed', 'error': f'Could not resolve handle: {handle}'}

        # Construct AT Protocol URI
        at_uri = f"at://{did}/app.bsky.feed.post/{post_id}"
        print(f"  [BLUESKY] AT URI: {at_uri}")

        # Fetch post thread (includes parent context)
        thread_data = self._get_post_thread(at_uri)
        if not thread_data:
            return {'status': 'failed', 'error': 'Could not fetch post thread'}

        # Parse the thread data
        result = self._parse_thread(thread_data, url)
        return result

    def _parse_url(self, url: str) -> Optional[tuple]:
        """
        Extract handle and post ID from Bluesky URL.

        Supports:
        - https://bsky.app/profile/jayrosen.bsky.social/post/3m4g3gxkoxs2r
        - https://bsky.app/profile/did:plc:xxx/post/yyy

        Returns:
            Tuple of (handle_or_did, post_id) or None
        """
        # Match bsky.app URL pattern
        match = re.search(r'bsky\.app/profile/([^/]+)/post/([a-z0-9]+)', url)
        if match:
            return match.group(1), match.group(2)
        return None

    def _resolve_handle(self, handle: str) -> Optional[str]:
        """
        Resolve a Bluesky handle to a DID.

        Args:
            handle: Bluesky handle (e.g., jayrosen.bsky.social) or DID

        Returns:
            DID string or None
        """
        # If already a DID, return as-is
        if handle.startswith('did:'):
            return handle

        try:
            response = self.session.get(
                f"{self.API_BASE}/com.atproto.identity.resolveHandle",
                params={'handle': handle},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return data.get('did')
            else:
                print(f"  [BLUESKY] Handle resolution failed: {response.status_code}")
                return None
        except requests.RequestException as e:
            print(f"  [BLUESKY] Handle resolution error: {e}")
            return None

    def _get_post_thread(self, at_uri: str, depth: int = 1) -> Optional[Dict]:
        """
        Fetch a post with its thread context (parent posts).

        Args:
            at_uri: AT Protocol URI (at://did:plc:xxx/app.bsky.feed.post/yyy)
            depth: How many parent levels to fetch

        Returns:
            Thread data dict or None
        """
        try:
            response = self.session.get(
                f"{self.API_BASE}/app.bsky.feed.getPostThread",
                params={
                    'uri': at_uri,
                    'depth': 0,  # Don't fetch replies
                    'parentHeight': depth  # Fetch parent posts
                },
                timeout=15
            )
            if response.status_code == 200:
                return response.json()
            else:
                print(f"  [BLUESKY] Thread fetch failed: {response.status_code}")
                # Try to get more info from error
                try:
                    error_data = response.json()
                    print(f"  [BLUESKY] Error: {error_data.get('message', 'Unknown error')}")
                except:
                    pass
                return None
        except requests.RequestException as e:
            print(f"  [BLUESKY] Thread fetch error: {e}")
            return None

    def _parse_thread(self, thread_data: Dict, original_url: str) -> Dict:
        """
        Parse thread data into standardized output format.

        Args:
            thread_data: Raw thread data from API
            original_url: Original Bluesky URL

        Returns:
            Standardized result dict
        """
        try:
            thread = thread_data.get('thread', {})

            # Handle blocked or not found posts
            if thread.get('$type') == 'app.bsky.feed.defs#blockedPost':
                return {'status': 'failed', 'error': 'Post is blocked'}
            if thread.get('$type') == 'app.bsky.feed.defs#notFoundPost':
                return {'status': 'failed', 'error': 'Post not found'}

            # Get the main post
            post = thread.get('post', {})
            record = post.get('record', {})
            author = post.get('author', {})

            # Extract post content
            text = record.get('text', '')
            created_at = record.get('createdAt', '')

            # Parse date
            pub_date = None
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    pub_date = dt.strftime('%Y-%m-%d')
                except:
                    pub_date = created_at[:10] if len(created_at) >= 10 else None

            # Determine if this is a reply and get parent info
            is_reply = False
            parent_info = None
            reply_ref = record.get('reply', {})

            if reply_ref:
                is_reply = True
                parent_info = self._extract_parent_info(thread)

            # Build author display name
            author_name = author.get('displayName') or author.get('handle', 'Unknown')
            author_handle = author.get('handle', '')

            # Determine title
            if is_reply:
                title = f"Reply by {author_name}"
            else:
                # Use first line or truncated text for title
                first_line = text.split('\n')[0][:80] if text else ''
                if len(first_line) < len(text.split('\n')[0]):
                    first_line += '...'
                title = f"Post by {author_name}" if not first_line else first_line

            # Extract any embedded content
            embeds = record.get('embed', {})
            embed_info = self._extract_embed_info(embeds)

            # Build result
            result = {
                'status': 'success',
                'source': 'bluesky',
                'raw_text': text,
                'title': title,
                'author': author_name,
                'author_handle': author_handle,
                'publication_date': pub_date,
                'url': original_url,
                'is_reply': is_reply,
                'metadata': {
                    'at_uri': post.get('uri'),
                    'cid': post.get('cid'),
                    'like_count': post.get('likeCount', 0),
                    'repost_count': post.get('repostCount', 0),
                    'reply_count': post.get('replyCount', 0),
                    'has_embed': bool(embeds),
                    'embed_type': embed_info.get('type') if embed_info else None
                }
            }

            # Add parent info if this is a reply
            if parent_info:
                result['parent_post'] = parent_info

            # Add embed text to raw_text if present
            if embed_info and embed_info.get('text'):
                result['raw_text'] += f"\n\n[Embedded: {embed_info['text']}]"

            print(f"  [BLUESKY] Extracted: {len(text)} chars, reply={is_reply}")
            return result

        except Exception as e:
            print(f"  [BLUESKY] Parse error: {e}")
            return {'status': 'failed', 'error': f'Failed to parse thread: {str(e)}'}

    def _extract_parent_info(self, thread: Dict) -> Optional[Dict]:
        """
        Extract parent post information from thread data.

        Args:
            thread: Thread data from API

        Returns:
            Dict with parent post info or None
        """
        parent = thread.get('parent', {})
        if not parent:
            return None

        # Handle blocked/not found parents
        if parent.get('$type') in ['app.bsky.feed.defs#blockedPost', 'app.bsky.feed.defs#notFoundPost']:
            return {
                'available': False,
                'reason': 'blocked' if 'blocked' in parent.get('$type', '') else 'deleted'
            }

        parent_post = parent.get('post', {})
        parent_record = parent_post.get('record', {})
        parent_author = parent_post.get('author', {})

        if not parent_record:
            return None

        # Extract parent info
        parent_text = parent_record.get('text', '')
        parent_author_name = parent_author.get('displayName') or parent_author.get('handle', 'Unknown')
        parent_handle = parent_author.get('handle', '')

        # Parse parent date
        parent_date = None
        created_at = parent_record.get('createdAt', '')
        if created_at:
            try:
                dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                parent_date = dt.strftime('%Y-%m-%d')
            except:
                parent_date = created_at[:10] if len(created_at) >= 10 else None

        return {
            'available': True,
            'at_uri': parent_post.get('uri'),
            'cid': parent_post.get('cid'),
            'text': parent_text,
            'author': parent_author_name,
            'author_handle': parent_handle,
            'date': parent_date,
            # Generate a URL for the parent post
            'url': f"https://bsky.app/profile/{parent_handle}/post/{parent_post.get('uri', '').split('/')[-1]}" if parent_handle else None
        }

    def _extract_embed_info(self, embed: Dict) -> Optional[Dict]:
        """
        Extract information from embedded content (links, images, quotes).

        Args:
            embed: Embed data from post record

        Returns:
            Dict with embed info or None
        """
        if not embed:
            return None

        embed_type = embed.get('$type', '')

        # External link embed
        if 'external' in embed_type:
            external = embed.get('external', {})
            return {
                'type': 'link',
                'url': external.get('uri'),
                'title': external.get('title'),
                'description': external.get('description'),
                'text': f"{external.get('title', '')} - {external.get('uri', '')}"
            }

        # Image embed
        if 'images' in embed_type:
            images = embed.get('images', [])
            alt_texts = [img.get('alt', '') for img in images if img.get('alt')]
            return {
                'type': 'images',
                'count': len(images),
                'alt_texts': alt_texts,
                'text': ' | '.join(alt_texts) if alt_texts else f"[{len(images)} image(s)]"
            }

        # Quote post embed
        if 'record' in embed_type:
            quoted = embed.get('record', {})
            if quoted.get('$type') == 'app.bsky.embed.record#viewRecord':
                quoted_value = quoted.get('value', {})
                return {
                    'type': 'quote',
                    'quoted_text': quoted_value.get('text', ''),
                    'text': f"[Quoted post: {quoted_value.get('text', '')[:100]}...]"
                }

        return {'type': 'unknown', 'text': None}

    def get_post_by_uri(self, at_uri: str) -> Optional[Dict]:
        """
        Fetch a single post by its AT Protocol URI.
        Useful for backfilling parent post data.

        Args:
            at_uri: AT Protocol URI

        Returns:
            Post data dict or None
        """
        try:
            response = self.session.get(
                f"{self.API_BASE}/app.bsky.feed.getPosts",
                params={'uris': [at_uri]},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                posts = data.get('posts', [])
                return posts[0] if posts else None
            return None
        except requests.RequestException as e:
            print(f"  [BLUESKY] Post fetch error: {e}")
            return None


# Convenience function for testing
def process_bluesky_url(url: str) -> Dict:
    """Process a Bluesky URL and return result."""
    processor = BlueskyProcessor()
    return processor.process(url)


if __name__ == "__main__":
    # Test with a sample URL
    import sys
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = "https://bsky.app/profile/jayrosen.bsky.social/post/3m4g3gxkoxs2r"

    result = process_bluesky_url(url)
    import json
    print(json.dumps(result, indent=2))
