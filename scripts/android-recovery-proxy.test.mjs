import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runId = "0198a122-0c00-7000-8000-000000000091";
const threadId = "0198a122-0c00-7000-8000-000000000092";
const envelopes = [
  { id: "1", chunk: { type: "RUN_STARTED", runId, threadId } },
  {
    id: "2",
    chunk: {
      type: "TEXT_MESSAGE_START",
      messageId: "message-1",
      role: "assistant",
    },
  },
  {
    id: "3",
    chunk: {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message-1",
      delta: "first",
    },
  },
  {
    id: "4",
    chunk: {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message-1",
      delta: "second",
    },
  },
  { id: "5", chunk: { type: "TEXT_MESSAGE_END", messageId: "message-1" } },
  { id: "6", chunk: { type: "RUN_FINISHED", runId, threadId } },
];

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

const close = (server) =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

const endpoint = (server) => {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${String(address.port)}`;
};

const waitFor = async (read, accept, description) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const value = await read();
      if (accept(value)) return value;
    } catch {}
    await delay(25);
  }
  assert.fail(`Timed out waiting for ${description}`);
};

const postControl = async (baseUrl, path, body = {}) => {
  const response = await fetch(`${baseUrl}/__recovery__/${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
};

const readState = async (baseUrl) => {
  const response = await fetch(`${baseUrl}/__recovery__/state`);
  assert.equal(response.status, 200);
  return response.json();
};

const postAi = (baseUrl, headers) => {
  const url = new URL("/v1/ai/chat", baseUrl);
  const request = httpRequest(url, { headers, method: "POST" });
  request.end(
    JSON.stringify({
      threadId,
      private: "never-record-this-user-text",
    }),
  );
  return request;
};

const responseBody = async (request) => {
  const [response] = await once(request, "response");
  response.setEncoding("utf8");
  let body = "";
  response.on("data", (chunk) => {
    body += chunk;
  });
  await once(response, "end");
  return body;
};

test(
  "faults one native stream, drains upstream, gates its hot retry, and releases a clean cold join",
  { timeout: 15_000 },
  async () => {
    const upstreamRequests = [];
    const upstream = createServer((request, response) => {
      upstreamRequests.push({
        lastEventId: request.headers["last-event-id"] ?? null,
        method: request.method,
        url: request.url,
        xRunId: request.headers["x-run-id"] ?? null,
      });
      request.resume();
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const envelope of envelopes)
        response.write(`${JSON.stringify(envelope)}\n`);
      response.end();
    });
    await listen(upstream);
    const portProbe = createServer();
    await listen(portProbe);
    const proxyUrl = endpoint(portProbe);
    await close(portProbe);
    const results = await mkdtemp(join(tmpdir(), "shopport-recovery-proxy-"));
    const child = spawn(
      process.execPath,
      ["scripts/android-recovery-proxy.mjs"],
      {
        cwd: new URL("..", import.meta.url),
        env: {
          ...process.env,
          PORT: new URL(proxyUrl).port,
          RECOVERY_RESULTS: results,
          UPSTREAM_URL: endpoint(upstream),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });

    try {
      await waitFor(
        () => fetch(`${proxyUrl}/__recovery__/health`),
        (response) => response.ok,
        "proxy readiness",
      );
      await postControl(proxyUrl, "arm", { attempt: 1 });

      const initial = postAi(proxyUrl, {
        authorization: "Bearer never-record-this-token",
        "content-type": "application/json",
        "x-run-id": runId,
      });
      const initialBody = await responseBody(initial);
      assert.deepEqual(
        initialBody
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line).id),
        ["1", "2", "3"],
      );
      const drained = await waitFor(
        () => readState(proxyUrl),
        (state) =>
          state.phase === "awaiting-hot-retry" && state.upstreamComplete,
        "upstream drain",
      );
      assert.equal(drained.faultEventId, "3");
      assert.equal(drained.threadId, threadId);

      const hot = postAi(proxyUrl, {
        authorization: "Bearer never-record-this-token",
        "content-type": "application/json",
        "last-event-id": "3",
        "x-run-id": runId,
      });
      await waitFor(
        () => readState(proxyUrl),
        (state) => state.phase === "holding-hot-retry",
        "held hot retry",
      );
      assert.equal(upstreamRequests.length, 1);
      hot.on("error", () => undefined);
      hot.destroy();
      await waitFor(
        () => readState(proxyUrl),
        (state) => state.hotRetryClosed,
        "hot retry closure",
      );
      await postControl(proxyUrl, "release");

      const coldResponse = await fetch(
        `${proxyUrl}/v1/ai/chat?offset=-1&runId=${runId}`,
        { headers: { authorization: "Bearer never-record-this-token" } },
      );
      assert.equal(coldResponse.status, 200);
      assert.deepEqual(
        (await coldResponse.text())
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line).id),
        ["1", "2", "3", "4", "5", "6"],
      );
      const complete = await waitFor(
        () => readState(proxyUrl),
        (state) => state.phase === "complete",
        "cold join completion",
      );
      assert.equal(
        complete.firstColdEnvelopeId,
        complete.firstInitialEnvelopeId,
      );
      assert.equal(complete.requestCount, 3);
      assert.equal(complete.threadId, threadId);
      assert.deepEqual(upstreamRequests, [
        {
          lastEventId: null,
          method: "POST",
          url: "/v1/ai/chat",
          xRunId: runId,
        },
        {
          lastEventId: null,
          method: "GET",
          url: `/v1/ai/chat?offset=-1&runId=${runId}`,
          xRunId: null,
        },
      ]);
      const fourthResponse = await fetch(
        `${proxyUrl}/v1/ai/chat?offset=-1&runId=${runId}`,
        { headers: { authorization: "Bearer never-record-this-token" } },
      );
      assert.equal(fourthResponse.status, 409);
      const rejected = await waitFor(
        () => readState(proxyUrl),
        (state) => state.phase === "failed",
        "fourth request rejection",
      );
      assert.equal(rejected.requestCount, 4);
      assert.equal(upstreamRequests.length, 2);
      const serialized = JSON.stringify(complete);
      assert.doesNotMatch(serialized, /never-record-this/u);
      assert.doesNotMatch(serialized, /authorization/iu);
      assert.doesNotMatch(serialized, /private/u);
      const ndjson = await readFile(join(results, "proxy.ndjson"), "utf8");
      assert.doesNotMatch(ndjson, /never-record-this/u);
      assert.doesNotMatch(ndjson, /authorization/iu);
      assert.match(ndjson, /"event":"cold-complete"/u);
    } finally {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), delay(2_000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
      await close(upstream);
      await rm(results, { force: true, recursive: true });
    }
    assert.equal(child.exitCode, 0, output);
  },
);
