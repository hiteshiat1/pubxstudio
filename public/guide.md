# 📖 PubxStudio User & Integration Guide

Welcome to the **PubxStudio** Guided Setup. This document covers content generation, review, and export. Social publishing is not yet available.

---

## 🛠️ Step-by-Step API Key Configurations

LLM provider API keys are currently stored in browser `localStorage` and sent to the selected provider for content generation. Social account tokens are not accepted by this interface.

### 1. Anthropic Claude Key
* **Purpose**: Spawns high-end creative, editorial, and copywriting agents.
* **How to create**:
  1. Go to the [Anthropic Developer Console](https://console.anthropic.com/).
  2. Create an account and navigate to **API Keys**.
  3. Click **Create Key**, name it `pubx-studio`, and copy the secret key (starts with `sk-ant-`).
* **Connection**: Open **Settings & Keys** in PubxStudio and paste it into the `ANTHROPIC API KEY` field.

### 2. OpenAI Key (GPT-4o)
* **Purpose**: Runs semantic reasoning agents, SEO health auditors, and visual vector diagrams.
* **How to create**:
  1. Visit the [OpenAI Platform Settings](https://platform.openai.com/api-keys).
  2. Under **API Keys**, click **Create new secret key**.
  3. Ensure it has model access permissions and copy the key (starts with `sk-proj-`).
* **Connection**: Paste under `OPENAI API KEY` in PubxStudio.

### 3. Google Gemini Key
* **Purpose**: High-speed multimodal analysis and parallel processing agents.
* **How to create**:
  1. Visit the [Google AI Studio Key Manager](https://aistudio.google.com/).
  2. Click **Create API Key** and link it to your Google Cloud project.
  3. Copy the key and paste it under `GEMINI API KEY` in PubxStudio settings.

---

## 🚀 Platform connectors

Social account connection and direct publishing are temporarily unavailable while secure OAuth, account ownership checks, and server-side approval are implemented. Do not paste access tokens into PubxStudio. Keep any existing provider tokens in the provider console and reconnect through the future OAuth flow.

---

## 🏆 Tutorial: Generate and export a draft

Follow this sample to create and review an *AI & ML* draft:

### Step 1: Initialize the Domain Presets
1. In the **Content Domain Category** row, click **AI & ML**.
2. **Dynamic UI Action**: Observe that the Topic (*Decentralized Multi-Agent Swarms...*) and Excerpt presets immediately pre-fill with highly premium context!
3. The slug naturally auto-populates as `/published/decentralized-multi-agent-swarms-...`.

### Step 2: Attach Context & Materials
1. Under **Multimodal RAG Context**, click **Upload Images** or drag screenshots/diagrams from your computer (forwarded as visual tokens to Claude).
2. Paste any reference papers, research articles, or notes into the **Raw Reference Research** box.
3. Paste relevant source links (e.g. `https://arxiv.org/abs/...`) under **Context Links**.

### Step 3: Trigger the Content Agent Chain
1. Select **Anthropic Claude**, **OpenAI Chat**, or **Google Gemini** as your primary orchestrator.
2. **Dynamic Cloud Model Fetching**: Notice that when you provide a valid API Key in settings, PubxStudio dynamically queries the provider's active API endpoints, populating the **Target Model** list in real time with all currently valid models for your key (falling back to standard offline presets if keys are blank).
3. Click **Spawn Content Generation Agent**.
4. Watch the progress tracker cycle through *Research*, *Drafting*, and *Platforms*.

### Step 4: Audit & Multi-Version HITL Editing
1. Once generated, click the **Article MDX** tab.
2. In the **SEO Copywriting Toolkit**, type your focus keyword (e.g. `multi-agent`) and click **Analyze SEO Health** to view density scores.
3. Click **Auto-Optimize Copy** to automatically polish keyphrase density!
4. Navigate to the **LinkedIn** tab. Click inside the text area, edit the hashtags, and click **+ Save Version** to save your edit milestone as `v2 - User hashtag edits`.

### Step 5: Export
1. Read through the final copy and use **Save Local Bundle** to download the files.
2. If you choose to publish manually, copy the reviewed text into the provider's own interface. PubxStudio does not verify a live post.

⚠️ **Manual Publishing Fallback & Troubleshooting**:
If you encounter any API connectivity issues, network failures, or if your developer access tokens expire:
*   **One-Click Clipboard Copy**: You can always use the **Copy Clipboard** button on any of the platform tabs (LinkedIn, Twitter, Substack, Medium, SEO) to copy the formatted text.
*   **Manual Paste**: Paste the copied content directly into the native interfaces of your social networks or editor dashboards.
*   **Unified Local Output Folder**: For every run, the Studio compiles a clean output package folder under `published/[slug]/` containing:
    *   `article.mdx` — The core markdown file.
    *   `platforms/` — Individual platform text assets (e.g., `linkedin.md`, `substack.md`, `twitter.md`).
    *   `images/` — RAG-based context diagrams and graphics.
    You can drag and upload these assets directly to your platforms as needed.
