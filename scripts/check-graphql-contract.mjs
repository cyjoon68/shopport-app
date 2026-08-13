import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromBackend = createRequire(
  new URL("../shopport-be/package.json", import.meta.url),
);
const { buildSchema, parse, validate } = requireFromBackend("graphql");
const root = new URL("..", import.meta.url);
const backendSchemaUrl = new URL("shopport-be/schema.graphql", root);
const frontendSchemaUrl = new URL(
  "shopport-fe/apps/mobile/schema.graphql",
  root,
);
const operationsRoot = new URL("shopport-fe/apps/mobile/src/graphql/", root);

const normalize = (source) => source.replaceAll("\r\n", "\n").trim();

const graphqlFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return graphqlFiles(path);
      return entry.name.endsWith(".graphql") ? [path] : [];
    }),
  );
  return nested.flat().sort();
};

const backend = normalize(await readFile(backendSchemaUrl, "utf8"));
const frontend = normalize(await readFile(frontendSchemaUrl, "utf8"));
if (backend !== frontend) {
  throw new Error(
    "GraphQL schema snapshot differs; copy shopport-be/schema.graphql to shopport-fe/apps/mobile/schema.graphql and run codegen",
  );
}

const files = await graphqlFiles(fileURLToPath(operationsRoot));
const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
const errors = validate(buildSchema(backend), parse(sources.join("\n")));
if (errors.length > 0) {
  throw new Error(errors.map(({ message }) => message).join("\n"));
}

process.stdout.write(
  `GraphQL contract valid: ${String(files.length)} operation files\n`,
);
