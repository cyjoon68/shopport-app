import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { join } from "node:path";

const port = Number(process.env.PORT ?? 4000);
const upstreamUrl = new URL(
  process.env.UPSTREAM_URL ?? "http://127.0.0.1:4001",
);
const resultsDirectory = process.env.RECOVERY_RESULTS;
const controlPrefix = "/__recovery__/";
const chatPath = "/v1/ai/chat";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const runIdPattern = /^[^\r\n]{1,200}$/u;
const hopHeaders = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

let state = null;
let heldResponse = null;

const stateView = () =>
  state
    ? {
        attempt: state.attempt,
        faultEventId: state.faultEventId,
        firstColdEnvelopeId: state.firstColdEnvelopeId,
        firstInitialEnvelopeId: state.firstInitialEnvelopeId,
        hotRetryClosed: state.hotRetryClosed,
        phase: state.phase,
        requestCount: state.requests.length,
        requests: state.requests,
        runId: state.runId,
        threadId: state.threadId,
        upstreamComplete: state.upstreamComplete,
      }
    : { phase: "idle" };

const persistState = () => {
  if (!resultsDirectory || !state) return;
  const attemptDirectory = join(
    resultsDirectory,
    `attempt-${String(state.attempt)}`,
  );
  mkdirSync(attemptDirectory, { recursive: true });
  writeFileSync(
    join(attemptDirectory, "proxy.json"),
    `${JSON.stringify(stateView(), null, 2)}\n`,
  );
};

const record = (event, details = {}) => {
  const entry = {
    atMilliseconds: Date.now(),
    event,
    ...(state ? { attempt: state.attempt } : {}),
    ...details,
  };
  if (resultsDirectory) {
    mkdirSync(resultsDirectory, { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    appendFileSync(join(resultsDirectory, "proxy.ndjson"), line);
    if (state) {
      const attemptDirectory = join(
        resultsDirectory,
        `attempt-${String(state.attempt)}`,
      );
      mkdirSync(attemptDirectory, { recursive: true });
      appendFileSync(join(attemptDirectory, "proxy.ndjson"), line);
    }
  }
  persistState();
};

const json = (response, status, value) => {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  response.end(`${JSON.stringify(value)}\n`);
};

const readJson = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_384) reject(new Error("Control body is too large"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

const safeResponseHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) =>
        !hopHeaders.has(name.toLowerCase()) && value !== undefined,
    ),
  );

const requestPath = (request) =>
  new URL(request.url ?? "/", upstreamUrl).pathname;

const runIdFromQuery = (request) =>
  new URL(request.url ?? "/", upstreamUrl).searchParams.get("runId");

const forward = (request, response, observe) => {
  const upstreamRequest = httpRequest(
    new URL(request.url ?? "/", upstreamUrl),
    {
      headers: { ...request.headers, host: upstreamUrl.host },
      method: request.method,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        safeResponseHeaders(upstreamResponse.headers),
      );
      if (!observe) {
        upstreamResponse.pipe(response);
        return;
      }
      upstreamResponse.setEncoding("utf8");
      let buffer = "";
      let downstreamEnded = false;
      const consumeLine = (line) => {
        if (!line.trim()) {
          if (!downstreamEnded) response.write(`${line}\n`);
          return;
        }
        let envelope;
        try {
          envelope = JSON.parse(line);
        } catch {
          state.phase = "failed";
          record("invalid-envelope", { channel: observe });
          if (!downstreamEnded)
            response.destroy(new Error("Invalid NDJSON envelope"));
          downstreamEnded = true;
          return;
        }
        const id = typeof envelope.id === "string" ? envelope.id : null;
        const type =
          typeof envelope.chunk?.type === "string"
            ? envelope.chunk.type
            : typeof envelope.type === "string"
              ? envelope.type
              : null;
        record("envelope", { channel: observe, id, type });
        if (observe === "initial" && state.firstInitialEnvelopeId === null)
          state.firstInitialEnvelopeId = id;
        if (observe === "cold" && state.firstColdEnvelopeId === null)
          state.firstColdEnvelopeId = id;
        if (
          observe === "initial" &&
          !downstreamEnded &&
          type === "TEXT_MESSAGE_CONTENT"
        ) {
          state.faultEventId = id;
          state.phase = "draining-upstream";
          downstreamEnded = true;
          response.end(`${line}\n`);
          record("downstream-ended", { faultEventId: id });
          return;
        }
        if (!downstreamEnded) response.write(`${line}\n`);
      };
      upstreamResponse.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(consumeLine);
      });
      upstreamResponse.on("end", () => {
        if (buffer) consumeLine(buffer);
        if (observe === "initial") {
          state.upstreamComplete = true;
          if (state.phase !== "failed" && state.phase !== "holding-hot-retry")
            state.phase = "awaiting-hot-retry";
          record("upstream-complete");
          return;
        }
        if (!downstreamEnded) response.end();
        if (observe === "cold") {
          state.phase =
            state.firstColdEnvelopeId !== null &&
            state.firstColdEnvelopeId === state.firstInitialEnvelopeId
              ? "complete"
              : "failed";
          record(
            state.phase === "complete"
              ? "cold-complete"
              : "cold-envelope-mismatch",
            {
              firstColdEnvelopeId: state.firstColdEnvelopeId,
              firstInitialEnvelopeId: state.firstInitialEnvelopeId,
            },
          );
        }
      });
      upstreamResponse.on("error", (error) => {
        if (state) {
          state.phase = "failed";
          record("upstream-response-error", { code: error.code ?? "UNKNOWN" });
        }
        if (!response.writableEnded) response.destroy(error);
      });
    },
  );
  upstreamRequest.on("error", (error) => {
    if (state && observe) {
      state.phase = "failed";
      record("upstream-request-error", { code: error.code ?? "UNKNOWN" });
    }
    if (!response.headersSent)
      json(response, 502, { message: "Recovery proxy upstream unavailable" });
    else if (!response.writableEnded) response.destroy(error);
  });
  if (observe !== "initial") {
    request.pipe(upstreamRequest);
    return;
  }
  let prefix = "";
  request.on("data", (chunk) => {
    if (!state.threadId) {
      prefix = `${prefix}${String(chunk)}`.slice(-256);
      const match = prefix.match(/"threadId"\s*:\s*"([^"]+)"/u);
      if (match?.[1] && uuidPattern.test(match[1])) {
        state.threadId = match[1];
        prefix = "";
        record("initial-thread", { threadId: state.threadId });
      }
    }
    if (!upstreamRequest.write(chunk)) request.pause();
  });
  upstreamRequest.on("drain", () => request.resume());
  request.on("end", () => {
    prefix = "";
    if (!state.threadId) {
      state.phase = "failed";
      record("invalid-initial-thread");
    }
    upstreamRequest.end();
  });
  request.on("aborted", () => upstreamRequest.destroy());
};

const safeRequest = (kind, request, runId) => ({
  kind,
  lastEventId: request.headers["last-event-id"] ?? null,
  method: request.method ?? null,
  path: kind === "cold-join" ? (request.url ?? null) : requestPath(request),
  runId,
  xRunId: request.headers["x-run-id"] ?? null,
});

const holdHotRetry = (request, response) => {
  state.requests.push(safeRequest("hot-retry", request, state.runId));
  state.phase = "holding-hot-retry";
  heldResponse = response;
  request.resume();
  let closed = false;
  const markClosed = () => {
    if (closed) return;
    closed = true;
    state.hotRetryClosed = true;
    heldResponse = null;
    record("hot-retry-closed");
  };
  request.once("aborted", markClosed);
  response.once("close", markClosed);
  record("hot-retry-held", { lastEventId: state.faultEventId });
};

const handleScenarioRequest = (request, response) => {
  if (!state || requestPath(request) !== chatPath) return false;
  const headerRunId = request.headers["x-run-id"];
  const lastEventId = request.headers["last-event-id"];
  if (
    state.phase === "armed" &&
    request.method === "POST" &&
    typeof headerRunId === "string" &&
    lastEventId === undefined
  ) {
    if (!runIdPattern.test(headerRunId)) {
      state.phase = "failed";
      record("invalid-initial-run");
      request.resume();
      json(response, 400, { message: "Invalid recovery run" });
      return true;
    }
    state.runId = headerRunId;
    state.requests.push(safeRequest("initial", request, headerRunId));
    state.phase = "initial";
    record("initial-request", { runId: headerRunId });
    forward(request, response, "initial");
    return true;
  }
  if (
    request.method === "POST" &&
    headerRunId === state.runId &&
    lastEventId === state.faultEventId &&
    (state.phase === "draining-upstream" ||
      state.phase === "awaiting-hot-retry")
  ) {
    holdHotRetry(request, response);
    return true;
  }
  const queryRunId = runIdFromQuery(request);
  if (
    state.phase === "released" &&
    request.method === "GET" &&
    queryRunId === state.runId
  ) {
    state.requests.push(safeRequest("cold-join", request, queryRunId));
    const expectedPath = `${chatPath}?offset=-1&runId=${state.runId}`;
    if (
      request.url !== expectedPath ||
      request.headers["x-run-id"] !== undefined ||
      request.headers["last-event-id"] !== undefined
    ) {
      state.phase = "failed";
      record("invalid-cold-request", {
        hasLastEventId: request.headers["last-event-id"] !== undefined,
        hasRunHeader: request.headers["x-run-id"] !== undefined,
        method: request.method,
        path: requestPath(request),
      });
      json(response, 400, { message: "Invalid cold recovery request" });
      return true;
    }
    state.phase = "cold-join";
    record("cold-request", { method: request.method, path: request.url });
    forward(request, response, "cold");
    return true;
  }
  const matchesRun = headerRunId === state.runId || queryRunId === state.runId;
  if (matchesRun) {
    state.requests.push(safeRequest("unexpected", request, state.runId));
    state.phase = "failed";
    record("unexpected-request", {
      method: request.method,
      path: requestPath(request),
    });
    request.resume();
    json(response, 409, { message: "Unexpected recovery request" });
    return true;
  }
  return false;
};

const handleControl = async (request, response) => {
  const path = requestPath(request).slice(controlPrefix.length);
  if (request.method === "GET" && path === "health") {
    json(response, 200, { status: "ready" });
    return;
  }
  if (request.method === "GET" && path === "state") {
    json(response, 200, stateView());
    return;
  }
  if (request.method === "POST" && path === "arm") {
    const body = await readJson(request);
    if (!Number.isInteger(body.attempt) || body.attempt < 1) {
      json(response, 400, { message: "Invalid attempt" });
      return;
    }
    if (state && state.phase !== "complete" && state.phase !== "failed") {
      json(response, 409, { message: "Recovery attempt is still active" });
      return;
    }
    state = {
      attempt: body.attempt,
      faultEventId: null,
      firstColdEnvelopeId: null,
      firstInitialEnvelopeId: null,
      hotRetryClosed: false,
      phase: "armed",
      requests: [],
      runId: null,
      threadId: null,
      upstreamComplete: false,
    };
    record("armed");
    json(response, 200, stateView());
    return;
  }
  if (request.method === "POST" && path === "release") {
    if (
      !state ||
      !state.upstreamComplete ||
      !state.hotRetryClosed ||
      state.phase === "failed"
    ) {
      json(response, 409, { message: "Recovery attempt is not ready" });
      return;
    }
    if (heldResponse && !heldResponse.writableEnded) heldResponse.destroy();
    heldResponse = null;
    state.phase = "released";
    record("released");
    json(response, 200, stateView());
    return;
  }
  json(response, 404, { message: "Unknown recovery control" });
};

const server = createServer((request, response) => {
  if (requestPath(request).startsWith(controlPrefix)) {
    void handleControl(request, response).catch(() => {
      if (!response.headersSent)
        json(response, 400, { message: "Invalid recovery control" });
      else if (!response.writableEnded) response.end();
    });
    return;
  }
  if (handleScenarioRequest(request, response)) return;
  forward(request, response, null);
});

const shutdown = () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.listen(port, "0.0.0.0", () => {
  record("ready", { port, upstream: upstreamUrl.origin });
  process.stdout.write(`Android recovery proxy listening on ${String(port)}\n`);
});
