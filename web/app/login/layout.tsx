/**
 * Layout for /login — renders only the page content with no sidebar or
 * main-content padding. The root layout still wraps this with ThemeProvider
 * and UserProvider, which is fine.
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
