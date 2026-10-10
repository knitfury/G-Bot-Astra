import test from "node:test";
import assert from "node:assert/strict";
import { fixtureRuntime } from "../fixtures/desktop";
import { contextWorkflowFixture as fixture } from "../fixtures/context-workflow";
test("automatic mailbox workflow resolves real account and folder IDs, shares discovery, and renders Inbox/Sent without AI", async () => {
  const { c, calls, engine } = fixture();
  const result = await engine.get(c.id);
  assert.equal(result.state, "ready");
  assert.deepEqual(
    result.sections?.map((s) => s.label),
    ["Inbox", "Sent"],
  );
  assert.ok(result.sections?.every((s) => s.snapshot.items.length === 5));
  assert.equal(calls.filter((c) => c.name === "getAccounts").length, 1);
  assert.equal(calls.filter((c) => c.name === "getFolders").length, 1);
  assert.deepEqual(
    calls.filter((c) => c.name === "listEmails").map((c) => c.args),
    [
      { accountId: "actual-account-0", folderId: "actual-Inbox" },
      { accountId: "actual-account-0", folderId: "actual-Sent" },
    ],
  );
  assert.equal(
    c.snapshotConfig,
    undefined,
    "automatic arguments do not replace manual configuration",
  );
  await engine.get(c.id);
  // Discovery is intentionally refreshed before trusting remembered identity values.
  assert.equal(calls.filter((c) => c.name === "listEmails").length, 2);
});
test("ambiguous accounts ask a business question and a validated remembered choice drives later reads", async () => {
  const { c, calls, engine } = fixture({ accounts: 2 });
  const result = await engine.get(c.id);
  assert.equal(result.state, "configuration");
  assert.equal(calls.filter((c) => c.name === "listEmails").length, 0);
  const question = result.choices![0];
  assert.equal(question.label, "Business account");
  await assert.rejects(engine.choose(c.id, question.key, "invented"));
  await engine.choose(c.id, question.key, question.choices[1].value);
  const ready = await engine.get(c.id, true);
  assert.equal(ready.state, "ready");
  assert.ok(
    calls
      .filter((c) => c.name === "listEmails")
      .every((c) => c.args.accountId === "actual-account-1"),
  );
});
for (const [name, options] of Object.entries({
  disabled: { disabled: true },
  malformed: { malformed: true },
  revoked: { revoke: true },
  empty: { accounts: 0 },
}))
  test(`${name} discovery never fabricates parameters or calls a dependent record read`, async () => {
    const { c, calls, engine } = fixture(options);
    const result = await engine.get(c.id);
    assert.notEqual(result.state, "ready");
    assert.equal(calls.filter((c) => c.name === "listEmails").length, 0);
    assert.ok(calls.length <= 6);
  });
test("a lone Inbox folder is not reused as Sent", async () => {
  const { c, engine } = fixture({ folders: ["Inbox"] });
  const result = await engine.get(c.id);
  assert.deepEqual(
    result.sections?.map((s) => s.label),
    ["Inbox"],
  );
});
test("unknown folder roles require a real choice instead of assuming the first folder", async () => {
  const { c, calls, engine } = fixture({ folders: ["Orders", "Archive"] });
  const result = await engine.get(c.id);
  assert.equal(result.state, "configuration");
  assert.equal(result.choices?.[0].label, "Mail folder");
  assert.equal(calls.filter((c) => c.name === "listEmails").length, 0);
});
test("a remembered account that disappears is offered again and never reused", async () => {
  const options = { accounts: 2 };
  const { c, calls, engine } = fixture(options);
  const question = (await engine.get(c.id)).choices![0];
  await engine.choose(c.id, question.key, question.choices[1].value);
  options.accounts = 0;
  const before = calls.length;
  const result = await engine.get(c.id, true);
  assert.notEqual(result.state, "ready");
  assert.equal(
    calls.slice(before).filter((c) => c.name === "listEmails").length,
    0,
  );
});
test("untrusted discovery metadata and mutating hints never authorize automatic calls", async () => {
  for (const unsafe of ["untrusted", "mutation"]) {
    const { c, calls, engine } = fixture();
    c.tools[2].annotations =
      unsafe === "mutation"
        ? { readOnlyHint: true, destructiveHint: true }
        : undefined;
    const result = await engine.get(c.id);
    assert.notEqual(result.state, "ready");
    assert.equal(calls.filter((c) => c.name === "getAccounts").length, 0);
    assert.equal(calls.filter((c) => c.name === "listEmails").length, 0);
  }
});
test("cyclic discovery schemas terminate without invoking unresolved tools", async () => {
  const { c, calls, engine } = fixture();
  c.tools[2].inputSchema = c.tools[1].inputSchema;
  const result = await engine.get(c.id);
  assert.notEqual(result.state, "ready");
  assert.equal(calls.length, 0);
});
test("explicit selection discovers dependencies but reads only the selected record source", async () => {
  const { c, calls, engine } = fixture();
  const result = await engine.get(c.id, true, "tool:listEmails");
  assert.equal(result.state, "ready");
  assert.equal(calls.filter((c) => c.name === "listEmails").length, 1);
  assert.equal(result.sections, undefined);
});
test("automatic discovery respects its six-call budget even with many missing identifiers", async () => {
  const { c, calls, engine } = fixture();
  const base = c.tools[0];
  const fields = Array.from({ length: 10 }, (_, i) => `location${i}Id`);
  c.tools = [
    {
      ...base,
      name: "listProducts",
      description: "List products",
      inputSchema: {
        type: "object",
        required: fields,
        properties: Object.fromEntries(
          fields.map((field) => [field, { type: "string" }]),
        ),
      },
    },
    ...fields.map((field, index) => ({
      ...base,
      id: field,
      name: `getLocations${index}`,
      description: "Get locations",
      schemaHash: field,
      inputSchema: { type: "object" },
      outputSchema: {
        type: "object",
        properties: {
          records: {
            type: "array",
            items: {
              type: "object",
              properties: { [field]: { type: "string" } },
              required: [field],
            },
          },
        },
      },
    })),
  ];
  const result = await engine.get(c.id);
  assert.notEqual(result.state, "ready");
  assert.ok(calls.length <= 6);
  assert.equal(
    calls.some((call) => call.name === "listProducts"),
    false,
  );
});

test("business choices survive runtime recreation and are reset on endpoint changes", async () => {
  const f = await fixtureRuntime();
  const { c, mcp } = fixture({ accounts: 2 });
  try {
    await f.runtime.services.auth.demo();
    await f.runtime.services.entitlements.change("business");
    f.runtime.db.connections = [c];
    f.runtime.mcp.sources = mcp.sources;
    f.runtime.mcp.call = mcp.call;
    const question = (await f.runtime.snapshots.get(c.id)).choices![0];
    await f.runtime.snapshots.choose(
      c.id,
      question.key,
      question.choices[1].value,
    );
    await f.runtime.save();
    await f.runtime.init();
    assert.equal(
      f.runtime.db.connections[0].contextChoices?.[question.key],
      "actual-account-1",
    );
    await f.runtime.services.connections.save(
      {
        name: c.name,
        url: "https://different.invalid/mcp",
        category: c.category,
        auth: "None",
        slot: c.slot,
      },
      c.id,
    );
    assert.equal(f.runtime.db.connections[0].contextChoices, undefined);
  } finally {
    f.runtime.engine.stopAll();
  }
});

test("read-looking operations that explicitly mark records read are vetoed", async () => {
  for (const description of [
    "This API is used to mark single or multiple emails as read.",
    "This API serves the purpose of marking a folder as read.",
  ]) {
    const { c, calls, engine } = fixture();
    c.tools[2].description = description;
    const result = await engine.get(c.id);
    assert.notEqual(result.state, "ready");
    assert.equal(
      calls.some(
        (call) => call.name === "getAccounts" || call.name === "listEmails",
      ),
      false,
    );
  }
});
