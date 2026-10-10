import test from "node:test";
import assert from "node:assert/strict";
import { contextWorkflowFixture } from "../fixtures/context-workflow";
import { sanitizeDiscovery } from "../../desktop/runtime/discovery-diagnostics";
function nestedFixture() {
  const f = contextWorkflowFixture();
  for (const tool of f.c.tools) {
    tool.inputSchema = {
      type: "object",
      properties: {
        path_variables: tool.inputSchema!,
        query_params: {
          type: "object",
          properties: { limit: { type: "integer", minimum: 1, maximum: 20 } },
        },
      },
      required: ["path_variables"],
      additionalProperties: false,
    };
  }
  f.c.tools[2].outputSchema = {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: ["accounts"],
        properties: {
          notices: {
            type: "array",
            items: {
              type: "object",
              properties: { status: { type: "string" } },
            },
          },
          accounts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                accountId: { type: "string" },
                name: { type: "string" },
              },
              required: ["accountId", "name"],
            },
          },
        },
      },
    },
  };
  f.c.tools[1].outputSchema = {
    type: "object",
    properties: {
      result: {
        type: "object",
        properties: {
          folders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                folderId: { type: "string" },
                name: { type: "string" },
              },
              required: ["folderId", "name"],
            },
          },
        },
      },
    },
  };
  f.mcp.call = async (_c, tool, args) => {
    f.calls.push({ name: tool.name, args });
    return JSON.stringify({
      structuredContent:
        tool.name === "getAccounts"
          ? {
              data: {
                notices: [{ status: "ok" }, { status: "ok" }],
                accounts: [
                  { accountId: "private-account", name: "Private mailbox" },
                ],
              },
            }
          : {
              result: {
                folders: [{ folderId: "private-folder", name: "Inbox" }],
              },
            },
    });
  };
  return f;
}
test("Configure resolves nested account → folder identifiers from their declared collections, without reading emails", async () => {
  const { c, engine, calls } = nestedFixture();
  const result = await engine.resolvePane(c.id, "tool:listEmails", {
    path_variables: {},
  });
  assert.deepEqual(result.arguments, {
    path_variables: {
      accountId: "private-account",
      folderId: "private-folder",
    },
  });
  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    calls.map((c) => c.name),
    ["getAccounts", "getFolders"],
  );
  assert.deepEqual(calls[1].args.path_variables, {
    accountId: "private-account",
  });
  const diagnostic = JSON.stringify(result.diagnostics);
  assert.ok(diagnostic.includes("data.accounts"));
  assert.ok(diagnostic.includes("result.folders"));
  assert.ok(
    !diagnostic.includes("private-account") &&
      !diagnostic.includes("private-folder") &&
      !diagnostic.includes("Private mailbox"),
  );
});
test("explicit identifiers and saved manual configuration remain authoritative during Configure discovery", async () => {
  const { c, engine, calls } = nestedFixture();
  c.snapshotConfig = {
    endpoint: c.url,
    source: "tool",
    name: "listEmails",
    binding: c.tools[0].schemaHash!,
    kind: "mail",
    arguments: { path_variables: { accountId: "explicit-account" } },
  };
  const result = await engine.resolvePane(
    c.id,
    "tool:listEmails",
    c.snapshotConfig.arguments,
  );
  assert.equal(
    (result.arguments.path_variables as any).accountId,
    "explicit-account",
  );
  assert.equal(
    calls.some((c) => c.name === "getAccounts"),
    false,
  );
  assert.deepEqual(calls[0].args.path_variables, {
    accountId: "explicit-account",
  });
  assert.deepEqual(c.snapshotConfig.arguments, {
    path_variables: { accountId: "explicit-account" },
  });
});
test("ambiguous accounts produce human-readable choices, reusable across compatible sources", async () => {
  const { c, engine } = contextWorkflowFixture({ accounts: 2 });
  const pending = await engine.resolvePane(c.id, "tool:listEmails", {});
  const question = pending.choices.find((q) => q.label === "Business account")!;
  assert.deepEqual(
    question.choices.map((c) => c.label),
    ["Mailbox 0", "Mailbox 1"],
  );
  const ready = await engine.resolvePane(
    c.id,
    "tool:getFolders",
    {},
    { [question.key]: question.choices[1].value },
  );
  assert.equal(ready.arguments.accountId, "actual-account-1");
  assert.equal(ready.issues.length, 0);
});
test("missing output schemas and ambiguous matching collections explain missing identifiers without executing a lookup", async () => {
  for (const ambiguous of [false, true]) {
    const { c, engine, calls } = nestedFixture();
    if (ambiguous)
      (c.tools[2].outputSchema!.properties as any).otherAccounts = {
        type: "array",
        items: {
          type: "object",
          properties: { accountId: { type: "string" } },
        },
      };
    else delete c.tools[2].outputSchema;
    const result = await engine.resolvePane(c.id, "tool:listEmails", {
      path_variables: {},
    });
    assert.ok(
      result.issues.some((issue) => issue.field === "path_variables.accountId"),
    );
    assert.equal(
      calls.some((c) => c.name === "getAccounts"),
      false,
    );
  }
});
test("permission invalidation discards Configure discoveries and diagnostic responses", async () => {
  const { c, engine, mcp } = nestedFixture();
  const call = mcp.call;
  mcp.call = async (...args) => {
    const result = await call(...args);
    c.tools[2].enabled = false;
    return result;
  };
  await assert.rejects(
    engine.resolvePane(c.id, "tool:listEmails", { path_variables: {} }),
    /Access changed/,
  );
});
test("sanitization retains MCP nesting and error indicators, redacts every business value and credential", () => {
  const original = {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "error",
          data: {
            accounts: [
              {
                accountId: "sensitive-account",
                email: "person@example.com",
                token: "secret",
                numericId: 987654,
                body: "private message",
              },
            ],
          },
        }),
      },
    ],
  };
  const safe = sanitizeDiscovery(original) as any;
  assert.equal(safe.isError, true);
  assert.equal(safe.content[0].type, "text");
  const data = JSON.parse(safe.content[0].text);
  assert.equal(data.status, "error");
  assert.equal(data.data.accounts[0].numericId, 0);
  const text = JSON.stringify(safe);
  for (const value of [
    "sensitive-account",
    "person@example.com",
    "secret",
    "987654",
    "private message",
  ])
    assert.ok(!text.includes(value));
  const schema = sanitizeDiscovery(
    {
      type: "object",
      required: ["accountId"],
      properties: {
        accountId: {
          type: "string",
          default: "secret-account",
          description: "person@example.com",
          examples: ["private-id"],
        },
      },
    },
    true,
  ) as any;
  assert.equal(schema.properties.accountId.type, "string");
  assert.deepEqual(schema.required, ["accountId"]);
  assert.ok(!JSON.stringify(schema).includes("secret-account"));
});

test("local schema references resolve while conflicting identifier paths fail closed", async () => {
  const { c, engine } = nestedFixture();
  const input = c.tools[0].inputSchema!;
  const path = (input.properties as any).path_variables;
  input.$defs = { identifiers: path };
  (input.properties as any).path_variables = { $ref: "#/$defs/identifiers" };
  const ready = await engine.resolvePane(c.id, "tool:listEmails", {
    path_variables: {},
  });
  assert.equal(
    (ready.arguments.path_variables as any).accountId,
    "private-account",
  );
  const accounts = (c.tools[2].outputSchema!.properties as any).data.properties
    .accounts.items;
  accounts.properties.owner = {
    type: "object",
    properties: { accountId: { type: "string" } },
  };
  const unresolved = await engine.resolvePane(c.id, "tool:listEmails", {
    path_variables: {},
  });
  assert.ok(
    unresolved.issues.some((i) => i.field === "path_variables.accountId"),
  );
});

test("disabled or unverified dependencies are not invoked and invalid explicit values remain intact", async () => {
  for (const disabled of [true, false]) {
    const { c, engine, calls } = nestedFixture();
    if (disabled) c.tools[2].enabled = false;
    else
      c.tools[2].annotations = { readOnlyHint: false, destructiveHint: true };
    const result = await engine.resolvePane(c.id, "tool:listEmails", {
      path_variables: {},
    });
    assert.ok(
      result.issues.some((i) => i.field === "path_variables.accountId"),
    );
    assert.equal(calls.length, 0);
  }
  const { c, engine, calls } = nestedFixture();
  const result = await engine.resolvePane(c.id, "tool:listEmails", {
    path_variables: { accountId: 42 },
  });
  assert.equal((result.arguments.path_variables as any).accountId, 42);
  assert.ok(
    result.issues.some((i) => i.message.includes("has not been replaced")),
  );
  assert.equal(calls.length, 0);
});

test("saved dependency scope cannot supply identifiers belonging to a different explicit account", async () => {
  const { c, engine, calls } = nestedFixture();
  c.snapshotConfig = {
    endpoint: c.url,
    source: "tool",
    name: "getFolders",
    binding: c.tools[1].schemaHash!,
    kind: "generic",
    arguments: { path_variables: { accountId: "other-account" } },
  };
  const result = await engine.resolvePane(c.id, "tool:listEmails", {
    path_variables: { accountId: "explicit-account" },
  });
  assert.deepEqual(result.arguments, {
    path_variables: { accountId: "explicit-account" },
  });
  assert.ok(
    result.issues.some((i) => i.message.includes("different account or scope")),
  );
  assert.equal(calls.length, 0);
});
