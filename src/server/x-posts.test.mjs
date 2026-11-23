import test from 'node:test';
import assert from 'node:assert/strict';
import { publishXPost, validateXText } from './x-posts.mjs';

test('X post request uses approved text and reply linkage, returns verified ID', async () => {
  let calls = 0;
  const result = await publishXPost({ text: 'Second post', accessToken: 'secret-token',
    accountId: '123456', replyToId: '111', fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.x.com/2/tweets');
      assert.equal(options.headers.Authorization, 'Bearer secret-token');
      assert.deepEqual(JSON.parse(options.body), { text: 'Second post', reply: { in_reply_to_tweet_id: '111' } });
      return { ok: true, status: 201, json: async () => ({ data: { id: '222', text: 'Second post' } }) };
    } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { providerPostId: '222', providerUrl: 'https://x.com/i/web/status/222' });
});

test('X weighted length and malformed inputs fail before a provider request', async () => {
  assert.equal(validateXText('https://example.com').length, 19);
  let calls = 0;
  const send = (text, replyToId = null) => publishXPost({ text, replyToId, accessToken: 'secret',
    accountId: '123', fetchImpl: async () => { calls++; throw new Error('should not send'); } });
  await assert.rejects(send('a'.repeat(281)), { code: 'invalid_text', outcome: 'permanent' });
  await assert.rejects(send(''), { code: 'invalid_text', outcome: 'permanent' });
  await assert.rejects(send('valid', 'not-a-post-id'), { code: 'invalid_request', outcome: 'permanent' });
  assert.equal(calls, 0);
});

test('X rate limits, rejection, timeout, and missing ID never claim success', async () => {
  const send = (fetchImpl) => publishXPost({ text: 'valid', accessToken: 'secret', accountId: '123', fetchImpl });
  await assert.rejects(send(async () => ({ ok: false, status: 429, headers: { get: () => '30' } })),
    { code: 'rate_limited', outcome: 'retryable', retryAfterSeconds: 30 });
  await assert.rejects(send(async () => ({ ok: false, status: 403 })), { code: 'provider_rejected', outcome: 'permanent' });
  await assert.rejects(send(async () => ({ ok: false, status: 503 })), { code: 'provider_outcome_unknown', outcome: 'uncertain' });
  await assert.rejects(send(async () => { throw new Error('secret-token timeout'); }),
    (error) => error.code === 'provider_outcome_unknown' && !error.message.includes('secret-token'));
  await assert.rejects(send(async () => ({ ok: true, status: 201, json: async () => ({ data: {} }) })),
    { code: 'provider_outcome_unknown', outcome: 'uncertain' });
});
