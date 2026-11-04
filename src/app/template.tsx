// A template (unlike a layout) is re-created on every navigation, so each page
// gets its short entrance animation (see .page-enter in globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
