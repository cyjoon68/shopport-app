import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.SHOPPORT_API_URL ?? "http://127.0.0.1:4000";

const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.text();
  assert.ok(
    response.ok,
    `${init.method ?? "GET"} ${path}: ${response.status} ${body}`,
  );
  return { response, body };
};

const json = async (path, init = {}) => {
  const result = await request(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  return JSON.parse(result.body);
};

const graphql = (token, query, variables = {}) =>
  json("/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });

const health = await json("/health/ready");
assert.equal(health.status, "ok");

const login = await json("/v1/auth/apple", {
  method: "POST",
  body: JSON.stringify({ identityToken: "demo", nonce: randomUUID() }),
});
assert.equal(login.expiresIn, 900);
assert.ok(login.accessToken);
assert.ok(login.refreshToken);

const created = await graphql(
  login.accessToken,
  "mutation Create($input: CreateConversationInput!) { createConversation(input: $input) { conversation { id } userErrors { code message } } }",
  { input: { title: "통합 E2E 텀블러 검색" } },
);
assert.deepEqual(created.data.createConversation.userErrors, []);
const conversationId = created.data.createConversation.conversation.id;
const runId = randomUUID();

const chat = await request("/v1/ai/chat", {
  method: "POST",
  headers: {
    authorization: `Bearer ${login.accessToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    threadId: conversationId,
    runId,
    messages: [{ id: randomUUID(), role: "user", content: "텀블러" }],
    forwardedProps: {},
  }),
});
assert.match(chat.body, /TOOL_CALL_RESULT/);
assert.match(chat.body, /RUN_FINISHED/);
assert.match(chat.body, /neutral-v1/);

const replay = await request(`/v1/ai/chat?runId=${runId}&offset=0-0`, {
  headers: { authorization: `Bearer ${login.accessToken}` },
});
assert.match(replay.body, /RUN_FINISHED/);

const searched = await graphql(
  login.accessToken,
  '{ searchProducts(input: { query: "텀블러" }, first: 4) { edges { node { id title provider { providerId } offer { total { amountMinor currency } } } } } }',
);
assert.ok(searched.data.searchProducts.edges.length > 0);
const product = searched.data.searchProducts.edges[0].node;
assert.equal(product.offer.total.currency, "KRW");

const saved = await graphql(
  login.accessToken,
  "mutation Save($input: ProductSelectionInput!) { saveProduct(input: $input) { product { id isSaved } userErrors { code } } }",
  { input: { productId: product.id } },
);
assert.equal(saved.data.saveProduct.product.isSaved, true);

const history = await graphql(
  login.accessToken,
  "query Conversation($id: UUID!) { conversation(id: $id) { id messages { status parts { __typename ... on TextMessagePart { text } ... on ProductReferenceMessagePart { product { id } } } } } }",
  { id: conversationId },
);
assert.equal(history.data.conversation.id, conversationId);
assert.ok(history.data.conversation.messages.length >= 2);

await request("/v1/auth/logout", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ refreshToken: login.refreshToken }),
});
const revoked = await graphql(login.accessToken, "{ viewer { id } }");
assert.equal(revoked.errors[0].extensions.code, "UNAUTHENTICATED");

process.stdout.write("Shopport HTTP E2E passed\n");
