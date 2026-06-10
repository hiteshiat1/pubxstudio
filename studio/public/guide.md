# 📖 PubxStudio User & Integration Guide

Welcome to the **PubxStudio** Guided Setup! This document guides you through creating API keys, configuring platform connectors, and executing your first end-to-end automated content publishing workflow.

---

## 🛠️ Step-by-Step API Key Configurations

All keys and tokens are stored **exclusively in your local browser storage (`localStorage`)**. No credentials ever touch a remote server, ensuring complete stateless privacy.

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

## 🚀 Setting Up Platform Connectors

### 🔗 LinkedIn Developer Connection
* **How to configure**:
  1. If you do not have one already, create a LinkedIn Company Page.
  2. Head to the [LinkedIn Developer Platform](https://www.linkedin.com/developers/apps).
  3. Click **Create App**.
  4. Under **Settings**, upload a logo (mandatory) and add your privacy policy URL.
  5. Under **Auth**, note your Client ID and Client Secret.
  6. Check **OAuth 2.0 Scopes** for the required `w_member_social` scope.
  7. If you do not see it, add it from the **Products** tab by requesting the **Share on LinkedIn** product.
  8. Head to the [LinkedIn OAuth Tools Manager](https://www.linkedin.com/developers/tools/oauth).
  9. Click **Create Token** for a **Member authorization code (3-legged)** flow.
  10. Copy the generated access token and use it to make an API call to `https://api.linkedin.com/v2/userinfo` (using Postman or curl, with `Authorization: Bearer <TOKEN>`).
  11. Copy the `"sub"` field value (e.g., `"sub": "Cpe7NMGZ90"`) from the JSON response output.
  12. Construct the final token setting string in the following exact format: `ACCESS_TOKEN|urn:li:person:SUB_VALUE` (e.g. `AQWXC2OK9q...|urn:li:person:Cpe7NMGZ90`). (Note: without this custom URN suffix, direct posting will fail validation).
  13. Copy the constructed string and paste it into the `LINKEDIN ACCESS TOKEN` field inside **System Settings & Defaults** modal in PubxStudio.
  14. You are now all set to publish to LinkedIn! The `w_member_social` scope allows PubxStudio to create, modify, and delete posts on your behalf.

### 🔗 Twitter / X Developer Connection
* **How to configure**:
  1. Go to the [Twitter/X Developer Portal](https://developer.twitter.com/en/portal/dashboard).
  2. Create a Project and App in your Developer Account.
  3. Under **User Authentication Settings**, activate OAuth 2.0 (Native App / Web App).
  4. Copy your **App Client ID** and generate a **Bearer Access Token**.
* **PubxStudio Connect**: Paste the token under `TWITTER / X BEARER KEY`.

### 🔗 Substack Drip Connection
* **How to configure**:
  1. Go to your Substack Publication Settings.
  2. Under the **Integrations** section, copy your publication Substack sub-URL or API hook if custom.
* **PubxStudio Connect**: Pre-fill under `SUBSTACK APP CODE`.

### 🔗 Medium Publishing Access
* **How to configure**:
  1. Visit your [Medium Settings - Integration Tokens](https://medium.com/me/settings/security).
  2. Scroll to the **Integration Tokens** block.
  3. Enter a token description and click **Get Integration Token**.
* **PubxStudio Connect**: Paste the token under `MEDIUM API KEY`.

---

## 🏆 End-to-End Tutorial: Generate & Publish

Follow this 5-minute step-by-step sample to publish a premium *AI & ML* thought leadership piece to your LinkedIn feed:

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

### Step 5: Approval & Direct Publication
1. Read through the finalized copies. Once satisfied, check the **Approved for Publication** box.
2. This unlocks direct publishing adapters.
3. Open `⚙ Settings & Keys` to confirm LinkedIn, Twitter, or Substack status states report as **Connected** in the relocated Live Dashboard.
4. Under the LinkedIn post preview, click **Publish LinkedIn**!
5. **Result**: A success indicator lights up green, delivering a custom success toast and a dynamic direct link to your live published article bundle under `published/[slug]/`!

⚠️ **Manual Publishing Fallback & Troubleshooting**:
If you encounter any API connectivity issues, network failures, or if your developer access tokens expire:
*   **One-Click Clipboard Copy**: You can always use the **Copy Clipboard** button on any of the platform tabs (LinkedIn, Twitter, Substack, Medium, SEO) to copy the formatted text.
*   **Manual Paste**: Paste the copied content directly into the native interfaces of your social networks or editor dashboards.
*   **Unified Local Output Folder**: For every run, the Studio compiles a clean output package folder under `published/[slug]/` containing:
    *   `article.mdx` — The core markdown file.
    *   `platforms/` — Individual platform text assets (e.g., `linkedin.md`, `substack.md`, `twitter.md`).
    *   `images/` — RAG-based context diagrams and graphics.
    You can drag and upload these assets directly to your platforms as needed.
