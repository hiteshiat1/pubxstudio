"use client";

import { useEffect, useState } from "react";

type Workspace = { id: string; name: string; role: string };
type Job = { id: string; status: string; scheduled_at: string; account_id: string };

export default function WorkspaceSession() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    fetch("/api/workspaces", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { workspaces: [] })
      .then((data) => setWorkspaces(data.workspaces || []))
      .catch(() => setWorkspaces([]));
  }, []);
  useEffect(() => {
    if (!workspaces?.length) return;
    fetch(`/api/workspaces/${workspaces[0].id}/jobs`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { jobs: [] })
      .then((data) => setJobs(data.jobs || []))
      .catch(() => setJobs([]));
  }, [workspaces]);
  if (workspaces === null) return null;
  if (!workspaces.length) return <a href="/api/auth/github/start">Sign in for workspace access</a>;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>{workspaces[0].name} · {workspaces[0].role}</span>
        {workspaces[0].role === "founder" && <a href={`/api/social/linkedin/start?workspaceId=${encodeURIComponent(workspaces[0].id)}`}>Connect LinkedIn</a>}
        <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>
      </div>
      {jobs.length > 0 && <details style={{ marginTop: 8 }}>
        <summary>Scheduled publishing ({jobs.length}) · times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}</summary>
        <ul>{jobs.map((job) => <li key={job.id}>
          {new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(job.scheduled_at))}
          {" · "}{job.status}{" · account "}{job.account_id.slice(0, 8)}
        </li>)}</ul>
      </details>}
    </div>
  );
}
