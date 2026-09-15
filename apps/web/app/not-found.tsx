import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="state-screen" style={{ position: 'fixed' }}>
      <div className="glass" style={{ padding: 24 }}>
        <h2>404</h2>
        <p>Такой страницы нет.</p>
        <Link className="btn" href="/">
          На главную
        </Link>
      </div>
    </div>
  );
}
