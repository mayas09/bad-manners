import { Link } from "@tanstack/react-router";
import logo from "@/assets/logo.jpg";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-slate-950 text-slate-100">
      {/* LEFT — brand panel */}
      <aside className="relative overflow-hidden flex flex-col items-center justify-center px-8 py-12 md:py-16 bg-gradient-to-br from-black via-slate-950 to-slate-900 border-b md:border-b-0 md:border-r border-slate-800">
        <Sparkles />
        <Link to="/" className="relative z-10 group">
          <img
            src={logo}
            alt="Bad Manners Coffee"
            className="w-40 md:w-64 h-40 md:h-64 rounded-2xl object-cover shadow-[0_0_60px_-10px_rgba(236,72,153,0.55)] ring-1 ring-pink-500/30 transition-transform group-hover:scale-[1.02]"
          />
        </Link>
        <p className="relative z-10 mt-6 font-display text-2xl md:text-3xl text-white text-center leading-tight">
          good coffee.
          <br />
          <span className="text-pink-400">bad manners.</span>
        </p>
        <p className="relative z-10 mt-3 text-xs uppercase tracking-[0.35em] text-slate-500">
          West Asheville, NC
        </p>
      </aside>

      {/* RIGHT — form panel */}
      <main className="flex items-center justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur p-6 md:p-8 shadow-2xl">
          {children}
        </div>
      </main>
    </div>
  );
}

function Sparkles() {
  // Deterministic sparkle positions so SSR/CSR match
  const dots = [
    { l: "8%", t: "12%", d: "0s", s: 3 },
    { l: "22%", t: "78%", d: "1.2s", s: 2 },
    { l: "35%", t: "32%", d: "2.4s", s: 4 },
    { l: "52%", t: "18%", d: "0.6s", s: 2 },
    { l: "68%", t: "62%", d: "1.8s", s: 3 },
    { l: "82%", t: "40%", d: "3s", s: 2 },
    { l: "14%", t: "48%", d: "2.1s", s: 3 },
    { l: "44%", t: "88%", d: "0.9s", s: 2 },
    { l: "72%", t: "8%", d: "2.7s", s: 3 },
    { l: "88%", t: "82%", d: "1.5s", s: 4 },
    { l: "5%", t: "70%", d: "3.3s", s: 2 },
    { l: "60%", t: "48%", d: "0.3s", s: 3 },
  ];
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(600px circle at 30% 20%, rgba(236,72,153,0.25), transparent 60%), radial-gradient(500px circle at 70% 80%, rgba(249,115,22,0.18), transparent 60%)",
        }}
      />
      <div aria-hidden className="absolute inset-0">
        {dots.map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-pink-300/80 animate-[floaty_5s_ease-in-out_infinite]"
            style={{
              left: d.l,
              top: d.t,
              width: d.s,
              height: d.s,
              animationDelay: d.d,
              boxShadow: "0 0 8px rgba(244,114,182,0.9)",
            }}
          />
        ))}
      </div>
      <style>{`@keyframes floaty {0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-14px);opacity:1}}`}</style>
    </>
  );
}

export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="w-full h-11 rounded-md bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
    >
      <svg viewBox="0 0 24 24" className="size-4">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
        />
      </svg>
      Continue with Google
    </button>
  );
}
