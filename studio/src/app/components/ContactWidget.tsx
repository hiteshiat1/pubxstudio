"use client";

import React, { useState, useRef } from "react";
import { sendSupportTicket } from "../actions";

export default function ContactWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [issue, setIssue] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setSubmitted(false);
    setError("");
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset state
    setName("");
    setEmail("");
    setIssue("");
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachment(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      // 1. Call Server Action to log ticket on server
      const formData = new FormData();
      formData.append("name", name);
      formData.append("email", email);
      formData.append("issue", issue);
      if (attachment) {
        formData.append("attachment", attachment);
      }

      const res = await sendSupportTicket(formData);
      if (!res.ok) {
        throw new Error(res.message);
      }

      // 2. Open client-side mailto client as fallback/primary action
      triggerMailto();

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const triggerMailto = () => {
    const recipient = "hitesh.iat1@gmail.com";
    const subject = `PubxStudio Help: ${issue.slice(0, 50)}${issue.length > 50 ? "..." : ""}`;
    let body = `Name: ${name}\nEmail: ${email}\n\nIssue Description:\n${issue}\n\n`;
    if (attachment) {
      body += `[Attachment: ${attachment.name} (${Math.round(attachment.size / 1024)} KB)]\n\n`;
      body += `*Please remember to attach your file (${attachment.name}) to this email manual draft if it is not already included.*\n`;
    }
    body += `\nSent via PubxStudio support widget.`;

    const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <>
      {/* Floating Button at Bottom Left */}
      <button
        onClick={handleOpen}
        title="Contact Support & Help"
        style={{
          position: "fixed",
          bottom: "24px",
          left: "24px",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "rgba(17, 17, 17, 0.8)",
          border: "1px solid var(--border-main)",
          color: "#5AB9FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 9999,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(12px)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          outline: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1) rotate(5deg)";
          e.currentTarget.style.borderColor = "#5AB9FF";
          e.currentTarget.style.boxShadow = "0 0 15px rgba(90, 185, 255, 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1) rotate(0deg)";
          e.currentTarget.style.borderColor = "var(--border-main)";
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.4)";
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="12" strokeWidth="2.5" />
          <line x1="12" y1="8" x2="12" y2="8" strokeWidth="3" />
        </svg>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6, 6, 6, 0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "16px",
          }}
          onClick={handleClose}
        >
          {/* Modal Container */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-main)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              padding: "24px",
              position: "relative",
              fontFamily: "var(--font-jetbrains, monospace)",
              animation: "modalFadeIn 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={handleClose}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {!submitted ? (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <h3
                    style={{
                      margin: "0 0 6px 0",
                      color: "var(--text-heading)",
                      fontSize: "18px",
                      fontWeight: "bold",
                    }}
                  >
                    Raise Support Ticket
                  </h3>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "12px" }}>
                    Have a question or bug? Send us a ticket to get help.
                  </p>
                </div>

                {error && (
                  <div
                    style={{
                      background: "rgba(255, 90, 138, 0.1)",
                      border: "1px solid #FF5A8A",
                      color: "#FF5A8A",
                      padding: "10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Name */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-muted-light)", textTransform: "uppercase" }}>
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-main)",
                      borderRadius: "6px",
                      padding: "10px",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#5AB9FF")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
                  />
                </div>

                {/* Email */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-muted-light)", textTransform: "uppercase" }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-main)",
                      borderRadius: "6px",
                      padding: "10px",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#5AB9FF")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
                  />
                </div>

                {/* Issue Description */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-muted-light)", textTransform: "uppercase" }}>
                    Describe your issue / question
                  </label>
                  <textarea
                    required
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                    placeholder="What issues or help do you need?"
                    rows={4}
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-main)",
                      borderRadius: "6px",
                      padding: "10px",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      outline: "none",
                      resize: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#5AB9FF")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border-main)")}
                  />
                </div>

                {/* File Attachment */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-muted-light)", textTransform: "uppercase" }}>
                    File Attachment (Optional)
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "1px dashed var(--border-main)",
                      borderRadius: "6px",
                      padding: "12px",
                      textAlign: "center",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: attachment ? "#A8FFB2" : "var(--text-muted)",
                      background: "var(--bg-input)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#5AB9FF";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-main)";
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ marginRight: "6px", verticalAlign: "middle" }}
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    {attachment ? attachment.name : "Click to select a file"}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-main)",
                      background: "transparent",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "6px",
                      border: "none",
                      background: submitting ? "rgba(90, 185, 255, 0.4)" : "#5AB9FF",
                      color: "#080808",
                      fontSize: "13px",
                      fontWeight: "bold",
                      cursor: submitting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    {submitting ? "Sending..." : "Submit & Send"}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "16px", padding: "12px 0" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "rgba(168, 255, 178, 0.1)",
                    color: "#A8FFB2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                <div>
                  <h3 style={{ margin: "0 0 6px 0", color: "var(--text-heading)", fontSize: "18px", fontWeight: "bold" }}>
                    Ticket Submitted Successfully!
                  </h3>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.5" }}>
                    Your ticket details have been logged on the server.
                    A pre-filled draft email was also opened on your mail client to send directly to <strong>hitesh.iat1@gmail.com</strong>.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  <button
                    onClick={triggerMailto}
                    style={{
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid #5AB9FF",
                      background: "rgba(90, 185, 255, 0.05)",
                      color: "#5AB9FF",
                      fontSize: "13px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Open Mail Draft Again
                  </button>
                  <button
                    onClick={handleClose}
                    style={{
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-main)",
                      background: "transparent",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Close Support Modal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global CSS animation for modal fade in */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes modalFadeIn {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `
      }} />
    </>
  );
}
