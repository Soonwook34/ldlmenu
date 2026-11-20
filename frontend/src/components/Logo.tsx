/** 앱 아이콘(LDL 투표함)과 같은 그림. 강조색을 따라 색이 바뀐다. 포크·나이프: lucide "utensils"(ISC) */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" rx="24" style={{ fill: "var(--brand-500)" }} />
      <g transform="rotate(-7 50 28)">
        <rect x="35.5" y="9" width="29" height="36" rx="5.5" fill="white" />
        <g transform="translate(38.72 15.2) scale(0.94)" fill="none" stroke="var(--brand-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </g>
      </g>
      <rect x="15" y="41" width="70" height="47" rx="11" fill="white" />
      <rect x="30" y="46" width="40" height="4.2" rx="2.1" style={{ fill: "var(--brand-200)" }} />
      <text x="50" y="76" textAnchor="middle" fontSize="25" letterSpacing="0.5" style={{ fill: "var(--brand-500)", fontFamily: "Jua" }}>
        LDL
      </text>
    </svg>
  );
}
