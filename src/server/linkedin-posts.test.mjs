import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkedInTextPost, LinkedInPostError } from './linkedin-posts.mjs';

const options = { accessToken: 'secret-token', authorUrn: 'urn:li:person:abc123', text: 'A reviewed post' };

test('Posts API request and verified provider ID', async () => {
  let calls = 0;
  const fetchImpl = async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.linkedin.com/rest/posts');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, 'Bearer secret-token');
    assert.equal(request.headers['Linkedin-Version'], '202611');
    assert.equal(request.headers['X-Restli-Protocol-Version'], '2.0.0');
    assert.equal(request.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(request.body), {
      author: options.authorUrn,
      commentary: options.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
    return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123456' } });
  };
  assert.deepEqual(await createLinkedInTextPost({ ...options, fetchImpl }), { postId: 'urn:li:share:123456' });
  assert.equal(calls, 1);
});

test('version override and organization author', async () => {
  const fetchImpl = async (_url, request) => {
    assert.equal(request.headers['Linkedin-Version'], '202610');
    assert.equal(JSON.parse(request.body).author, 'urn:li:organization:987');
    return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:ugcPost:456' } });
  };
  assert.deepEqual(await createLinkedInTextPost({ ...options, authorUrn: 'urn:li:organization:987', version: '202610', fetchImpl }), { postId: 'urn:li:ugcPost:456' });
});

test('rejections are normalized and do not leak provider text or tokens', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ code: 'ACCESS_DENIED', message: 'secret-token was rejected' }), { status: 403 });
  await assert.rejects(createLinkedInTextPost({ ...options, fetchImpl }), (error) => {
    assert.ok(error instanceof LinkedInPostError);
    assert.equal(error.code, 'AUTHORIZATION_FAILED');
    assert.equal(error.httpStatus, 403);
    assert.equal(error.providerCode, 'ACCESS_DENIED');
    assert.ok(!JSON.stringify(error).includes('secret-token'));
    return true;
  });
});

test('rate limits and uncertain outcomes do not claim success or fall back', async () => {
  let calls = 0;
  const limited = async () => { calls++; return new Response('{}', { status: 429, headers: { 'retry-after': '12' } }); };
  await assert.rejects(createLinkedInTextPost({ ...options, fetchImpl: limited }), (error) => error.code === 'RATE_LIMITED' && error.retryAfterSeconds === 12);
  assert.equal(calls, 1);
  await assert.rejects(createLinkedInTextPost({ ...options, fetchImpl: async () => new Response('{"code":"INVALID_REQUEST","message":"secret-token"}', { status: 400 }) }),
    (error) => error.code === 'PROVIDER_REJECTED' && error.providerCode === 'INVALID_REQUEST' && !JSON.stringify(error).includes('secret-token'));
  for (const fetchImpl of [
    async () => new Response(null, { status: 201 }),
    async () => new Response('{}', { status: 500 }),
    async () => { throw new Error('network failed'); },
  ]) {
    await assert.rejects(createLinkedInTextPost({ ...options, fetchImpl }), (error) => error.code === 'OUTCOME_UNCERTAIN');
  }
});

test('invalid inputs never make a provider call', async () => {
  const fetchImpl = async () => { throw new Error('unexpected call'); };
  for (const invalid of [
    { accessToken: '' }, { authorUrn: 'urn:li:organization:org_pubx_92|bad' },
    { text: ' ' }, { version: '2026-11' },
  ]) {
    await assert.rejects(createLinkedInTextPost({ ...options, ...invalid, fetchImpl }), (error) => error instanceof LinkedInPostError && error.code.startsWith('INVALID_'));
  }
});
