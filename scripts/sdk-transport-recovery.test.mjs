import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import test from "node:test";

import { xhrHttpStream } from "../shopport-fe/node_modules/@tanstack/ai-client/dist/esm/index.js";

const requireFromBackend = createRequire(
  new URL("../shopport-be/package.json", import.meta.url),
);
const { PostgreSqlContainer } = requireFromBackend(
  "@testcontainers/postgresql",
);
const { Pool } = requireFromBackend("pg");
const backendDirectory = new URL("../shopport-be", import.meta.url).pathname;
const expectedDeltas = ["조건에 맞는 ", "상품 다섯 개를 ", "찾았어요."];
const expectedText = expectedDeltas.join("");
const expectedProductIds = Array.from(
  { length: 5 },
  (_, index) =>
    `0198a122-0c00-7000-8000-${String(95 + index).padStart(12, "0")}`,
);
const expectedEventTypes = [
  "CUSTOM",
  "RUN_STARTED",
  "TOOL_CALL_RESULT",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "RUN_FINISHED",
];

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

const reservePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
};

const collectOutput = (child) => {
  let output = "";
  const append = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-16_384);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => output;
};

const runProcess = async (args, environment) => {
  const child = spawn(process.execPath, args, {
    cwd: backendDirectory,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectOutput(child);
  const [code, signal] = await once(child, "exit");
  assert.equal(
    code,
    0,
    `Process failed (${String(code ?? signal)}): ${output()}`,
  );
};

const stopProcess = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(5_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
};

const waitForReady = async (baseUrl, child, output) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    assert.equal(
      child.exitCode,
      null,
      `Maestro API exited before ready: ${output()}`,
    );
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  assert.fail(`Maestro API did not become ready: ${output()}`);
};

const postJson = async (baseUrl, path, body, headers = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  assert.ok(response.ok, `POST ${path}: ${response.status} ${text}`);
  return JSON.parse(text);
};

const createConversation = async (baseUrl, accessToken, attempt) => {
  const response = await postJson(
    baseUrl,
    "/graphql",
    {
      query:
        "mutation Create($input: CreateConversationInput!) { createConversation(input: $input) { conversation { id } userErrors { code message } } }",
      variables: { input: { title: `S2 transport recovery ${attempt}` } },
    },
    { authorization: `Bearer ${accessToken}` },
  );
  assert.deepEqual(response.data.createConversation.userErrors, []);
  return response.data.createConversation.conversation.id;
};

const createFaultingXhrFactory = (evidence) => () => {
  const state = {
    controller: undefined,
    done: false,
    headers: {},
    method: undefined,
    networkFault: false,
    url: undefined,
  };
  const xhr = {
    abort: () => {
      if (state.done) return;
      state.done = true;
      state.controller?.abort();
      xhr.onabort?.();
      xhr.onloadend?.();
    },
    onabort: null,
    onerror: null,
    onload: null,
    onloadend: null,
    onprogress: null,
    open: (method, url) => {
      state.method = method;
      state.url = url;
    },
    responseText: "",
    send: (body) => {
      state.controller = new AbortController();
      const request = {
        envelopes: [],
        headers: { ...state.headers },
        method: state.method,
        path: new URL(state.url).pathname + new URL(state.url).search,
      };
      evidence.requests.push(request);
      void (async () => {
        try {
          const response = await fetch(state.url, {
            body: body ?? undefined,
            headers: state.headers,
            method: state.method,
            signal: state.controller.signal,
          });
          xhr.status = response.status;
          xhr.statusText = response.statusText;
          assert.ok(response.body);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const envelope = JSON.parse(line);
              request.envelopes.push({
                id: envelope.id,
                type: envelope.chunk?.type ?? envelope.type,
              });
              xhr.responseText += `${line}\n`;
              xhr.onprogress?.();
              if (
                evidence.faultEventId === undefined &&
                envelope.chunk?.type === "TEXT_MESSAGE_CONTENT"
              ) {
                evidence.faultEventId = envelope.id;
                state.networkFault = true;
                state.done = true;
                state.controller.abort();
                xhr.onerror?.();
                xhr.onloadend?.();
                return;
              }
            }
          }
          xhr.responseText += buffer + decoder.decode();
          state.done = true;
          xhr.onload?.();
          xhr.onloadend?.();
        } catch {
          if (state.done || state.networkFault) return;
          state.done = true;
          xhr.onerror?.();
          xhr.onloadend?.();
        }
      })();
    },
    setRequestHeader: (name, value) => {
      state.headers[name.toLowerCase()] = value;
    },
    status: 0,
    statusText: "",
    withCredentials: false,
  };
  return xhr;
};

const assertAttempt = async ({
  accessToken,
  attempt,
  baseUrl,
  pool,
  sdkVersion,
}) => {
  const conversationId = await createConversation(
    baseUrl,
    accessToken,
    attempt,
  );
  const runId = uuidv7();
  const userMessageId = uuidv7();
  const transport = { faultEventId: undefined, requests: [] };
  const connection = xhrHttpStream(`${baseUrl}/v1/ai/chat`, {
    headers: { authorization: `Bearer ${accessToken}` },
    reconnect: { delayMs: 10, maxAttempts: 5 },
    xhrFactory: createFaultingXhrFactory(transport),
  });
  const chunks = [];
  for await (const chunk of connection.connect(
    [
      {
        id: userMessageId,
        role: "user",
        parts: [{ type: "text", content: "텀블러 다섯 개 추천해줘" }],
      },
    ],
    undefined,
    undefined,
    { threadId: conversationId, runId, forwardedProps: {} },
  )) {
    chunks.push(chunk);
  }

  assert.equal(transport.requests.length, 2);
  const [initial, resumed] = transport.requests;
  assert.equal(transport.faultEventId, initial.envelopes.at(-1)?.id);
  assert.equal(initial.method, "POST");
  assert.equal(resumed.method, "POST");
  assert.equal(initial.path, "/v1/ai/chat");
  assert.equal(resumed.path, "/v1/ai/chat");
  for (const request of transport.requests) {
    assert.equal(request.headers["x-run-id"], runId);
    assert.equal(request.headers.authorization, `Bearer ${accessToken}`);
  }
  assert.equal(initial.headers["last-event-id"], undefined);
  assert.equal(resumed.headers["last-event-id"], transport.faultEventId);

  const eventResult = await pool.query(
    "select id::text, chunk from ai_run_events where run_id = $1 order by id",
    [runId],
  );
  const eventIds = eventResult.rows.map(({ id }) => id);
  assert.ok(eventIds.every((id) => /^\d+$/u.test(id)));
  assert.ok(
    eventIds.every(
      (id, index) => index === 0 || BigInt(id) > BigInt(eventIds[index - 1]),
    ),
  );
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.deepEqual(
    eventResult.rows.map(({ chunk }) => chunk.type),
    expectedEventTypes,
  );
  assert.deepEqual(
    chunks.map(({ type }) => type),
    expectedEventTypes,
  );
  const deliveredIds = transport.requests.flatMap(({ envelopes }) =>
    envelopes.map(({ id }) => id),
  );
  assert.deepEqual(deliveredIds, eventIds);
  assert.equal(
    resumed.envelopes[0]?.id,
    eventIds[eventIds.indexOf(transport.faultEventId) + 1],
  );

  const contents = chunks.filter(({ type }) => type === "TEXT_MESSAGE_CONTENT");
  assert.deepEqual(
    contents.map(({ delta }) => delta),
    expectedDeltas,
  );
  assert.equal(contents.map(({ delta }) => delta).join(""), expectedText);
  const toolResult = chunks.find(({ type }) => type === "TOOL_CALL_RESULT");
  assert.ok(toolResult);
  const products = JSON.parse(toolResult.content).products;
  const productIds = products.map(({ id }) => id).sort();
  assert.deepEqual(productIds, expectedProductIds);
  const messageIds = chunks
    .filter(({ type }) => type.startsWith("TEXT_MESSAGE"))
    .map(({ messageId }) => messageId);
  assert.equal(new Set(messageIds).size, 1);
  assert.deepEqual(
    chunks
      .filter(({ type }) => type === "RUN_STARTED" || type === "RUN_FINISHED")
      .map(({ runId: chunkRunId }) => chunkRunId),
    [runId, runId],
  );

  const persisted = await pool.query(
    `select r.status, r.stream_closed_at, p.kind, p.payload
     from ai_runs r
     left join messages m on m.run_id = r.id and m.role = 'assistant'
     left join message_parts p on p.message_id = m.id
     where r.id = $1
     order by p.position`,
    [runId],
  );
  assert.ok(persisted.rows.every(({ status }) => status === "completed"));
  assert.ok(persisted.rows.every(({ stream_closed_at }) => stream_closed_at));
  assert.equal(
    persisted.rows.find(({ kind }) => kind === "text")?.payload.text,
    expectedText,
  );
  assert.deepEqual(
    persisted.rows
      .filter(({ kind }) => kind === "product_reference")
      .map(({ payload }) => payload.productId)
      .sort(),
    expectedProductIds,
  );

  const evidence = {
    attempt,
    dbEventIds: eventIds,
    disconnect: {
      afterType: "TEXT_MESSAGE_CONTENT",
      cursor: transport.faultEventId,
    },
    duplicateCount: deliveredIds.length - new Set(deliveredIds).size,
    eventTypes: chunks.map(({ type }) => type),
    missingCount: expectedEventTypes.length - chunks.length,
    outcome: "pass",
    productIds,
    requests: transport.requests.map(
      ({ envelopes, headers, method, path }) => ({
        eventCount: envelopes.length,
        lastEventId: headers["last-event-id"] ?? null,
        method,
        path,
        runIdMatches: headers["x-run-id"] === runId,
      }),
    ),
    runId,
    scenario: "S2",
    sdk: `@tanstack/ai-client@${sdkVersion}`,
    text: expectedText,
    transportEvidence: "node-xhrFactory-contract-shim",
  };
  const serialized = JSON.stringify(evidence);
  assert.ok(serialized.length < 4_096);
  process.stdout.write(`${serialized}\n`);
};

test(
  "installed xhrHttpStream recovers the five-product split response from PostgreSQL after a content delivery failure",
  { timeout: 180_000 },
  async () => {
    let postgres;
    let serverProcess;
    let pool;
    try {
      postgres = await new PostgreSqlContainer("postgres:16.8-alpine")
        .withCommand([
          "postgres",
          "-c",
          "shared_preload_libraries=pg_stat_statements",
        ])
        .withDatabase("shopport")
        .withUsername("shopport")
        .withPassword("shopport")
        .start();
      const port = await reservePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const environment = {
        ...process.env,
        APP_ENV: "dev",
        DATABASE_URL: postgres.getConnectionUri(),
        JWT_SECRET: "sdk-transport-test-secret-at-least-32-bytes",
        NODE_ENV: "test",
        PERSISTED_OPERATION_MANIFEST: "",
        PORT: String(port),
        PROVIDER_API_KEY: "sdk-transport-provider-key",
      };
      await runProcess(["--import", "tsx", "scripts/migrate.ts"], environment);
      serverProcess = spawn(
        process.execPath,
        [
          "node_modules/@nestjs/cli/bin/nest.js",
          "start",
          "--path",
          "tsconfig.json",
          "--sourceRoot",
          ".",
          "--entryFile",
          "test/maestro-server",
        ],
        {
          cwd: backendDirectory,
          env: environment,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const serverOutput = collectOutput(serverProcess);
      await waitForReady(baseUrl, serverProcess, serverOutput);
      pool = new Pool({ connectionString: postgres.getConnectionUri() });
      const login = await postJson(baseUrl, "/v1/auth/kakao", {
        identityToken: "maestro-identity-token",
        nonce: "maestro-identity-nonce",
      });
      const sdkPackage = JSON.parse(
        await readFile(
          new URL(
            "../shopport-fe/node_modules/@tanstack/ai-client/package.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await assertAttempt({
          accessToken: login.accessToken,
          attempt,
          baseUrl,
          pool,
          sdkVersion: sdkPackage.version,
        });
      }
    } finally {
      await pool?.end();
      await stopProcess(serverProcess);
      await postgres?.stop();
    }
  },
);
