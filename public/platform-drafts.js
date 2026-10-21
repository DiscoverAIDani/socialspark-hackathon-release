/** Local, deterministic drafts for UI testing; not AI output or a content guarantee. */
export const PLATFORMS = Object.freeze([
  { id: 'facebook', label: 'Facebook', hint: 'Conversational, with an invitation to respond' },
  { id: 'instagram', label: 'Instagram', hint: 'Short caption with broad, optional hashtags' },
  { id: 'linkedin', label: 'LinkedIn', hint: 'Professional and discussion-oriented' },
  { id: 'tiktok', label: 'TikTok', hint: 'Short video caption with a simple hook and optional hashtags' }
]);
export const TONES = Object.freeze(['friendly', 'professional', 'playful']);
const MAX_IDEA = 1000;
const MAX_POST = 6000;

export function validateIdea(value) {
  if (typeof value !== 'string') return { valid:false, reason:'Enter a text idea.' };
  if (!value.trim()) return { valid:false, reason:'Enter a topic or starting idea first.' };
  if (value.length > MAX_IDEA) return { valid:false, reason:`Keep your idea under ${MAX_IDEA.toLocaleString()} characters.` };
  return { valid:true, reason:'' };
}

function cleanIdea(value) {
  // No content is sent anywhere. Whitespace normalization is limited to the local, editable example.
  return value.trim().replace(/\s+/gu, ' ');
}

export function makeOfflineDrafts(idea, tone='friendly') {
  const validation = validateIdea(idea);
  if (!validation.valid) throw new Error(validation.reason);
  if (!TONES.includes(tone)) throw new Error('Unsupported tone.');
  const topic = cleanIdea(idea);
  // Preserve the user's factual statement as written; add questions, not fabricated claims.
  const variants = {
    friendly: {
      facebook: `${topic}\n\nI'd love to hear what you think. Let me know in the comments!`,
      instagram: `${topic}\n\nWhat do you think? ✨\n\n#Community #Conversation`,
      linkedin: `${topic}\n\nI'd welcome your thoughts and perspectives on this.`,
      tiktok: `✨ Curious about this?\n${topic}\n\nWhat would you ask? #LearnTogether`
    },
    professional: {
      facebook: `${topic}\n\nFeel free to share your thoughts or questions below.`,
      instagram: `${topic}\n\nYour thoughts are welcome.\n\n#Updates #Community`,
      linkedin: `${topic}\n\nI'm interested in hearing other perspectives. What would you add?`,
      tiktok: `Quick look 👀\n${topic}\n\nWhat would you like to learn? #Community`
    },
    playful: {
      facebook: `${topic}\n\nWhat do you think? Let's chat!`,
      instagram: `${topic}\n\nThoughts? 💬✨\n\n#LetsTalk #Community`,
      linkedin: `${topic}\n\nA conversation worth having—what's your take?`,
      tiktok: `⚡ Wait, this is fun!\n${topic}\n\nTell me your thoughts! #LetsTalk`
    }
  };
  const drafts = variants[tone];
  for (const name of Object.keys(drafts)) {
    if (drafts[name].length > MAX_POST) throw new Error('Draft is too long.');
  }
  return { ...drafts };
}
