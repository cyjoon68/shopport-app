import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const baseUrl = process.env.SHOPPORT_API_URL ?? "http://127.0.0.1:4000";
const kakaoIdentityToken = process.env.KAKAO_IDENTITY_TOKEN;
const kakaoIdentityNonce = process.env.KAKAO_IDENTITY_NONCE;
assert.ok(kakaoIdentityToken, "KAKAO_IDENTITY_TOKEN is required");
assert.ok(kakaoIdentityNonce, "KAKAO_IDENTITY_NONCE is required");
const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const uuidv7 = () => {
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

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

const login = await json("/v1/auth/kakao", {
  method: "POST",
  body: JSON.stringify({
    identityToken: kakaoIdentityToken,
    nonce: kakaoIdentityNonce,
  }),
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

const preparedUpload = await graphql(
  login.accessToken,
  "mutation Upload($input: CreateAssetUploadInput!) { createAssetUpload(input: $input) { upload { asset { id status } uploadUrl headers { name value } } userErrors { code message } } }",
  {
    input: {
      conversationId,
      contentType: "image/jpeg",
      byteSize: "1024",
    },
  },
);
assert.deepEqual(preparedUpload.data.createAssetUpload.userErrors, []);
assert.equal(
  preparedUpload.data.createAssetUpload.upload.asset.status,
  "PENDING_UPLOAD",
);
assert.match(
  preparedUpload.data.createAssetUpload.upload.uploadUrl,
  /shopport-assets-raw/u,
);
assert.deepEqual(
  preparedUpload.data.createAssetUpload.upload.headers.find(
    ({ name }) => name === "if-none-match",
  ),
  { name: "if-none-match", value: "*" },
);
const deletedAsset = await graphql(
  login.accessToken,
  "mutation DeleteAsset($input: DeleteAssetInput!) { deleteAsset(input: $input) { success userErrors { code message } } }",
  { input: { id: preparedUpload.data.createAssetUpload.upload.asset.id } },
);
assert.equal(deletedAsset.data.deleteAsset.success, true);
assert.deepEqual(deletedAsset.data.deleteAsset.userErrors, []);

const runId = uuidv7();
const userMessageId = uuidv7();
assert.match(runId, uuidV7Pattern);
assert.match(userMessageId, uuidV7Pattern);

const chat = await request("/v1/ai/chat", {
  method: "POST",
  headers: {
    authorization: `Bearer ${login.accessToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    threadId: conversationId,
    runId,
    messages: [{ id: userMessageId, role: "user", content: "텀블러" }],
    forwardedProps: {},
  }),
});
assert.match(chat.body, /TOOL_CALL_RESULT/);
assert.match(chat.body, /RUN_FINISHED/);
assert.match(chat.body, /neutral-v1/);
const parseStreamChunks = (body) =>
  body
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value = JSON.parse(line);
      return value.chunk ?? value;
    });
const streamChunks = parseStreamChunks(chat.body);
const assistantMessageId = streamChunks.find(
  ({ type }) => type === "TEXT_MESSAGE_START",
)?.messageId;
assert.equal(typeof assistantMessageId, "string");
assert.match(assistantMessageId, uuidV7Pattern);

const replay = await request(`/v1/ai/chat?runId=${runId}&offset=0`, {
  headers: { authorization: `Bearer ${login.accessToken}` },
});
const replayChunks = parseStreamChunks(replay.body);
assert.ok(replayChunks.some(({ type }) => type === "CUSTOM"));
assert.equal(replayChunks.some(({ type }) => type === "RUN_ERROR"), false);
assert.equal(replayChunks.at(-1)?.type, "RUN_FINISHED");

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
  "query Conversation($id: UUID!) { conversation(id: $id) { id messages { id role status parts { __typename ... on TextMessagePart { text } ... on ProductReferenceMessagePart { product { id } } } } } }",
  { id: conversationId },
);
assert.equal(history.data.conversation.id, conversationId);
assert.deepEqual(
  history.data.conversation.messages.map(({ id, role, status }) => ({
    id,
    role,
    status,
  })),
  [
    { id: userMessageId, role: "USER", status: "COMPLETED" },
    { id: assistantMessageId, role: "ASSISTANT", status: "COMPLETED" },
  ],
);

await request("/v1/auth/logout", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ refreshToken: login.refreshToken }),
});
const revoked = await graphql(login.accessToken, "{ viewer { id } }");
assert.equal(revoked.errors[0].extensions.code, "UNAUTHENTICATED");

process.stdout.write("Shopport HTTP E2E passed\n");
