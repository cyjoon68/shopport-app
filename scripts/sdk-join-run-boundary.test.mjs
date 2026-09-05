import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

import { xhrHttpStream } from "../shopport-fe/node_modules/@tanstack/ai-client/dist/esm/index.js";

const createNodeXhrContractShim = () => {
  const state = {
    controller: undefined,
    done: false,
    headers: {},
    method: undefined,
    url: undefined,
  };
  const xhr = {
    abort: () => {
      if (state.done) return;
      state.controller?.abort();
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
      void fetch(state.url, {
        body: body ?? undefined,
        headers: state.headers,
        method: state.method,
        signal: state.controller.signal,
      })
        .then(async (response) => {
          xhr.status = response.status;
          xhr.statusText = response.statusText;
          xhr.responseText = await response.text();
          xhr.onprogress?.();
          state.done = true;
          xhr.onload?.();
          xhr.onloadend?.();
        })
        .catch(() => {
          state.done = true;
          if (state.controller?.signal.aborted) xhr.onabort?.();
          else xhr.onerror?.();
          xhr.onloadend?.();
        });
    },
    setRequestHeader: (name, value) => {
      state.headers[name] = value;
    },
    status: 0,
    statusText: "",
    withCredentials: false,
  };
  return xhr;
};

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

test("installed xhrHttpStream joinRun reaches an authenticated server from offset -1 through the Node XHR contract shim", async () => {
  const runId = "0198a122-0c00-7000-8000-000000000001";
  const authorization = "Bearer sdk-boundary-token";
  const terminal = {
    finishReason: "stop",
    model: "sdk-boundary",
    runId,
    threadId: "0198a122-0c00-7000-8000-000000000002",
    timestamp: 0,
    type: "RUN_FINISHED",
  };
  let observedRequest;
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      observedRequest = {
        authorization: request.headers.authorization,
        body,
        method: request.method,
        url: request.url,
      };
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      response.end(`${JSON.stringify({ id: "1", chunk: terminal })}\n`);
    });
  });

  await listen(server);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const connection = xhrHttpStream(
      `http://127.0.0.1:${address.port}/v1/ai/chat`,
      {
        headers: { authorization },
        xhrFactory: createNodeXhrContractShim,
      },
    );
    assert.ok(connection.joinRun);
    const chunks = [];
    for await (const chunk of connection.joinRun(runId)) chunks.push(chunk);

    assert.deepEqual(observedRequest, {
      authorization,
      body: "",
      method: "GET",
      url: `/v1/ai/chat?offset=-1&runId=${runId}`,
    });
    assert.deepEqual(chunks, [terminal]);
  } finally {
    await close(server);
  }

  const packageJsonUrl = new URL(
    "../shopport-fe/node_modules/@tanstack/ai-client/package.json",
    import.meta.url,
  );
  const sourceUrl = new URL(
    "../shopport-fe/node_modules/@tanstack/ai-client/src/connection-adapters.ts",
    import.meta.url,
  );
  const frontendPackageUrl = new URL(
    "../shopport-fe/package.json",
    import.meta.url,
  );
  const [packageJson, frontendPackage, source] = await Promise.all([
    readFile(packageJsonUrl, "utf8").then(JSON.parse),
    readFile(frontendPackageUrl, "utf8").then(JSON.parse),
    readFile(sourceUrl, "utf8"),
  ]);
  const sha256 = createHash("sha256").update(source).digest("hex");
  assert.equal(
    packageJson.version,
    frontendPackage.dependencies["@tanstack/ai-client"],
  );
  assert.match(sha256, /^[a-f0-9]{64}$/u);
  process.stdout.write(
    `${JSON.stringify({
      adapter: "xhrHttpStream.joinRun",
      request: {
        authorization: true,
        method: observedRequest.method,
        url: observedRequest.url,
      },
      sdk: {
        name: packageJson.name,
        source: "src/connection-adapters.ts",
        sourceSha256: sha256,
        version: packageJson.version,
      },
      transportEvidence: "node-xhrFactory-contract-shim",
    })}\n`,
  );
});
