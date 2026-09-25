import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AtomicStore,
  SecretVault,
  stringMap,
} from "../../desktop/runtime/storage";
import {
  remoteURL,
  parseHeaders,
  readPath,
} from "../../desktop/runtime/security";
import { validateOperation, trustedSender } from "../../desktop/runtime/ipc";
import { DesktopOAuth, validState } from "../../desktop/adapters/oauth";
export async function vaultFixture(available = true) {
  const dir = await mkdtemp(join(tmpdir(), "gbot-test-"));
  const vault = new SecretVault(
    new AtomicStore(dir, "secrets.json", () => ({}), stringMap),
    {
      available: async () => available,
      encrypt: async (v) => Buffer.from(`encrypted:${v}`),
      decrypt: async (v) => v.toString().slice(10),
    },
  );
  await vault.init();
  return { vault, dir };
}
test("IPC allowlist validates parameters and trusted main frame", () => {
  assert.throws(() => validateOperation("shell.exec", ["echo unsafe"]));
  assert.throws(() => validateOperation("__proto__", []));
  assert.throws(() => validateOperation("tools.toggle", ["a", "b", "true"]));
  assert.throws(() => validateOperation("connections.save", [{ slot: 9 }]));
  assert.equal(validateOperation("snapshot", []).operation, "snapshot");
  assert.equal(
    trustedSender(
      1,
      1,
      "http://127.0.0.1:123/workspace",
      "http://127.0.0.1:123",
      true,
    ),
    true,
  );
  assert.equal(
    trustedSender(1, 1, "https://evil.example", "http://127.0.0.1:123", true),
    false,
  );
  assert.equal(
    trustedSender(1, 1, "http://127.0.0.1:123", "http://127.0.0.1:123", false),
    false,
  );
});
test("preload sender validation denies empty, malformed and non-app URLs without throwing", () => {
  for (const url of [
    "",
    "not a URL",
    "/workspace",
    "about:blank",
    "data:text/html,test",
    "http://[",
  ])
    assert.equal(trustedSender(1, 1, url, "http://127.0.0.1:123", true), false);
  assert.equal(
    trustedSender(
      2,
      1,
      "http://127.0.0.1:123/workspace",
      "http://127.0.0.1:123",
      true,
    ),
    false,
  );
});
test("endpoint and header validation prevents embedded credentials, unsafe schemes and prototype paths", () => {
  for (const url of [
    "file:///etc/passwd",
    "http://remote.example/mcp",
    "https://user:pass@example.com",
    "https://example.com?token=abc",
  ])
    assert.throws(() => remoteURL(url));
  assert.equal(remoteURL("http://127.0.0.1:3333/mcp").hostname, "127.0.0.1");
  assert.throws(() => parseHeaders('{"Host":"evil"}'));
  assert.throws(() => parseHeaders('{"x-key":"a\\r\\nb"}'));
  assert.throws(() => readPath({}, "__proto__.polluted"));
  assert.equal(
    readPath({ choices: [{ text: "yes" }] }, "choices[0].text"),
    "yes",
  );
});
test("OS vault supports save replace delete and fails closed without encryption", async () => {
  const { vault, dir } = await vaultFixture();
  await vault.set("key", "first");
  assert.equal(await vault.get("key"), "first");
  await vault.set("key", "second");
  assert.equal(await vault.get("key"), "second");
  assert.ok(
    !(await readFile(join(dir, "secrets.json"), "utf8")).includes('"second"'),
  );
  await vault.delete("key");
  assert.equal(await vault.get("key"), undefined);
  const locked = await vaultFixture(false);
  await assert.rejects(
    () => locked.vault.set("key", "secret"),
    /OS credential/,
  );
});
test("atomic persistence survives restart and preserves corrupted files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gbot-persist-"));
  const store = new AtomicStore(dir, "state.json", () => ({}), stringMap);
  await store.write({ draft: "saved" });
  assert.deepEqual(
    await new AtomicStore(dir, "state.json", () => ({}), stringMap).read(),
    { draft: "saved" },
  );
  await writeFile(join(dir, "state.json"), "{broken");
  assert.deepEqual(await store.read(), {});
  assert.match(store.recovery, /recovery/);
  assert.ok((await readdir(dir)).some((f) => f.includes("corrupt")));
});
test("OAuth validates CSRF state, accepts one loopback callback and stores tokens only in vault", async () => {
  const { vault } = await vaultFixture();
  let oauth: DesktopOAuth;
  oauth = new DesktopOAuth("mcp", vault, async (url) => {
    const u = new URL(url);
    assert.equal(u.protocol, "https:");
    const bad = await fetch(oauth.redirectUrl + "?state=wrong&code=bad");
    assert.equal(bad.status, 400);
    await fetch(oauth.redirectUrl + `?state=${oauth.state()}&code=test-code`);
  });
  oauth.saveCodeVerifier("test-verifier");
  assert.equal(oauth.codeVerifier(), "test-verifier");
  assert.equal(validState("123", "456"), false);
  await oauth.redirectToAuthorization(
    new URL(`https://auth.example/authorize?state=${oauth.state()}`),
  );
  assert.equal(await oauth.code(), "test-code");
  await oauth.saveTokens({
    access_token: "fake-access",
    token_type: "Bearer",
    refresh_token: "fake-refresh",
  });
  assert.equal((await oauth.tokens())?.refresh_token, "fake-refresh");
  await oauth.invalidateCredentials("all");
  assert.equal(await oauth.tokens(), undefined);
  oauth.close();
});
test("concurrent credential writes do not lose entries", async () => {
  const { vault } = await vaultFixture();
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => vault.set(`key${i}`, `value${i}`)),
  );
  for (let i = 0; i < 10; i++)
    assert.equal(await vault.get(`key${i}`), `value${i}`);
});
test("unwrapped legacy data migrates to a versioned envelope", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gbot-migration-"));
  await writeFile(
    join(dir, "legacy"),
    JSON.stringify({ theme: "orange-dark" }),
  );
  const store = new AtomicStore(dir, "legacy", () => ({}), stringMap);
  assert.deepEqual(await store.read(), { theme: "orange-dark" });
  assert.equal(
    JSON.parse(await readFile(join(dir, "legacy"), "utf8")).version,
    1,
  );
});
