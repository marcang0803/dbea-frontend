import Link from 'next/link';

export default function TransferStepHeader({ step, title, backHref, backLabel }) {
  return (
    <header>
      <div className="flex items-center gap-4">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-200/90 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/20"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19 8 12l7-7" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Step {step} of 3</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((item) => (
          <span
            key={item}
            className={`h-1.5 rounded-full transition-colors ${item <= step ? 'bg-emerald-600' : 'bg-slate-200'}`}
          />
        ))}
      </div>
    </header>
  );
}
