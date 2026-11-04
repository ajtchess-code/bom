"use client";
import { useEffect, useState } from "react";
export default function OpenAIAdmin() {
  const [state, setState] = useState<any>(null),
    [key, setKey] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(method = "GET", suffix = "", body?: any) {
    setBusy(true);
    try {
      const r = await fetch("/api/internal/community/openai" + suffix, {
        method,
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.message ?? result.error ?? "Request failed");
      if (suffix) setNotice(result.message);
      else {
        setState(result);
        if (method !== "GET") {
          setKey("");
          setNotice(
            method === "DELETE"
              ? "Dashboard key removed. An environment key is used if present."
              : "OpenAI key stored. Gateway routes currently use the OPENAI_API_KEY environment setting; configure routing under AI Providers.",
          );
        }
      }
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void request();
  }, []);
  return (
    <section className="panel">
      <h2>OpenAI Connection</h2>
      <p>
        This page manages legacy stored OpenAI credentials. Banter, Wiki and Sentinel gateway routes currently
        read OPENAI_API_KEY from the server environment; saving a key here does not configure those routes. A
        ChatGPT subscription does not provide API credit. Keys are encrypted on the server and never returned
        to this page.
      </p>
      <p role="status">
        {state
          ? `Status: ${state.configured ? "Configured" : "Not Configured"} · Source: ${state.source}`
          : "Loading…"}
      </p>
      {state && !state.storageAvailable && (
        <p>
          Secure storage needs a stable CREDENTIAL_ENCRYPTION_KEY or INTERNAL_API_TOKEN of at least 32
          characters in the API and controller environments.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void request("PUT", "", { key });
        }}
      >
        <label>
          OpenAI API Key
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="new-password"
            placeholder="Paste a new key to add or replace it"
            minLength={20}
            maxLength={512}
            required
          />
        </label>
        <div className="controlRow">
          <button className="goldButton" disabled={busy || !key.trim() || !state?.storageAvailable}>
            Save API Key
          </button>
          <button
            type="button"
            disabled={busy || !state?.configured}
            onClick={() => void request("POST", "/test")}
          >
            Test Connection
          </button>
          <button
            type="button"
            disabled={busy || state?.source !== "dashboard"}
            onClick={() => void request("DELETE")}
          >
            Remove Dashboard Key
          </button>
        </div>
      </form>
      {notice && <p role="status">{notice}</p>}
      <p>
        The connection test checks authentication without generating an answer. Configure #ask channels,
        assistance roles, and correction permissions in Ask & Rules.
      </p>
    </section>
  );
}
