type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#brand-bg)" />
      <path d="M16 41L28 23L38 33L48 19" stroke="#F4F4F5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="19" r="3.5" fill="#F4F4F5" />
      <path d="M18 49H46" stroke="#A1A1AA" strokeWidth="3" strokeLinecap="round" />
      <defs>
        <linearGradient id="brand-bg" x1="6" y1="8" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3F3F46" />
          <stop offset="1" stopColor="#18181B" />
        </linearGradient>
      </defs>
    </svg>
  );
}
