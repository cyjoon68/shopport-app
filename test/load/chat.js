import http from "k6/http";
import { check } from "k6";

const apiUrl = __ENV.SHOPPORT_API_URL || "http://127.0.0.1:4000";
const profile = __ENV.PROFILE || "smoke";

const scenarios = {
  smoke: { executor: "constant-vus", vus: 1, duration: "10s" },
  steady: {
    executor: "constant-arrival-rate",
    rate: 60,
    timeUnit: "1s",
    duration: "15m",
    preAllocatedVUs: 500,
    maxVUs: 2000,
  },
  peak: {
    executor: "constant-arrival-rate",
    rate: 600,
    timeUnit: "1s",
    duration: "5m",
    preAllocatedVUs: 3000,
    maxVUs: 10000,
  },
  concurrency: {
    executor: "ramping-vus",
    startVUs: 100,
    stages: [
      { duration: "10m", target: 10000 },
      { duration: "10m", target: 10000 },
      { duration: "5m", target: 0 },
    ],
  },
};

export const options = {
  scenarios: { chat: scenarios[profile] },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<60000"],
  },
};

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    return (value === "x" ? random : (random & 3) | 8).toString(16);
  });

export function setup() {
  const login = http.post(
    `${apiUrl}/v1/auth/apple`,
    JSON.stringify({ identityToken: "demo", nonce: uuid() }),
    { headers: { "content-type": "application/json" } },
  );
  check(login, { "login succeeds": (response) => response.status === 200 });
  const token = login.json("accessToken");
  const created = http.post(
    `${apiUrl}/graphql`,
    JSON.stringify({
      query:
        "mutation($input: CreateConversationInput!) { createConversation(input: $input) { conversation { id } } }",
      variables: { input: { title: "부하 테스트" } },
    }),
    {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    },
  );
  return {
    token,
    conversationId: created.json("data.createConversation.conversation.id"),
  };
}

export default function (data) {
  const response = http.post(
    `${apiUrl}/v1/ai/chat`,
    JSON.stringify({
      threadId: data.conversationId,
      runId: uuid(),
      messages: [{ id: uuid(), role: "user", content: "3만원 이하 텀블러" }],
      forwardedProps: {},
    }),
    {
      headers: {
        authorization: `Bearer ${data.token}`,
        "content-type": "application/json",
      },
      timeout: "65s",
    },
  );
  check(response, {
    "chat finishes": (result) =>
      result.status === 200 && result.body.includes("RUN_FINISHED"),
  });
}
