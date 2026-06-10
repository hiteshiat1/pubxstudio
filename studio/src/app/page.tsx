"use client";

import React, { useState, useEffect } from "react";

export default function LandingPage() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [activeTab, setActiveTab] = useState<"pwa" | "local" | "vercel">("pwa");

  // Sync theme status
  useEffect(() => {
    const activeTheme = (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "dark";
    setTheme(activeTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("pubx_theme", nextTheme);
    setTheme(nextTheme);
  };

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    
    // Check if already installed / standalone
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-main)",
      color: "var(--text-main)",
      fontFamily: "var(--font-jetbrains, monospace)",
      transition: "background-color 0.3s, color 0.3s",
      overflowX: "hidden",
      position: "relative"
    }}>
      {/* Decorative Radial Glowing Elements */}
      <div style={{
        position: "absolute",
        top: "-10%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "600px",
        height: "400px",
        background: "radial-gradient(circle, rgba(90, 185, 255, 0.08) 0%, rgba(141, 108, 255, 0.03) 70%, transparent 100%)",
        borderRadius: "50%",
        zIndex: 0,
        pointerEvents: "none"
      }} />

      {/* Navigation Header */}
      <header style={{
        borderBottom: "1px solid var(--border-main)",
        backdropFilter: "blur(12px)",
        background: "rgba(8, 8, 8, 0.7)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        padding: "16px 24px"
      }}>
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          {/* Logo & Branding */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" rx="20" fill="#111111" stroke="#5AB9FF" strokeWidth="4" />
              <path d="M30 30H70V45H30V30Z" fill="#5AB9FF" />
              <path d="M30 55H55V70H30V55Z" fill="#A8FFB2" />
              <circle cx="67" cy="62" r="8" fill="#FF5A8A" />
            </svg>
            <span style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text-heading)",
              letterSpacing: "-0.5px"
            }}>
              Pubx<span style={{ color: "#5AB9FF" }}>Studio</span>
            </span>
          </div>

          {/* Navigation Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={toggleTheme}
              style={{
                background: "transparent",
                border: "1px solid var(--border-main)",
                borderRadius: "8px",
                color: "var(--text-heading)",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "all 0.2s"
              }}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <a
              href="/studio"
              style={{
                background: "linear-gradient(135deg, #5AB9FF 0%, #8D6CFF 100%)",
                border: "none",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "10px 20px",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "bold",
                boxShadow: "0 4px 14px rgba(90, 185, 255, 0.3)",
                transition: "all 0.2s"
              }}
            >
              LAUNCH STUDIO →
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        padding: "80px 24px 60px 24px",
        textAlign: "center",
        zIndex: 1,
        position: "relative"
      }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          {/* Badge */}
          <span style={{
            background: "rgba(90, 185, 255, 0.1)",
            border: "1px solid rgba(90, 185, 255, 0.2)",
            color: "#5AB9FF",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: "bold",
            letterSpacing: "1px",
            textTransform: "uppercase"
          }}>
            ⚡ PREMIUM MULTI-AGENT CONTENT PLATFORM
          </span>

          <h1 style={{
            fontSize: "48px",
            lineHeight: "1.1",
            color: "var(--text-heading)",
            margin: "24px 0 16px 0",
            letterSpacing: "-1px"
          }}>
            Generate and Distribute Premium Content with Complete Privacy
          </h1>

          <p style={{
            fontSize: "16px",
            color: "var(--text-muted)",
            lineHeight: "1.6",
            maxWidth: "640px",
            margin: "0 auto 32px auto"
          }}>
            PubxStudio is a high-fidelity, self-hosted, offline-capable multi-agent Studio. Author posts, execute RAG-driven context briefs, preview SVG media, and publish to social channels.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <a
              href="/studio"
              style={{
                background: "var(--text-heading)",
                color: "var(--bg-main)",
                padding: "14px 28px",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "bold",
                transition: "transform 0.2s"
              }}
            >
              Launch Studio
            </a>
            {isInstallable && (
              <button
                onClick={handleInstallPWA}
                style={{
                  background: "rgba(168, 255, 178, 0.1)",
                  border: "1px solid #A8FFB2",
                  color: "#A8FFB2",
                  padding: "14px 28px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                  transition: "all 0.2s"
                }}
              >
                📥 Install App (PWA)
              </button>
            )}
            <a
              href="#installation"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-main)",
                color: "var(--text-heading)",
                padding: "14px 28px",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "bold",
                transition: "all 0.2s"
              }}
            >
              Setup Guides
            </a>
          </div>
        </div>
      </section>

      {/* App Screenshot / Conceptual Wireframe */}
      <section style={{ padding: "0 24px 60px 24px", position: "relative", zIndex: 1 }}>
        <div style={{
          maxWidth: "1000px",
          margin: "0 auto",
          background: "linear-gradient(180deg, rgba(17, 17, 17, 0.8) 0%, rgba(8, 8, 8, 0.95) 100%)",
          border: "1px solid var(--border-main)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
        }}>
          {/* Window Control Bar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#FF5F56" }} />
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#FFBD2E" }} />
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#27C93F" }} />
            <span style={{ color: "var(--text-muted)", fontSize: "11px", marginLeft: "10px", lineHeight: "12px" }}>
              PubxStudio Layout
            </span>
          </div>

          {/* Interactive Mockup Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, minHeight: "340px" }}>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--border-main)", borderRadius: "8px", padding: "16px" }}>
              <div style={{ height: "20px", background: "rgba(255,255,255,0.05)", marginBottom: "12px", borderRadius: "4px" }} />
              <div style={{ height: "40px", background: "rgba(90,185,255,0.1)", marginBottom: "12px", borderRadius: "4px" }} />
              <div style={{ height: "20px", background: "rgba(255,255,255,0.05)", marginBottom: "12px", borderRadius: "4px" }} />
              <div style={{ height: "20px", background: "rgba(255,255,255,0.05)", marginBottom: "12px", borderRadius: "4px" }} />
            </div>
            <div style={{ background: "rgba(255,255,255,0.01)", border: "1px dashed var(--border-main)", borderRadius: "8px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
                <div style={{ width: "40%", height: "24px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} />
                <div style={{ width: "20%", height: "24px", background: "rgba(168,255,178,0.1)", borderRadius: "4px" }} />
              </div>
              <div style={{ height: "120px", background: "rgba(255,255,255,0.03)", marginBottom: "20px", borderRadius: "4px" }} />
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ width: "100px", height: "32px", background: "rgba(255,255,255,0.08)", borderRadius: "4px" }} />
                <div style={{ width: "120px", height: "32px", background: "rgba(90,185,255,0.2)", borderRadius: "4px" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section style={{ padding: "80px 24px", background: "rgba(255, 255, 255, 0.01)", borderTop: "1px solid var(--border-main)", borderBottom: "1px solid var(--border-main)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "32px", textAlign: "center", marginBottom: "48px", color: "var(--text-heading)" }}>
            ⚡ Complete Capability Set
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
            {/* Feature 1 */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: "12px", padding: "24px", transition: "all 0.2s" }}>
              <h3 style={{ color: "#5AB9FF", fontSize: "18px", margin: "0 0 12px 0" }}>🤖 Multi-LLM Orchestration</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
                Integrate Anthropic Claude, OpenAI, or Google Gemini keys directly in client storage. Dynamically pulls active model sets directly from platform APIs.
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: "12px", padding: "24px" }}>
              <h3 style={{ color: "#A8FFB2", fontSize: "18px", margin: "0 0 12px 0" }}>⚡ Dual-Agent Workflow</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
                Composes custom drafts based on specific presets (Strategy, Research, Coding, ML) and runs them through a second validation/quality-review agent.
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: "12px", padding: "24px" }}>
              <h3 style={{ color: "#FF5A8A", fontSize: "18px", margin: "0 0 12px 0" }}>📊 MoE & SVG Media Creator</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
                Triggers visual sub-agents to generate beautiful neon blueprints and infographics in SVG formats, directly linking them into drafts.
              </p>
            </div>

            {/* Feature 4 */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: "12px", padding: "24px" }}>
              <h3 style={{ color: "#FFC837", fontSize: "18px", margin: "0 0 12px 0" }}>🔍 SEO Inspector & Auto-Optimizer</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
                Audit keyword density instantly and trigger server-side semantic re-writers to seamlessly format headers and optimal copy structure.
              </p>
            </div>

            {/* Feature 5 */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: "12px", padding: "24px" }}>
              <h3 style={{ color: "#8D6CFF", fontSize: "18px", margin: "0 0 12px 0" }}>🔗 Multi-Platform Plugin Registry</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
                Directly publishes and bundles output packages tailored for LinkedIn Posts, Twitter Threads, Substack Newsletters, and JSON SEO profiles.
              </p>
            </div>

            {/* Feature 6 */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: "12px", padding: "24px" }}>
              <h3 style={{ color: "#00E5FF", fontSize: "18px", margin: "0 0 12px 0" }}>🔒 Absolute Privacy & Offline Zip</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
                All secrets are saved in browser localStorage. Generates a fully consolidated offline ZIP archive compiling all media assets and markdown drafts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Installation & Deployment Stepper */}
      <section id="installation" style={{ padding: "80px 24px", maxWidth: "800px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "32px", textAlign: "center", marginBottom: "40px", color: "var(--text-heading)" }}>
          🚀 Setup & Installation
        </h2>

        {/* Simplified Two-Option Layout */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          marginBottom: "32px"
        }}>
          {/* Option 1: Chrome App PWA */}
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            borderRadius: "12px",
            padding: "30px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between"
          }}>
            <div>
              <h3 style={{ margin: "0 0 16px 0", color: "var(--text-heading)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>🖥️</span> 1. Install as Chrome App
              </h3>
              <p style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
                Run PubxStudio in a dedicated standalone app window. It integrates directly with your desktop dock, system applications list, and supports quick launches.
              </p>
              <ul style={{ paddingLeft: "20px", fontSize: "12px", lineHeight: "1.7", color: "var(--text-main)", margin: 0 }}>
                <li><strong>Desktop (Chrome/Edge)</strong>: Click the install icon (📥) in the right side of the address bar.</li>
                <li><strong>Mobile (iOS Safari)</strong>: Tap the Share button and select <strong>Add to Home Screen</strong>.</li>
                <li><strong>Mobile (Android Chrome)</strong>: Tap settings and choose <strong>Install App</strong>.</li>
              </ul>
            </div>
            
            {isInstallable && (
              <button
                onClick={handleInstallPWA}
                style={{
                  marginTop: "20px",
                  background: "#5AB9FF",
                  border: "none",
                  borderRadius: "6px",
                  color: "#080808",
                  padding: "12px 20px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "12px",
                  width: "100%",
                  textAlign: "center"
                }}
              >
                📥 INSTALL NOW
              </button>
            )}
          </div>

          {/* Option 2: Launch Direct URL */}
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-main)",
            borderRadius: "12px",
            padding: "30px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between"
          }}>
            <div>
              <h3 style={{ margin: "0 0 16px 0", color: "var(--text-heading)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>🌐</span> 2. Launch Directly from URL
              </h3>
              <p style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
                Access the full dashboard suite directly in your browser tab without any installation required.
              </p>
              <div style={{
                background: "#060606",
                border: "1px solid var(--border-main)",
                padding: "12px",
                borderRadius: "6px",
                color: "#5AB9FF",
                fontSize: "12px",
                wordBreak: "break-all",
                marginBottom: "16px"
              }}>
                https://pubxstudio-alphav1.vercel.app/studio
              </div>
            </div>

            <a
              href="/studio"
              style={{
                display: "block",
                textAlign: "center",
                background: "linear-gradient(135deg, #5AB9FF 0%, #8D6CFF 100%)",
                borderRadius: "6px",
                color: "#ffffff",
                padding: "12px 20px",
                textDecoration: "none",
                fontWeight: "bold",
                fontSize: "12px"
              }}
            >
              LAUNCH STUDIO CONSOLE →
            </a>
          </div>
        </div>

        {/* Storage Warning Banner */}
        <div style={{
          background: "rgba(255, 90, 138, 0.05)",
          border: "1px solid rgba(255, 90, 138, 0.2)",
          borderRadius: "8px",
          padding: "20px",
          color: "var(--text-main)",
          fontSize: "13px",
          lineHeight: "1.6"
        }}>
          <strong style={{ color: "#FF5A8A", display: "block", marginBottom: "6px" }}>
            🔒 Privacy & Session Storage Notice:
          </strong>
          Nothing is stored on the server side or application backend. All of your API keys, credentials, drafts, and system configurations are saved exclusively within your browser's local sandbox storage ('localStorage'). 
          <span style={{ display: "block", marginTop: "8px", color: "#FF8FAD", fontWeight: "bold" }}>
            ⚠️ WARNING: If you clear your browser cache, cookies, or site data, all your credentials and saved configurations will be permanently erased.
          </span>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--border-main)",
        padding: "32px 24px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: "12px"
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <span>© 2026 PubxStudio content system. All Rights Reserved.</span>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="/guide" style={{ color: "var(--text-muted)", textDecoration: "none" }}>User Guide</a>
            <a href="/studio" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Dashboard</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
