"use client";

import { useEffect, useState } from "react";

type Workspace = { id: string; name: string; role: string };
type Account = { id: string; provider: "linkedin" | "x"; provider_account_id: string;
  display_name: string; status: string; token_expires_at: string | null; granted_scopes: string[] | null };

export default function AccountsPanel() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<{ revisionId: string; accountId: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/workspaces", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { workspaces: [] })
      .then(async (data) => {
        const first = data.workspaces?.[0] as Workspace | undefined;
        if (!first) return;
        const response = await fetch(`/api/workspaces/${first.id}/accounts`, { cache: "no-store" });
        const accountData = response.ok ? await response.json() : { accounts: [] };
        if (active) { setWorkspace(first); setAccounts(accountData.accounts || []); }
      }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!workspace) return null;
  const connected = accounts.filter((account) => account.status === "connected");
  const selected = accounts.find((account) => account.id === selectedId);
  const canDraft = workspace.role === "founder" || workspace.role === "operator";

  async function disconnect(accountId: string) {
    if (!workspace) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/accounts/${accountId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setAccounts((current) => current.map((account) => account.id === accountId ? { ...account, status: "revoked" } : account));
      if (selectedId === accountId) setSelectedId("");
      setMessage("Account disconnected. Reconnect through the provider link when needed.");
    } catch { setMessage("Could not disconnect this account."); }
    finally { setBusy(false); }
  }

  async function createDraft() {
    if (!workspace || !selected || !title.trim() || !body.trim()) return;
    setBusy(true); setMessage(""); setDraft(null);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/content`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setDraft({ revisionId: result.revision.id, accountId: selected.id });
      setMessage(`Draft saved for ${selected.display_name}. Review the text before approving.`);
    } catch { setMessage("Could not save the draft."); }
    finally { setBusy(false); }
  }

  async function approveDraft() {
    if (!workspace || !draft) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/approvals`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: draft.revisionId, accountId: draft.accountId }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setMessage(`Approved for ${accounts.find((account) => account.id === draft.accountId)?.display_name || "the selected account"}. Approval ID: ${result.approval.approvalId}. Scheduling is a separate step.`);
      setDraft(null);
    } catch { setMessage("Could not approve this draft. Check your role and account status."); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="accounts-heading" style={{ border: "1px solid var(--border-color, #555)", borderRadius: 8, padding: 16, marginBottom: 24 }}>
    <h2 id="accounts-heading" style={{ margin: "0 0 12px", fontSize: 16 }}>Workspace accounts</h2>
    <p style={{ margin: "0 0 12px", fontSize: 12 }}>{workspace.name} · {workspace.role}</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      {workspace.role === "founder" && <>
        <a href={`/api/social/linkedin/start?workspaceId=${encodeURIComponent(workspace.id)}`}>Connect LinkedIn</a>
        <a href={`/api/social/x/start?workspaceId=${encodeURIComponent(workspace.id)}`}>Connect X after approving API costs</a>
      </>}
    </div>
    {accounts.length === 0 ? <p>No social accounts connected yet.</p> :
      <ul style={{ paddingLeft: 20 }}>{accounts.map((account) => <li key={account.id} style={{ marginBottom: 10 }}>
        <strong>{account.provider === "x" ? "X" : "LinkedIn"} · {account.display_name}</strong>
        {" · "}{account.status}{" · ID "}{account.provider_account_id}
        <div style={{ fontSize: 12 }}>Scopes: {account.granted_scopes?.length ? account.granted_scopes.join(", ") : "Provider did not report granted scopes"}</div>
        {account.token_expires_at && <div style={{ fontSize: 12 }}>Token expires: {new Date(account.token_expires_at).toLocaleString()}</div>}
        {workspace.role === "founder" && account.status !== "revoked" && <button disabled={busy} onClick={() => disconnect(account.id)}>Disconnect</button>}
        {workspace.role === "founder" && account.status !== "connected" &&
          <a href={`/api/social/${account.provider}/start?workspaceId=${encodeURIComponent(workspace.id)}`} style={{ marginLeft: 8 }}>Reconnect</a>}
      </li>)}</ul>}
    {canDraft && <div>
      <label htmlFor="publish-as-account">Publish as</label>{" "}
      <select id="publish-as-account" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setDraft(null); }}>
        <option value="">Choose a connected account</option>
        {connected.map((account) => <option key={account.id} value={account.id}>{account.provider === "x" ? "X" : "LinkedIn"} · {account.display_name}</option>)}
      </select>
      {selected && <div style={{ display: "grid", gap: 8, maxWidth: 650, marginTop: 12 }}>
        <label htmlFor="workspace-draft-title">Draft title</label>
        <input id="workspace-draft-title" value={title} onChange={(event) => { setTitle(event.target.value); setDraft(null); }} maxLength={300} />
        <label htmlFor="workspace-draft-body">Approved text or X thread JSON</label>
        <textarea id="workspace-draft-body" value={body} onChange={(event) => { setBody(event.target.value); setDraft(null); }} rows={5} maxLength={100000} />
        <button disabled={busy || !title.trim() || !body.trim()} onClick={createDraft}>Save draft for {selected.display_name}</button>
        {draft && (workspace.role === "founder" || workspace.role === "approver") &&
          <button disabled={busy} onClick={approveDraft}>Approve this exact revision for {accounts.find((account) => account.id === draft.accountId)?.display_name}</button>}
      </div>}
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
