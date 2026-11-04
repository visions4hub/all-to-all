import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { META_CSP } from "@/lib/security/csp";
import "./globals.css";

// Fonts are downloaded at build time and served from our own origin.
const body = IBM_Plex_Sans_Arabic({
  variable: "--font-body",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const display = Readex_Pro({
  variable: "--font-display",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "All To All — كل ملفاتك. كل أدواتك. بمكان واحد.",
    template: "%s · All To All",
  },
  description:
    "أدوات احترافية لتحويل وتعديل وتنظيم ملفات PDF والصور داخل متصفحك. مجاناً، بدون تسجيل، وبدون رفع ملفاتك إلى أي خادم.",
  applicationName: "All To All",
  authors: [{ name: "Visions" }],
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1220" },
  ],
};

// Runs before first paint: applies the saved language/direction and theme so
// returning visitors don't see a flash of the wrong layout or colors.
const prefsScript = `(function(){try{var p=JSON.parse(localStorage.getItem('ata-prefs')||'{}').state||{};var l=p.locale==='en'?'en':'ar';var d=document.documentElement;d.lang=l;d.dir=l==='ar'?'rtl':'ltr';var t=p.theme||'system';var dark=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(dark)d.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${body.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* First in <head> so it covers everything after it; works on hosts that can't set headers. */}
        <meta httpEquiv="Content-Security-Policy" content={META_CSP} />
        <meta name="referrer" content="no-referrer" />
        <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AppProviders>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
