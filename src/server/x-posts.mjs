import twitterText from 'twitter-text';

export class XPublishError extends Error {
  constructor(code, outcome, retryAfterSeconds = null) {
    super(code);
    this.name = 'XPublishError';
    this.code = code;
    this.outcome = outcome;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function validateXText(text) {
  if (typeof text !== 'string' || !text.trim() || !twitterText.parseTweet(text).valid) {
    throw new XPublishError('invalid_text', 'permanent');
  }
  return text;
}

export async function publishXPost({ text, accessToken, replyToId = null, accountId,
  fetchImpl = fetch }) {
  validateXText(text);
  if (typeof accessToken !== 'string' || !accessToken || !/^\d{1,19}$/.test(accountId || '') ||
      (replyToId != null && !/^\d{1,19}$/.test(replyToId))) {
    throw new XPublishError('invalid_request', 'permanent');
  }
  const payload = { text };
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };
  let response;
  try {
    response = await fetchImpl('https://api.x.com/2/tweets', {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        Accept: 'application/json' }, body: JSON.stringify(payload), cache: 'no-store',
    });
  } catch {
    throw new XPublishError('provider_outcome_unknown', 'uncertain');
  }
  if (response.status === 429) {
    const value = Number(response.headers?.get?.('retry-after'));
    throw new XPublishError('rate_limited', 'retryable', Number.isFinite(value) && value > 0 ? value : null);
  }
  if (response.status >= 500) throw new XPublishError('provider_outcome_unknown', 'uncertain');
  if (!response.ok) throw new XPublishError('provider_rejected', 'permanent');
  let body;
  try { body = await response.json(); } catch { throw new XPublishError('provider_outcome_unknown', 'uncertain'); }
  const id = body?.data?.id;
  if (typeof id !== 'string' || !/^\d{1,19}$/.test(id)) throw new XPublishError('provider_outcome_unknown', 'uncertain');
  return { providerPostId: id, providerUrl: `https://x.com/i/web/status/${id}` };
}
