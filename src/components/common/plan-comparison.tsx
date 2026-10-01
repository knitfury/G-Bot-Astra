import { PLANS } from "@/production/model";
export function PlanComparison() {
  const rows: [string, string, string, string][] = [
    [
      "Price (USD)",
      "$0",
      `$${PLANS.starter.monthly}/month · $${PLANS.starter.annual}/year`,
      "$9/month · $90/year",
    ],
    ["Active MCP connections", "1", "5", "8"],
    ...[
      "Core workspace",
      "BYOK direct AI",
      "Business snapshots",
      "Tool permissions & approvals",
      "Demo Mode",
      "Normal Activity / Execution Details",
    ].map(
      (label) =>
        [label, "Included", "Included", "Included"] as [
          string,
          string,
          string,
          string,
        ],
    ),
    [
      "LLM Routers & Aggregators — Experimental",
      "Locked",
      "Included",
      "Included",
    ],
    ["OpenRouter Auto", "Locked", "Included", "Included"],
    ["OmniRoute Auto", "Locked", "Included", "Included"],
    ["Advanced Activity & Audit", "—", "—", "Included"],
  ];
  return (
    <section className="panel stack">
      <h2>Compare plans</h2>
      <div className="plan-comparison">
        <table>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              {Object.values(PLANS).map((p) => (
                <th scope="col" key={p.name}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...values]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {values.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny">
        Single-user plans. AI and router usage is billed separately by your
        provider. Saved inactive connections do not consume capacity.
      </p>
    </section>
  );
}
