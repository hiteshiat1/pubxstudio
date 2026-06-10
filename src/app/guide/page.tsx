"use client";

import React, { useState, useEffect } from "react";

// -------------------------------------------------------------
// Upgraded Dynamic Guide Compiler & API Reference Manual
// -------------------------------------------------------------

interface APICardData {
  title: string;
  type: string;
  color: string;
  bgGlow: string;
  codePlaceholder: string;
  instructions: string[];
}

interface ConnectorCardData {
  title: string;
  badge: string;
  color: string;
  link: string;
  instructions: string[];
}

interface TutorialStepData {
  num: number;
  title: string;
  paragraphs: string[];
}

const renderInlineCode = (text: string, key: any): React.ReactNode => {
  const codeRegex = /`([^`]+)`/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = codeRegex.exec(text)) !== null) {
    const codeText = match[1];
    const startIndex = match.index;

    if (startIndex > lastIndex) {
      parts.push(text.substring(lastIndex, startIndex));
    }

    parts.push(
      <code
        key={`code-${codeText}-${startIndex}`}
        style={{
          fontFamily: "var(--font-jetbrains, monospace)",
          fontSize: "11px",
          background: "var(--code-bg)",
          border: "1px solid var(--code-border)",
          borderRadius: "4px",
          padding: "1px 5px",
          color: "var(--code-text)",
          margin: "0 2px"
        }}
      >
        {codeText}
      </code>
    );

    lastIndex = codeRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? <React.Fragment key={key}>{parts}</React.Fragment> : text;
};

const renderFormattedText = (text: string): React.ReactNode => {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    const linkText = match[1];
    const url = match[2];
    const startIndex = match.index;

    if (startIndex > lastIndex) {
      parts.push(text.substring(lastIndex, startIndex));
    }

    parts.push(
      <a
        key={`link-${url}-${startIndex}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "#5AB9FF",
          textDecoration: "none",
          borderBottom: "1px dashed rgba(90,185,255,0.4)",
          transition: "all 0.2s"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#8D6CFF";
          e.currentTarget.style.borderBottomColor = "#8D6CFF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#5AB9FF";
          e.currentTarget.style.borderBottomColor = "rgba(90,185,255,0.4)";
        }}
      >
        {linkText}
      </a>
    );

    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? (
    <span>
      {parts.map((part, idx) => {
        if (typeof part === "string") {
          return renderInlineCode(part, idx);
        }
        return part;
      })}
    </span>
  ) : (
    renderInlineCode(text, 0)
  );
};

const SECTIONS = [
  { id: "intro", title: "📖 Introduction & Guarantee", category: "keys" },
  { id: "api-keys", title: "🔑 Credentials Setup", category: "keys" },
  { id: "connectors", title: "🔗 Connectors Sync", category: "connectors" },
  { id: "tutorial", title: "🏆 End-to-End Pass", category: "tutorial" }
] as const;

export default function StaticUserGuidePage() {
  // --- Theme Mode State ---
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

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

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<"all" | "keys" | "connectors" | "tutorial">("all");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  
  // Dynamic Parsed States
  const [guideIntro, setGuideIntro] = useState("");
  const [apiCards, setApiCards] = useState<APICardData[]>([]);
  const [connectorCards, setConnectorCards] = useState<ConnectorCardData[]>([]);
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStepData[]>([]);
  const [loading, setLoading] = useState(true);

  // Interactive Tutorial Timeline State
  const [activeStep, setActiveStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({
    1: false, 2: false, 3: false, 4: false, 5: false
  });

  // Handle Clipboard Copies
  const handleCopy = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(identifier);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Toggle step completion in the tutorial
  const toggleStep = (stepNum: number) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }));
  };

  // Fetch and Parse the guide.md dynamically to preserve absolute single-source data
  useEffect(() => {
    fetch("/guide.md")
      .then((res) => res.text())
      .then((text) => {
        parseGuideMarkdown(text);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load guide.md:", err);
        setLoading(false);
      });
  }, []);

  const parseGuideMarkdown = (content: string) => {
    const lines = content.split("\n");
    let currentHeader = "";
    
    let introAccumulator = "";
    let claudInst: string[] = [];
    let openaiInst: string[] = [];
    let geminiInst: string[] = [];

    let linkedinInst: string[] = [];
    let twitterInst: string[] = [];
    let substackInst: string[] = [];
    let mediumInst: string[] = [];

    let stepData: Record<number, { title: string; paras: string[] }> = {
      1: { title: "", paras: [] },
      2: { title: "", paras: [] },
      3: { title: "", paras: [] },
      4: { title: "", paras: [] },
      5: { title: "", paras: [] },
    };

    let targetSection: "intro" | "keys" | "connectors" | "tutorial" = "intro";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("## 🛠️ Step-by-Step API Key Configurations")) {
        targetSection = "keys";
        continue;
      } else if (line.startsWith("## 🚀 Setting Up Platform Connectors")) {
        targetSection = "connectors";
        continue;
      } else if (line.startsWith("## 🏆 End-to-End Tutorial")) {
        targetSection = "tutorial";
        continue;
      }

      if (targetSection === "intro") {
        if (!line.startsWith("#")) {
          introAccumulator += (introAccumulator ? " " : "") + line;
        }
      } else if (targetSection === "keys") {
        if (line.startsWith("### 1. Anthropic")) {
          currentHeader = "claude";
        } else if (line.startsWith("### 2. OpenAI")) {
          currentHeader = "openai";
        } else if (line.startsWith("### 3. Google Gemini")) {
          currentHeader = "gemini";
        } else if (/^(\*|-|\d+\.)\s/.test(line)) {
          const itemText = line.replace(/^[\*\d\.\-\s]+/, "");
          if (currentHeader === "claude") claudInst.push(itemText);
          if (currentHeader === "openai") openaiInst.push(itemText);
          if (currentHeader === "gemini") geminiInst.push(itemText);
        }
      } else if (targetSection === "connectors") {
        if (line.startsWith("### 🔗 LinkedIn")) {
          currentHeader = "linkedin";
        } else if (line.startsWith("### 🔗 Twitter")) {
          currentHeader = "twitter";
        } else if (line.startsWith("### 🔗 Substack")) {
          currentHeader = "substack";
        } else if (line.startsWith("### 🔗 Medium")) {
          currentHeader = "medium";
        } else if (/^(\*|-|\d+\.)\s/.test(line)) {
          const itemText = line.replace(/^[\*\d\.\-\s]+/, "");
          if (currentHeader === "linkedin") linkedinInst.push(itemText);
          if (currentHeader === "twitter") twitterInst.push(itemText);
          if (currentHeader === "substack") substackInst.push(itemText);
          if (currentHeader === "medium") mediumInst.push(itemText);
        }
      } else if (targetSection === "tutorial") {
        const stepMatch = line.match(/^### Step (\d+):\s*(.*)/i);
        if (stepMatch) {
          const stepNum = parseInt(stepMatch[1], 10);
          stepData[stepNum].title = stepMatch[2];
          currentHeader = `step-${stepNum}`;
        } else if (currentHeader.startsWith("step-")) {
          const stepNum = parseInt(currentHeader.split("-")[1], 10);
          if (!line.startsWith("###")) {
            stepData[stepNum].paras.push(line.replace(/^[\d\.\-\*\s]+/, ""));
          }
        }
      }
    }

    setGuideIntro(introAccumulator);

    // Build API Cards
    setApiCards([
      {
        title: "Anthropic Claude Key",
        type: "CREATIVE / EDITORIAL",
        color: "rgb(234, 115, 87)",
        bgGlow: "rgba(234, 115, 87, 0.05)",
        codePlaceholder: "sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx",
        instructions: claudInst.length > 0 ? claudInst : ["Navigate to Anthropic Developer Console.", "Generate api keys naming it pubx-studio.", "Copy secret sk-ant- token into credentials."],
      },
      {
        title: "OpenAI GPT-4o Key",
        type: "REASONING / SEO AUDITS",
        color: "rgb(16, 163, 127)",
        bgGlow: "rgba(16, 163, 127, 0.05)",
        codePlaceholder: "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx",
        instructions: openaiInst.length > 0 ? openaiInst : ["Visit OpenAI Platform API Settings.", "Generate new secret key with proper permissions.", "Copy sk-proj- key into settings credentials."],
      },
      {
        title: "Google Gemini Key",
        type: "MULTIMODAL / PARALLEL",
        color: "rgb(141, 108, 255)",
        bgGlow: "rgba(141, 108, 255, 0.05)",
        codePlaceholder: "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxx",
        instructions: geminiInst.length > 0 ? geminiInst : ["Open Google AI Studio Key Manager.", "Click Create API Key bound to cloud project.", "Copy and paste key under settings credentials."],
      },
    ]);

    // Build Connectors
    setConnectorCards([
      {
        title: "LinkedIn integration",
        badge: "w_member_social",
        color: "#0A66C2",
        link: "https://developer.linkedin.com/",
        instructions: linkedinInst.length > 0 ? linkedinInst : ["Visit LinkedIn Developers Portal.", "Create an App associated with verified Company Page.", "Activate Share on LinkedIn inside products tab.", "Generate Member Access Token and paste in keys."],
      },
      {
        title: "Twitter / X Platform",
        badge: "Bearer Token",
        color: "#1DA1F2",
        link: "https://developer.twitter.com/en/portal/dashboard",
        instructions: twitterInst.length > 0 ? twitterInst : ["Visit Twitter Developers Dashboard.", "Enable OAuth 2.0 (Web or Native Client app).", "Copy client Bearer Access Token key and save in workspace settings."],
      },
      {
        title: "Substack Drip Connection",
        badge: "Publication URL",
        color: "#FF6B00",
        link: "https://substack.com",
        instructions: substackInst.length > 0 ? substackInst : ["Go to Substack Settings panel.", "Copy Substack publication sub-URL identifier.", "Paste publication handle under Substack settings."],
      },
      {
        title: "Medium publisher",
        badge: "Integration Token",
        color: "#ffffff",
        link: "https://medium.com/me/settings/security",
        instructions: mediumInst.length > 0 ? mediumInst : ["Visit Medium Security settings profile.", "Generate direct Integration Token descriptive label.", "Paste integration token key in credentials settings."],
      },
    ]);

    // Build Tutorial Steps
    const compiledSteps: TutorialStepData[] = [];
    for (let stepNum = 1; stepNum <= 5; stepNum++) {
      compiledSteps.push({
        num: stepNum,
        title: stepData[stepNum].title || `Step ${stepNum} Milestone`,
        paragraphs: stepData[stepNum].paras,
      });
    }
    setTutorialSteps(compiledSteps);
  };

  // Filter sections by search query and button tags
  const matchesSearch = (text: string) => {
    if (!searchQuery) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const isTutorialDone = Object.values(completedSteps).every(Boolean);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-main)", color: "var(--text-main)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-jetbrains, monospace)" }}>
        🔄 LOADING PUBXSTUDIO DYNAMIC MANUAL COMPILER...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)", color: "var(--text-main)", fontFamily: "var(--font-jetbrains, monospace)", boxSizing: "border-box", transition: "background-color 0.3s, color 0.3s" }}>
      
      {/* Premium Header / Hero Banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(90,185,255,0.06) 0%, rgba(168,255,178,0.02) 100%)",
        borderBottom: "1px solid var(--border-main)",
        padding: "40px 24px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>📖</span>
              <h1 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 32, color: "var(--text-heading)", fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>
                PubxStudio Static Guide & Manual
              </h1>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, maxWidth: 650, lineHeight: 1.5, fontFamily: "var(--font-jetbrains, monospace)" }}>
              An offline-first developer manual for credentials, social connectors, and automated multi-LLM publishing pipelines.
            </p>
          </div>
          
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={toggleTheme}
              style={{
                padding: "10px 12px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-main)",
                borderRadius: 8,
                color: "var(--text-heading)",
                cursor: "pointer",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--shadow)",
                transition: "all 0.2s"
              }}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <a
              href="/studio"
              style={{
                padding: "12px 24px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-main)",
                borderRadius: 8,
                color: "var(--text-heading)",
                textDecoration: "none",
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s",
                boxShadow: "var(--shadow)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-card-hover)";
                e.currentTarget.style.borderColor = "var(--border-focus)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-card)";
                e.currentTarget.style.borderColor = "var(--border-main)";
              }}
            >
              ← BACK TO STUDIO
            </a>
          </div>
        </div>
      </div>

      {/* Main Grid Workspace */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: "280px 1fr", gap: 40 }}>
        
        {/* LEFT COLUMN: STICKY NAVIGATION & SIDEBAR */}
        <div style={{ position: "sticky", top: 40, height: "fit-content" }}>
          
          {/* Quick Search */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 10, color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}>Search Manual</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Type platform or key..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-main)",
                  borderRadius: 8,
                  color: "var(--text-heading)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "var(--font-jetbrains, monospace)",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#FF5A5A", cursor: "pointer", fontSize: 12 }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filter Category pills */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 10, color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}>Filter Category</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(["all", "keys", "connectors", "tutorial"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    background: filterCategory === cat ? "rgba(90,185,255,0.06)" : "transparent",
                    border: filterCategory === cat ? "1px solid rgba(90,185,255,0.3)" : "1px solid transparent",
                    borderRadius: 6,
                    color: filterCategory === cat ? "#5AB9FF" : "var(--text-muted)",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontWeight: filterCategory === cat ? 700 : 400,
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (filterCategory !== cat) e.currentTarget.style.color = "var(--text-heading)";
                  }}
                  onMouseLeave={(e) => {
                    if (filterCategory !== cat) e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  {cat === "all" ? "📂 All Chapters" : cat === "keys" ? "🔑 Credentials Setup" : cat === "connectors" ? "🔗 Connectors Sync" : "🏆 End-to-End Pass"}
                </button>
              ))}
            </div>
          </div>

          {/* Table of Contents list */}
          <div style={{ borderTop: "1px solid var(--border-main)", paddingTop: 20 }}>
            <label style={{ display: "block", fontSize: 10, color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}>Jump To Chapter</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setFilterCategory("all");
                    setTimeout(() => {
                      const el = document.getElementById(section.id);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }, 50);
                  }}
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 13,
                    textDecoration: "none",
                    padding: "4px 0",
                    transition: "color 0.2s",
                    display: "block",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "#5AB9FF"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: INTERACTIVE DOCUMENT CANVAS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 50 }}>
          
          {/* 1. Introduction Section */}
          {(filterCategory === "all" || filterCategory === "keys") && matchesSearch(guideIntro) && (
            <section id="intro" style={{ scrollMarginTop: 40 }}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 30, boxShadow: "var(--shadow)" }}>
                <h2 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 24, color: "var(--text-heading)", fontWeight: 400, margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>📖</span> Welcome to PubxStudio Guide
                </h2>
                <p style={{ fontSize: 15, color: "var(--text-main)", lineHeight: 1.7, margin: 0 }}>
                  {renderFormattedText(guideIntro || "This interactive guide manual outlines how to setup API keys, establish direct publishing adapters, configure custom hashtag pipelines, and run your first dynamic multi-LLM Studio flow.")}
                </p>
                <div style={{
                  marginTop: 20,
                  padding: 15,
                  background: "var(--guide-bg-highlight)",
                  border: "1px solid var(--guide-border-highlight)",
                  borderRadius: 8,
                  color: "var(--guide-text-highlight)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontFamily: "var(--font-jetbrains, monospace)",
                }}>
                  🔐 <strong>SECURITY GUARANTEE:</strong> All keys and integration credentials are saved <strong>exclusively in your browser's local storage (`localStorage`)</strong>. No credentials ever touch our servers or code versioning stacks, ensuring complete stateless offline privacy!
                </div>
              </div>
            </section>
          )}

          {/* 2. Step-by-Step API Key Configurations */}
          {(filterCategory === "all" || filterCategory === "keys") && (
            <section id="api-keys" style={{ scrollMarginTop: 40 }}>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 26, color: "var(--text-heading)", fontWeight: 400, margin: "0 0 8px 0" }}>
                  🛠️ Step-by-Step API Key Configurations
                </h2>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
                  Integrate your own credentials to spawn highly specialized copywriting and structural agents.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {apiCards.filter(card => matchesSearch(card.title + " " + card.type + " " + card.instructions.join(" "))).map((card, idx) => (
                  <div key={idx} style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-main)",
                    borderLeft: `4px solid ${card.color}`,
                    borderRadius: 8,
                    padding: 24,
                    boxShadow: "var(--shadow)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 8px 24px ${card.color}15, var(--shadow)`;
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "var(--shadow)";
                    e.currentTarget.style.transform = "none";
                  }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18, color: card.color, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}>0{idx + 1}</span>
                        <h3 style={{ margin: 0, fontSize: 18, color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 400 }}>{card.title}</h3>
                      </div>
                      <span style={{ fontSize: 11, background: `${card.color}15`, color: card.color, padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}>{card.type}</span>
                    </div>
                    
                    <div style={{ fontSize: 13, color: "var(--text-main)", paddingLeft: 12, borderLeft: "2px solid var(--border-main)" }}>
                      <strong style={{ color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", display: "block", marginBottom: 6 }}>How to configure:</strong>
                      <ol style={{ paddingLeft: 16, margin: "6px 0", lineHeight: 1.6, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text-muted)" }}>
                        {card.instructions.map((inst, subIdx) => (
                           <li key={subIdx} style={{ marginBottom: 6 }}>{renderFormattedText(inst)}</li>
                        ))}
                      </ol>
                    </div>

                    <div style={{ marginTop: 14, background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <code style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 12, color: card.color }}>{card.codePlaceholder}</code>
                      <button
                        onClick={() => handleCopy(card.codePlaceholder.split("-")[0], `key-mock-${idx}`)}
                        style={{ background: "transparent", border: "none", color: copiedText === `key-mock-${idx}` ? "var(--guide-text-highlight)" : "var(--text-label)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)" }}
                      >
                        {copiedText === `key-mock-${idx}` ? "✓ Copied" : "Copy Mock"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. Setting Up Platform Connectors */}
          {(filterCategory === "all" || filterCategory === "connectors") && (
            <section id="connectors" style={{ scrollMarginTop: 40 }}>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 26, color: "var(--text-heading)", fontWeight: 400, margin: "0 0 8px 0" }}>
                  🚀 Setting Up Platform Connectors
                </h2>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
                  Enable direct publishers by configuring access tokens for LinkedIn, Twitter, Substack, and Medium.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {connectorCards.filter(card => matchesSearch(card.title + " " + card.instructions.join(" "))).map((card, idx) => {
                  const cardColor = card.color === "#ffffff" ? (theme === "dark" ? "#ffffff" : "var(--text-heading)") : card.color;
                  return (
                    <div key={idx} style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 8, padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "var(--shadow)" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                          <h4 style={{ margin: 0, fontSize: 17, color: "var(--text-heading)", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 400 }}>
                            <span style={{ color: cardColor }}>🔗</span> {card.title}
                          </h4>
                          <span style={{ fontSize: 10, background: `${card.color === "#ffffff" ? (theme === "dark" ? "#ffffff" : "#000000") : card.color}15`, color: cardColor, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}>{card.badge}</span>
                        </div>
                        <ol style={{ paddingLeft: 16, margin: "0 0 14px 0", fontSize: 12, color: "var(--text-main)", lineHeight: 1.5, fontFamily: "var(--font-jetbrains, monospace)" }}>
                          {card.instructions.map((inst, subIdx) => (
                            <li key={subIdx} style={{ marginBottom: 6 }}>{renderFormattedText(inst)}</li>
                          ))}
                        </ol>
                      </div>
                      
                      <a
                        href={card.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "block",
                          textAlign: "center",
                          padding: "8px 12px",
                          background: "var(--bg-subtle)",
                          border: "1px solid var(--border-main)",
                          borderRadius: 6,
                          color: "var(--text-muted)",
                          fontSize: 11,
                          textDecoration: "none",
                          fontFamily: "var(--font-jetbrains, monospace)",
                          fontWeight: 700,
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "#5AB9FF";
                          e.currentTarget.style.borderColor = "var(--border-focus)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-muted)";
                          e.currentTarget.style.borderColor = "var(--border-main)";
                        }}
                      >
                        OPEN DEVELOPER PORTAL
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. End-to-End Tutorial: Generate & Publish */}
          {(filterCategory === "all" || filterCategory === "tutorial") && (
            <section id="tutorial" style={{ scrollMarginTop: 40 }}>
              
              <div style={{ marginBottom: 24, borderBottom: "1px solid var(--border-main)", paddingBottom: 15 }}>
                <h2 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 26, color: "var(--text-heading)", fontWeight: 400, margin: "0 0 8px 0" }}>
                  🏆 End-to-End Tutorial: Generate & Publish
                </h2>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
                  Click through steps 1-5 to learn how to generate, review versions, optimize SEO, and publish your content bundle.
                </p>
              </div>

              {/* Steps Progress Header Tracker */}
              <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((stepNum) => {
                  const isActive = activeStep === stepNum;
                  const isDone = completedSteps[stepNum];
                  return (
                    <button
                      key={stepNum}
                      onClick={() => setActiveStep(stepNum)}
                      style={{
                        flex: 1,
                        minWidth: 100,
                        padding: "12px 10px",
                        background: isActive ? "rgba(90,185,255,0.08)" : isDone ? "var(--guide-bg-highlight)" : "var(--bg-card)",
                        border: isActive ? "1px solid #5AB9FF" : isDone ? "1px solid var(--guide-border-highlight)" : "1px solid var(--border-main)",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        transition: "all 0.2s",
                        boxShadow: "var(--shadow)"
                      }}
                    >
                      <span style={{ fontSize: 9, color: isDone ? "var(--guide-text-highlight)" : "var(--text-label)", fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)", textTransform: "uppercase" }}>
                        {isDone ? "✓ DONE" : `STEP 0${stepNum}`}
                      </span>
                      <span style={{ fontSize: 12, color: isActive ? "#5AB9FF" : isDone ? "var(--guide-text-highlight)" : "var(--text-heading)", fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)" }}>
                        {stepNum === 1 ? "Preset Load" : stepNum === 2 ? "Context RAG" : stepNum === 3 ? "Spawn Agent" : stepNum === 4 ? "Audit & Edit" : "Direct Post"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Step Panel */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 30, marginBottom: 20, boxShadow: "var(--shadow)" }}>
                {tutorialSteps.filter(step => step.num === activeStep).map((step, idx) => (
                  <div key={idx}>
                    <h3 style={{ fontSize: 18, color: "var(--text-heading)", margin: "0 0 12px 0", fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 400 }}>
                      Step {step.num}: {step.title}
                    </h3>
                    {step.paragraphs.map((p, pIdx) => {
                      if (p.includes("Unified Output Bundle:")) {
                        return (
                          <div key={pIdx} style={{ marginTop: 14, background: "rgba(90,185,255,0.04)", border: "1px solid rgba(90,185,255,0.15)", borderRadius: 8, padding: 14, fontSize: 13, color: "#5AB9FF", lineHeight: 1.5, fontFamily: "var(--font-jetbrains, monospace)" }}>
                            📁 <strong>Unified Output Bundle:</strong> The workspace automatically bundles your MDX post, platform formats, RAG images, and SEO data together under a local output directory: <code style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "11px", background: "var(--code-bg)", border: "1px solid var(--code-border)", borderRadius: "4px", padding: "1px 5px", color: "var(--code-text)" }}>published/[slug]/</code>
                          </div>
                        );
                      }
                      
                      const isBoldTip = p.startsWith("Dynamic UI Action:") || p.startsWith("Security Guarantee:") || p.startsWith("Result:");
                      return (
                        <p key={pIdx} style={{
                          fontSize: 14,
                          color: isBoldTip ? "var(--text-heading)" : "var(--text-main)",
                          lineHeight: 1.6,
                          margin: "0 0 12px 0",
                          fontFamily: "var(--font-jetbrains, monospace)",
                          background: isBoldTip ? "var(--bg-subtle)" : "transparent",
                          padding: isBoldTip ? "8px 12px" : "0",
                          borderRadius: isBoldTip ? 6 : 0,
                          borderLeft: isBoldTip ? `2px solid ${activeStep === 5 ? "#5AFFDB" : "#5AB9FF"}` : "none"
                        }}>
                          {renderFormattedText(p)}
                        </p>
                      );
                    })}
                  </div>
                ))}

                {/* Checklist checkbox inside the step panel */}
                <div style={{ marginTop: 20, borderTop: "1px solid var(--border-main)", paddingTop: 15, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)" }}>
                    <input
                      type="checkbox"
                      checked={completedSteps[activeStep] || false}
                      onChange={() => toggleStep(activeStep)}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--guide-text-highlight)" }}
                    />
                    Mark this Step as Completed
                  </label>
                  
                  {activeStep < 5 && (
                    <button
                      onClick={() => setActiveStep(activeStep + 1)}
                      style={{ padding: "6px 12px", background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}
                    >
                      Next Step →
                    </button>
                  )}
                </div>
              </div>

              {/* Tutorial Complete Success banner */}
              {isTutorialDone && (
                <div style={{
                  background: "linear-gradient(135deg, var(--guide-bg-highlight) 0%, rgba(90,185,255,0.05) 100%)",
                  border: "1.5px solid var(--guide-border-highlight)",
                  borderRadius: 12,
                  padding: 24,
                  textAlign: "center",
                  boxShadow: "0 8px 24px rgba(168,255,178,0.05)",
                  animation: "pulse 2s infinite"
                }}>
                  <h3 style={{ margin: 0, fontSize: 20, color: "var(--guide-text-highlight)", fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 400 }}>
                    🎉 Tutorial Completed Successfully!
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--text-main)", margin: "8px 0 16px 0", lineHeight: 1.5, fontFamily: "var(--font-jetbrains, monospace)" }}>
                    You are now fully trained on PubxStudio's multi-LLM Studio! You can confidently configure keys, upload research context, optimize SEO metrics, and execute Direct Publishing actions.
                  </p>
                  <a
                    href="/studio"
                    style={{
                      display: "inline-block",
                      padding: "10px 20px",
                      background: "var(--guide-text-highlight)",
                      border: "none",
                      borderRadius: 6,
                      color: "var(--bg-main)",
                      fontWeight: 700,
                      fontSize: 12,
                      textDecoration: "none",
                      fontFamily: "var(--font-jetbrains, monospace)",
                    }}
                  >
                    GO TO STUDIO CONSOLE
                  </a>
                </div>
              )}

            </section>
          )}

        </div>

      </div>

      {/* Footer */}
      <div style={{
        marginTop: 80,
        padding: "40px 24px",
        borderTop: "1px solid var(--border-main)",
        textAlign: "center",
        background: "var(--bg-subtle)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12
      }}>
        <p style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-muted-dark)", margin: 0, letterSpacing: "0.05em" }}>
          PUBXSTUDIO v2.4 — STATELESS OFFLINE INTELLIGENCE
        </p>
        <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)" }}>
          <button onClick={() => setTermsOpen(true)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, textDecoration: "underline", padding: 0 }}>Terms & Conditions</button>
          <span style={{ color: "var(--border-main)" }}>|</span>
          <button onClick={() => setPrivacyOpen(true)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, textDecoration: "underline", padding: 0 }}>Privacy Policy</button>
        </div>
      </div>

      {/* Terms & Conditions Modal */}
      {termsOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000, padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 640, maxHeight: "85vh", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: "30px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-main)", paddingBottom: 12 }}>
              <h3 style={{ fontSize: 18, color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📜</span> Terms & Conditions
              </h3>
              <button
                onClick={() => setTermsOpen(false)}
                style={{ background: "transparent", border: "none", color: "#FF5A5A", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-jetbrains, monospace)", padding: 0 }}
              >
                ✕ Close
              </button>
            </div>
            
            <div style={{ overflowY: "auto", flex: 1, margin: "20px 0", paddingRight: 10, fontSize: 13, lineHeight: 1.6, color: "var(--text-main)", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Bold Disclaimer block */}
              <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid #EF4444", borderRadius: 8, padding: 16, color: "#F87171" }}>
                <strong style={{ display: "block", marginBottom: 6, fontSize: 12, letterSpacing: "0.05em", textTransform: "uppercase" }}>⚠️ CRITICAL WARNING & LIABILITY DISCLAIMER</strong>
                <ul style={{ paddingLeft: 16, margin: 0, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <li><strong>ACCURACY OF AI LOGIC:</strong> None of the software operations, research outputs, SEO density audits, generated posts, or automated AI logic provided by this application are deemed to be accurate or error-free. Always check, verify, and edit all drafts before publishing.</li>
                  <li><strong>NO FINANCIAL OR INVESTMENT ADVICE:</strong> Absolutely no content, analysis, Presets, or summaries generated or processed by this app constitutes financial, investment, legal, tax, or professional advice. This software must not be used to make investment decisions.</li>
                  <li><strong>NO GUARANTEES:</strong> This application is provided completely "AS IS" without warranties or guarantees of any kind, including uptime, API access preservation, or publishing success.</li>
                </ul>
              </div>

              <p style={{ margin: 0 }}>
                Welcome to PubxStudio. By accessing or using this local, stateless application, you agree to be bound by these Terms and Conditions. If you do not agree, do not use the application.
              </p>

              <div>
                <strong style={{ color: "var(--text-heading)", display: "block", marginBottom: 4 }}>1. Scope of Use & Local Processing</strong>
                <p style={{ margin: 0 }}>
                  PubxStudio operates as a local developer manual and publishing interface. It compiles API calls directly from your browser to your third-party providers (OpenAI, Anthropic, Google). You represent that you possess valid developer credentials and active subscription rights to invoke these APIs.
                </p>
              </div>

              <div>
                <strong style={{ color: "var(--text-heading)", display: "block", marginBottom: 4 }}>2. Limitation of Liability</strong>
                <p style={{ margin: 0 }}>
                  Under no circumstances shall the creators, contributors, or distributors of PubxStudio be liable for any direct, indirect, incidental, special, or consequential damages arising out of the use or inability to use this software, including but not limited to API cost overruns, platform account bans, or publishing errors.
                </p>
              </div>

              <div>
                <strong style={{ color: "var(--text-heading)", display: "block", marginBottom: 4 }}>3. Compliance & Jurisdiction</strong>
                <p style={{ margin: 0 }}>
                  These terms shall be governed by international developer standards and local jurisdictions. You are solely responsible for ensuring compliance with your local laws, including US CCPA/CPRA, European Union GDPR, and platform developer terms of service.
                </p>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-main)", paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setTermsOpen(false)}
                style={{ padding: "10px 24px", background: "var(--guide-text-highlight)", border: "none", borderRadius: 6, color: "var(--bg-main)", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)" }}
              >
                I UNDERSTAND & AGREE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {privacyOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000, padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 640, maxHeight: "85vh", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: "30px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-main)", paddingBottom: 12 }}>
              <h3 style={{ fontSize: 18, color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>🛡️</span> Privacy Policy
              </h3>
              <button
                onClick={() => setPrivacyOpen(false)}
                style={{ background: "transparent", border: "none", color: "#FF5A5A", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-jetbrains, monospace)", padding: 0 }}
              >
                ✕ Close
              </button>
            </div>
            
            <div style={{ overflowY: "auto", flex: 1, margin: "20px 0", paddingRight: 10, fontSize: 13, lineHeight: 1.6, color: "var(--text-main)", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Privacy highlight banner */}
              <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid #10B981", borderRadius: 8, padding: 16, color: "#34D399" }}>
                <strong style={{ display: "block", marginBottom: 6, fontSize: 12, letterSpacing: "0.05em", textTransform: "uppercase" }}>🔒 Zero-Server Storage Guarantee</strong>
                <p style={{ margin: 0, fontSize: 12 }}>
                  All your developer keys, client access tokens, custom preset inputs, tone instructions, and draft logs are stored <strong>exclusively in your browser's local storage (`localStorage`)</strong>. No credentials ever touch our servers, databases, or version control systems.
                </p>
              </div>

              <p style={{ margin: 0 }}>
                This Privacy Policy describes how we handle information in our stateless offline application. Because we do not run a centralized backend database for your data, your data remains fully under your own custody.
              </p>

              <div>
                <strong style={{ color: "var(--text-heading)", display: "block", marginBottom: 4 }}>1. Data Storage & Cookie Policy</strong>
                <p style={{ margin: 0 }}>
                  We do not use tracking cookies, analytics pixels, or advertisement trackers. Local storage is used strictly for offline functionality to persist settings (active theme, credentials, category selections).
                </p>
              </div>

              <div>
                <strong style={{ color: "var(--text-heading)", display: "block", marginBottom: 4 }}>2. GDPR & CCPA/CPRA Rights</strong>
                <p style={{ margin: 0 }}>
                  By design, you are the sole owner of your data. Under the EU GDPR and US CCPA/CPRA, you have the right to access, rectify, export, or erase all of your data at any time. You can instantly exercise these rights by clearing your browser's site cookies and local storage.
                </p>
              </div>

              <div>
                <strong style={{ color: "var(--text-heading)", display: "block", marginBottom: 4 }}>3. Third-Party Services</strong>
                <p style={{ margin: 0 }}>
                  When requesting article generation or research summaries, data is transmitted directly from your client machine to third-party generative API endpoints (OpenAI, Anthropic, Google). Your interaction with these APIs is governed by their respective privacy terms and developer conditions.
                </p>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-main)", paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setPrivacyOpen(false)}
                style={{ padding: "10px 24px", background: "var(--guide-text-highlight)", border: "none", borderRadius: 6, color: "var(--bg-main)", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)" }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
