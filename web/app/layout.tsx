import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { UserProvider } from "@/contexts/user-context";
import { NotificationsProvider } from "@/contexts/notifications-context";
import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/components/query-provider";
import { getServerUser } from "@/lib/server-user";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRO-MAT",
  description: "PRO-MAT",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // O script de tema é inline e precisa do nonce do CSP (proxy.ts).
  const [requestHeaders, serverUser] = await Promise.all([headers(), getServerUser()]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider defaultTheme="light" attribute="class" enableSystem={false} nonce={nonce}>
          <UserProvider initialUser={serverUser.user} initialResolved={serverUser.resolved}>
            <QueryProvider>
              <NotificationsProvider>
                <AppShell>{children}</AppShell>
              </NotificationsProvider>
            </QueryProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
