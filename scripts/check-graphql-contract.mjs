import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromBackend = createRequire(
  new URL("../shopport-be/package.json", import.meta.url),
);
const { buildSchema, parse, stripIgnoredCharacters, validate } =
  requireFromBackend("graphql");
const root = new URL("..", import.meta.url);
const backendSchemaUrl = new URL("shopport-be/schema.graphql", root);
const frontendSchemaUrl = new URL(
  "shopport-fe/apps/mobile/schema.graphql",
  root,
);
const operationsRoot = new URL("shopport-fe/apps/mobile/src/graphql/", root);
const persistedOperationsUrl = new URL(
  "shopport-fe/apps/mobile/src/graphql/generated/persisted-documents.json",
  root,
);

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

const schema = buildSchema(backend);
const files = await graphqlFiles(fileURLToPath(operationsRoot));
const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
const operationsDocument = parse(sources.join("\n"));
const errors = validate(schema, operationsDocument);
if (errors.length > 0) {
  throw new Error(errors.map(({ message }) => message).join("\n"));
}
const operationNames = operationsDocument.definitions
  .filter(({ kind }) => kind === "OperationDefinition")
  .map(({ name }) => {
    if (!name) throw new Error("Every GraphQL operation must be named");
    return name.value;
  })
  .sort();

const serializedManifest = await readFile(persistedOperationsUrl, "utf8");
const manifest = JSON.parse(serializedManifest);
if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
  throw new Error("Persisted operation manifest must be a JSON object");
}
const persistedOperations = Object.entries(manifest);
if (persistedOperations.length === 0) {
  throw new Error("Persisted operation manifest must not be empty");
}
const persistedOperationNames = [];
for (const [hash, source] of persistedOperations) {
  if (!/^[a-f0-9]{64}$/u.test(hash) || typeof source !== "string") {
    throw new Error(`Invalid persisted operation entry: ${hash}`);
  }
  const normalizedSource = stripIgnoredCharacters(source);
  const actualHash = createHash("sha256").update(normalizedSource).digest("hex");
  if (actualHash !== hash) {
    throw new Error(`Persisted operation hash mismatch: ${hash}`);
  }
  const document = parse(source);
  const operationDefinitions = document.definitions.filter(
    ({ kind }) => kind === "OperationDefinition",
  );
  if (operationDefinitions.length !== 1 || !operationDefinitions[0].name) {
    throw new Error(`Persisted entry must contain one operation: ${hash}`);
  }
  persistedOperationNames.push(operationDefinitions[0].name.value);
  const persistedErrors = validate(schema, document);
  if (persistedErrors.length > 0) {
    throw new Error(
      `${hash}: ${persistedErrors.map(({ message }) => message).join("\n")}`,
    );
  }
}
persistedOperationNames.sort();
if (JSON.stringify(persistedOperationNames) !== JSON.stringify(operationNames)) {
  throw new Error(
    "Persisted operation names differ from the frontend operation sources",
  );
}

process.stdout.write(
  `GraphQL contract valid: ${String(files.length)} operation files, ${String(persistedOperations.length)} persisted operations\n`,
);
