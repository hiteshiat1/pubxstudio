// Internal provider adapter. Call only after account, author, revision and approval checks.
const POSTS_ENDPOINT = 'https://api.linkedin.com/rest/posts';
const DEFAULT_VERSION = '202611';

export class LinkedInPostError extends Error {
  constructor(code, httpStatus = null, providerCode = null, retryAfterSeconds = null) {
    super(code);
    this.name = 'LinkedInPostError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.providerCode = providerCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function safeProviderCode(value) {
  const code = typeof value === 'number' ? String(value) : value;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : null;
}

export async function createLinkedInTextPost({ accessToken, authorUrn, text, version = process.env.PUBX_LINKEDIN_API_VERSION || DEFAULT_VERSION, fetchImpl = fetch }) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw new LinkedInPostError('INVALID_TOKEN');
  if (typeof authorUrn !== 'string' || !/^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(authorUrn)) {
    throw new LinkedInPostError('INVALID_AUTHOR');
  }
  if (typeof text !== 'string' || !text.trim()) throw new LinkedInPostError('INVALID_TEXT');
  if (typeof version !== 'string' || !/^20\d{4}$/.test(version)) throw new LinkedInPostError('INVALID_VERSION');
  let response;
  try {
    response = await fetchImpl(POSTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Linkedin-Version': version,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });
  } catch {
    // The request may have reached LinkedIn; callers must reconcile before retrying.
    throw new LinkedInPostError('OUTCOME_UNCERTAIN');
  }

  if (response.status === 201) {
    const postId = response.headers.get('x-restli-id');
    if (!postId || !/^urn:li:(share|ugcPost):[A-Za-z0-9_-]+$/.test(postId)) {
      throw new LinkedInPostError('OUTCOME_UNCERTAIN', 201);
    }
    return { postId };
  }

  let providerCode = null;
  try {
    const body = await response.json();
    providerCode = safeProviderCode(body?.code);
  } catch { /* Response may not be JSON. Never expose its body. */ }
  const retryAfterHeader = response.headers.get('retry-after');
  const retryAfter = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
  const retryAfterSeconds = Number.isInteger(retryAfter) && retryAfter >= 0 ? retryAfter : null;
  if (response.status === 401 || response.status === 403) {
    throw new LinkedInPostError('AUTHORIZATION_FAILED', response.status, providerCode);
  }
  if (response.status === 429) {
    throw new LinkedInPostError('RATE_LIMITED', response.status, providerCode, retryAfterSeconds);
  }
  if (response.status >= 500 || response.ok || response.status === 409) {
    throw new LinkedInPostError('OUTCOME_UNCERTAIN', response.status, providerCode);
  }
  throw new LinkedInPostError('PROVIDER_REJECTED', response.status, providerCode);
}
