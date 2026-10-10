import {
  choiceRecordBinding,
  parameterFields,
  parameterValue,
  setParameter,
  validateParameters,
} from "../../src/lib/context-parameters";
import { isObject } from "../../src/lib/context-inference";
import { argumentPlan } from "./context-discovery";
import type { SnapshotSource, ContextChoice } from "../../src/types/snapshot";

/** Metadata suggests useful reads; authority remains entirely in the caller. */
export async function resolveContextArguments(
  target: SnapshotSource,
  sources: SnapshotSource[],
  read: (source: SnapshotSource) => Promise<unknown>,
  memo = new Map<string, Promise<unknown>>(),
  visiting = new Set<string>(),
  choose?: (
    question: ContextChoice,
  ) => string | number | boolean | null | undefined,
  decisions?: {
    field: string;
    reason: string;
    source?: string;
    collection?: string;
    recordPath?: string;
  }[],
): Promise<SnapshotSource> {
  const key = `${target.source}:${target.name}`;
  if (visiting.has(key) || visiting.size >= 3) return target;
  const chain = new Set(visiting).add(key);
  let args = structuredClone(target.arguments ?? {});
  for (const field of parameterFields(target.inputSchema)) {
    if (!argumentPlan(target.inputSchema, args).needs.includes(field.path))
      continue;
    const explicit = parameterValue(args, field.path);
    if (
      explicit !== undefined &&
      explicit !== "" &&
      !validateParameters(field.schema, explicit).valid
    ) {
      decisions?.push({
        field: field.path,
        reason:
          "The value you entered does not match this field’s required format; it has not been replaced.",
      });
      continue;
    }
    const candidates = sources.filter(
      (s) =>
        s.eligible &&
        s.purpose === "discovery" &&
        !chain.has(`${s.source}:${s.name}`) &&
        choiceRecordBinding(s.outputSchema, field),
    );
    if (!candidates.length)
      decisions?.push({
        field: field.path,
        reason: sources.some(
          (s) => s.purpose === "discovery" && !s.outputSchema,
        )
          ? "Discovery tools have no matching declared output schema."
          : "No enabled, verified discovery tool declares this identifier unambiguously.",
      });
    for (const candidate of candidates.slice(0, 2)) {
      let candidateArgs = structuredClone(candidate.arguments ?? {});
      let conflictingScope = false;
      for (const dependencyField of parameterFields(candidate.inputSchema)) {
        const compatible = parameterFields(target.inputSchema).find(
          (parentField) =>
            parentField.path
              .split(".")
              .at(-1)
              ?.replace(/[_-]/g, "")
              .toLowerCase() ===
              dependencyField.path
                .split(".")
                .at(-1)
                ?.replace(/[_-]/g, "")
                .toLowerCase() &&
            parentField.schema.type === dependencyField.schema.type,
        );
        const supplied = compatible && parameterValue(args, compatible.path);
        const existing = parameterValue(candidateArgs, dependencyField.path);
        if (existing !== undefined) {
          if (
            supplied !== undefined &&
            supplied !== "" &&
            existing !== supplied
          )
            conflictingScope = true;
          continue;
        }
        if (supplied !== undefined && supplied !== "")
          candidateArgs = setParameter(
            candidateArgs,
            dependencyField.path,
            supplied,
          );
      }
      if (conflictingScope) {
        decisions?.push({
          field: field.path,
          source: candidate.name,
          reason:
            "This discovery source is configured for a different account or scope. Its saved choices have not been replaced.",
        });
        continue;
      }
      const resolved = await resolveContextArguments(
        { ...candidate, arguments: candidateArgs },
        sources,
        read,
        memo,
        chain,
        choose,
        decisions,
      );
      if (!argumentPlan(resolved.inputSchema, resolved.arguments).valid)
        continue;
      const binding = choiceRecordBinding(resolved.outputSchema, field)!;
      const readKey = JSON.stringify([
        resolved.source,
        resolved.name,
        resolved.binding,
        resolved.arguments,
      ]);
      let pending = memo.get(readKey);
      if (!pending) {
        pending = read(resolved);
        memo.set(readKey, pending);
      }
      let data: unknown;
      try {
        data = await pending;
      } catch {
        decisions?.push({
          field: field.path,
          source: candidate.name,
          reason:
            "This dependency could not be read. Review the resolver outcomes and Tools & Permissions.",
        });
        continue;
      }
      const at = (object: unknown, path: string): unknown =>
        path
          .split(".")
          .filter(Boolean)
          .reduce<unknown>(
            (value, key) =>
              isObject(value) &&
              !["__proto__", "constructor", "prototype"].includes(key)
                ? value[key]
                : undefined,
            object,
          );
      const collection = at(data, binding.collection);
      if (!Array.isArray(collection) || collection.length > 50) {
        decisions?.push({
          field: field.path,
          source: candidate.name,
          collection: binding.collection,
          reason:
            "The response collection is absent or exceeds the safe discovery limit.",
        });
        continue;
      }
      const records = collection.filter(isObject);
      const values = records
        .map((record) => at(record, binding.path))
        .filter(
          (value): value is string | number | boolean =>
            ["string", "number", "boolean"].includes(typeof value) &&
            validateParameters(field.schema, value).valid &&
            (field.schema.type !== "integer" || Number.isSafeInteger(value)),
        );
      const unique = [...new Set(values)];
      // An ambiguous business identifier always requires a human choice.
      const question: ContextChoice = {
        key: JSON.stringify([
          resolved.source,
          resolved.name,
          resolved.binding,
          field.path.split(".").at(-1)?.replace(/[_-]/g, "").toLowerCase(),
          field.schema.type,
        ]),
        label: field.label,
        choices: unique.map((value) => ({
          value: value!,
          label: (() => {
            const record = records.find(
              (record) => at(record, binding.path) === value,
            );
            return (
              (record &&
                (Object.entries(record).find(
                  ([key, value]) =>
                    /^(name|displayName|label|title|emailAddress|address)$/i.test(
                      key,
                    ) && typeof value === "string",
                )?.[1] as string)) ||
              `Option ${unique.indexOf(value) + 1}`
            );
          })(),
        })),
      };
      const decision = choose?.(question);
      const selected =
        decision === null
          ? undefined
          : (decision ?? (unique.length === 1 ? unique[0] : undefined));
      if (selected === undefined || !unique.includes(selected)) {
        decisions?.push({
          field: field.path,
          source: candidate.name,
          collection: binding.collection,
          recordPath: binding.path,
          reason: unique.length
            ? "Choose among the available values."
            : "The declared collection returned no valid values.",
        });
        continue;
      }
      decisions?.push({
        field: field.path,
        source: candidate.name,
        collection: binding.collection,
        recordPath: binding.path,
        reason: "Resolved from a validated discovery response.",
      });
      args = setParameter(args, field.path, selected);
      break;
    }
  }
  const plan = argumentPlan(target.inputSchema, args);
  return {
    ...target,
    arguments: args,
    needs: plan.needs,
    readiness: plan.valid ? "ready" : "configuration",
  };
}
