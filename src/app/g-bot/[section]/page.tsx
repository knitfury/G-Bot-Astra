import Link from "next/link";
import { notFound } from "next/navigation";
import { pages } from "@/production/web/content";
import { Logo } from "@/components/common/ui";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params,
    p = pages[section];
  if (!p) notFound();
  return (
    <main className="public-page">
      <header className="public-nav">
        <Link className="row" href="/g-bot">
          <Logo small />
          <strong>G-Bot</strong>
        </Link>
        <Link href="/portal">My account</Link>
      </header>
      <section className="public-heading">
        <h1>{p.title}</h1>
        <p>{p.intro}</p>
      </section>
      <div className="public-prose">
        {p.sections.map(([title, body]) => (
          <section className="public-section" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <footer className="public-footer">
        <Link href="/g-bot">G-Bot</Link>
        <a href="mailto:gbot@vidinex.ee">gbot@vidinex.ee</a>
        <span>Vidinex E-Commerce OÜ · Registry 17603412 · Estonia</span>
      </footer>
    </main>
  );
}
