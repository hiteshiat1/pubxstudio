import { JetBrains_Mono, DM_Sans, Instrument_Serif } from "next/font/google";
import ContactWidget from "./components/ContactWidget";
import { Analytics } from "@vercel/analytics/next";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-jetbrains",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${dmSans.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#080808" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="PubxStudio" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('pubx_theme') || 'dark';
                document.documentElement.setAttribute('data-theme', theme);
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --bg-main: #080808;
                --bg-card: #111111;
                --bg-card-hover: #161616;
                --bg-input: #0c0c0c;
                --bg-input-focus: #050505;
                --bg-subtle: #181818;
                --border-main: #222222;
                --border-subtle: #1a1a1a;
                --border-focus: #333333;
                --text-main: #E5E5E5;
                --text-heading: #ffffff;
                --text-muted: #aaa;
                --text-muted-dark: #666;
                --text-muted-light: #ccc;
                --text-label: #555;
                --shadow: none;
                --opacity-dim: 0.4;
                --divider: #222222;
                --guide-bg-highlight: rgba(168,255,178,0.03);
                --guide-border-highlight: rgba(168,255,178,0.15);
                --guide-text-highlight: #A8FFB2;
                --code-bg: #181818;
                --code-border: #333333;
                --code-text: #FF5A8A;
                --pre-bg: #060606;
                --pre-border: #222222;
                --pre-text: #a8ffb2;
                color-scheme: dark;
              }

              [data-theme="light"] {
                --bg-main: #F4F7F6; /* soft light grey background with nice slate/mint tint */
                --bg-card: #ffffff;
                --bg-card-hover: #fafafa;
                --bg-input: #f8fafc;
                --bg-input-focus: #ffffff;
                --bg-subtle: #f1f5f9;
                --border-main: #cbd5e1;
                --border-subtle: #e2e8f0;
                --border-focus: #94a3b8;
                --text-main: #334155; /* Slate-700 */
                --text-heading: #0f172a; /* Slate-900 */
                --text-muted: #64748b; /* Slate-500 */
                --text-muted-dark: #94a3b8; /* Slate-400 */
                --text-muted-light: #475569; /* Slate-600 */
                --text-label: #64748b;
                --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
                --opacity-dim: 0.6;
                --divider: #e2e8f0;
                --guide-bg-highlight: rgba(34,197,94,0.05);
                --guide-border-highlight: rgba(34,197,94,0.25);
                --guide-text-highlight: #15803d;
                --code-bg: #e2e8f0;
                --code-border: #cbd5e1;
                --code-text: #db2777; /* slate/pink tint, very nice */
                --pre-bg: #f8fafc;
                --pre-border: #cbd5e1;
                --pre-text: #16a34a; /* nice green */
                color-scheme: light;
              }

              * {
                font-family: var(--font-jetbrains, monospace) !important;
              }
            `,
          }}
        />
      </head>
      <body style={{ margin: 0, background: "var(--bg-main)", color: "var(--text-main)", transition: "background-color 0.3s, color 0.3s" }}>
        {children}
        <ContactWidget />
        <Analytics />
      </body>
    </html>
  );
}
