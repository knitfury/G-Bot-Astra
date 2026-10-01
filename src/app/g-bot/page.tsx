import { PlanComparison } from "@/components/common/plan-comparison";
import Link from "next/link";
import { Logo, Badge } from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/production/model";
export default function Product() {
  return (
    <main className="public-page">
      <header className="public-nav">
        <Link href="/g-bot" className="row">
          <Logo small />
          <strong>G-Bot</strong>
        </Link>
        <nav className="row wrap">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/g-bot/support">Support</Link>
          <Link href="/portal">My account</Link>
        </nav>
      </header>
      <section className="public-heading">
        <Badge>YOUR BUSINESS. WORKING TOGETHER.</Badge>
        <h1>
          Ask once.
          <br />
          Get the work done.
        </h1>
        <p>
          Your inbox, inventory and customer context. Your choice of AI. One
          calm workspace that helps you move from a question to a prepared
          action—with you in control.
        </p>
        <div className="row wrap">
          <Button variant="default" asChild>
            <Link href="/g-bot/downloads">Get G-Bot</Link>
          </Button>
          <Button asChild>
            <Link href="/">Explore the demo</Link>
          </Button>
        </div>
        <p className="tiny muted">
          Windows & macOS · Bring your own AI keys · Free needs no card
        </p>
      </section>
      <section
        className="product-visual"
        aria-label="Illustrative cross-app workflow"
      >
        <div>
          <span className="eyebrow">MAIL · ILLUSTRATION</span>
          <h3>A customer needs 12 lamps.</h3>
          <p>“Could you confirm availability for our studio?”</p>
          <Badge>Business context</Badge>
        </div>
        <div className="center">
          <Logo small />
          <h2>From request to ready.</h2>
          <p>
            Find the request. Check stock. Prepare a response using both apps.
          </p>
          <Badge>Read → prepare → your approval</Badge>
          <p>Send only after you review the recipient and exact message.</p>
        </div>
        <div>
          <span className="eyebrow">INVENTORY · ILLUSTRATION</span>
          <h3>24 units available</h3>
          <p>The information you need, alongside your conversation.</p>
          <Badge>Authorized read</Badge>
        </div>
      </section>
      <section id="how" className="public-section">
        <h2>Your apps. Your AI. Your say.</h2>
        <div className="portal-grid">
          <article className="panel stack">
            <h3>See the business context</h3>
            <p>
              Useful snapshots alongside G-Bot. Search mail, inspect stock and
              understand your customer context through the read tools you allow.
            </p>
          </article>
          <article className="panel stack">
            <h3>Prepare across apps</h3>
            <p>
              G-Bot can gather information across your authorized connections
              and prepare a response. Consequential actions pause for your
              explicit approval.
            </p>
          </article>
          <article className="panel stack">
            <h3>Bring your own AI</h3>
            <p>
              Connect OpenAI-compatible, Anthropic-compatible or
              Gemini-compatible services. Provider charges and terms apply
              separately. G-Bot supplies no AI credits.
            </p>
          </article>
          <article className="panel stack">
            <h3>A direct data path</h3>
            <p>
              AI requests go from your device to your selected provider. MCP
              requests go directly to your authorized apps. G-Bot cloud handles
              account and licensing metadata, not ordinary conversations or
              business records.
            </p>
            <Link href="/g-bot/privacy">Read the privacy draft</Link>
          </article>
        </div>
      </section>
      <section className="public-section">
        <span className="eyebrow">CONNECTIONS</span>
        <h2>A workspace for the apps you use.</h2>
        <p>
          CRM · Accounting · Email & Communication · Ecommerce · Inventory ·
          Shipping & Logistics
        </p>
        <p>
          Custom remote MCP connections are first-class. G-Bot Recommended
          entries appear only after compatibility and safety acceptance. No live
          integration has yet passed the release acceptance gate.
        </p>
        <Link className="text-link" href="/g-bot/connections">
          Connection setup & compatibility
        </Link>
      </section>
      <PlanComparison />
      <section id="pricing" className="public-section">
        <h2>Start small. Connect more when you need to.</h2>
        <div className="plan-grid">
          {Object.entries(PLANS).map(([id, p]) => (
            <article className="panel stack" key={id}>
              <span className="eyebrow">{p.name}</span>
              <h3>
                ${p.monthly}
                <small> / month</small>
              </h3>
              <p>
                {p.annual
                  ? `Or $${p.annual}/year · USD annual billing`
                  : "No card. No subscription required."}
              </p>
              <p>
                {p.connections} active connection{p.connections > 1 ? "s" : ""}
                <br />
                {p.devices} device{p.devices > 1 ? "s" : ""}
              </p>
              <p>BYOK · Demo Mode · No G-Bot message or token limit</p>
              <Button asChild>
                <Link href="/portal">
                  {id === "free" ? "Start Free" : `Choose ${p.name}`}
                </Link>
              </Button>
            </article>
          ))}
        </div>
        <p className="tiny muted">
          Single-user plans. USD pricing; applicable taxes are shown at
          checkout. Final consumer tax-inclusive pricing and legal terms require
          pre-launch review.
        </p>
      </section>
      <section className="public-section public-prose">
        <h2>A few useful answers.</h2>
        {[
          [
            "Does G-Bot include AI credits?",
            "No. You connect and pay your chosen AI provider separately.",
          ],
          [
            "Does business data leave my device?",
            "Selected prompts, attachments and tool context go to your chosen AI provider and authorized MCP services under their terms. They are not routed through the G-Bot control plane.",
          ],
          [
            "Can G-Bot make changes without asking?",
            "Authorized reads and preparation can proceed. Sending, deleting, orders, refunds, inventory changes and other consequential actions require approval of the exact action.",
          ],
          [
            "What happens if I downgrade?",
            "Your saved connections remain. Excess connections and devices become inactive according to the new plan.",
          ],
          [
            "Can I work offline?",
            "A previously activated device can verify a signed license for up to seven days. AI and remote apps still require their own network access.",
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
      <footer className="public-footer">
        {[
          "downloads",
          "support",
          "privacy",
          "terms",
          "subscriptions",
          "refunds",
          "cookies",
          "status",
        ].map((s) => (
          <Link href={`/g-bot/${s}`} key={s}>
            {s}
          </Link>
        ))}
        <span>
          G-Bot 1.0.0 candidate · Vidinex E-Commerce OÜ · Registry 17603412 ·
          Estonia
        </span>
      </footer>
    </main>
  );
}
