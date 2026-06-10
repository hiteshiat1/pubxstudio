import { CATEGORIES, type Category, detectMoE, PUBLISHING_PLUGINS } from "../constants";

export async function callLLMClient(options: {
  provider: "openai" | "gemini" | "claude";
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  images?: { mimeType: string; base64: string }[];
}): Promise<string> {
  let { provider, model, apiKey, systemPrompt, userPrompt, images = [] } = options;

  if (!apiKey || !apiKey.trim()) {
    throw new Error(`API Key for provider "${provider}" is missing. Please configure it in your Settings.`);
  }

  // Intercept legacy/invalid Claude model names
  if (provider === "claude") {
    if (model === "claude-4-sonnet-latest" || !model) {
      model = "claude-3-5-sonnet-latest";
    } else if (model === "claude-4-haiku-latest") {
      model = "claude-3-5-haiku-latest";
    }
  }

  // 1. Anthropic Claude direct browser fetch
  if (provider === "claude") {
    const formattedContent: Array<unknown> = [];
    
    // Add images if present (multimodal Claude Messages payload)
    images.forEach((img) => {
      formattedContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType,
          data: img.base64,
        },
      });
    });

    formattedContent.push({
      type: "text",
      text: userPrompt,
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true", // Opt-in to enable direct browser access without CORS block
      },
      body: JSON.stringify({
        model: model || "claude-3-5-sonnet-latest",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: formattedContent }],
      }),
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(`Claude API Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return (data.content as Array<{ type: string; text: string }>)
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  // 2. OpenAI direct browser fetch
  if (provider === "openai") {
    const messages: Array<unknown> = [
      { role: "system", content: systemPrompt },
    ];

    const contentArray: Array<unknown> = [{ type: "text", text: userPrompt }];

    // Add images to OpenAI chat completions multimodal structure
    images.forEach((img) => {
      contentArray.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64}`,
        },
      });
    });

    messages.push({ role: "user", content: contentArray });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages,
        max_tokens: 4000,
      }),
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(`OpenAI API Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return data.choices?.[0]?.message?.content || "";
  }

  // 3. Google Gemini direct browser fetch
  if (provider === "gemini") {
    const urlModel = model || "gemini-1.5-pro";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${urlModel}:generateContent?key=${apiKey}`;

    const parts: Array<unknown> = [{ text: userPrompt }];

    // Add images (Gemini generateContent base64 payload)
    images.forEach((img) => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    });

    const body = {
      contents: [{ parts }],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(`Gemini API Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export async function runOptimizationAgentClient(options: {
  category: Category;
  contentType: string;
  content: string;
  provider: "openai" | "gemini" | "claude";
  apiKey: string;
  model?: string;
}): Promise<string> {
  let { category, contentType, content, provider, apiKey, model } = options;

  // Intercept stale/invalid model names
  if (provider === "claude") {
    if (model === "claude-4-sonnet-latest" || !model) {
      model = "claude-3-5-sonnet-latest";
    } else if (model === "claude-4-haiku-latest") {
      model = "claude-3-5-haiku-latest";
    }
  }
  const config = CATEGORIES[category];

  let systemPrompt = `You are a premium Editor and Quality Review Agent at PubxStudio.
Your task is to review the generated ${contentType} asset and optimize it specifically to target the "${category}" audience.

Optimization Category Directives:
"${config.optimizedDirectives}"

Rules:
- Audit and refine vocabulary to perfectly match this domain.
- Ensure formatting is dense and clean (e.g. check code blocks in Engineering, ROI references in Business, structured layout grids in Product, academic metrics in Research).
- Do not add preambles or headers like "Here is the optimized content". Return ONLY the fully polished, final text.`;

  if (contentType === "LinkedIn Post") {
    systemPrompt += `\n\n[CRITICAL OVERRIDE FOR LINKEDIN]: The output MUST be 100% plain text. Do NOT introduce or retain any markdown formatting (such as **, *, #, \`, or code blocks). Explain any code examples, bullet points, or tables using plain conversational prose text. The total length MUST be strictly under 3000 characters.`;
  }

  try {
    return await callLLMClient({
      provider,
      model: model || (provider === "openai" ? "gpt-4o-mini" : provider === "gemini" ? "gemini-1.5-flash" : "claude-3-5-sonnet-latest"),
      apiKey,
      systemPrompt,
      userPrompt: `Audit and fully optimize this generated copy to perfect standards:\n\n${content}`,
    });
  } catch (err) {
    console.error(`Optimization agent pass failed for category [${category}]:`, err);
    return content; // Graceful fallback to original content
  }
}

export async function generateMediaAssetClient(options: {
  topic: string;
  slug: string;
  provider: "openai" | "gemini" | "claude";
  apiKey: string;
  model?: string;
}): Promise<{ name: string; base64: string; ref: string } | null> {
  const { topic, slug, provider, apiKey, model } = options;

  const systemPrompt = `You are a visual design engineer at PubxStudio. You design premium, vector-based technical diagram cards (SVG format).
Your SVGs are visually stunning:
- Beautiful dark theme (#0D0D0D background).
- Curated vibrant gradients (Neon Teals, Yellows, Purples).
- Premium typography and clean blueprints.
- Return ONLY valid SVG code. No markdown wrapping.`;

  const userPrompt = `Create a striking conceptual design SVG diagram card representing: "${topic}". Make it feel architectural, futuristic, and premium.`;

  try {
    const rawSvg = await callLLMClient({
      provider,
      model: model || (provider === "openai" ? "gpt-4o-mini" : provider === "gemini" ? "gemini-1.5-flash" : "claude-3-5-sonnet-latest"),
      apiKey,
      systemPrompt,
      userPrompt,
    });

    const cleanSvg = rawSvg.substring(rawSvg.indexOf("<svg"), rawSvg.lastIndexOf("</svg>") + 6);
    const base64 = btoa(unescape(encodeURIComponent(cleanSvg || rawSvg)));
    const name = `${slug}-diagram.svg`;
    const markdownRef = `![PubxStudio Media Agent Blueprint Diagram](/images/articles/${slug}/${name})`;

    return { name, base64, ref: markdownRef };
  } catch (err) {
    console.error("Media Agent diagram generation failed:", err);
    // Graceful fallback diagram
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="100%" height="100%">
      <rect width="800" height="450" fill="#0D0D0D" rx="16"/>
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E8FF5A"/>
          <stop offset="50%" stop-color="#5AFFDB"/>
          <stop offset="100%" stop-color="#B18CFF"/>
        </linearGradient>
      </defs>
      <circle cx="400" cy="225" r="120" stroke="url(#g)" stroke-width="4" fill="none" opacity="0.3"/>
      <circle cx="400" cy="225" r="80" stroke="url(#g)" stroke-width="6" fill="none"/>
      <text x="400" y="235" font-family="monospace" font-size="28" font-weight="bold" fill="#fff" text-anchor="middle" letter-spacing="4">PUBXSTUDIO</text>
      <text x="400" y="270" font-family="sans-serif" font-size="12" fill="#555" text-anchor="middle" letter-spacing="1">CONCEPTUAL GRAPHIC · ${topic.toUpperCase()}</text>
    </svg>`;
    const base64 = btoa(unescape(encodeURIComponent(fallbackSvg)));
    const name = `${slug}-blueprint.svg`;
    return { name, base64, ref: `![PubxStudio Diagram](/images/articles/${slug}/${name})` };
  }
}

export async function runGenerationPipelineClient(options: {
  topic: string;
  excerpt: string;
  category: string;
  slug: string;
  brief: string;
  provider: "openai" | "gemini" | "claude";
  model: string;
  apiKey: string;
  customPrompts: Record<string, string>; // custom prompt strings per plugin id
  ragContext: string;
  links: string[];
  attachedImages: { name: string; dataUrl: string }[]; // client side base64 images
  selectedPlatforms: Record<string, boolean>;
}): Promise<any> {
  let {
    topic,
    excerpt,
    category,
    slug,
    brief,
    provider,
    model,
    apiKey,
    customPrompts,
    ragContext,
    links,
    attachedImages,
    selectedPlatforms,
  } = options;

  // Intercept stale/invalid model names
  if (provider === "claude") {
    if (model === "claude-4-sonnet-latest" || !model) {
      model = "claude-3-5-sonnet-latest";
    } else if (model === "claude-4-haiku-latest") {
      model = "claude-3-5-haiku-latest";
    }
  }

  const validCategory = (CATEGORIES[category as Category] ? category : "General") as Category;
  const categoryConfig = CATEGORIES[validCategory];

  // Format multimodal image inputs for the primary call if attached
  const imagesPayload = attachedImages.map((img) => {
    const parts = img.dataUrl.split(",");
    const mimeType = parts[0].split(";")[0].split(":")[1] || "image/png";
    return { mimeType, base64: parts[1] };
  });

  // Prepare full structural prompt variables
  const userCtx = [
    `Category Domain: ${validCategory}`,
    `Main Topic: ${topic}`,
    `Summary Excerpt: ${excerpt}`,
    `Slug ID: ${slug}`,
    links.length > 0 ? `External Context Links:\n${links.map((l) => `• ${l}`).join("\n")}` : "",
    ragContext.trim() ? `Additional RAG Materials & Reference Data:\n${ragContext.trim()}` : "",
    brief.trim() ? `Author Editorial Brief:\n${brief.trim()}` : "",
  ].filter(Boolean).join("\n\n");

  const results: Record<string, string> = {};

  // Phase 1: Spawn primary text agent to generate the long-form Article MDX
  const articlePlugin = PUBLISHING_PLUGINS.find((p) => p.id === "article")!;
  
  // Dynamic system prompt optimization: Inject category directives (Requirement 15)
  const baseArticlePrompt = customPrompts.article || articlePlugin.defaultSystemPrompt;
  const optimizedArticleSystemPrompt = `${baseArticlePrompt}\n\n[DYNAMIC OPTIMIZATION DIRECTIVES FOR CATEGORY: ${validCategory}]\n${categoryConfig.optimizedDirectives}`;

  const articleBodyRaw = await callLLMClient({
    provider,
    model,
    apiKey,
    systemPrompt: optimizedArticleSystemPrompt,
    userPrompt: `Compose the main article body for:\n\n${userCtx}`,
    images: imagesPayload,
  });

  // Run the Optimization & Review Agent over the generated article (Requirement 15)
  const articleBody = await runOptimizationAgentClient({
    category: validCategory,
    contentType: "article",
    content: articleBodyRaw,
    provider,
    apiKey,
    model,
  });

  const words = articleBody.trim().split(/\s+/).length;
  const readTime = `${Math.max(1, Math.ceil(words / 225))} min read`;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = new Date();
  const dateString = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  // Assemble full markdown with clean frontmatter
  const fullMdx = `---
title: "${topic.replace(/"/g, '\\"')}"
slug: "${slug}"
excerpt: "${excerpt.replace(/"/g, '\\"')}"
category: "${validCategory}"
date: "${dateString}"
readTime: "${readTime}"
author: "The PubxStudio Team"
published: true
canonicalUrl: "{{ARTICLE_URL}}"
---

${articleBody}`;

  results["article"] = fullMdx;

  // Phase 2: Detect MoE and spawn Media/Image Agent if applicable
  let diagramResult = null;
  const isMoE = detectMoE(model);
  if (isMoE) {
    diagramResult = await generateMediaAssetClient({
      topic,
      slug,
      provider,
      apiKey,
      model,
    });
  }

  // Phase 3: Execute all other publishing plugins in parallel (LinkedIn, Substack, X Thread, SEO, LeadMagnet)
  const remainingPlugins = PUBLISHING_PLUGINS.filter(
    (p) => p.id !== "article" && selectedPlatforms[p.id] === true
  );

  await Promise.all(
    remainingPlugins.map(async (plugin) => {
      try {
        const customPrompt = customPrompts[plugin.id] || plugin.defaultSystemPrompt;
        
        // Dynamically append Category Optimization Directives to platform adapter system prompts (Requirement 15)
        let systemPrompt = `${customPrompt}\n\n[DYNAMIC PLATFORM DIRECTIVES FOR CATEGORY: ${validCategory}]\n${categoryConfig.optimizedDirectives}`;
        let userPrompt = `Write the distribution content asset based on this article:\n\nTitle: ${topic}\nExcerpt: ${excerpt}\n\nFull Article Body:\n${articleBody}`;

        if (plugin.id === "linkedin") {
          systemPrompt += `\n\n[CRITICAL FORMATTING OVERRIDE FOR LINKEDIN]: Regardless of any category directives or other instructions, you MUST generate the output in 100% plain formatted text. Do NOT use any Markdown formatting whatsoever (no **, *, #, \`, or code blocks). Do NOT include code blocks or markdown lists; write them as plain text prose. The total length MUST be strictly under 3000 characters.`;
        }

        if (plugin.id === "seo") {
          systemPrompt = customPrompt;
          userPrompt = `Build structured SEO data for:\n\nTitle: ${topic}\nExcerpt: ${excerpt}\nCategory: ${validCategory}\nSlug: ${slug}`;
        } else if (plugin.id === "leadmagnet") {
          userPrompt = `Create a valuable download asset for this topic:\n\nTitle: ${topic}\nCategory: ${validCategory}\nExcerpt: ${excerpt}\n\nFull Article Body:\n${articleBody.slice(0, 2000)}`;
        }

        const outRaw = await callLLMClient({
          provider,
          model,
          apiKey,
          systemPrompt,
          userPrompt,
        });

        // Run the platform specific optimization pass
        let out = (plugin.id === "seo") ? outRaw : await runOptimizationAgentClient({
          category: validCategory,
          contentType: plugin.name,
          content: outRaw,
          provider,
          apiKey,
          model,
        });

        if (plugin.id === "linkedin") {
          // Programmatically strip any accidental markdown formatting
          out = out
            .replace(/\*\*(.*?)\*\*/g, "$1") // Bold
            .replace(/\*(.*?)\*/g, "$1")     // Italic
            .replace(/__(.*?)__/g, "$1")     // Bold underscore
            .replace(/_(.*?)_/g, "$1")       // Italic underscore
            .replace(/\`(.*?)\`/g, "$1")     // Inline code
            .replace(/```[\s\S]*?```/g, "")  // Code blocks
            .replace(/```/g, "")
            .replace(/^#+\s+/gm, "")         // Headers
            .trim();

          // Programmatically enforce a strict limit of 3000 characters
          if (out.length > 3000) {
            out = out.substring(0, 3000);
            const lastSpace = out.lastIndexOf(" ");
            if (lastSpace > 2800) {
              out = out.substring(0, lastSpace);
            }
          }
        }

        results[plugin.id] = out;
      } catch (err) {
        console.error(`Generation failed for plugin [${plugin.id}]:`, err);
        results[plugin.id] = `Generation failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    })
  );

  return {
    date: dateString,
    readTime,
    results,
    diagram: diagramResult,
  };
}
