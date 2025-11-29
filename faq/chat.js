// Chat: BYOK Claude Interface for Dissertation Q&A
import { FAQ_ITEMS } from './data.js';

// DOM Elements
const messagesContainer = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing');
const noKeyWarning = document.getElementById('no-key-warning');
const clearChatBtn = document.getElementById('clear-chat');
const removeKeyBtn = document.getElementById('remove-key');

// State
let apiKey = null;
let conversationHistory = [];
let isLoading = false;

// System prompt with dissertation context
const SYSTEM_PROMPT = `You are an AI assistant helping users explore Jay Rosen's 1986 doctoral dissertation, "The Impossible Press: American Journalism and the Decline of Public Life."

DISSERTATION CONTEXT:
- Author: Jay Rosen, Ph.D., NYU 1986
- Advisor: Neil Postman
- Central thesis: The phrase "the press informs the public" obscures more than it reveals. Journalism is a transaction, not just an action. Professional standards cannot solve structural problems in the press-public relationship.

KEY CONCEPTS:
- Pseudo-environment: The mental picture of the world that mediates between people and reality (from Lippmann)
- Omnicompetent citizen: The impossible ideal of a citizen informed about all public matters
- The impossible press: A press that promises to solve problems it structurally cannot solve
- Journalism as transaction: Journalism understood as communication between people, not just journalist activity
- Communication without community: Mass communication connecting people who share no actual community
- Mobilized privacy: Individuals hooked into remote information sources but isolated from each other
- Attention economy: When attention must be gained, content is eclipsed by the struggle to be heard
- Making things public ≠ making a public: Publishing information doesn't create an informed public

KEY ARGUMENTS:
1. Information is relational, not substantive - it exists in relationships, not in news items
2. A public must be formed, not just informed - it doesn't exist prior to formation
3. Professional journalism made an impossible promise after the yellow journalism era
4. The professional attitude (objectivity, fairness) is necessary but insufficient
5. Scale matters: democracy was designed for small communities

KEY FIGURES:
- Walter Lippmann: Diagnosed the pseudo-environment and limits of democratic theory
- John Dewey: Agreed with Lippmann's diagnosis but advocated reconstructing community
- Neil Postman: Rosen's advisor, founder of media ecology
- Robert Park: Analyzed how newspapers create new kinds of social bodies

INSTRUCTIONS:
- Ground your responses in the dissertation's arguments and concepts
- When relevant, connect 1986 insights to contemporary media issues
- If asked about something not covered in the dissertation, say so clearly
- Be concise but thorough
- Use quotes from the dissertation when you have them
- If you're making an inference beyond the text, note that
- Encourage users to read the original dissertation for authoritative understanding`;

// Check for API key
function checkApiKey() {
  apiKey = localStorage.getItem('claude_api_key');

  if (!apiKey) {
    noKeyWarning.classList.remove('hidden');
    chatInput.disabled = true;
    sendBtn.disabled = true;
    return false;
  }

  return true;
}

// Add message to UI
function addMessage(content, role) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${role} ${role === 'user' ? 'bg-sky-50' : 'bg-white'} rounded-lg p-4 shadow-sm`;

  // Format content with paragraphs and basic markdown
  const formattedContent = content
    .split('\n\n')
    .map(p => `<p class="mb-2 last:mb-0">${p}</p>`)
    .join('')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-stone-100 px-1 rounded">$1</code>');

  messageDiv.innerHTML = `<div class="text-stone-700 text-sm leading-relaxed">${formattedContent}</div>`;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send message to Claude API
async function sendMessage(userMessage) {
  if (!apiKey || isLoading) return;

  isLoading = true;
  sendBtn.disabled = true;
  typingIndicator.classList.remove('hidden');

  // Add user message to history
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });

  // Add user message to UI
  addMessage(userMessage, 'user');
  chatInput.value = '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: conversationHistory
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const assistantMessage = data.content[0].text;

    // Add assistant response to history
    conversationHistory.push({
      role: 'assistant',
      content: assistantMessage
    });

    // Add to UI
    addMessage(assistantMessage, 'assistant');

  } catch (error) {
    console.error('API Error:', error);

    // Handle specific errors
    let errorMessage = 'Sorry, there was an error processing your request.';

    if (error.message.includes('invalid_api_key') || error.message.includes('authentication')) {
      errorMessage = 'Your API key appears to be invalid. Please check it and try again.';
      localStorage.removeItem('claude_api_key');
    } else if (error.message.includes('rate_limit')) {
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (error.message.includes('overloaded')) {
      errorMessage = 'The API is currently overloaded. Please try again in a few moments.';
    }

    addMessage(errorMessage, 'assistant');

    // Remove the failed user message from history
    conversationHistory.pop();

  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    typingIndicator.classList.add('hidden');
    chatInput.focus();
  }
}

// Clear chat
function clearChat() {
  conversationHistory = [];

  // Keep welcome message, remove others
  const messages = messagesContainer.querySelectorAll('.message');
  messages.forEach((msg, i) => {
    if (i > 0) msg.remove();
  });
}

// Remove API key
function removeApiKey() {
  if (confirm('Remove your API key? You\'ll need to enter it again to use chat.')) {
    localStorage.removeItem('claude_api_key');
    window.location.href = './index.html';
  }
}

// Initialize
function init() {
  if (!checkApiKey()) {
    return;
  }

  // Form submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (message) {
      sendMessage(message);
    }
  });

  // Clear chat
  clearChatBtn.addEventListener('click', clearChat);

  // Remove key
  removeKeyBtn.addEventListener('click', removeApiKey);

  // Focus input
  chatInput.focus();

  console.log('Chat initialized');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
