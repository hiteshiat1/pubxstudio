export interface PromptTemplate {
  name: string;
  description: string;
  prompt: string;
}

export interface PublishingPlugin {
  id: string;
  name: string;
  outputPath: string;
  outputType: "markdown" | "json";
  defaultSystemPrompt: string;
  templates: PromptTemplate[];
}

// -------------------------------------------------------------
// Category Definitions, Colors, and Presets (Requirement 14)
// -------------------------------------------------------------
export const CATEGORY_ORDER = [
  "General",
  "Business Strategy",
  "Product Design",
  "Research",
  "Engineering & Code",
  "AI & ML"
] as const;

export type Category = typeof CATEGORY_ORDER[number];

export const CATEGORIES = {
  "General": {
    color: "#E0E0E0",
    bg: "#1C1C1C",
    description: "General interest editorials, industry shifts, and high-impact macro insights.",
    defaultTopic: "The Rise of Stateless Local Productivity Software",
    defaultExcerpt: "An exploration of why technical professionals are shifting back from cloud SaaS to lightweight, stateless offline-first developer utilities.",
    optimizedDirectives: "Focus on general readability, clean logical styling, macro-economic context, and broader strategic paradigms. Skip dense code blocks but emphasize historical context and clear formatting."
  },
  "Business Strategy": {
    color: "#FF8A5A",
    bg: "#2E1D15",
    description: "Startups, growth loops, monetization frameworks, and product launches.",
    defaultTopic: "Sustainable Open-Source Business & Monetization Models",
    defaultExcerpt: "How developers and founders are utilizing dual-licensing, open-core ecosystems, and cloud-hosted API layers to build viable businesses around open code.",
    optimizedDirectives: "Focus heavily on pricing tiers, ROI metrics, SaaS conversion variables, distribution networks, growth velocity, and target customer pricing thresholds."
  },
  "Product Design": {
    color: "#FF5AFF",
    bg: "#2E142E",
    description: "Visual premium aesthetics, dark interfaces, typography, and layout logic.",
    defaultTopic: "Designing Glassmorphic Responsive UIs for High-End Developer Tools",
    defaultExcerpt: "A deep dive into styling depth utilizing subtle backdrop filters, custom scrollbars, cohesive high-contrast typography, and fluid micro-animations.",
    optimizedDirectives: "Prioritize user experience patterns, spacing hierarchies, component states (disabled, active, focus), animations, glassmorphism CSS blueprints, and color harmonious combinations."
  },
  "Research": {
    color: "#5AB9FF",
    bg: "#152A3A",
    description: "System benchmarks, framework comparisons, technical review papers.",
    defaultTopic: "Dense Architectures vs. Mixture of Experts: A Technical Assessment",
    defaultExcerpt: "An in-depth review of computational efficiency, latency curves, activation costs, and token throughput ratios comparing MoE and traditional models.",
    optimizedDirectives: "Maintain an academic, deeply structured tone. Provide citations, exact metric equations, systematic comparison tables, benchmarks, research paper references, and comparative latency analysis."
  },
  "Engineering & Code": {
    color: "#5AFF5A",
    bg: "#142E14",
    description: "API specifications, type safety, modular structures, and server logic.",
    defaultTopic: "Building Type-Safe Stateless Architectures in Next.js 16 Applications",
    defaultExcerpt: "How to decouple synchronous types and registry schemas from server action modules to guarantee compile-safe execution in React 19.",
    optimizedDirectives: "Enforce strict type-safety, provide 2-3 complete, copy-pasteable TypeScript or Python code blocks, focus heavily on decoupled imports, file decoupling, and error catch blocks."
  },
  "AI & ML": {
    color: "#B18CFF",
    bg: "#241A3A",
    description: "Agentic swarms, deep learning pipelines, RAG, and reasoning models.",
    defaultTopic: "Decentralized Multi-Agent Swarms with Shared Memory and HITL Rules",
    defaultExcerpt: "Designing coordinate agent chains that utilize vector memory blocks, live account connections, and manual Human-in-the-Loop review approvals.",
    optimizedDirectives: "Expose complex agent orchestration patterns, retrieval augmented memory architectures, prompt engineering blocks, tool bindings, and visual system flow graphs."
  }
} as const;

// -------------------------------------------------------------
// Plugin Registry System Definitions
// -------------------------------------------------------------
export const PUBLISHING_PLUGINS: PublishingPlugin[] = [
  {
    id: "article",
    name: "Article MDX",
    outputPath: "article.mdx",
    outputType: "markdown",
    defaultSystemPrompt: `You are a premium content writer for PubxStudio — a modern publishing platform read by professionals, builders, and domain leaders.

Your writing style:
- Deeply authoritative and informative. You skip superficial filler.
- Use concrete examples, data tables, and clean formatting.
- Include real-world references, case studies, or tactical playbooks where appropriate.
- Formulate strong section headlines (##, ###) and use markdown alerts where helpful.
- Target a length of 1200-2000 words. Rich and high density.
- Conclude with an actionable key takeaway summary.

Do NOT include yaml frontmatter in the raw output content. Just write the article body starting with the first ## heading.
Do NOT include the title as an H1 — that is rendered by the shell layout.`,
    templates: [
      {
        name: "Tactical Playbook",
        description: "Dense step-by-step technical guide with illustrations and checklists.",
        prompt: "Write a comprehensive, step-by-step practical playbook on this topic. Include actionable checklists, code snippets or structured flow definitions, and deep explanations of trade-offs."
      },
      {
        name: "Industry Analysis",
        description: "High-level overview covering market trends, funding landscape, and future forecasts.",
        prompt: "Provide an analytical market teardown on this topic. Highlight structural forces, key players, recent funding or technology shifts, and where the value is migrating over the next 3-5 years."
      },
      {
        name: "Thought Leadership",
        description: "Opinionated, scroll-stopping editorial arguing a bold, non-obvious thesis.",
        prompt: "Craft a highly opinionated, strategic thought-leadership essay. Establish a strong, counter-intuitive thesis early, back it up with robust case logical pillars, and challenge existing paradigms."
      }
    ]
  },
  {
    id: "linkedin",
    name: "LinkedIn Post",
    outputPath: "platforms/linkedin.md",
    outputType: "markdown",
    defaultSystemPrompt: `You are a social content writer for PubxStudio. You write compelling, high-reach LinkedIn posts.

Rules:
- Do NOT use any Markdown formatting whatsoever (no bolding with **, no italics with *, no headers #, no markdown list symbols, no backticks, no inline code, no code blocks). The output must be completely clean, direct, plain text.
- Start with a strong, single-sentence hook line (do NOT bold it).
- Write in short, readable paragraphs (1-2 sentences max) with double spaces.
- Keep the tone professional but highly engaging and approachable.
- Include a bulleted breakdown of the core takeaways using plain unicode bullets (like • or -) but do NOT wrap them in any markdown bolding or list symbols.
- MANDATORY HASHTAGS: You MUST append exactly 3 to 5 highly relevant domain-specific hashtags at the very end of the post (e.g. #Technology #Leadership #Innovation).
- End with an engaging question or direct call to action prompting readers to leave a comment or share.
- Do not use excessive emojis (maximum of 2).
- Constraints: The entire post MUST be strictly under 3,000 characters.

Output ONLY the raw LinkedIn post copy with zero markdown formatting.`,
    templates: [
      {
        name: "Pattern Interrupt",
        description: "A counter-interactive hook that challenges standard industry beliefs.",
        prompt: "Focus on a controversial or commonly misunderstood truth about this topic. Start with a bold hook that interrupts the feed."
      },
      {
        name: "Storytelling Framework",
        description: "Personal, narrative-driven journey from friction to success.",
        prompt: "Frame the topic as a problem-solution story. Start in the middle of a high-friction situation, explain the epiphany, and share the lessons learned."
      }
    ]
  },
  {
    id: "x",
    name: "X/Twitter Thread",
    outputPath: "platforms/x.md",
    outputType: "markdown",
    defaultSystemPrompt: `You write viral, educational Twitter/X threads for PubxStudio.

Rules:
- Do NOT use any Markdown formatting whatsoever (no bolding with **, no italics with *, no backticks). The output must be completely clean, direct, plain text.
- Generate a cohesive, engaging thread of 5 to 6 tweets.
- Tweet 1 (Hook): Must have a powerful scroll-stopping hook, a brief teaser of what will be learned, and end with the thread emoji 🧵.
- Tweets 2-4 (Core lessons): Each tweet explains one highly specific, tactical, or fascinating point.
- Tweet 5 (The Takeaway): Summarize the big shift or actionable advice.
- Tweet 6 (CTA): Provide a call to action prompting readers to retweet the first tweet of the thread.
- MANDATORY HASHTAGS: You MUST append exactly 1 or 2 relevant hashtags to the final tweet (e.g. #AI #SaaS).
- Constraints: EVERY single tweet must be strictly under 280 characters.
- Formatting: Number each tweet clearly at the start (1/, 2/, 3/, etc.) and leave a blank line between tweets.

Output ONLY the thread, separated by blank lines with zero markdown formatting.`,
    templates: [
      {
        name: "The Educational Masterclass",
        description: "Teaches a complex topic step-by-step in bite-sized tweets.",
        prompt: "Break this topic down into a comprehensive multi-step tutorial. Each tweet should provide one clear lesson with clear instructions."
      },
      {
        name: "The Curated Checklist",
        description: "Summarizes the absolute best frameworks or tools in a checklist.",
        prompt: "Structure the thread as a checklist of high-value actions or frameworks. Ensure every tweet packs high-utility density."
      }
    ]
  },
  {
    id: "substack",
    name: "Substack Newsletter",
    outputPath: "platforms/substack.md",
    outputType: "markdown",
    defaultSystemPrompt: `You write Substack newsletter editions for PubxStudio.

Rules:
- Format the newsletter beautifully with clean headers, structured blockquotes, and lists.
- You are allowed to use standard Markdown formatting (headers, bolding, blockquotes, code blocks) to suit the Substack platform format.
- Start with a warm, personal 2-3 sentence introduction welcoming readers in a conversational tone.
- Include a designated "Why This Matters" or "Strategic Insights" section set off by markdown quotes.
- Incorporate a conversational CTA encouraging readers to reply directly or leave their thoughts in the comments.
- Conclude with a warm signature: "To your success,\nThe PubxStudio Team".
- Constraints: The entire newsletter copy MUST be strictly under 100,000 characters to prevent Gmail inbox clipping.

Output ONLY the Substack markdown document.`,
    templates: [
      {
        name: "Trench Notes",
        description: "Casual, high-context email written as a peer-to-peer developer memo.",
        prompt: "Write the newsletter in a highly conversational, peer-to-peer tone. Emphasize raw, real-world context and insights from the trenches."
      },
      {
        name: "The Deep Dive Digest",
        description: "Dense, deeply structured analytical briefing for executives.",
        prompt: "Structure the newsletter as a premium weekly digest. Use clean headers, highlight key trends, and provide macro-to-micro connections."
      }
    ]
  },
  {
    id: "medium",
    name: "Medium Post",
    outputPath: "platforms/medium.md",
    outputType: "markdown",
    defaultSystemPrompt: `You write high-reach, technical thought leadership articles optimized for Medium publications.

Rules:
- Structure the content with a bold, high-converting Title and a descriptive Subtitle.
- Emphasize readability with engaging subheadings, styled blockquotes, and code snippets where appropriate.
- You are allowed to use standard Markdown formatting (headers, bolding, blockquotes, code blocks) to suit the Medium publication format.
- Introduce clear reading times and dynamic tag lists at the end.
- Use conversational CTAs encouraging readers to clap, highlight, and follow.
- Maintain an editorial, narrative-rich tone.
- Constraints: The entire article copy MUST be strictly under 100,000 characters.

Output ONLY the Medium markdown copy.`,
    templates: [
      {
        name: "Technical Briefing",
        description: "Deep, structured engineering breakdown optimized for tech readers.",
        prompt: "Focus heavily on system internals, code benchmarks, architectural diagrams, and deep technical details."
      },
      {
        name: "Founder Journey",
        description: "Narrative journey sharing core strategic lessons and business pivots.",
        prompt: "Write the article as a personal narrative describing business insights, growth challenges, metric numbers, and executive advice."
      }
    ]
  },
  {
    id: "seo",
    name: "SEO Metadata",
    outputPath: "seo.json",
    outputType: "json",
    defaultSystemPrompt: `You generate premium, SEO-optimized metadata cards for PubxStudio.

Return ONLY a valid JSON block containing:
- metaDescription (Strictly under 155 characters summarizing the focus)
- keywords (An array of 5-8 highly searched tags)
- ogTitle (Open Graph Title, 60 characters max)
- ogDescription (OG social description, 95 characters max)
- twitterTitle (Twitter card Title)
- twitterDescription (Twitter card description)
- focusKeyphrase (The primary 2-3 word target keyphrase)
- relatedTopics (An array of 3-5 closely related categories)

Do NOT enclose your output in markdown backticks (no \`\`\`json). Just raw JSON.`,
    templates: [
      {
        name: "Search Focused",
        description: "Optimized primarily for Google search intent and target keyphrases.",
        prompt: "Generate SEO values tuned strictly for organic search intent and keyword competition."
      }
    ]
  },
  {
    id: "leadmagnet",
    name: "Lead Magnet Download",
    outputPath: "lead-magnet.md",
    outputType: "markdown",
    defaultSystemPrompt: `You build practical, high-value lead magnets for PubxStudio readers to download.

Rules:
- Design a premium, highly actionable asset (a checklist, a prompt pack, or a comparison matrix).
- Start with a clear header title and the branding tag: "**A Premium Asset by PubxStudio**".
- Include a short, practical "How to Implement This" introduction.
- Provide a minimum of 20-30 detailed, comprehensive checklist items or a robust structured data matrix.
- Ensure all items have descriptive bullet blocks.
- End with a clean horizontal rule and footer: "*Unlock more premium assets at [pubxstudio.com](https://pubxstudio.com)*".

Output ONLY the markdown asset block.`,
    templates: [
      {
        name: "Interactive Implementation Checklist",
        description: "A massive, multi-phase action checklist that guides standard deployments.",
        prompt: "Build an aggressive, multi-phase implementation checklist covering Phase 1: Planning, Phase 2: Core Execution, Phase 3: Testing & Auditing, and Phase 4: Scaling."
      },
      {
        name: "Strategic Prompt Pack",
        description: "A suite of 10+ advanced copy-paste prompt blocks with variables.",
        prompt: "Design a curated prompt pack. Provide 10 copy-pasteable system prompts with brackets [like this] for user inputs."
      }
    ]
  }
];

// -------------------------------------------------------------
// Version Control Data Definition (Requirement 17 / phase2)
// -------------------------------------------------------------
export interface ContentVersion {
  version: number;
  timestamp: string;
  content: string;
  note: string;
}

// -------------------------------------------------------------
// Synchronous Helpers
// -------------------------------------------------------------
export function detectMoE(modelName: string): boolean {
  const normalized = modelName.toLowerCase();
  return (
    normalized.includes("moe") ||
    normalized.includes("mixtral") ||
    normalized.includes("gpt-4o") ||
    normalized.includes("claude-3-5") ||
    normalized.includes("claude-4") ||
    normalized.includes("gemini-1.5-pro") ||
    normalized.includes("deepseek")
  );
}

export type PipelineOutputs = {
  date: string;
  readTime: string;
  results: Record<string, string>;
  diagram?: { name: string; base64: string; ref: string } | null;
};
