export function InlineSpinner() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-3.5 animate-spin motion-reduce:animate-pulse">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}
