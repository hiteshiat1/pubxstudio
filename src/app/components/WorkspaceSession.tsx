"use client";

import { useEffect, useState } from "react";

type Workspace = { id: string; name: string; role: string };

export default function WorkspaceSession() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  useEffect(() => {
    fetch("/api/workspaces", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { workspaces: [] })
      .then((data) => setWorkspaces(data.workspaces || []))
      .catch(() => setWorkspaces([]));
  }, []);
  if (workspaces === null) return null;
  if (!workspaces.length) return <a href="/api/auth/github/start">Sign in for workspace access</a>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span>{workspaces[0].name} · {workspaces[0].role}</span>
      <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>
    </div>
  );
}
