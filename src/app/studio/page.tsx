"use client";

import React, { useState, useEffect } from "react";
import {
  runGenerationPipeline,
  saveOutputBundle,
  directPublishToAccount,
  autoOptimizeSEO,
  fetchDynamicModels,
} from "../actions";
import { downloadZip } from "../utils/zip";
import {
  PUBLISHING_PLUGINS,
  detectMoE,
  CATEGORY_ORDER,
  CATEGORIES,
  type Category,
  type PipelineOutputs,
  type ContentVersion,
} from "../constants";

// -------------------------------------------------------------
// Interactive Static HTML Markdown Renderer (Requirement 19 & 20)
// -------------------------------------------------------------
function parseInlineStyles(text: string, activeColor: string): React.ReactNode[] {
  let parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;
  
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
    const linkMatch = remaining.match(/\[(.*?)\]\((.*?)\)/);
    const codeMatch = remaining.match(/\`(.*?)\`/);
    
    let earliest: { index: number; type: "bold" | "link" | "code"; match: RegExpMatchArray } | null = null;
    
    if (boldMatch && boldMatch.index !== undefined) {
      earliest = { index: boldMatch.index, type: "bold", match: boldMatch };
    }
    if (linkMatch && linkMatch.index !== undefined && (!earliest || linkMatch.index < earliest.index)) {
      earliest = { index: linkMatch.index, type: "link", match: linkMatch };
    }
    if (codeMatch && codeMatch.index !== undefined && (!earliest || codeMatch.index < earliest.index)) {
      earliest = { index: codeMatch.index, type: "code", match: codeMatch };
    }
    
    if (!earliest) {
      parts.push(<span key={keyIdx++}>{remaining}</span>);
      break;
    }
    
    if (earliest.index > 0) {
      parts.push(<span key={keyIdx++}>{remaining.slice(0, earliest.index)}</span>);
    }
    
    const matchContent = earliest.match[1];
    if (earliest.type === "bold") {
      parts.push(<strong key={keyIdx++} style={{ color: "#fff", fontWeight: 700 }}>{matchContent}</strong>);
    } else if (earliest.type === "link") {
      const url = earliest.match[2];
      parts.push(
        <a key={keyIdx++} href={url} target="_blank" rel="noreferrer" style={{ color: activeColor, textDecoration: "underline", fontWeight: 500 }}>
          {matchContent}
        </a>
      );
    } else if (earliest.type === "code") {
      parts.push(
        <code key={keyIdx++} style={{ background: "var(--code-bg)", border: "1px solid var(--code-border)", borderRadius: 4, padding: "2px 5px", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--code-text)" }}>
          {matchContent}
        </code>
      );
    }
    
    remaining = remaining.slice(earliest.index + earliest.match[0].length);
  }
  
  return parts;
}

function MarkdownRenderer({ content, activeColor }: { content: string; activeColor: string }) {
  const lines = content.split("\n");
  const renderedElements: React.ReactNode[] = [];
  
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeBlockKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle Code Blocks
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        // Close block and render
        inCodeBlock = false;
        const codeText = codeLines.join("\n");
        renderedElements.push(
          <pre key={`code-${codeBlockKey++}`} style={{ background: "var(--pre-bg)", border: "1px solid var(--pre-border)", borderRadius: 8, padding: 14, color: "var(--pre-text)", fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all", overflowX: "auto", margin: "14px 0" }}>
            {codeText}
          </pre>
        );
        codeLines = [];
      } else {
        // Open block
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Horizontal Rule
    if (trimmed === "---") {
      renderedElements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #222", margin: "24px 0" }} />);
      continue;
    }

    // Headers
    if (trimmed.startsWith("# ")) {
      renderedElements.push(
        <h1 key={i} style={{ fontSize: 26, color: "#fff", fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 400, marginTop: 28, marginBottom: 14, borderBottom: "1px solid #222", paddingBottom: 10 }}>
          {parseInlineStyles(trimmed.slice(2), activeColor)}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      renderedElements.push(
        <h2 key={i} style={{ fontSize: 18, color: activeColor, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 400, marginTop: 22, marginBottom: 12 }}>
          {parseInlineStyles(trimmed.slice(3), activeColor)}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      renderedElements.push(
        <h3 key={i} style={{ fontSize: 14, color: "#fff", fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
          {parseInlineStyles(trimmed.slice(4), activeColor)}
        </h3>
      );
      continue;
    }

    // Lists
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      renderedElements.push(
        <div key={i} style={{ display: "flex", gap: 10, paddingLeft: 8, margin: "6px 0", alignItems: "baseline" }}>
          <span style={{ color: activeColor, fontSize: 14 }}>•</span>
          <span style={{ fontSize: 13, color: "#ccc" }}>{parseInlineStyles(trimmed.slice(2), activeColor)}</span>
        </div>
      );
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      renderedElements.push(
        <div key={i} style={{ display: "flex", gap: 10, paddingLeft: 8, margin: "6px 0", alignItems: "baseline" }}>
          <span style={{ color: activeColor, fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, fontWeight: 700 }}>{numMatch[1]}.</span>
          <span style={{ fontSize: 13, color: "#ccc" }}>{parseInlineStyles(numMatch[2], activeColor)}</span>
        </div>
      );
      continue;
    }

    // Empty Lines
    if (!trimmed) {
      renderedElements.push(<div key={i} style={{ height: 10 }} />);
      continue;
    }

    // Standard Paragraph
    renderedElements.push(
      <p key={i} style={{ margin: "10px 0", fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>
        {parseInlineStyles(line, activeColor)}
      </p>
    );
  }

  return <div style={{ display: "flex", flexDirection: "column" }}>{renderedElements}</div>;
}

const CHARACTER_LIMITS: Record<string, { limit: number; label: string }> = {
  article: { limit: 120000, label: "Max recommended article length (120k chars)" },
  linkedin: { limit: 3000, label: "Free & Premium post character limit (3,000 chars)" },
  x: { limit: 280, label: "Free account tweet character limit (280 chars per tweet)" },
  substack: { limit: 100000, label: "Max recommended for email inboxes (100k chars)" },
  medium: { limit: 150000, label: "Max recommended article length (150k chars)" },
  seo: { limit: 10000, label: "Max recommended metadata size (10k chars)" },
  leadmagnet: { limit: 100000, label: "Max recommended lead magnet length (100k chars)" },
};

export default function PubxStudioPage() {
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

  // --- Workspace Inputs ---
  const [topic, setTopic] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState<Category>("Engineering & Code");
  const [slug, setSlug] = useState("");
  const [brief, setBrief] = useState("");
  
  // --- Model Settings ---
  const [provider, setProvider] = useState<"openai" | "gemini" | "claude">("claude");
  const [model, setModel] = useState("claude-3-5-sonnet-latest");
  const [moeOverride, setMoeOverride] = useState<boolean | null>(null);

  // --- RAG Materials ---
  const [ragContext, setRagContext] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [currentLink, setCurrentLink] = useState("");
  const [attachedImages, setAttachedImages] = useState<{ name: string; dataUrl: string }[]>([]);
  const [attachedDocs, setAttachedDocs] = useState<{ name: string; type: string; size: string }[]>([]);

  // --- Custom Plugin Prompts ---
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const [editingPluginPromptId, setEditingPluginPromptId] = useState<string | null>(null);

  // --- Execution & App State ---
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);
  const [outputs, setOutputs] = useState<PipelineOutputs | null>(null);
  const [activePluginTab, setActivePluginTab] = useState("article");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // --- Review & HITL States ---
  const [approvedForPublication, setApprovedForPublication] = useState(false);
  const [publishStatus, setPublishStatus] = useState<Record<string, { ok: boolean; message: string; url?: string }>>({});
  const [publishingTo, setPublishingTo] = useState<string | null>(null);

  // --- Settings Sidebar State ---
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState({ openai: "", gemini: "", claude: "" });
  const [dynamicModels, setDynamicModels] = useState<Record<"openai" | "gemini" | "claude", Array<{ id: string; displayName: string }>>>({
    openai: [],
    gemini: [],
    claude: []
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({
    linkedin: true,
    x: false,
    substack: false,
    medium: false,
    seo: false,
    leadmagnet: false,
  });
  
  // --- Connectors Grid & Publishing Dashboard State (Requirement 18 & Phase 2 #3) ---
  const [connections, setConnections] = useState<Record<string, string>>({
    linkedin: "",
    twitter: "",
    substack: "",
    medium: "",
    website: "",
  });
  
  const [syncHistory, setSyncHistory] = useState<Record<string, { errorCount: number; lastSync: string | null }>>({
    linkedin: { errorCount: 0, lastSync: null },
    twitter: { errorCount: 0, lastSync: null },
    substack: { errorCount: 0, lastSync: null },
    medium: { errorCount: 0, lastSync: null },
    website: { errorCount: 0, lastSync: null },
  });

  // --- Version Control System State (Requirement 17 / phase2) ---
  const [versionHistory, setVersionHistory] = useState<Record<string, ContentVersion[]>>({});
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<Record<string, number>>({});
  const [versionNote, setVersionNote] = useState("");
  const [versionAlert, setVersionAlert] = useState<string | null>(null);

  // --- SEO Health Inspector State (Requirement 16) ---
  const [focusKeyphrase, setFocusKeyphrase] = useState("");
  const [seoReport, setSeoReport] = useState<{
    density: string;
    densityStatus: "Under" | "Optimal" | "Over";
    titleValid: boolean;
    introValid: boolean;
    warnings: string[];
  } | null>(null);
  const [optimizingSEO, setOptimizingSEO] = useState(false);

  // --- User Guide Panel State (Requirement 19 & 20) ---
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideContent, setGuideContent] = useState("Loading User Guide...");

  // --- Interactive Guide Overlay States ---
  const [guideSearch, setGuideSearch] = useState("");
  const [guideStep, setGuideStep] = useState(1);
  const [guideCompleted, setGuideCompleted] = useState<Record<number, boolean>>({
    1: false, 2: false, 3: false, 4: false, 5: false
  });
  const [guideCopied, setGuideCopied] = useState<string | null>(null);

  // --- LinkedIn Destination State ---
  const [linkedinTarget, setLinkedinTarget] = useState<"person" | "organization">("person");

  // Save target platform selections to localStorage on change
  useEffect(() => {
    localStorage.setItem("pubx_selected_platforms", JSON.stringify(selectedPlatforms));
  }, [selectedPlatforms]);


  // Get active theme colors
  const activeColor = CATEGORIES[category].color;
  const activeBg = CATEGORIES[category].bg;

  // Load Persisted Credentials & Pre-fill Presets
  useEffect(() => {
    const savedKeys = localStorage.getItem("pubx_api_keys");
    const savedConnections = localStorage.getItem("pubx_connections");
    const savedSync = localStorage.getItem("pubx_sync_history");
    const savedModel = localStorage.getItem("pubx_default_model");
    const savedProvider = localStorage.getItem("pubx_default_provider");
    const savedLinkedinTarget = localStorage.getItem("pubx_linkedin_target");
    const savedPlatforms = localStorage.getItem("pubx_selected_platforms");

    if (savedKeys) setApiKeys(JSON.parse(savedKeys));
    if (savedConnections) setConnections(JSON.parse(savedConnections));
    if (savedSync) setSyncHistory(JSON.parse(savedSync));
    if (savedProvider) setProvider(JSON.parse(savedProvider));
    if (savedModel) {
      let migratedModel = savedModel;
      if (savedModel === "claude-4-sonnet-latest") {
        migratedModel = "claude-3-5-sonnet-latest";
        localStorage.setItem("pubx_default_model", "claude-3-5-sonnet-latest");
      } else if (savedModel === "claude-4-haiku-latest") {
        migratedModel = "claude-3-5-haiku-latest";
        localStorage.setItem("pubx_default_model", "claude-3-5-haiku-latest");
      }
      setModel(migratedModel);
    }
    if (savedLinkedinTarget) setLinkedinTarget(savedLinkedinTarget as "person" | "organization");
    if (savedPlatforms) {
      try {
        setSelectedPlatforms(JSON.parse(savedPlatforms));
      } catch (e) {
        console.error("Failed to parse saved platforms", e);
      }
    }


    // Dynamic Topic Preset Pre-fill on Initial Load
    const defaultTopic = CATEGORIES[category].defaultTopic;
    const defaultExcerpt = CATEGORIES[category].defaultExcerpt;
    setTopic(defaultTopic);
    setExcerpt(defaultExcerpt);
    
    const initialSlug = defaultTopic
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50)
      .replace(/-$/, "");
    setSlug(initialSlug);

    // Initial system prompts from database
    const initialPrompts: Record<string, string> = {};
    PUBLISHING_PLUGINS.forEach((p) => {
      initialPrompts[p.id] = p.defaultSystemPrompt;
    });
    setCustomPrompts(initialPrompts);
  }, []);

  // Load dynamic models when API Keys are configured or loaded (Requirement 21)
  useEffect(() => {
    const fetchModels = async () => {
      const providers: Array<"openai" | "gemini" | "claude"> = ["openai", "gemini", "claude"];
      for (const p of providers) {
        const key = apiKeys[p];
        if (key && key.trim()) {
          try {
            const modelsList = await fetchDynamicModels(p, key);
            if (modelsList && modelsList.length > 0) {
              setDynamicModels((prev) => ({
                ...prev,
                [p]: modelsList
              }));
            }
          } catch (err) {
            console.error(`Failed loading dynamic models for ${p}:`, err);
          }
        }
      }
    };
    fetchModels();
  }, [apiKeys]);

  // Fetch dynamic guide.md document contents (Requirement 19)
  useEffect(() => {
    if (guideOpen) {
      setGuideContent("Loading User Guide...");
      fetch("/guide.md")
        .then((res) => {
          if (!res.ok) throw new Error("Guide not found");
          return res.text();
        })
        .then((text) => setGuideContent(text))
        .catch((err) => {
          setGuideContent(`## 📖 User Guide\n\nFailed to load guide document. Verify that \`studio/public/guide.md\` exists.\n\nError: ${err.message}`);
        });
    }
  }, [guideOpen]);

  // Sync Settings to LocalStorage
  const saveSettings = (newKeys: typeof apiKeys, newConns: typeof connections, newLinkedinTarget: "person" | "organization") => {
    localStorage.setItem("pubx_api_keys", JSON.stringify(newKeys));
    localStorage.setItem("pubx_connections", JSON.stringify(newConns));
    localStorage.setItem("pubx_linkedin_target", newLinkedinTarget);
    localStorage.setItem("pubx_default_provider", JSON.stringify(provider));
    localStorage.setItem("pubx_default_model", model);
    setApiKeys(newKeys);
    setConnections(newConns);
    setLinkedinTarget(newLinkedinTarget);
    setSaveStatus("✓ Settings updated successfully!");
    setTimeout(() => setSaveStatus(null), 3000);
  };


  // Connectors State Manager (Requirement 18)
  const getConnectionStatus = (platform: string) => {
    const value = connections[platform];
    const history = syncHistory[platform] || { errorCount: 0, lastSync: null };
    
    if (!value) return { text: "Disconnected", color: "#FF5A5A", connected: false };
    if (history.errorCount > 0) return { text: "Connection Error", color: "#FFAF5A", connected: true };
    return { text: "Connected", color: "#5AFFDB", connected: true };
  };

  const handleDisconnect = (platform: string) => {
    const updatedConns = { ...connections, [platform]: "" };
    const updatedSync = {
      ...syncHistory,
      [platform]: { errorCount: 0, lastSync: null },
    };
    
    setConnections(updatedConns);
    setSyncHistory(updatedSync);
    localStorage.setItem("pubx_connections", JSON.stringify(updatedConns));
    localStorage.setItem("pubx_sync_history", JSON.stringify(updatedSync));
    
    setSaveStatus(`✓ Disconnected from ${platform.toUpperCase()}`);
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // Dynamic Category Change Handler with Preset Pre-fills (Requirement 14)
  const handleCategoryChange = (newCat: Category) => {
    setCategory(newCat);
    
    const presetTopic = CATEGORIES[newCat].defaultTopic;
    const presetExcerpt = CATEGORIES[newCat].defaultExcerpt;
    
    setTopic(presetTopic);
    setExcerpt(presetExcerpt);
    
    const generatedSlug = presetTopic
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50)
      .replace(/-$/, "");
    setSlug(generatedSlug);

    const firstWord = presetTopic.split(" ").slice(0, 2).join(" ");
    setFocusKeyphrase(firstWord);
    setSeoReport(null);
  };

  // Auto-slug generator when title manually updated
  const handleTitleChange = (t: string) => {
    setTopic(t);
    const generated = t
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50)
      .replace(/-$/, "");
    setSlug(generated || "untitled");
  };

  // Add External Link Context
  const addLink = () => {
    if (currentLink.trim() && !links.includes(currentLink)) {
      setLinks((prev) => [...prev, currentLink]);
      setCurrentLink("");
    }
  };

  const removeLink = (url: string) => setLinks((prev) => prev.filter((l) => l !== url));

  // Multimodal Image Drop Handler
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setAttachedImages((prev) => [...prev, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // Client-Side Document Text Extractor (Text/Markdown files)
  const handleDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      setAttachedDocs((prev) => [
        ...prev,
        { name: file.name, type: file.type, size: `${(file.size / 1024).toFixed(1)} KB` },
      ]);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setRagContext((prev) => `${prev}\n\n[Reference Material: ${file.name}]\n${text}`);
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  };

  // Main Generator Action Trigger
  const handleGeneratePipeline = async () => {
    if (!topic.trim() || !excerpt.trim()) return;

    const activeApiKey = apiKeys[provider];
    if (!activeApiKey) {
      setError(`API Key for ${provider.toUpperCase()} is not set! Click settings on the top right to configure it.`);
      return;
    }

    setGenerating(true);
    setError(null);
    setOutputs(null);
    setSaveStatus(null);
    setApprovedForPublication(false);
    setPublishStatus({});
    setStep(0);

    const stepInterval = setInterval(() => {
      setStep((prev) => (prev < 2 ? prev + 1 : prev));
    }, 3500);

    try {
      const results = await runGenerationPipeline({
        topic,
        excerpt,
        category,
        slug,
        brief,
        provider,
        model,
        apiKey: activeApiKey,
        customPrompts,
        ragContext,
        links,
        attachedImages,
        selectedPlatforms,
      });

      clearInterval(stepInterval);
      setStep(3);
      setOutputs(results);
      
      const keyphraseSeed = topic.split(" ").slice(0, 2).join(" ");
      setFocusKeyphrase(keyphraseSeed);
      setSeoReport(null);

      // Create Version 1 (Generated) history blocks (Requirement 17 / phase2)
      const freshHistory: Record<string, ContentVersion[]> = {};
      const freshIndices: Record<string, number> = {};
      
      PUBLISHING_PLUGINS.forEach((plugin) => {
        const generatedText = results.results[plugin.id] || "";
        freshHistory[plugin.id] = [
          {
            version: 1,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            content: generatedText,
            note: "V1 - Generated Content Pass",
          },
        ];
        freshIndices[plugin.id] = 0;
      });

      setVersionHistory(freshHistory);
      setSelectedVersionIndex(freshIndices);

    } catch (err) {
      clearInterval(stepInterval);
      setError(err instanceof Error ? err.message : "Content Pipeline execution failed.");
    } finally {
      setGenerating(false);
    }
  };

  // -------------------------------------------------------------
  // Content Version Control Handlers (Requirement 17 / phase2)
  // -------------------------------------------------------------
  const saveNewContentVersion = () => {
    if (!outputs) return;
    const currentText = outputs.results[activePluginTab] || "";
    const history = versionHistory[activePluginTab] || [];
    const nextVerNum = history.length + 1;
    const note = versionNote.trim() || `V${nextVerNum} - User Edit`;

    const newVersion: ContentVersion = {
      version: nextVerNum,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      content: currentText,
      note,
    };

    const updatedHistory = [...history, newVersion];
    setVersionHistory((prev) => ({
      ...prev,
      [activePluginTab]: updatedHistory,
    }));

    setSelectedVersionIndex((prev) => ({
      ...prev,
      [activePluginTab]: updatedHistory.length - 1,
    }));

    setVersionNote("");
    setVersionAlert(`✓ Successfully created Version ${nextVerNum}!`);
    setTimeout(() => setVersionAlert(null), 3000);
  };

  const revertToSelectedVersion = (index: number) => {
    const history = versionHistory[activePluginTab];
    if (!history || !history[index]) return;
    
    const targetContent = history[index].content;
    handleInlineEdit(activePluginTab, targetContent);

    setSelectedVersionIndex((prev) => ({
      ...prev,
      [activePluginTab]: index,
    }));

    setVersionAlert(`✓ Reverted successfully to Version ${history[index].version}!`);
    setTimeout(() => setVersionAlert(null), 3000);
  };

  // -------------------------------------------------------------
  // Interactive SEO Health Audits & Auto-Optimizer (Requirement 16)
  // -------------------------------------------------------------
  const runSEOHealthAudit = () => {
    if (!outputs) return;
    const content = outputs.results["article"] || "";
    const phrase = focusKeyphrase.trim().toLowerCase();

    if (!phrase) {
      alert("Please enter a valid Focus Keyphrase to audit.");
      return;
    }

    const words = content.toLowerCase().split(/\s+/).filter(Boolean);
    const totalWords = words.length;
    
    let occurrences = 0;
    const cleanContent = content.toLowerCase();
    let pos = cleanContent.indexOf(phrase);
    while (pos !== -1) {
      occurrences++;
      pos = cleanContent.indexOf(phrase, pos + phrase.length);
    }

    const densityVal = totalWords > 0 ? (occurrences / totalWords) * 100 : 0;
    const densityStr = `${densityVal.toFixed(2)}% (${occurrences} match${occurrences === 1 ? '' : 'es'})`;
    
    let densityStatus: "Under" | "Optimal" | "Over" = "Optimal";
    if (densityVal < 0.8) densityStatus = "Under";
    else if (densityVal > 2.8) densityStatus = "Over";

    const titleValid = topic.length <= 60;
    const first100Words = words.slice(0, 100).join(" ");
    const introValid = first100Words.includes(phrase);

    const warnings: string[] = [];
    if (densityStatus === "Under") {
      warnings.push(`Keyword Density is too low (${densityVal.toFixed(2)}%). Add keyphrase in at least 2-3 more paragraphs.`);
    }
    if (densityStatus === "Over") {
      warnings.push(`Keyword Density is too high (${densityVal.toFixed(2)}%). Avoid keyword stuffing to escape Google penalties.`);
    }
    if (!titleValid) {
      warnings.push(`SEO Title is too long (${topic.length} chars). Keep titles under 60 characters for optimal search snippets.`);
    }
    if (!introValid) {
      warnings.push(`Focus keyphrase "${phrase}" not found in the introduction paragraph. Place it within the first 100 words.`);
    }
    if (!content.includes("##")) {
      warnings.push("No H2 headings detected. Utilize H2 and H3 elements to structure text semantically.");
    }

    setSeoReport({
      density: densityStr,
      densityStatus,
      titleValid,
      introValid,
      warnings,
    });
  };

  const handleAutoOptimizeSEO = async () => {
    if (!outputs) return;
    const activeApiKey = apiKeys[provider];
    if (!activeApiKey) {
      alert("API Key is missing. Configure it in Settings.");
      return;
    }

    const phrase = focusKeyphrase.trim();
    if (!phrase) {
      alert("Please provide a Focus Keyphrase to optimize for.");
      return;
    }

    setOptimizingSEO(true);
    setSaveStatus("Optimizing article keyword density and headings...");
    try {
      const originalText = outputs.results["article"] || "";
      const optimizedText = await autoOptimizeSEO({
        content: originalText,
        focusKeyphrase: phrase,
        provider,
        apiKey: activeApiKey,
        model,
      });

      handleInlineEdit("article", optimizedText);
      
      const history = versionHistory["article"] || [];
      const nextVerNum = history.length + 1;
      const seoVersion: ContentVersion = {
        version: nextVerNum,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        content: optimizedText,
        note: `V${nextVerNum} - SEO Keyphrase Auto-Optimization`,
      };

      const updatedHistory = [...history, seoVersion];
      setVersionHistory((prev) => ({
        ...prev,
        article: updatedHistory,
      }));

      setSelectedVersionIndex((prev) => ({
        ...prev,
        article: updatedHistory.length - 1,
      }));

      setSaveStatus("✓ Article successfully optimized for SEO!");
      setTimeout(() => {
        runSEOHealthAudit();
      }, 500);

    } catch (err) {
      setSaveStatus(`✗ SEO optimization failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOptimizingSEO(false);
    }
  };

  // Save the full bundle package to published/${slug}/
  const handleSaveOutputBundle = async () => {
    if (!outputs) return;
    setSaveStatus("Saving Output Bundle...");
    
    let serverSaved = false;
    let filesList: string[] = [];
    try {
      const res = await saveOutputBundle({
        slug,
        results: outputs.results,
        diagram: outputs.diagram,
        attachedImages,
      });
      serverSaved = res.ok;
      filesList = res.filesSaved;
    } catch (err) {
      console.warn("Server-side file saving skipped or failed (common in cloud environments):", err);
    }

    // Dynamic browser-side ZIP packaging & download
    try {
      const zipFiles: Record<string, string | Uint8Array> = {};
      
      PUBLISHING_PLUGINS.forEach((plugin) => {
        const content = outputs.results[plugin.id];
        if (content) {
          zipFiles[plugin.outputPath] = content;
        }
      });

      if (outputs.diagram) {
        try {
          const bytes = Uint8Array.from(window.atob(outputs.diagram.base64), (c) => c.charCodeAt(0));
          zipFiles[`images/${outputs.diagram.name}`] = bytes;
        } catch (e) {
          console.error("Failed to parse diagram for zip", e);
        }
      }

      attachedImages.forEach((img) => {
        try {
          const base64Data = img.dataUrl.split(",")[1];
          const bytes = Uint8Array.from(window.atob(base64Data), (c) => c.charCodeAt(0));
          zipFiles[`images/${img.name}`] = bytes;
        } catch (e) {
          console.error("Failed to parse attached image for zip", e);
        }
      });

      downloadZip(slug, zipFiles);

      if (serverSaved) {
        setSaveStatus(`✓ Bundle saved to local directory published/${slug}/\n✓ Automatic download of '${slug}.zip' started successfully!\n\nFiles packaged:\n${filesList.join("\n")}`);
      } else {
        setSaveStatus(`✓ Automatic download of '${slug}.zip' started successfully!\n(Note: Cloud mode active, local filesystem write bypassed)`);
      }
    } catch (zipErr) {
      setSaveStatus(`✗ Save failed: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`);
    }
  };

  // Human-in-the-Loop Inline Editor
  const handleInlineEdit = (pluginId: string, updatedText: string) => {
    if (!outputs) return;
    setOutputs((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        results: {
          ...prev.results,
          [pluginId]: updatedText,
        },
      };
    });
  };

  // direct publishing handler
  const handleDirectPublish = async (platform: string) => {
    if (!outputs) return;
    setPublishingTo(platform);
    
    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedDate = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
    const syncStamp = `${formattedDate}, ${formattedTime}`;

    try {
      const pluginId = platform === "twitter" ? "x" : platform === "website" ? "article" : platform;
      const content = outputs.results[pluginId] || "";

      // Character limit free plan safety interceptor (Requirement 24)
      const limits: Record<string, number> = {
        x: 280,
        linkedin: 3000,
        substack: 100000,
        medium: 150000,
        article: 120000,
      };

      const maxLimit = limits[pluginId] || 100000;
      if (pluginId === "x") {
        const tweets = content.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
        const longTweets = tweets.filter(t => t.length > 280);
        if (longTweets.length > 0) {
          const proceed = window.confirm(`⚠️ Warning: You have ${longTweets.length} tweet(s) in your thread that exceed the X (Twitter) free tier limit of 280 characters. Are you sure you want to publish?`);
          if (!proceed) {
            setPublishingTo(null);
            return;
          }
        }
      } else if (platform === "linkedin" && content.length > 3000) {
        alert(`❌ Error: LinkedIn posts cannot exceed 3,000 characters (current draft is ${content.length.toLocaleString()} characters). Please shorten the draft in the editor before publishing.`);
        setPublishingTo(null);
        return;
      } else if (content.length > maxLimit) {
        const proceed = window.confirm(`⚠️ Warning: The current draft for ${platform.toUpperCase()} (${content.length.toLocaleString()} characters) exceeds the free platform limit of ${maxLimit.toLocaleString()} characters. Are you sure you want to publish?`);
        if (!proceed) {
          setPublishingTo(null);
          return;
        }
      }

      const credentials = {
        token: connections[platform],
        apiKey: apiKeys[provider],
        linkedinTarget: platform === "linkedin" ? linkedinTarget : "",
      };

      const result = await directPublishToAccount({
        slug,
        platform,
        content,
        credentials,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }

      setPublishStatus((prev) => ({ ...prev, [platform]: result }));

      const updatedSync = {
        ...syncHistory,
        [platform]: { errorCount: 0, lastSync: syncStamp },
      };
      setSyncHistory(updatedSync);
      localStorage.setItem("pubx_sync_history", JSON.stringify(updatedSync));

    } catch (err) {
      const failMsg = err instanceof Error ? err.message : "Publishing failed";
      setPublishStatus((prev) => ({
        ...prev,
        [platform]: { ok: false, message: failMsg },
      }));

      const history = syncHistory[platform] || { errorCount: 0, lastSync: null };
      const updatedSync = {
        ...syncHistory,
        [platform]: { errorCount: history.errorCount + 1, lastSync: syncStamp },
      };
      setSyncHistory(updatedSync);
      localStorage.setItem("pubx_sync_history", JSON.stringify(updatedSync));
    } finally {
      setPublishingTo(null);
    }
  };

  const isMoEActive = moeOverride !== null ? moeOverride : detectMoE(model);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)", color: "var(--text-main)", fontFamily: "var(--font-jetbrains, monospace)", padding: "30px 24px", maxWidth: 1200, margin: "0 auto", boxSizing: "border-box", transition: "background-color 0.3s, color 0.3s" }}>
      
      {/* Header and settings buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 34, color: "var(--text-heading)", fontWeight: 400, letterSpacing: "-0.02em" }}>PubxStudio</span>
            <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 10, color: activeColor, letterSpacing: "0.15em", textTransform: "uppercase", background: activeBg, padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>Studio v2.4</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, fontFamily: "var(--font-jetbrains, monospace)" }}>
            Stateless local publisher • Dynamic Category Adaptations • Integrated Content Versioning • SEO Optimizer
          </p>
        </div>
        
        {/* Theme Toggle & Guide buttons next to settings */}
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
          <button
            onClick={() => setGuideOpen(true)}
            style={{ padding: "10px 18px", background: "rgba(90,185,255,0.05)", border: "1px solid rgba(90,185,255,0.2)", borderRadius: 8, color: "#5AB9FF", cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 12, display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}
          >
            📖 User Guide
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{ padding: "10px 18px", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 8, color: "var(--text-heading)", cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 12, display: "flex", alignItems: "center", gap: 8, boxShadow: "var(--shadow)" }}
          >
            ⚙ Settings & Keys
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        
        {/* MAIN WORKBENCH PANEL */}
        <div style={{ width: "100%" }}>
          
          {/* Section 1: Content Meta Options */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "var(--shadow)" }}>
            <h2 style={{ fontSize: 16, color: "var(--text-heading)", marginBottom: 16, fontFamily: "var(--font-jetbrains, monospace)", borderBottom: "1px solid var(--border-main)", paddingBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: activeColor }}>01</span> Topic & Category Setup
            </h2>

            {/* Category Select Buttons (Ordered dynamic selection) */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Content Domain Category</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CATEGORY_ORDER.map((name) => {
                  const c = CATEGORIES[name];
                  const isSelected = category === name;
                  return (
                    <button
                      key={name}
                      onClick={() => handleCategoryChange(name)}
                      style={{ padding: "8px 14px", border: isSelected ? `1.5px solid ${c.color}` : "1.5px solid var(--border-main)", borderRadius: 6, background: isSelected ? c.bg : "transparent", color: isSelected ? c.color : "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 13, fontWeight: isSelected ? 700 : 400, cursor: "pointer", transition: "all 0.2s" }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-jetbrains, monospace)" }}>{CATEGORIES[category].description}</p>
            </div>

            {/* Topic / Title Input */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Topic / Title</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Topic text presets populate automatically..."
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid var(--border-main)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-heading)", fontSize: 15, outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => (e.target.style.borderColor = activeColor)}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
              />
            </div>

            {/* Slug Field */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Slug Descriptor</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 13, color: "var(--text-muted-dark)" }}>/published/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  style={{ flex: 1, padding: "10px 12px", border: "1.5px solid var(--border-main)", borderRadius: 6, background: "var(--bg-input)", color: activeColor, fontFamily: "var(--font-jetbrains, monospace)", fontSize: 13, outline: "none" }}
                />
              </div>
            </div>

            {/* Excerpt Summary */}
            <div>
              <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Excerpt / Summary Statement</label>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Excerpt summary presets populate automatically..."
                rows={3}
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid var(--border-main)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-main)", fontSize: 14, lineHeight: 1.5, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                onFocus={(e) => (e.target.style.borderColor = activeColor)}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
              />
            </div>
          </div>

          {/* Section 2: Advanced Context RAG Workspace */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "var(--shadow)" }}>
            <h2 style={{ fontSize: 16, color: "var(--text-heading)", marginBottom: 16, fontFamily: "var(--font-jetbrains, monospace)", borderBottom: "1px solid var(--border-main)", paddingBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: activeColor }}>02</span> Multimodal RAG Context & Uploads
            </h2>

            {/* Links input */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Context Links (Webpages / Social posts)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={currentLink}
                  onChange={(e) => setCurrentLink(e.target.value)}
                  placeholder="https://example.com/research-notes"
                  style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--border-main)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-main)", fontSize: 13, outline: "none" }}
                />
                <button
                  type="button"
                  onClick={addLink}
                  style={{ padding: "0 18px", border: "none", borderRadius: 6, background: activeColor, color: "#000", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 12 }}
                >
                  + Add Link
                </button>
              </div>
              {links.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {links.map((link) => (
                    <span key={link} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: activeColor }}>
                      {link.replace("https://", "").replace("http://", "").slice(0, 30)}...
                      <button onClick={() => removeLink(link)} style={{ border: "none", background: "transparent", color: "#FF5A5A", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Drag & Drop File Zones */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              
              {/* Image upload */}
              <div>
                <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Illustrations / Screenshots</label>
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, height: 90, border: "1.5px dashed var(--border-main)", borderRadius: 8, background: "var(--bg-input)", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)" }}>
                  <input type="file" accept="image/*" multiple onChange={handleImageFile} style={{ display: "none" }} />
                  <span>📁 Upload Images</span>
                  <span style={{ fontSize: 9, color: "var(--text-muted-dark)" }}>Forwarded as multimodal bytes</span>
                </label>
                {attachedImages.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {attachedImages.map((img, i) => (
                      <div key={i} style={{ position: "relative", width: 50, height: 40 }}>
                        <img src={img.dataUrl} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4, border: "1px solid var(--border-main)" }} />
                        <button onClick={() => setAttachedImages((prev) => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: -4, right: -4, background: "#FF5A5A", color: "#fff", border: "none", borderRadius: "50%", width: 14, height: 14, fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Document upload */}
              <div>
                <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Text / Markdown Documents</label>
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, height: 90, border: "1.5px dashed var(--border-main)", borderRadius: 8, background: "var(--bg-input)", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)" }}>
                  <input type="file" accept=".txt,.md,.json" multiple onChange={handleDocFile} style={{ display: "none" }} />
                  <span>📄 Attach Doc File</span>
                  <span style={{ fontSize: 9, color: "var(--text-muted-dark)" }}>Parsed client-side to RAG</span>
                </label>
                {attachedDocs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                    {attachedDocs.map((doc, i) => (
                      <div key={i} style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                        <span>✓ {doc.name.slice(0, 18)}... ({doc.size})</span>
                        <button onClick={() => {
                          setAttachedDocs((prev) => prev.filter((_, idx) => idx !== i));
                        }} style={{ border: "none", background: "transparent", color: "#FF5A5A", cursor: "pointer", fontSize: 10 }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RAG Context Area */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Raw Reference Research / Transcripts</label>
              <textarea
                value={ragContext}
                onChange={(e) => setRagContext(e.target.value)}
                placeholder="Paste raw research transcripts, articles, tables, or PDF contents directly..."
                rows={5}
                style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--border-main)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-main)", fontSize: 13, lineHeight: 1.6, outline: "none", fontFamily: "var(--font-jetbrains, monospace)", boxSizing: "border-box", resize: "vertical", transition: "all 0.2s" }}
                onFocus={(e) => (e.target.style.borderColor = activeColor)}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
              />
            </div>

            {/* Author brief */}
            <div>
              <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Private Author Instructions & Tone Guidelines</label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Angle, formatting specifics, or details Claude/OpenAI should know..."
                rows={3}
                style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--border-main)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-main)", fontSize: 12, lineHeight: 1.6, outline: "none", fontFamily: "var(--font-jetbrains, monospace)", boxSizing: "border-box", resize: "vertical", transition: "all 0.2s" }}
                onFocus={(e) => (e.target.style.borderColor = activeColor)}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
              />
            </div>
          </div>

          {/* Section 3: Model and Prompt Settings */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "var(--shadow)" }}>
            <h2 style={{ fontSize: 16, color: "var(--text-heading)", marginBottom: 16, fontFamily: "var(--font-jetbrains, monospace)", borderBottom: "1px solid var(--border-main)", paddingBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: activeColor }}>03</span> LLM Engine & System Prompt Customizer
            </h2>

            {/* Provider and Model selectors */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Orchestrator Provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const p = e.target.value as "openai" | "gemini" | "claude";
                    setProvider(p);
                    const fetched = dynamicModels[p];
                    if (fetched && fetched.length > 0) {
                      setModel(fetched[0].id);
                    } else {
                      setModel(p === "claude" ? "claude-3-5-sonnet-latest" : p === "openai" ? "gpt-4o" : "gemini-1.5-pro");
                    }
                  }}
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--border-main)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-heading)", fontSize: 13, outline: "none" }}
                >
                  <option value="claude">Anthropic Claude</option>
                  <option value="openai">OpenAI Chat</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div>
                <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Target Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--border-main)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-heading)", fontSize: 13, outline: "none" }}
                >
                  {dynamicModels[provider] && dynamicModels[provider].length > 0 ? (
                    dynamicModels[provider].map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))
                  ) : (
                    <>
                      {provider === "claude" && (
                        <>
                          <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                          <option value="claude-3-5-haiku-latest">Claude 3.5 Haiku</option>
                          <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                        </>
                      )}
                      {provider === "openai" && (
                        <>
                          <option value="gpt-4o">GPT-4o (Reasoning MoE)</option>
                          <option value="gpt-4o-mini">GPT-4o Mini (Speed)</option>
                          <option value="o1-preview">o1 Preview (Reasoning)</option>
                        </>
                      )}
                      {provider === "gemini" && (
                        <>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                          <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                        </>
                      )}
                    </>
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>MoE Status</label>
                <div style={{ height: 38, border: "1px solid var(--border-main)", borderRadius: 6, background: isMoEActive ? "rgba(90,255,219,0.05)" : "transparent", color: isMoEActive ? "#5AFFDB" : "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: isMoEActive ? "#5AFFDB" : "var(--border-main)" }} />
                  {isMoEActive ? "ACTIVE" : "INACTIVE"}
                </div>
              </div>
            </div>

            {/* Custom Prompts & templates */}
            <div style={{ border: "1px solid var(--border-main)", borderRadius: 8, padding: 16, background: "var(--bg-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text-heading)", fontWeight: 700 }}>Custom System Prompts & Templates Library</span>
                <select
                  value={editingPluginPromptId || ""}
                  onChange={(e) => setEditingPluginPromptId(e.target.value || null)}
                  style={{ padding: "6px 10px", border: "1px solid var(--border-main)", borderRadius: 4, background: "var(--bg-input)", color: activeColor, fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)" }}
                >
                  <option value="">-- Customize System Prompt --</option>
                  {PUBLISHING_PLUGINS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {editingPluginPromptId && (
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)" }}>Presets:</span>
                    {PUBLISHING_PLUGINS.find((p) => p.id === editingPluginPromptId)?.templates.map((tpl) => (
                      <button
                        key={tpl.name}
                        onClick={() => {
                          const baseSystem = PUBLISHING_PLUGINS.find((p) => p.id === editingPluginPromptId)!.defaultSystemPrompt;
                          setCustomPrompts((prev) => ({
                            ...prev,
                            [editingPluginPromptId]: `${baseSystem}\n\n[TEMPLATE INSTRUCTIONS: ${tpl.name}]\n${tpl.prompt}`,
                          }));
                        }}
                        style={{ padding: "4px 8px", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 4, color: "var(--text-muted)", fontSize: 10, cursor: "pointer" }}
                        title={tpl.description}
                      >
                        {tpl.name}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const original = PUBLISHING_PLUGINS.find((p) => p.id === editingPluginPromptId)!.defaultSystemPrompt;
                        setCustomPrompts((prev) => ({ ...prev, [editingPluginPromptId]: original }));
                      }}
                      style={{ padding: "4px 8px", background: "rgba(255,90,90,0.05)", border: "1px solid rgba(255,90,90,0.1)", borderRadius: 4, color: "#FF5A5A", fontSize: 10, cursor: "pointer", marginLeft: "auto" }}
                    >
                      Reset Default
                    </button>
                  </div>

                  <textarea
                    value={customPrompts[editingPluginPromptId] || ""}
                    onChange={(e) => {
                      const updated = e.target.value;
                      setCustomPrompts((prev) => ({ ...prev, [editingPluginPromptId]: updated }));
                    }}
                    rows={6}
                    style={{ width: "100%", padding: "10px", border: "1px solid var(--border-main)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-main)", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", lineHeight: 1.5, boxSizing: "border-box", transition: "all 0.2s" }}
                    onFocus={(e) => (e.target.style.borderColor = activeColor)}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
                  />
                  <button
                    onClick={() => setEditingPluginPromptId(null)}
                    style={{ marginTop: 8, padding: "5px 12px", background: activeColor, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                  >
                    Save Prompt Configuration
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 3.5: Selected Target Platforms Checkboxes (Requirement 22) */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "var(--shadow)" }}>
            <label style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, color: "var(--text-label)", display: "block", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Target Publishing Channels
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {PUBLISHING_PLUGINS.filter(p => p.id !== "article").map((plugin) => {
                const isChecked = selectedPlatforms[plugin.id] ?? true;
                const platformColor = plugin.id === "linkedin" ? "#0A66C2" : plugin.id === "x" ? (theme === "dark" ? "#fff" : "#000") : plugin.id === "substack" ? "#FF6B00" : plugin.id === "medium" ? (theme === "dark" ? "#fff" : "#000") : plugin.id === "seo" ? "#5AFFDB" : "#B18CFF";
                
                return (
                  <label
                    key={plugin.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      background: isChecked ? "var(--bg-subtle)" : "transparent",
                      border: isChecked ? `1px solid ${platformColor}40` : "1px solid var(--border-main)",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "var(--font-jetbrains, monospace)",
                      color: isChecked ? "var(--text-heading)" : "var(--text-muted)",
                      transition: "all 0.2s",
                      userSelect: "none"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = platformColor + "80";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isChecked ? platformColor + "40" : "var(--border-main)";
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        const newChecked = !selectedPlatforms[plugin.id];
                        setSelectedPlatforms((prev) => ({
                          ...prev,
                          [plugin.id]: newChecked,
                        }));
                        if (!newChecked && activePluginTab === plugin.id) {
                          setActivePluginTab("article");
                        }
                      }}
                      style={{
                        width: 15,
                        height: 15,
                        accentColor: platformColor,
                        cursor: "pointer"
                      }}
                    />
                    <span>{plugin.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* GENERATE ACTION BUTTON */}
          <button
            onClick={handleGeneratePipeline}
            disabled={generating || !topic.trim() || !excerpt.trim()}
            style={{ width: "100%", padding: 16, border: "none", borderRadius: 10, background: generating ? "#1A1A1A" : `linear-gradient(135deg, ${activeColor}, ${activeColor}D0)`, color: generating ? "#555" : "#000", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 14, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer", letterSpacing: "0.08em", textTransform: "uppercase", boxShadow: generating ? "none" : `0 4px 20px ${activeColor}20` }}
          >
            {generating ? "Executing Engine Agents..." : "Spawn Content Generation Agent →"}
          </button>

          {/* Progress updates */}
          {generating && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "24px 0" }}>
              {["Agent Research", "Drafting Article Bundle", "Triggering Platform Adapters", "Complete"].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", border: i <= step ? `1.5px solid ${activeColor}` : "1.5px solid var(--border-main)", color: i < step ? "var(--bg-main)" : i === step ? activeColor : "var(--text-muted)", background: i < step ? activeColor : "transparent", fontWeight: 700 }}>
                    {i < step ? "✓" : i + 1}
                  </div>
                  {i < 3 && <div style={{ width: 30, height: 1.5, background: i < step ? activeColor : "var(--border-main)" }} />}
                </div>
              ))}
              <span style={{ fontSize: 12, color: activeColor, fontFamily: "var(--font-jetbrains, monospace)", marginLeft: "auto" }}>Generating...</span>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 20, padding: 14, background: "#2D1414", border: "1px solid #FF5A5A", borderRadius: 8, fontSize: 12, color: "#FF8A8A", fontFamily: "var(--font-jetbrains, monospace)" }}>
              {error}
            </div>
          )}

          {/* DUAL-AGENT REVIEW PANEL */}
          {outputs && (
            <div style={{ marginTop: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid var(--border-main)", paddingBottom: 12 }}>
                <h2 style={{ fontSize: 20, color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", margin: 0 }}>Human Review Panel (Approved for Publication)</h2>
                
                {/* HITL Approved state toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={approvedForPublication}
                    onChange={(e) => setApprovedForPublication(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: activeColor }}
                  />
                  <span style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", color: approvedForPublication ? activeColor : "var(--text-label)", fontWeight: 700 }}>
                    {approvedForPublication ? "APPROVED FOR PUBLICATION" : "MARK AS APPROVED"}
                  </span>
                </label>
              </div>

              {/* Version History Toolbar (Requirement 17 / phase2) */}
              <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", boxShadow: "var(--shadow)" }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: activeColor, fontWeight: 700 }}>📄 Version History:</span>
                
                <select
                  value={selectedVersionIndex[activePluginTab] ?? 0}
                  onChange={(e) => revertToSelectedVersion(Number(e.target.value))}
                  style={{ padding: "5px 10px", border: "1px solid var(--border-main)", borderRadius: 4, background: "var(--bg-input)", color: "var(--text-main)", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)" }}
                >
                  {(versionHistory[activePluginTab] || []).map((ver, idx) => (
                    <option key={idx} value={idx}>
                      v{ver.version} - {ver.note} ({ver.timestamp})
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={versionNote}
                  onChange={(e) => setVersionNote(e.target.value)}
                  placeholder="Note: e.g. Polished intro paragraphs"
                  style={{ flex: 1, minWidth: 150, padding: "5px 10px", border: "1px solid var(--border-main)", borderRadius: 4, background: "var(--bg-input)", color: "var(--text-heading)", fontSize: 11 }}
                />

                <button
                  onClick={saveNewContentVersion}
                  style={{ padding: "5px 12px", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 4, color: "var(--text-heading)", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", cursor: "pointer", boxShadow: "var(--shadow)" }}
                >
                  + Save Version
                </button>

                {versionAlert && (
                  <span style={{ fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: "#5AFFDB", marginLeft: "auto" }}>
                    {versionAlert}
                  </span>
                )}
              </div>

              {/* Previews Tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {PUBLISHING_PLUGINS.filter((plugin) => plugin.id === "article" || selectedPlatforms[plugin.id] === true).map((plugin) => (
                  <button
                    key={plugin.id}
                    onClick={() => setActivePluginTab(plugin.id)}
                    style={{ padding: "8px 16px", border: activePluginTab === plugin.id ? `1.5px solid ${activeColor}` : "1.5px solid var(--border-main)", borderRadius: 6, background: activePluginTab === plugin.id ? `${activeColor}1A` : "transparent", color: activePluginTab === plugin.id ? activeColor : "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 12, cursor: "pointer", fontWeight: activePluginTab === plugin.id ? 700 : 400 }}
                  >
                    {plugin.name}
                  </button>
                ))}
              </div>

              {/* Interactive SEO Optimization Panel (Requirement 16) */}
              {activePluginTab === "article" && (
                <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", color: "#5AB9FF", fontWeight: 700 }}>🔍 Interactive SEO Copywriting Toolkit</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="text"
                        value={focusKeyphrase}
                        onChange={(e) => setFocusKeyphrase(e.target.value)}
                        placeholder="Focus Keyword / Phrase"
                        style={{ padding: "5px 10px", border: "1px solid var(--border-main)", borderRadius: 4, background: "var(--bg-input)", color: "var(--text-heading)", fontSize: 11, width: 180 }}
                      />
                      <button
                        onClick={runSEOHealthAudit}
                        style={{ padding: "5px 12px", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 4, color: "#5AB9FF", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", cursor: "pointer", boxShadow: "var(--shadow)" }}
                      >
                        ⚡ Analyze SEO Health
                      </button>
                      <button
                        onClick={handleAutoOptimizeSEO}
                        disabled={optimizingSEO}
                        style={{ padding: "5px 12px", background: "#5AB9FF", border: "none", borderRadius: 4, color: "#000", fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", cursor: optimizingSEO ? "not-allowed" : "pointer", fontWeight: 700 }}
                      >
                        {optimizingSEO ? "Optimizing..." : "🚀 Auto-Optimize Copy"}
                      </button>
                    </div>
                  </div>

                  {seoReport && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, background: "var(--bg-input-focus)", borderRadius: 6, padding: 12, border: "1px solid var(--border-main)" }}>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text-label)" }}>Focus Keyphrase Density</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: seoReport.densityStatus === "Optimal" ? "#5AFF5A" : "#FF8A5A", marginTop: 4 }}>
                          {seoReport.density} — <span style={{ fontSize: 11, textTransform: "uppercase" }}>{seoReport.densityStatus}</span>
                        </div>

                        <div style={{ fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text-label)", marginTop: 10 }}>Title Length & Intro Check</div>
                        <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: seoReport.titleValid ? "#5AFF5A" : "#FF5A5A" }}>
                            {seoReport.titleValid ? "✓ Title Length Optimal" : "✗ Title Too Long"}
                          </span>
                          <span style={{ fontSize: 11, color: seoReport.introValid ? "#5AFF5A" : "#FF5A5A" }}>
                            {seoReport.introValid ? "✓ Found in Intro" : "✗ Missing in Intro"}
                          </span>
                        </div>
                      </div>

                      <div style={{ borderLeft: "1px solid var(--border-main)", paddingLeft: 14 }}>
                        <div style={{ fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text-label)", marginBottom: 6 }}>Optimization Recommendations</div>
                        {seoReport.warnings.length === 0 ? (
                          <div style={{ fontSize: 11, color: "#5AFF5A", fontWeight: 700 }}>✓ Excellent! Article is fully SEO optimized.</div>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: 12, fontSize: 10, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                            {seoReport.warnings.map((w, i) => <li key={i}>{w}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* In-place Editable Tab Area */}
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", top: 12, right: 12, fontFamily: "var(--font-jetbrains, monospace)", fontSize: 10, color: "var(--text-label)", background: "var(--bg-input-focus)", padding: "2px 6px", borderRadius: 4 }}>
                  Editable Markdown Previews
                </span>
                <textarea
                  value={outputs.results[activePluginTab] || ""}
                  onChange={(e) => handleInlineEdit(activePluginTab, e.target.value)}
                  rows={20}
                  style={{ width: "100%", padding: "18px", border: "1px solid var(--border-main)", borderRadius: 10, background: "var(--bg-card)", color: "var(--text-main)", fontSize: 13, lineHeight: 1.7, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "var(--font-jetbrains, monospace)", marginBottom: 8 }}
                />
              </div>

              {/* Character Limit and Warnings Panel (Requirement 24) */}
              {(() => {
                const currentText = outputs.results[activePluginTab] || "";
                const charCount = currentText.length;
                const config = CHARACTER_LIMITS[activePluginTab] || { limit: 100000, label: "Recommended limit" };
                const isOver = charCount > config.limit;
                
                let tweetWarnings: string[] = [];
                if (activePluginTab === "x") {
                  const tweets = currentText.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
                  tweets.forEach((tweet, idx) => {
                    if (tweet.length > 280) {
                      tweetWarnings.push(`Tweet ${idx + 1} (${tweet.length} chars)`);
                    }
                  });
                }

                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid var(--border-main)", borderRadius: 8, background: "var(--bg-subtle)", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, borderLeft: isOver ? "3px solid #FF5A5A" : `3px solid ${activeColor}`, boxShadow: "var(--shadow)" }}>
                      <div style={{ color: "var(--text-muted)" }}>
                        <span>Platform: <strong style={{ color: "var(--text-heading)" }}>{activePluginTab.toUpperCase()}</strong></span>
                        <span style={{ margin: "0 8px" }}>|</span>
                        <span>Limit: {config.limit.toLocaleString()} characters ({config.label})</span>
                      </div>
                      <div style={{ color: isOver ? "#FF5A5A" : "#5AFFDB", fontWeight: 700 }}>
                        {charCount.toLocaleString()} / {config.limit.toLocaleString()} chars
                        {isOver && " ⚠️ EXCEEDS FREE PLATFORM LIMIT"}
                      </div>
                    </div>

                    {tweetWarnings.length > 0 && (
                      <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(255,90,90,0.05)", border: "1px solid rgba(255,90,90,0.2)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: "#FF5A5A", borderLeft: "3px solid #FF5A5A" }}>
                        <span style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>⚠️ Tweet Character Limit Violations (Max 280 chars per tweet):</span>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {tweetWarnings.map((warning, index) => (
                            <li key={index} style={{ marginBottom: 2 }}>{warning} exceeds the 280 character tweet capacity!</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Media Card Render Area (if MoE active and diagram generated) */}
              {outputs.diagram && (
                <div style={{ marginTop: 20, background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 18, boxShadow: "var(--shadow)" }}>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: activeColor, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 10 }}>Media Agent Assets (Mixture of Experts Vector Card)</span>
                  <div style={{ maxWidth: 600, margin: "0 auto", border: "1px solid var(--border-main)", borderRadius: 8, overflow: "hidden", background: "var(--bg-input-focus)" }}>
                    <div dangerouslySetInnerHTML={{ __html: Buffer.from(outputs.diagram.base64, "base64").toString("utf-8") }} />
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-label)", textAlign: "center", marginTop: 8, fontFamily: "var(--font-jetbrains, monospace)" }}>
                    Diagram saved as <code>/images/articles/{slug}/{outputs.diagram.name}</code>
                  </p>
                </div>
              )}

              {/* Editorial Options Actions Panel */}
              <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
                
                <button
                  onClick={handleSaveOutputBundle}
                  style={{ padding: "12px 24px", background: "transparent", border: `1.5px solid ${activeColor}`, borderRadius: 8, color: activeColor, fontFamily: "var(--font-jetbrains, monospace)", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}
                >
                  Save Local Bundle (published/{slug}/)
                </button>

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {["linkedin", "twitter", "substack", "medium", "website"].filter((p) => {
                    if (p === "website") return true;
                    const key = p === "twitter" ? "x" : p;
                    return selectedPlatforms[key] === true;
                  }).map((p) => {
                    const isPublished = publishStatus[p]?.ok;
                    
                    return (
                      <button
                        key={p}
                        onClick={() => handleDirectPublish(p)}
                        disabled={!approvedForPublication || publishingTo === p || isPublished}
                        style={{ padding: "10px 14px", border: "1px solid var(--border-main)", borderRadius: 6, background: isPublished ? "rgba(90,255,219,0.05)" : publishingTo === p ? "var(--border-main)" : !approvedForPublication ? "rgba(255,255,255,0.01)" : "var(--bg-subtle)", color: isPublished ? "#5AFFDB" : publishingTo === p ? "var(--text-muted)" : !approvedForPublication ? "var(--text-muted-dark)" : "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, cursor: !approvedForPublication || isPublished ? "not-allowed" : "pointer", fontWeight: 700, boxShadow: "var(--shadow)" }}
                        title={!approvedForPublication ? "You must mark contents as 'Approved for Publication' to unlock triggers." : `Direct Publish to ${p}`}
                      >
                        {publishingTo === p ? "Posting..." : isPublished ? `✓ Posted` : `Publish ${p.toUpperCase()}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {saveStatus && (
                <pre style={{ marginTop: 16, padding: 14, background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderRadius: 8, fontSize: 12, color: saveStatus.startsWith("✓") ? "#5AFFDB" : "#FF5A5A", fontFamily: "var(--font-jetbrains, monospace)", whiteSpace: "pre-wrap" }}>
                  {saveStatus}
                </pre>
              )}

              {/* Show direct publication live links summaries */}
              {Object.keys(publishStatus).length > 0 && (
                <div style={{ marginTop: 16, padding: 14, background: "#0F1A1A", border: "1px solid #142E2E", borderRadius: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-jetbrains, monospace)", color: "#5AFFDB", fontWeight: 700, display: "block", marginBottom: 8 }}>Publication Log Summaries</span>
                  {Object.entries(publishStatus).map(([p, s]) => (
                    <div key={p} style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: s.ok ? "#5AFFDB" : "#FF5A5A" }}>● {p.toUpperCase()}: {s.message}</span>
                      {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ color: activeColor, textDecoration: "underline" }}>View Live</a>}
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* Quick Start Guide */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 24, fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)", marginTop: 24, boxShadow: "var(--shadow)" }}>
            <h4 style={{ color: "var(--text-heading)", marginBottom: 12, fontFamily: "var(--font-jetbrains, monospace)", textTransform: "uppercase", fontSize: 13, letterSpacing: "0.05em" }}>Quick Start Guide</h4>
            <ol style={{ paddingLeft: 18, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 30px" }}>
              <li>Read the <span style={{ color: "#5AB9FF", fontWeight: 700 }}>📖 User Guide</span> next to settings for step-by-step credentials.</li>
              <li>Ensure your OpenAI/Gemini/Claude LLM keys are supplied in settings.</li>
              <li>Select your Category Preset. Context pre-fills instantly.</li>
              <li>Drop images or docs for multimodal RAG parsing context.</li>
              <li>Analyze SEO score or trigger server-side auto-optimizations.</li>
              <li>Save editable platform drafts as separate version history milestones.</li>
              <li>Mark as Approved, which activates direct distribution triggers.</li>
            </ol>
          </div>

          {/* System Functionality & Calendar */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 24, marginTop: 24 }}>
            {/* System Status (RAG) */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}>
              <h4 style={{ color: "var(--text-heading)", marginBottom: 16, fontFamily: "var(--font-jetbrains, monospace)", textTransform: "uppercase", fontSize: 13, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚡</span> Functionality status
              </h4>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Core Publishing Connectors</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-main)" }}>
                      <span style={{ fontSize: 12, color: "var(--text-heading)", fontWeight: 700 }}>LinkedIn Publisher</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#10B981", fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 8px #10B981", display: "inline-block" }}></span> ACTIVE
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-main)" }}>
                      <span style={{ fontSize: 12, color: "var(--text-heading)", fontWeight: 700 }}>Twitter/X Publisher</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#10B981", fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 8px #10B981", display: "inline-block" }}></span> ACTIVE
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-main)" }}>
                      <span style={{ fontSize: 12, color: "var(--text-heading)", fontWeight: 700 }}>Substack Drip Publisher</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#10B981", fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 8px #10B981", display: "inline-block" }}></span> ACTIVE
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Extended Integrations</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-main)", opacity: 0.65 }}>
                      <span style={{ fontSize: 12, color: "var(--text-heading)" }}>Medium Publisher</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#EF4444", fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", display: "inline-block" }}></span> INACTIVE
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-main)", opacity: 0.65 }}>
                      <span style={{ fontSize: 12, color: "var(--text-heading)" }}>Custom Website Publisher</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#EF4444", fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", display: "inline-block" }}></span> INACTIVE
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Calendar coming soon */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <h4 style={{ color: "var(--text-heading)", marginBottom: 6, fontFamily: "var(--font-jetbrains, monospace)", textTransform: "uppercase", fontSize: 13, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📅</span> Content calendar
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Cross-platform editorial planner. Schedule pipelines, optimize posting frequencies, and map out visual content calendars.
                </p>
              </div>

              {/* Blurred Mock Calendar View */}
              <div style={{ position: "relative", flex: 1, marginTop: 16, background: "var(--bg-subtle)", borderRadius: 8, border: "1px solid var(--border-main)", padding: 12, display: "grid", gridTemplateRows: "auto 1fr", gap: 8 }}>
                {/* Month header mock */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>JUNE 2026</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 10, background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4 }}>◀</span>
                    <span style={{ fontSize: 10, background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4 }}>▶</span>
                  </div>
                </div>
                {/* Month Grid mock */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, opacity: 0.15 }}>
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div key={i} style={{ aspectRatio: "1.3", background: "var(--bg-card)", borderRadius: 4, display: "flex", alignItems: "flex-start", padding: 4, fontSize: 9 }}>
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Coming Soon Glassmorphic Overlay */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.05)", backdropFilter: "blur(2.5px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
                  <span style={{ fontSize: 10, color: activeColor, background: activeBg, border: `1px solid ${activeColor}30`, padding: "4px 10px", borderRadius: 20, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Coming Soon • v2.5
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>


      {settingsOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "flex-end", zIndex: 1000 }}>
          <div style={{ width: 480, height: "100%", background: "var(--bg-card)", borderLeft: "1px solid var(--border-main)", padding: "30px 24px", boxSizing: "border-box", overflowY: "auto", boxShadow: "var(--shadow)" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-main)", paddingBottom: 12 }}>
              <h3 style={{ fontSize: 18, color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", margin: 0 }}>System Settings & Defaults</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                style={{ background: "transparent", border: "none", color: "#FF5A5A", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-jetbrains, monospace)" }}
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newKeys = {
                openai: fd.get("key_openai") as string,
                gemini: fd.get("key_gemini") as string,
                claude: fd.get("key_claude") as string,
              };
              const newConns = {
                linkedin: fd.get("conn_linkedin") as string,
                twitter: fd.get("conn_twitter") as string,
                substack: fd.get("conn_substack") as string,
                medium: fd.get("conn_medium") as string,
                website: fd.get("conn_website") as string,
              };
              const newLinkedinTarget = fd.get("linkedin_target") as "person" | "organization";
              saveSettings(newKeys, newConns, newLinkedinTarget);
              setSettingsOpen(false);
            }}>
              
              {/* Part 1: API Keys */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", color: activeColor, textTransform: "uppercase", marginBottom: 12 }}>Provider API Keys (Local persistent)</h4>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>ANTHROPIC API KEY</label>
                  <input type="password" name="key_claude" defaultValue={apiKeys.claude} placeholder="sk-ant-..." style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>OPENAI API KEY</label>
                  <input type="password" name="key_openai" defaultValue={apiKeys.openai} placeholder="sk-proj-..." style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>GEMINI API KEY</label>
                  <input type="password" name="key_gemini" defaultValue={apiKeys.gemini} placeholder="AIzaSy..." style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>
              </div>

              {/* Part 2: Platform Credentials */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", color: activeColor, textTransform: "uppercase", marginBottom: 12 }}>Account Connection Tokens</h4>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>LINKEDIN ACCESS TOKEN</label>
                  <input type="password" name="conn_linkedin" defaultValue={connections.linkedin} placeholder="Local token / credentials identifier" style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>LINKEDIN POST DESTINATION</label>
                  <select name="linkedin_target" defaultValue={linkedinTarget} style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none", fontFamily: "var(--font-jetbrains, monospace)" }}>
                    <option value="person">Personal Profile Feed (w_member_social)</option>
                    <option value="organization">Organization Company Page (w_organization_social)</option>
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>TWITTER / X BEARER KEY</label>
                  <input type="password" name="conn_twitter" defaultValue={connections.twitter} placeholder="Twitter app credentials block" style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>SUBSTACK APP CODE</label>
                  <input type="password" name="conn_substack" defaultValue={connections.substack} placeholder="Substack direct connection token" style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>MEDIUM API KEY</label>
                  <input type="password" name="conn_medium" defaultValue={connections.medium} placeholder="Medium Integration Token" style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4, fontFamily: "var(--font-jetbrains, monospace)" }}>WEBSITE WEBHOOK / APP PSWD</label>
                  <input type="password" name="conn_website" defaultValue={connections.website} placeholder="WordPress App password or direct webhook" style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-main)", borderRadius: 6, color: "var(--text-heading)", fontSize: 12, outline: "none" }} />
                </div>
              </div>

              <button
                type="submit"
                style={{ width: "100%", padding: 12, border: "none", borderRadius: 6, background: activeColor, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)" }}
              >
                Save Settings Configuration
              </button>

            </form>

            {/* Part 3: Live Connectors Status Dashboard */}
            <div style={{ marginTop: 32, borderTop: "1px solid var(--border-main)", paddingTop: 24 }}>
              <h4 style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", color: activeColor, textTransform: "uppercase", marginBottom: 16 }}>Live Connectors Dashboard</h4>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { id: "linkedin", name: "LinkedIn" },
                  { id: "twitter", name: "Twitter/X" },
                  { id: "substack", name: "Substack" },
                  { id: "medium", name: "Medium" },
                  { id: "website", name: "Website/WP" },
                ].map((plat) => {
                  const stat = getConnectionStatus(plat.id);
                  const sync = syncHistory[plat.id] || { errorCount: 0, lastSync: null };
                  
                  return (
                    <div key={plat.id} style={{ padding: "12px", background: "var(--bg-input-focus)", border: "1px solid var(--border-main)", borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 13, color: "var(--text-heading)", fontWeight: 700 }}>{plat.name}</div>
                        <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700, background: `${stat.color}15`, color: stat.color, border: `1px solid ${stat.color}30` }}>
                          {stat.text}
                        </span>
                      </div>

                      <div style={{ fontSize: 10, color: "var(--text-label)", fontFamily: "var(--font-jetbrains, monospace)", display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                        <div>Sync Time: <span style={{ color: "var(--text-muted)" }}>{sync.lastSync || "Never"}</span></div>
                        <div>Errors: <span style={{ color: sync.errorCount > 0 ? "#FF5A5A" : "var(--text-muted-dark)" }}>{sync.errorCount}</span></div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        {!stat.connected ? (
                          <button
                            style={{ flex: 1, padding: "4px 8px", background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderRadius: 4, color: "var(--text-label)", fontSize: 10, fontFamily: "var(--font-jetbrains, monospace)" }}
                            disabled
                          >
                            Provide token above
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDisconnect(plat.id)}
                            style={{ flex: 1, padding: "4px 8px", background: "rgba(255,90,90,0.05)", border: "1px solid rgba(255,90,90,0.1)", borderRadius: 4, color: "#FF5A5A", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)" }}
                          >
                            Disconnect Platform
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}


      {/* USER GUIDE DRAWER OVERLAY (Requirement 19 & 20 - Beautifully rendered statically!) */}
      {guideOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "flex-end", zIndex: 1001 }}>
          <div style={{ width: 720, height: "100%", background: "var(--bg-card)", borderLeft: "1px solid var(--border-main)", padding: "35px 30px", boxSizing: "border-box", overflowY: "auto" }}>
            
            {/* Header section with Close & Fullscreen Action */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-main)", paddingBottom: 15 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>📖</span>
                <h3 style={{ fontSize: 20, color: "var(--text-heading)", fontFamily: "var(--font-jetbrains, monospace)", margin: 0 }}>PubxStudio Guided Setup</h3>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <a
                  href="/guide"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "#5AB9FF",
                    textDecoration: "none",
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "6px 12px",
                    background: "rgba(90,185,255,0.06)",
                    border: "1px solid rgba(90,185,255,0.2)",
                    borderRadius: 6,
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(90,185,255,0.12)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(90,185,255,0.06)"}
                >
                  ↗ OPEN FULLSCREEN
                </a>
                <button
                  onClick={() => setGuideOpen(false)}
                  style={{ background: "transparent", border: "none", color: "#FF5A5A", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700 }}
                >
                  ✕ Close Guide
                </button>
              </div>
            </div>

            {/* Quick search input */}
            <div style={{ marginBottom: 24 }}>
              <input
                type="text"
                placeholder="Search topics (e.g. LinkedIn, Claude, SEO...)"
                value={guideSearch}
                onChange={(e) => setGuideSearch(e.target.value)}
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
                }}
              />
            </div>

            {/* Rendered Chapters */}
            <div style={{ display: "flex", flexDirection: "column", gap: 35, paddingBottom: 30 }}>
              
              {/* Introduction Card */}
              {(!guideSearch || guideSearch.toLowerCase().includes("welcome") || guideSearch.toLowerCase().includes("guide")) && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 8, padding: 20 }}>
                  <p style={{ fontSize: 13, color: "var(--text-main)", margin: 0, lineHeight: 1.6 }}>
                    Welcome to the <strong>PubxStudio</strong> setup center. Integrate your API keys, establish distribution connectors, and publish content dynamically.
                  </p>
                  <div style={{ marginTop: 12, fontSize: 11, color: "var(--guide-text-highlight)", fontFamily: "var(--font-jetbrains, monospace)", background: "var(--guide-bg-highlight)", padding: 10, borderRadius: 6, border: "1px solid var(--guide-border-highlight)" }}>
                    🔐 Keys and tokens are persistent strictly inside your local browser storage (`localStorage`) and never exit your device.
                  </div>
                </div>
              )}

              {/* API Credentials */}
              <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 25 }}>
                <h4 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 18, color: "var(--text-heading)", margin: "0 0 14px 0" }}>
                  🛠️ Step-by-Step API Configurations
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                  
                  {/* Anthropic */}
                  {(!guideSearch || guideSearch.toLowerCase().includes("claude") || guideSearch.toLowerCase().includes("anthropic")) && (
                    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderLeft: "3.5px solid rgb(234, 115, 87)", padding: 16, borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <h5 style={{ margin: 0, color: "var(--text-heading)", fontSize: 14 }}>1. Anthropic Claude Key</h5>
                        <span style={{ fontSize: 10, color: "rgb(234, 115, 87)" }}>sk-ant-</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                        Create a key on the <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ color: "#5AB9FF", textDecoration: "none" }}>Anthropic Console</a>, copy the string, and paste it into the `ANTHROPIC API KEY` settings field.
                      </p>
                    </div>
                  )}

                  {/* OpenAI */}
                  {(!guideSearch || guideSearch.toLowerCase().includes("openai") || guideSearch.toLowerCase().includes("gpt")) && (
                    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderLeft: "3.5px solid rgb(16, 163, 127)", padding: 16, borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <h5 style={{ margin: 0, color: "var(--text-heading)", fontSize: 14 }}>2. OpenAI Key (GPT-4o)</h5>
                        <span style={{ fontSize: 10, color: "rgb(16, 163, 127)" }}>sk-proj-</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                        Create a key under the <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ color: "#5AB9FF", textDecoration: "none" }}>OpenAI Platform Dashboard</a> and bind it in PubxStudio settings.
                      </p>
                    </div>
                  )}

                  {/* Gemini */}
                  {(!guideSearch || guideSearch.toLowerCase().includes("gemini") || guideSearch.toLowerCase().includes("google")) && (
                    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", borderLeft: "3.5px solid rgb(141, 108, 255)", padding: 16, borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <h5 style={{ margin: 0, color: "var(--text-heading)", fontSize: 14 }}>3. Google Gemini Key</h5>
                        <span style={{ fontSize: 10, color: "rgb(141, 108, 255)" }}>AIzaSy</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                        Acquire a direct key from the <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: "#5AB9FF", textDecoration: "none" }}>Google AI Studio Key Manager</a> and paste under settings inputs.
                      </p>
                    </div>
                  )}

                </div>
              </div>

              {/* Connectors */}
              <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 25 }}>
                <h4 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 18, color: "var(--text-heading)", margin: "0 0 14px 0" }}>
                  🚀 Direct Connectors Setups
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                  
                  {(!guideSearch || guideSearch.toLowerCase().includes("linkedin")) && (
                    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", padding: 14, borderRadius: 6 }}>
                      <h5 style={{ margin: "0 0 6px 0", color: "var(--text-heading)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#0A66C2" }}>🔗</span> LinkedIn
                      </h5>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                        Enable **Share on LinkedIn** inside developers hub. Supports personal w_member_social feed or organization feed toggles!
                      </p>
                    </div>
                  )}

                  {(!guideSearch || guideSearch.toLowerCase().includes("twitter") || guideSearch.toLowerCase().includes("x")) && (
                    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", padding: 14, borderRadius: 6 }}>
                      <h5 style={{ margin: "0 0 6px 0", color: "var(--text-heading)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>🔗</span> Twitter / X
                      </h5>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                        Configure OAuth 2.0 inside developers dashboard, copy App Client ID, and generate Bearer key.
                      </p>
                    </div>
                  )}

                  {(!guideSearch || guideSearch.toLowerCase().includes("substack")) && (
                    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", padding: 14, borderRadius: 6 }}>
                      <h5 style={{ margin: "0 0 6px 0", color: "var(--text-heading)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#FF6B00" }}>🔗</span> Substack
                      </h5>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                        Specify your publication identifier sub-URL in workspace defaults to prefill drafts.
                      </p>
                    </div>
                  )}

                  {(!guideSearch || guideSearch.toLowerCase().includes("medium")) && (
                    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-main)", padding: 14, borderRadius: 6 }}>
                      <h5 style={{ margin: "0 0 6px 0", color: "var(--text-heading)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>🔗</span> Medium
                      </h5>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                        Retrieve Integration Token from medium security profile, paste directly under settings keys.
                      </p>
                    </div>
                  )}

                </div>
              </div>

              {/* End-to-End Timeline */}
              {(!guideSearch || guideSearch.toLowerCase().includes("tutorial") || guideSearch.toLowerCase().includes("step") || guideSearch.toLowerCase().includes("publish")) && (
                <div>
                  <h4 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 18, color: "var(--text-heading)", margin: "0 0 14px 0" }}>
                    🏆 E2E Publish Timeline Tutorial
                  </h4>

                  {/* Timelines tabs */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setGuideStep(s)}
                        style={{
                          flex: 1,
                          padding: "6px 2px",
                          background: guideStep === s ? "rgba(90,185,255,0.08)" : "var(--bg-subtle)",
                          border: guideStep === s ? "1px solid #5AB9FF" : "1px solid var(--border-main)",
                          borderRadius: 4,
                          color: guideStep === s ? "#5AB9FF" : "var(--text-muted)",
                          fontFamily: "var(--font-jetbrains, monospace)",
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        STEP {s}
                      </button>
                    ))}
                  </div>

                  {/* Timeline step body */}
                  <div style={{ background: "var(--bg-input-focus)", border: "1px solid var(--border-main)", padding: 20, borderRadius: 8 }}>
                    {guideStep === 1 && (
                      <div>
                        <h6 style={{ margin: "0 0 8px 0", color: "var(--text-heading)", fontSize: 13 }}>Step 1: Preset Load</h6>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          Click your **Category** (e.g. **AI & ML**). Notice how the Topic and Excerpt presets dynamically pre-fill with highly optimized copywriting setups instantly!
                        </p>
                      </div>
                    )}

                    {guideStep === 2 && (
                      <div>
                        <h6 style={{ margin: "0 0 8px 0", color: "var(--text-heading)", fontSize: 13 }}>Step 2: Context RAG</h6>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          Upload supporting images or transcripts to the RAG workspace box to provide raw anchor materials to the generator.
                        </p>
                      </div>
                    )}

                    {guideStep === 3 && (
                      <div>
                        <h6 style={{ margin: "0 0 8px 0", color: "var(--text-heading)", fontSize: 13 }}>Step 3: Spawn Agent</h6>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          Select your model in settings, then trigger **Spawn Content Generation Agent**. Watch the logs report research progress live.
                        </p>
                      </div>
                    )}

                    {guideStep === 4 && (
                      <div>
                        <h6 style={{ margin: "0 0 8px 0", color: "var(--text-heading)", fontSize: 13 }}>Step 4: Audit & Versioning</h6>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          Check Focus Keyphrase density, run auto-optimizers, and save manual drafts into the granular version stack to log milestones.
                        </p>
                      </div>
                    )}

                    {guideStep === 5 && (
                      <div>
                        <h6 style={{ margin: "0 0 8px 0", color: "var(--text-heading)", fontSize: 13 }}>Step 5: Direct Post</h6>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          Tick **Approved for Publication**, then trigger direct publishing to connected LinkedIn accounts, delivering live update feeds!
                        </p>
                      </div>
                    )}

                    {/* Timeline checkbox */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>
                        <input
                          type="checkbox"
                          checked={guideCompleted[guideStep] || false}
                          onChange={() => setGuideCompleted(prev => ({ ...prev, [guideStep]: !prev[guideStep] }))}
                          style={{ accentColor: "#A8FFB2" }}
                        />
                        Mark step as complete
                      </label>
                      {guideStep < 5 && (
                        <button
                          onClick={() => setGuideStep(guideStep + 1)}
                          style={{ padding: "4px 8px", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 4, color: "var(--text-heading)", fontSize: 10, cursor: "pointer", boxShadow: "var(--shadow)" }}
                        >
                          Next Step
                        </button>
                      )}
                    </div>

                  </div>
                </div>
              )}

            </div>

            {/* Drawer bottom control */}
            <div style={{ marginTop: 10, borderTop: "1px solid var(--border-main)", paddingTop: 20, textAlign: "center" }}>
              <button
                onClick={() => setGuideOpen(false)}
                style={{ padding: "12px 30px", background: activeColor, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)", letterSpacing: "0.05em" }}
              >
                GOT IT, LET'S WORK!
              </button>
            </div>

          </div>
        </div>
      )}


      {/* Footer */}
      <div style={{ marginTop: 60, paddingTop: 20, borderTop: "1px solid var(--border-subtle)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <p style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 10, color: "var(--text-muted-dark)", letterSpacing: "0.05em", margin: 0 }}>
          PUBXSTUDIO v2.4 — IDEA → DRAFT → PREVIEW → APPROVE → PUBLISH
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
                style={{ padding: "10px 24px", background: activeColor, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)" }}
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
                style={{ padding: "10px 24px", background: activeColor, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-jetbrains, monospace)" }}
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
