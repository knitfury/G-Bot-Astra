import {
  choiceRecordPath,
  parameterFields,
  setParameter,
  validateParameters,
} from "../../src/lib/context-parameters";
import { argumentPlan } from "./context-discovery";
import type {
  SnapshotSource,
  SnapshotItem,
  ContextChoice,
} from "../../src/types/snapshot";

/** Metadata suggests useful reads; authority remains entirely in the caller. */
export async function resolveContextArguments(
  target: SnapshotSource,
  sources: SnapshotSource[],
  read: (source: SnapshotSource) => Promise<SnapshotItem[]>,
  memo = new Map<string, Promise<SnapshotItem[]>>(),
  visiting = new Set<string>(),
  choose?: (
    question: ContextChoice,
  ) => string | number | boolean | null | undefined,
): Promise<SnapshotSource> {
  const key = `${target.source}:${target.name}`;
  if (visiting.has(key) || visiting.size >= 3) return target;
  const chain = new Set(visiting).add(key);
  let args = structuredClone(target.arguments ?? {});
  for (const field of parameterFields(target.inputSchema)) {
    if (!argumentPlan(target.inputSchema, args).needs.includes(field.path))
      continue;
    const candidates = sources.filter(
      (s) =>
        s.eligible &&
        s.purpose === "discovery" &&
        !chain.has(`${s.source}:${s.name}`) &&
        choiceRecordPath(s.outputSchema, field),
    );
    for (const candidate of candidates.slice(0, 2)) {
      const resolved = await resolveContextArguments(
        candidate,
        sources,
        read,
        memo,
        chain,
        choose,
      );
      if (!argumentPlan(resolved.inputSchema, resolved.arguments).valid)
        continue;
      const path = choiceRecordPath(resolved.outputSchema, field)!;
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
      let records: SnapshotItem[];
      try {
        records = await pending;
      } catch {
        continue;
      }
      const values = records
        .slice(0, 50)
        .map((item) => item.values?.[path])
        .filter((v) => v !== undefined)
        .map((value) =>
          field.schema.type === "string"
            ? value!
            : field.schema.type === "boolean"
              ? value === "true"
                ? true
                : value === "false"
                  ? false
                  : undefined
              : Number(value),
        )
        .filter(
          (value) =>
            value !== undefined &&
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
          field.path.split(".").at(-1)?.toLowerCase(),
          field.schema.type,
        ]),
        label: field.label,
        choices: unique.map((value) => ({
          value: value!,
          label:
            records.find(
              (item) => String(item.values?.[path]) === String(value),
            )?.title || String(value),
        })),
      };
      const decision = choose?.(question);
      const selected =
        decision === null
          ? undefined
          : (decision ?? (unique.length === 1 ? unique[0] : undefined));
      if (selected === undefined || !unique.includes(selected)) continue;
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
