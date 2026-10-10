import test from "node:test";
import assert from "node:assert/strict";
import {
  parameterFields,
  parameterValue,
  setParameter,
  validateParameters,
  validateParameterInputs,
  emptyParameterContainers,
  choiceRecordPath,
} from "../../src/lib/context-parameters";
import {
  argumentPlan,
  rankSource,
} from "../../desktop/runtime/context-discovery";
const schema = {
  type: "object",
  required: ["path_variables", "query_params"],
  properties: {
    path_variables: {
      type: "object",
      required: ["accountId"],
      properties: {
        accountId: { type: "string", title: "Account", minLength: 1 },
        folderId: { type: "string", title: "Folder" },
      },
    },
    query_params: {
      type: "object",
      properties: {
        archived: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
  },
};
test("nested simple parameters produce business labels without inventing identifiers", () => {
  const fields = parameterFields(schema);
  assert.equal(fields[0].label, "Account");
  assert.equal(fields[0].required, true);
  assert.ok(fields.every((f) => !f.complex));
  const plan = argumentPlan(schema);
  assert.deepEqual(plan.args, { query_params: {} });
  assert.deepEqual(plan.needs, ["path_variables.accountId"]);
  let args = setParameter(
    plan.args,
    "path_variables.accountId",
    "real-account",
  );
  assert.equal(
    parameterValue(args, "path_variables.accountId"),
    "real-account",
  );
  assert.ok(validateParameters(schema, args).valid);
  args = setParameter(args, "query_params.limit", 100);
  assert.equal(validateParameters(schema, args).valid, false);
  assert.deepEqual(emptyParameterContainers(schema, {}), { query_params: {} });
});
test("complex structures remain advanced and local references are bounded", () => {
  assert.equal(
    parameterFields({
      type: "object",
      properties: { filters: { type: "array", items: { type: "object" } } },
    })[0].complex,
    true,
  );
  assert.equal(
    parameterFields({
      type: "object",
      properties: { account: { $ref: "#/$defs/id" } },
      $defs: { id: { type: "string", title: "Account" } },
    })[0].label,
    "Account",
  );
  assert.equal(
    parameterFields({
      type: "object",
      properties: { account: { $ref: "https://untrusted.test/schema" } },
    })[0].complex,
    true,
  );
  assert.deepEqual(setParameter({}, "__proto__.polluted", true), {});
});
test("ranking favors business collections over status and administrative sources without granting access", () => {
  const base = {
    source: "tool" as const,
    name: "records",
    label: "Records",
    binding: "b",
    eligible: true,
    reason: "verified",
    inputSchema: { type: "object" },
  };
  const business = rankSource(base);
  assert.equal(
    rankSource({
      ...base,
      name: "list_tasks_by_status",
      label: "Tasks by status",
    }).purpose,
    "business",
  );
  assert.ok(
    business.score! >
      rankSource({ ...base, name: "get_status", label: "Status" }).score!,
  );
  assert.ok(
    business.score! >
      rankSource({
        ...base,
        name: "get_account_settings",
        label: "Account settings",
      }).score!,
  );
  assert.equal(
    rankSource({ ...base, eligible: false, safety: "permission" }).readiness,
    "permission",
  );
});
test("choice discovery requires exact identifier names and scalar types in a declared collection", () => {
  const field = parameterFields(schema)[0];
  const output = {
    type: "object",
    properties: {
      accounts: {
        type: "array",
        items: {
          type: "object",
          properties: { accountId: { type: "string" } },
        },
      },
    },
  };
  assert.equal(choiceRecordPath(output, field), "accountId");
  assert.equal(
    choiceRecordPath(
      {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" } } },
      },
      field,
    ),
    undefined,
  );
  assert.equal(
    choiceRecordPath(
      { ...output, properties: { accountId: { type: "string" } } },
      field,
    ),
    undefined,
  );
});

test("CSP-compatible field validation blocks missing and invalid values without schema compilation", () => {
  assert.equal(validateParameterInputs(schema, {}).valid, false);
  assert.equal(
    validateParameterInputs(schema, {
      path_variables: { accountId: "" },
      query_params: {},
    }).valid,
    false,
  );
  const args = {
    path_variables: { accountId: "actual-account" },
    query_params: { limit: 10, archived: false },
  };
  assert.ok(validateParameterInputs(schema, args).valid);
  assert.ok(validateParameters(schema, args).valid);
  assert.equal(
    validateParameterInputs(schema, { ...args, query_params: { limit: 100 } })
      .valid,
    false,
  );
});
