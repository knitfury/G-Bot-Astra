import Link from 'next/link';
export default function NotFound(){return <main className="page"><h1>This page isn’t in your workspace.</h1><p style={{margin:'20px 0'}}>Check the address or return to G-Bot.</p><Link className="button primary" href="/workspace">Open workspace</Link></main>;}
