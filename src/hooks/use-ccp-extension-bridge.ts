/**
 * useCcpExtensionBridge — connects the Ticket Notes React app to the
 * "Ecovacs Note Helper" Tier-2 browser extension living in
 * /extension of this repo (previously known as "Ecovacs Ticket DOM Scraper").
 *
 * Two transport channels, tried in this order:
 *
 *   1. chrome.runtime.sendMessage(EXT_ID, msg) — when the page's origin
 *      matches manifest.externally_connectable (localhost / 127.0.0.1 /
 *      *.vercel.app / note-master.vercel.app). This is the official,
 *      permission-blessed MV3 channel.
 *   2. window.postMessage through the bridge.js content-script injected
 *      into the page. Needed for custom hosts (any URL the user loads the
 *      app on) where externally_connectable has no match; bridge.js
 *      translates our postMessage envelope into chrome.runtime.sendMessage
 *      (the content script runs in the extension's origin, so it can call
 *      the SW) and tunnels replies back via postMessage.
 *
 * Data model (flat merged fields):
 *   { customerName, contactNumber, emailAddress, shippingAddress,
 *     serialNumber, skuNumber, deebotModel, purchaseInfo, caseNumber,
 *     caseOwner, caseStatus, issueType, issueTitle, detailedIssue,
 *     resolutionSummary, firstName, lastName }
 * — the extension background SW's buildMergedFields() already normalized
 * these into a single object; we just map them onto the app's NODE_IDS.
 *
 * The hook returns a stable `status` (connected/not), a list of the most
 * recent pushed fields (for UI badges), and a `scrapeAll()` helper.
 * Callers provide an `onApply` callback that receives (fieldId → value)
 * and writes each value into the form via the page's existing autofill
 * pipeline (marked as source 'dom-ext').
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { NODE_IDS } from '@/data/ticket';

export type ExtensionFieldMap = Partial<Record<string, string>>;
export type ExtensionMeta = {
  ccp?: { capturedAt?: string; url?: string; title?: string } | null;
  sf?: { capturedAt?: string; url?: string; title?: string } | null;
  pushedAt?: string;
};

export type PendingExtensionPush = {
  /** EXT_TO_NODE_ID → value (already mapped). For auto scope: 4 identity
   *  fields only. For manual scope: full merged set from the extension. */
  mapped: Record<string, string>;
  /** Extension metadata (which URLs/tabs this scrape came from). */
  meta: ExtensionMeta | null;
  /** Original fields (extension keys) for display labels. */
  fields: ExtensionFieldMap;
  pushedAt: string;
  /** 'auto' = scrape triggered, key fields only. 'manual' = popup "Push to
   *  open Ticket Notes" → full merged set. */
  scope: 'auto' | 'manual';
};

export interface CcpExtensionBridge {
  connected: boolean;
  /** Extension runtime id, when known. */
  extensionId: string | null;
  /** Version string reported by the background SW. */
  version: string | null;
  /** Field mapping the extension wrote to the form most recently. */
  lastApplied: { fieldId: string; value: string }[];
  lastMeta: ExtensionMeta | null;
  /** Current scrape-data popup waiting for user confirmation.
   *  Non-null → caller should render the Apply/Dismiss popup card. */
  pendingPush: PendingExtensionPush | null;
  /** Accept the pending popup: apply its fields through the normal onApply
   *  pipeline (same as the old auto-apply behavior). */
  acceptPendingPush: () => void;
  /** Dismiss the pending popup without touching form state. */
  dismissPendingPush: () => void;
  /** Force a scrape of both the CCP tab and the SF tab now. Returns the
   *  merged result; does NOT re-apply automatically — caller handles it. */
  scrapeAll: () => Promise<{ ok: boolean; merged?: ExtensionFieldMap; error?: string }>;
  /** Fetch the current extension state + merged fields snapshot. */
  getSnapshot: () => Promise<{ ok: boolean; merged?: ExtensionFieldMap; state?: unknown }>;
  /** Ask the extension to open (or focus) a Salesforce Console tab for
   *  a given case number (global search scoped to Case records), OR to
   *  a direct Lightning view URL when provided.  `newTab=true` forces a
   *  brand new browser tab; false (default) reuses the most-recent SF
   *  Console tab (or focuses an existing tab already showing that URL). */
  openCase: (opts: {
    caseNumber?: string;
    directUrl?: string;
    newTab?: boolean;
  }) => Promise<{ ok: boolean; url?: string; navigated?: 'new' | 'reused' | null; error?: string }>;
  /** After generating a formatted ticket note, push the note body (Post tab
   *  chatter publisher) + editable layout fields (AMR Model No., Name,
   *  Account Name, Phone) back into a Salesforce Case tab via the content
   *  script.  If tabId is omitted, the extension auto-selects: active SF
   *  Case tab → most-recent / active SF tab.  `postPublish: true` will
   *  click the Publish button (disabled by default so the agent can
   *  proofread before publishing).  Result includes per-field ok/skipped
   *  + summary counts. */
  applyCaseFields: (opts: {
    fields: {
      postBody?: string;
      postPublish?: boolean;
      amrModelNo?: string;
      customerName?: string;
      accountName?: string;
      contactPhone?: string;
    };
    tabId?: number;
    saveEach?: boolean;
  }) => Promise<{
    ok: boolean;
    summary?: { ok: boolean; okCount: number; total: number } | null;
    postBody?: unknown;
    fields?: unknown;
    tab?: unknown;
    error?: string | null;
  }>;

  /** Runtime diagnostics explaining why connected might be false.
   *  Exposed so the UI can show a specific "paste this pattern into your
   *  manifest and reload the extension" banner + toast instead of the
   *  previous generic greyed-out message. */
  connectionDiagnostics: {
    /** Current ticket app origin. */
    appOrigin: string;
    /** Full URL of the ticket app. */
    appHref: string;
    /** True when we have received at least one postMessage from bridge.js
     *  (i.e. bridge.js content script *was* injected for this origin). */
    bridgeInjected: boolean;
    /** Match patterns currently in memory. Source: patternsReceivedFromBridge
     *  === true → from the INSTALLED extension's manifest.json via
     *  bridge.js runtime fetch. Otherwise → app-side best-guess DEFAULTS
     *  (bridge not yet loaded, or not covered by content_scripts matches). */
    manifestBridgePatterns: string[];
    /** Match patterns from the manifest externally_connectable block.
     *  Source caveat same as manifestBridgePatterns above. */
    manifestExternalPatterns: string[];
    /** True if the patterns in memory cover the ticket app origin.
     *  IMPORTANT: only trust this 100% when patternsReceivedFromBridge is
     *  true. Otherwise it's a guess from app-side defaults. */
    originCoveredByBridge: boolean;
    /** True if origin is covered by manifestExternalPatterns (same caveat
     *  about patternsReceivedFromBridge as originCoveredByBridge). */
    originCoveredByExternal: boolean;
    /** If origin is NOT covered: a concrete pattern you should add to the
     *  manifest (both content_scripts > bridge matches AND externally
     *  connectable matches) to make this deployment work. */
    suggestedPatternsToAdd: string[];
    /** ISO timestamp of last handshake:ready or :diagnostics we received. */
    lastHandshakeAt: string | null;
    /** True when we've already issued `handshake_request` to probe for a
     *  bridge that might have injected before we attached the listener. */
    handshakeRequested: boolean;
    /** If the externally_connectable path ever threw (e.g. unknown
     *  extension id, or message blocked) we store the error string here
     *  so the UI can surface "reload extension / confirm manifest
     *  patterns". */
    lastExternalError: string | null;
    /** Ticket-app-side expected extension manifest version. Bump this
     *  constant whenever the extension manifest version is bumped so the
     *  page can flag stale-cache mismatches. */
    expectedManifestVersion: string;
    /** Version string from the actually-injected bridge (taken from the
     *  manifest the installed extension shipped). Null until first
     *  handshake or diagnostics broadcast. */
    injectedManifestVersion: string | null;
    /** Tiny fingerprint (DJB2 hash of manifest version + bridge pattern
     *  list + external pattern list) so both sides can detect "same
     *  version string, different patterns shipped" drift. */
    injectedFingerprint: string | null;
    /** TRUE when we've received a :diagnostics broadcast from bridge with
     *  filled-in pattern arrays extracted at runtime from the INSTALLED
     *  manifest. This is the ONLY state under which
     *  originCoveredByBridge/originCoveredByExternal are 100% trustworthy. */
    patternsReceivedFromBridge: boolean;
    /** ISO timestamp of when we last received a filled-in :diagnostics
     *  broadcast. */
    patternsReceivedAt: string | null;
    /** Version mismatch detection: null = not yet known, true = mismatch
     *  (installed older or newer than expected), false = matches. */
    injectedVersionMatchesExpected: boolean | null;
    /** True when injectedManifestVersion is clearly behind
     *  expectedManifestVersion (the "you need to 🔄 reload extension at
     *  chrome://extensions" case). false / null otherwise. */
    injectedVersionStale: boolean;
    /** True when bridge.js explicitly posted :context_invalidated OR a
     *  chrome.runtime.sendMessage call on this tab threw 'Extension
     *  context invalidated' → browser extension was reloaded/updated under
     *  this tab without the tab refreshing. Mandatory user action: REFRESH
     *  the Ticket Notes tab (NOT just the extension). */
    contextInvalidatedSeen: boolean;
    /** ISO timestamp of when a :context_invalidated signal was last seen. */
    contextInvalidatedSeenAt: string | null;
  };

  /** Probe the bridge right now. Useful when the UI shows "disconnected"
   *  and the user just clicked "Reload extension" — triggers a new
   *  handshake_request so the connected flag flips true immediately
   *  instead of waiting for the next 10s heartbeat. */
  requestConnection: () => void;
}

/** Map the flat field shape produced by the background's
 *  buildMergedFields() into the node ids used by the React form. */
export const EXT_TO_NODE_ID: Readonly<Record<string, string>> = {
  customerName: NODE_IDS.CUSTOMER_NAME,
  contactNumber: NODE_IDS.CONTACT_NUMBER,
  emailAddress: NODE_IDS.EMAIL_ADDRESS,
  shippingAddress: NODE_IDS.SHIPPING_ADDRESS,
  serialNumber: NODE_IDS.SERIAL_NUMBER,
  skuNumber: NODE_IDS.SKU_NUMBER,
  deebotModel: NODE_IDS.DEEBOT_MODEL,
  purchaseInfo: NODE_IDS.PURCHASE_INFO,
  issueType: NODE_IDS.ISSUE_TYPE,
  detailedIssue: NODE_IDS.DETAILED_ISSUE,
  resolutionSummary: NODE_IDS.RESOLUTION_SUMMARY,
  additionalNotes: NODE_IDS.ADDITIONAL_NOTES,
  // caseNumber, caseOwner, caseStatus, issueTitle are rendered as chips /
  // Additional notes. We concatenate them into ADDITIONAL_NOTES with a
  // clear prefix so agents can still copy them out easily.
};

/** The 4 identity fields + aliases auto-pushed from the extension and shown
 *  in the bottom-right confirm popup. Defensive mirror of background.js's
 *  KEY_PUSH_FIELDS / KEY_PUSH_FALLBACKS so any older extension that still
 *  pushes full fields still ends up showing only these 4. */
const KEY_FIELD_KEYS = ['contactNumber', 'customerName', 'deebotModel', 'serialNumber'] as const;
const KEY_FIELD_FALLBACKS: Readonly<Record<string, string[]>> = {
  contactNumber: ['phone'],
  customerName: ['accountName', 'contactName'],
  deebotModel: [],
  serialNumber: [],
};
/** Default extension ID the packaged build uses; users can override via
 *  localStorage key `nm-ext-id` when loading an unpacked build that gets a
 *  different random ID on each machine. */
const EXT_ID_LS_KEY = 'nm-ext-id';
const DEFAULT_EXT_ID_CANDIDATE = ''; // unknown until bridge.js says hello

type PendingReqMap = Record<number, (reply: any) => void>;

export interface UseCcpExtensionBridgeArgs {
  /** Called every time the extension pushes a new merged payload (on boot
   *  handshake, after each content script scrape, after explicit scrapeAll)
   *  with the mapped nodeId → value dictionary and source metadata. Return
   *  the list of actually-applied fields so the hook can report `lastApplied`.
   */
  onApply: (
    mapped: Record<string, string>,
    meta: ExtensionMeta | null,
    rawFields: ExtensionFieldMap
  ) => Array<{ fieldId: string; value: string }>;
  /**
   * Source label used by the caller's autofill engine. Defaults to
   * 'dom-ext' so callers can match against their AutoFillSource type.
   */
  source?: AutoFillSourceLike;
}

type AutoFillSourceLike = string;

export function useCcpExtensionBridge({
  onApply,
  source = 'dom-ext',
}: UseCcpExtensionBridgeArgs): CcpExtensionBridge {
  const [connected, setConnected] = useState(false);
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<Array<{ fieldId: string; value: string }>>([]);
  const [lastMeta, setLastMeta] = useState<ExtensionMeta | null>(null);
  const [pendingPush, setPendingPush] = useState<PendingExtensionPush | null>(null);
  /** Non-state mirror of pendingPush so accept/dismiss never read stale closures
   *  or call side-effects inside a state updater (StrictMode double-invoke). */
  const pendingPushRef = useRef<PendingExtensionPush | null>(null);

  // --- Diagnostics state (explains why `connected` might be false) -------
  const appOrigin = typeof window !== 'undefined' ? (window.location?.origin ?? '') : '';
  const appHref = typeof window !== 'undefined' ? (window.location?.href ?? '') : '';
  const [bridgeInjected, setBridgeInjected] = useState(false);
  // DEFAULT patterns — used ONLY until bridge.js broadcasts a
  // :diagnostics message (which ships patterns extracted at runtime DIRECTLY
  // from manifest.json so they can never drift from what Chrome loaded).
  // Initializing to non-empty covers the "user clicks Diagnostics before
  // any message arrives" case; we mark results as "(defaults, not yet
  // received from bridge)" in that scenario.
  const DEFAULT_BRIDGE_PATTERNS = Object.freeze([
    '*://localhost:*/*',
    '*://127.0.0.1:*/*',
    '*://[::1]:*/*',
    'https://*.vercel.app/*',
    'https://note-master.vercel.app/*',
    'https://note-master-roan.vercel.app/*',
  ] as const);
  const DEFAULT_EXTERNAL_PATTERNS = Object.freeze([
    'http://localhost:*/*',
    'https://localhost:*/*',
    'http://127.0.0.1:*/*',
    'https://127.0.0.1:*/*',
    'http://[::1]:*/*',
    'https://[::1]:*/*',
    'https://*.vercel.app/*',
    'https://note-master.vercel.app/*',
    'https://note-master-roan.vercel.app/*',
  ] as const);
  // Bump this EXPECTED whenever extension manifest version bumps so the
  // ticket app page can immediately flag "bridge content script loaded but
  // it's still the OLD cached version (user needs 🔄 reload extension)".
  const EXPECTED_MANIFEST_VERSION = '0.1.28';
  const [manifestBridgePatterns, setManifestBridgePatterns] = useState<string[]>([...DEFAULT_BRIDGE_PATTERNS]);
  const [manifestExternalPatterns, setManifestExternalPatterns] = useState<string[]>([...DEFAULT_EXTERNAL_PATTERNS]);
  const [receivedBridgePatternsAt, setReceivedBridgePatternsAt] = useState<string | null>(null);
  const [injectedManifestVersion, setInjectedManifestVersion] = useState<string | null>(null);
  const [injectedFingerprint, setInjectedFingerprint] = useState<string | null>(null);
  const [lastHandshakeAt, setLastHandshakeAt] = useState<string | null>(null);
  const [handshakeRequested, setHandshakeRequested] = useState(false);
  const [lastExternalError, setLastExternalError] = useState<string | null>(null);
  const [contextInvalidatedSeenAt, setContextInvalidatedSeenAt] = useState<string | null>(null);

  /** Chrome/Chromium match-pattern matcher (simplified, covers the patterns
   *  we actually emit: * (any path), <scheme>://<host with wildcards>:<port>/*.
   *  Good enough to answer "is my current origin covered by manifest?". */
  const matchPattern = useCallback((url: string, pattern: string): boolean => {
    try {
      // Scheme: <scheme> | *
      // Host: *.foo.com | foo.bar.com | *
      // Port: * | number
      // Path: /* | /anything/with*wildcards
      const p = pattern.trim();
      const schemeMatch = p.match(/^(\*|https?|file|http|ftp):\/\//i);
      if (!schemeMatch) return false;
      const scheme = schemeMatch[1].toLowerCase();
      const rest = p.slice(schemeMatch[0].length); // host[:port]/path
      const slashIdx = rest.indexOf('/');
      const hostPort = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      const pathPattern = slashIdx === -1 ? '/*' : rest.slice(slashIdx);
      const hostPattern = (() => {
        const colonIdx = hostPort.lastIndexOf(':');
        return colonIdx === -1 ? hostPort : hostPort.slice(0, colonIdx);
      })();
      const portPattern = (() => {
        const colonIdx = hostPort.lastIndexOf(':');
        if (colonIdx === -1) return '*';
        return hostPort.slice(colonIdx + 1);
      })();
      // Glob match using a tiny glob → regex helper.
      const globToRegex = (g: string): RegExp => {
        let out = '^';
        for (let i = 0; i < g.length; i += 1) {
          const c = g[i];
          if (c === '*') out += '.*';
          else if (/[.+?^${}()|[\]\\]/.test(c)) out += '\\' + c;
          else out += c;
        }
        out += '$';
        return new RegExp(out, 'i');
      };
      const u = new URL(url);
      // 1) scheme
      if (scheme !== '*' && u.protocol.slice(0, -1).toLowerCase() !== scheme) return false;
      // 2) host
      if (hostPattern && hostPattern !== '*') {
        if (!globToRegex(hostPattern).test(u.hostname)) return false;
      }
      // 3) port
      if (portPattern !== '*' && portPattern !== '') {
        const uPort = u.port || (u.protocol === 'https:' ? '443' : '80');
        if (String(portPattern) !== String(uPort)) return false;
      }
      // 4) path
      if (!globToRegex(pathPattern).test(u.pathname + (u.search || ''))) return false;
      return true;
    } catch { return false; }
  }, []);

  // "Covered" check is against the PATTERNS BRIDGE.JS BROADCASTS. Why? The
  // user's screenshot showed "patterns say covered but bridge injected: NO"
  // — that happened because we were testing against app-side defaults, not
  // what Chrome actually loaded. If bridge never broadcasted patterns, we
  // still show a coverage guess from defaults, but explicitly tag it as a
  // guess so the diagnostic text can say "STALE CACHE, reload extension".
  const patternsReceivedFromBridge = receivedBridgePatternsAt != null;
  const originCoveredByBridge = manifestBridgePatterns.length > 0 && manifestBridgePatterns.some((p) => matchPattern(appHref || appOrigin + '/', p));
  const originCoveredByExternal = manifestExternalPatterns.length > 0 && manifestExternalPatterns.some((p) => matchPattern(appHref || appOrigin + '/', p));
  const injectedVersionMatchesExpected = injectedManifestVersion == null
    ? null
    : injectedManifestVersion === EXPECTED_MANIFEST_VERSION;
  // Extension bridge loaded (handshake seen) but version fingerprint or
  // manifest version is BEHIND what the ticket app expects → tell user to
  // reload extension. Note: injectedManifestVersion can be 'loading' or
  // 'fetch-failed:…' while bridge.js is still awaiting manifest fetch —
  // those aren't "mismatch" errors, just transient.
  const injectedVersionStale = injectedManifestVersion != null
    && !injectedManifestVersion.startsWith('loading')
    && !injectedManifestVersion.startsWith('fetch-failed')
    && injectedManifestVersion !== EXPECTED_MANIFEST_VERSION;

  /** When origin is NOT covered, build the TWO exact patterns the user
   *  should paste into manifest.json: (1) content_scripts bridge match →
   *  uses scheme wildcard + port wildcard, path wildcard; (2) externally
   *  connectable → MV3 doesn't allow scheme:* so we emit one match per
   *  scheme (http + https) with port wildcard. */
  const suggestedPatternsToAdd = useMemo((): string[] => {
    if (originCoveredByBridge && originCoveredByExternal) return [];
    try {
      const u = new URL(appHref || appOrigin + '/');
      const host = u.hostname;
      const hostIsLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(host);
      if (hostIsLocal) {
        const add: string[] = [];
        if (!originCoveredByBridge) add.push(`*://${host}:*/*`);
        if (!originCoveredByExternal) {
          add.push(`${u.protocol}//${host}:*/*`);
          // If protocol is http → also add https just in case agent uses https
          add.push(`${u.protocol === 'http:' ? 'https:' : 'http:'}//${host}:*/*`);
        }
        return Array.from(new Set(add));
      }
      // Non-local host (vercel.app, custom domain, etc.).  Emit one
      // `<scheme>://*.${domain}/*` pattern so subdomains are covered.
      const parts = host.split('.').filter(Boolean);
      const apex = parts.length >= 2 ? parts.slice(-2).join('.') : host;
      const add: string[] = [];
      if (!originCoveredByBridge) add.push(`https://*.${apex}/*`);
      if (!originCoveredByExternal) add.push(`https://*.${apex}/*`);
      // Also an exact-host pattern as fallback (in case apex match seems too broad).
      if (!originCoveredByBridge) add.push(`*://${host}:*/*`);
      if (!originCoveredByExternal) add.push(`${u.protocol}//${host}:*/*`);
      return Array.from(new Set(add));
    } catch { return []; }
  }, [appHref, appOrigin, originCoveredByBridge, originCoveredByExternal]);

  const requestConnection = useCallback(() => {
    setHandshakeRequested(true);
    try {
      window.postMessage({ source: 'ecovacs-ccp-extension:handshake_request' }, '*');
    } catch { /* ignore */ }
  }, []);

  // Stable transport state across renders.
  const bridgeReadyRef = useRef(false);
  const extIdRef = useRef<string>('');
  const pendingReqRef = useRef<PendingReqMap>({});
  const requestCounterRef = useRef(1);
  const onApplyRef = useRef(onApply);
  useEffect(() => { onApplyRef.current = onApply; }, [onApply]);
  const sourceRef = useRef(source);
  useEffect(() => { sourceRef.current = source; }, [source]);

  // Persisted ext id override (copied from the popup). Also updated each
  // time bridge.js sends a :ready message with the real id.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXT_ID_LS_KEY);
      if (saved) { extIdRef.current = saved; setExtensionId(saved); }
    } catch { /* ignore */ }
  }, []);

  // -------------------------------------------------------------------------
  //  Transport 2: bridge.js → window.postMessage
  //  (Always listened to; handles the extension's periodic pushes plus
  //  reply envelopes for our own tunneled requests.)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      const src = data.source;
      if (src === 'ecovacs-ccp-extension:ready' || src === 'ecovacs-ccp-extension:handshake_reply') {
        // bridge.js pings at least once on load OR replies to our
        // proactive handshake_request.
        bridgeReadyRef.current = true;
        setBridgeInjected(true);
        setLastHandshakeAt(new Date().toISOString());
        if (typeof data.manifestVersion === 'string') setInjectedManifestVersion(data.manifestVersion);
        if (typeof data.fingerprint === 'string') setInjectedFingerprint(data.fingerprint);
        const id: string | undefined = data.extensionId;
        if (id) {
          extIdRef.current = id;
          setExtensionId(id);
          try { localStorage.setItem(EXT_ID_LS_KEY, id); } catch { /* ignore */ }
        }
        if (!connected) {
          setConnected(true);
          // Ask background for a hello snapshot so the page picks up any
          // already-scraped CCP/SF data immediately on navigation.
          void sendRequest({ type: 'EXT_HELLO' }).then((r) => {
            if (r?.ok) {
              setVersion(r.version ?? null);
              if (r.merged && typeof r.merged === 'object' && Object.keys(r.merged).length > 0) {
                queuePendingPush(r.merged, r.state ?? null);
              }
            }
          });
        }
        return;
      }
      if (src === 'ecovacs-ccp-extension:diagnostics') {
        // Broadcast from bridge.js — carries the TRUE manifest pattern
        // lists (runtime-extracted straight from manifest.json inside the
        // installed extension), version + fingerprint. This is the only
        // source of trust for coverage/version-mismatch detection.
        setBridgeInjected(true);
        setLastHandshakeAt(new Date().toISOString());
        setReceivedBridgePatternsAt(new Date().toISOString());
        if (typeof data.manifestVersion === 'string') setInjectedManifestVersion(data.manifestVersion);
        if (typeof data.fingerprint === 'string') setInjectedFingerprint(data.fingerprint);
        if (Array.isArray(data.ticketAppPatterns)) {
          // Accept empty arrays too: an empty list from the bridge is a
          // real signal (bridge loaded with zero patterns) that should
          // OVERRIDE our defaults, not be silently ignored.
          setManifestBridgePatterns(data.ticketAppPatterns.filter((x: unknown) => typeof x === 'string') as string[]);
        }
        if (Array.isArray(data.externalConnectablePatterns)) {
          setManifestExternalPatterns(data.externalConnectablePatterns.filter((x: unknown) => typeof x === 'string') as string[]);
        }
        if (typeof data.extensionId === 'string' && data.extensionId) {
          extIdRef.current = data.extensionId;
          setExtensionId(data.extensionId);
        }
        return;
      }
      if (src === 'ecovacs-ccp-extension:context_invalidated') {
        // Bridge.js / external sendMessage tells us: the MV3 background /
        // content-script context the page was previously talking to was
        // replaced (extension was reloaded / updated) without the Ticket
        // Notes tab being refreshed. Two consequences:
        //   1. Old chrome.runtime.sendMessage handles inside the page throw
        //      'Extension context invalidated' forever until F5.
        //   2. bridge.js listeners are gone until page refresh as well.
        // Fix is deterministic: user MUST refresh the Ticket Notes tab.
        // We reset connected = false, clear cached ids so next retries don't
        // use staled handles, and mark a visible diagnostics flag so all
        // push / scrape toasts surface explicit guidance instead of the old
        // misleading "Open a Lightning Case tab".
        bridgeReadyRef.current = false;
        setConnected(false);
        setBridgeInjected(false);
        extIdRef.current = null;
        setExtensionId(null);
        try { if (typeof localStorage !== 'undefined') localStorage.removeItem(EXT_ID_LS_KEY); } catch { /* ignore */ }
        const ts = new Date().toISOString();
        setContextInvalidatedSeenAt(ts);
        const errText = [
          `Extension context invalidated seen at ${new Date(ts).toLocaleTimeString()} (when: ${String(data?.when || 'unknown')}).`,
          (typeof data?.error === 'string' && data.error ? `Error: ${data.error}` : ''),
        ].filter(Boolean).join(' ');
        setLastExternalError(errText);
        return;
      }
      if (src === 'ecovacs-ccp-extension:push') {
        // Background service worker pushed merged fields via bridge.
        // Every push surfaces the bottom-right "review these fields?"
        // confirm card FIRST — nothing ever writes to the form without the
        // user clicking "Fill". The mode only controls field filtering:
        //   auto  → 4 identity key fields (scrape-triggered)
        //   manual → full merged field set (popup "Push to open Ticket
        //            Notes" button → still shows the card, no silent apply)
        const payload = data.payload;
        if (payload?.fields && typeof payload.fields === 'object') {
          setConnected(true);
          const mode: unknown = payload.mode;
          if (mode === 'manual') {
            queueFullPendingPush(payload.fields, payload.state ?? null, payload.pushedAt);
          } else {
            queuePendingPush(payload.fields, payload.state ?? null, payload.pushedAt);
          }
        }
        return;
      }
      if (src === 'ecovacs-ccp-extension:response') {
        // Tunnelled bridge reply.
        const id: number | undefined = data.id;
        const cb = id != null ? pendingReqRef.current[id] : undefined;
        if (cb) {
          delete pendingReqRef.current[id];
          cb(data.reply);
        }
        return;
      }
    };

    window.addEventListener('message', onMessage);
    // Probe for bridge right after mounting. This resolves the
    // classic "bridge broadcast happened BEFORE React attached the
    // listener" race: requestConnection → bridge.js echoes back :ready
    // + :diagnostics synchronously → connected flips true.
    const t1 = window.setTimeout(requestConnection, 30);
    const t2 = window.setTimeout(requestConnection, 400);
    const t3 = window.setTimeout(requestConnection, 1800);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [requestConnection, connected]);

  /** Build the EXT_TO_NODE_ID-mapped nodeId → string dict that the form
   *  handler understands. Anything unmapped spills into ADDITIONAL_NOTES.
   *  Shared between immediate applyMerged (manual pushes / scrapeAll) and
   *  the pending-confirm popup. */
  const buildMapped = useCallback((fields: ExtensionFieldMap) => {
    const mapped: Record<string, string> = {};
    const extras: Array<{ key: string; value: string }> = [];
    for (const [k, raw] of Object.entries(fields || {})) {
      if (raw === undefined || raw === null) continue;
      const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
      if (!value) continue;
      const nodeId = EXT_TO_NODE_ID[k];
      if (nodeId) {
        if (nodeId === NODE_IDS.ADDITIONAL_NOTES && mapped[nodeId]) {
          mapped[nodeId] = `${mapped[nodeId]}\n${value}`;
        } else {
          mapped[nodeId] = mapped[nodeId] || value;
        }
      } else {
        const nice = toPrettyLabel(k);
        if (nice) extras.push({ key: k, value: `${nice}: ${value}` });
      }
    }
    if (extras.length > 0) {
      const nodeId = NODE_IDS.ADDITIONAL_NOTES;
      const prev = mapped[nodeId] ? `${mapped[nodeId]}\n` : '';
      mapped[nodeId] = prev + extras.map((x) => x.value).join('\n');
    }
    return mapped;
  }, []);

  /** Defensive key-field picker: filters merged fields to the 4 identity
   *  fields, resolving aliases. Mirrors background.js's buildKeyFields()
   *  so older extensions that don't filter server-side still show only the
   *  4 fields in the confirm popup. */
  const pickKeyFields = useCallback((fields: ExtensionFieldMap): ExtensionFieldMap => {
    const out: ExtensionFieldMap = {};
    for (const k of KEY_FIELD_KEYS) {
      let v = fields?.[k];
      if (!v || (typeof v === 'string' && v.trim() === '')) {
        for (const alias of KEY_FIELD_FALLBACKS[k] || []) {
          const av = fields?.[alias];
          if (av && (typeof av !== 'string' || av.trim() !== '')) { v = av; break; }
        }
      }
      if (!v) continue;
      const asStr = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v);
      if (asStr.trim() !== '') out[k] = asStr;
    }
    return out;
  }, []);

  /** Queue the 4 identity fields as a user-confirmable popup (bottom-right
   *  glass card). Called on every auto push + hello snapshot. */
  const queuePendingPush = useCallback((
    rawFields: ExtensionFieldMap,
    state: unknown,
    pushedAt?: string
  ) => {
    const keyFields = pickKeyFields(rawFields);
    if (Object.keys(keyFields).length === 0) return;
    const mapped = buildMapped(keyFields);
    if (Object.keys(mapped).length === 0) return;
    const meta: ExtensionMeta | null = extractMeta(state);
    const next: PendingExtensionPush = {
      mapped,
      meta,
      fields: keyFields,
      pushedAt: pushedAt || meta?.pushedAt || new Date().toISOString(),
      scope: 'auto',
    };
    pendingPushRef.current = next;
    setPendingPush(next);
  }, [buildMapped, pickKeyFields]);

  /** Queue the FULL merged field set (popup "Push to open Ticket Notes"
   *  button → scope 'manual'). Still goes through the confirm popup — the
   *  user must explicitly click Fill to accept. */
  const queueFullPendingPush = useCallback((
    rawFields: ExtensionFieldMap,
    state: unknown,
    pushedAt?: string
  ) => {
    if (!rawFields || Object.keys(rawFields).length === 0) return;
    const displayFields: ExtensionFieldMap = {};
    for (const [k, v] of Object.entries(rawFields)) {
      const s = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v ?? '');
      if (s.trim()) displayFields[k] = s;
    }
    if (Object.keys(displayFields).length === 0) return;
    const mapped = buildMapped(displayFields);
    if (Object.keys(mapped).length === 0) return;
    const meta: ExtensionMeta | null = extractMeta(state);
    const next: PendingExtensionPush = {
      mapped,
      meta,
      fields: displayFields,
      pushedAt: pushedAt || meta?.pushedAt || new Date().toISOString(),
      scope: 'manual',
    };
    pendingPushRef.current = next;
    setPendingPush(next);
  }, [buildMapped]);

  const acceptPendingPush = useCallback(() => {
    const pending = pendingPushRef.current;
    if (!pending) return;
    pendingPushRef.current = null;
    setPendingPush(null);
    const applied = onApplyRef.current(pending.mapped, pending.meta, pending.fields);
    if (applied.length > 0) {
      setLastApplied(applied.slice(0, 24));
      if (pending.meta) setLastMeta(pending.meta);
    }
  }, []);

  const dismissPendingPush = useCallback(() => {
    pendingPushRef.current = null;
    setPendingPush(null);
  }, []);

  /** Apply merged fields into the parent form via the user-provided
   *  callback. Honors EXT_TO_NODE_ID for named fields; anything that
   *  doesn't map (caseNumber, caseOwner, caseStatus, issueTitle) is
   *  concatenated into ADDITIONAL_NOTES so nothing silently disappears.
   *
   *  The first `mapped` argument carries EXT_TO_NODE_ID nodeId keys so
   *  the caller can directly hand them to the form's per-field handlers.
   *  `rawFields` is the original flat shape for debugging / inspection. */
  const applyMerged = useCallback((
    fields: ExtensionFieldMap,
    state: unknown,
    _fromHello: boolean
  ) => {
    if (!fields) return;
    const mapped = buildMapped(fields);
    const meta: ExtensionMeta | null = extractMeta(state);
    const applied = onApplyRef.current(mapped, meta, fields);
    if (applied.length > 0) {
      setLastApplied(applied.slice(0, 24));
      setLastMeta(meta);
    } else if (meta) {
      setLastMeta(meta);
    }
  }, [buildMapped]);

  // -------------------------------------------------------------------------
  //  Unified request layer: try chrome.runtime externals_connectable first,
  //  fall back to bridge postMessage tunnel.
  // -------------------------------------------------------------------------
  const sendRequest = useCallback(async (request: any): Promise<any> => {
    function classifyError(e: any): { raw: any; isContextInvalidated: boolean; isExtensionMissing: boolean; isExternalDenied: boolean; normalizedMessage: string } {
      const msg = String(e?.message ?? e ?? '');
      const isContextInvalidated = /extension context invalidated/i.test(msg)
        // When chrome.* bindings themselves are stale (old content script
        // context, extension reloaded under the same tab session), direct
        // access to chrome.runtime inside an MV3 page throws synchronously
        // or via lastError with this string.
        || (typeof (globalThis as any).chrome !== 'undefined' && (globalThis as any).chrome?.runtime?.id == null && typeof (globalThis as any).chrome?.runtime !== 'undefined');
      const isExtensionMissing = !!(e?.message && /does not exist|unknown extension id|receiving end does not exist|extension and webpage have different|extension not installed/i.test(msg));
      const isExternalDenied = /cannot access a chrome:\/\//i.test(msg) || /Incorrect extension id|extensionsDisabledByPolicy|the extensions client is disabled|origin not listed in externally_connectable/i.test(msg)
        || !!((e?.message || '').match(/Could not establish connection/));
      return { raw: e, isContextInvalidated, isExtensionMissing, isExternalDenied, normalizedMessage: msg };
    }
    async function channelExternal(id: string, payload: any): Promise<{ ok: boolean; value: any; error?: any }> {
      try {
        // MV3 extension context can be "invalidated" synchronously when we
        // even just TOUCH chrome.runtime.sendMessage (old handle after a
        // reload). Wrap in try/catch so a bad property read doesn't kill
        // the whole chain — we need to fall through.
        const chromeRt = (globalThis as any).chrome?.runtime;
        if (!chromeRt || typeof chromeRt.sendMessage !== 'function') {
          return { ok: false, value: null, error: new Error('chrome.runtime.sendMessage not available.') };
        }
        try {
          const reply = await new Promise<any>((resolve, reject) => {
            try {
              chromeRt.sendMessage(id, payload, (r: any) => {
                const lastErr = chromeRt.lastError;
                if (lastErr) reject(lastErr);
                else resolve(r);
              });
            } catch (sendInnerErr) {
              reject(sendInnerErr);
            }
          });
          return { ok: true, value: reply };
        } catch (err) {
          return { ok: false, value: null, error: err };
        }
      } catch (outerSyncErr) {
        return { ok: false, value: null, error: outerSyncErr };
      }
    }
    async function channelBridge(payload: any): Promise<{ ok: boolean; value: any; error?: any }> {
      if (typeof window === 'undefined') return { ok: false, value: null, error: new Error('window not available') };
      const reqId = requestCounterRef.current += 1;
      try {
        const result = await new Promise<any>((resolve) => {
          let timedOut = false;
          const timer = window.setTimeout(() => {
            timedOut = true;
            resolve({ ok: false, error: 'Extension bridge request timed out.' });
          }, 12000);
          pendingReqRef.current[reqId] = (v: any) => {
            if (timedOut) return;
            clearTimeout(timer);
            resolve(v);
          };
          try {
            window.postMessage({
              source: 'ecovacs-ccp-extension:request',
              id: reqId,
              request: payload,
            }, '*');
          } catch (postErr) {
            if (!timedOut) clearTimeout(timer);
            resolve({ ok: false, error: String((postErr as any)?.message || postErr) });
          }
        });
        // After bridge roundtrip: if bridge returned a context-invalidated
        // signal via error field, unwrap it so caller can show the tailored
        // remediation toast instead of "open a Lightning Case tab".
        if (result?.ok === false && typeof result?.error === 'string' && /Extension context invalidated/i.test(result.error)) {
          return { ok: false, value: null, error: new Error(result.error) };
        }
        return { ok: true, value: result };
      } catch (e) {
        return { ok: false, value: null, error: e };
      } finally {
        delete pendingReqRef.current[reqId];
      }
    }

    // -- Channel 1: direct externally_connectable --------------------------
    let id = extIdRef.current || (DEFAULT_EXT_ID_CANDIDATE as string);
    const extIdLs = (() => { try { return (typeof localStorage !== 'undefined' ? (localStorage.getItem(EXT_ID_LS_KEY) || null) : null); } catch { return null; } })();
    if (!id && extIdLs) id = extIdLs;
    let firstExternalError: any = null;
    if (id && typeof (globalThis as any).chrome?.runtime?.sendMessage === 'function') {
      const attempt1 = await channelExternal(id, request);
      if (attempt1.ok) return attempt1.value;
      const cls = classifyError(attempt1.error);
      firstExternalError = cls;
      if (cls.isContextInvalidated) {
        // First remediate: extension reload under a stale page context
        // almost always kills the direct handle, but the bridge post
        // route is still alive IF the injected copy of bridge.js still has
        // chrome.runtime.sendMessage. If that too fails, we fall back with
        // explicit remediation.
        setBridgeInjected(false);
        setLastExternalError(cls.normalizedMessage);
        try { if (typeof localStorage !== 'undefined') localStorage.removeItem(EXT_ID_LS_KEY); } catch { /* ignore */ }
        extIdRef.current = null;
        setExtensionId(null);
        // Ask bridge for handshake again — if bridge isn't invalidated we'll
        // pick up the new extension id broadcasted by the reload extension.
        try {
          if (typeof window !== 'undefined') {
            window.postMessage({ source: 'ecovacs-ccp-extension:handshake_request' }, '*');
          }
        } catch { /* ignore */ }
        // Sleep a bit so the fresh bridge (if any) can reply.
        await new Promise((r) => setTimeout(r, 650));
        // Retry channel 1 ONCE with the potentially-refreshed extension id.
        const retryId = extIdRef.current || (DEFAULT_EXT_ID_CANDIDATE as string);
        if (retryId && typeof (globalThis as any).chrome?.runtime?.sendMessage === 'function') {
          const retry1 = await channelExternal(retryId, request);
          if (retry1.ok) return retry1.value;
          const cls2 = classifyError(retry1.error);
          if (cls2.isContextInvalidated) firstExternalError = cls2; else firstExternalError = cls2;
        }
      }
    }

    // -- Channel 2: bridge tunnel -----------------------------------------
    if (typeof window !== 'undefined') {
      const attempt2 = await channelBridge(request);
      if (attempt2.ok) return attempt2.value;
      const clsBridge = classifyError(attempt2.error);
      // Context invalidated on bridge path trumps external-channel errors
      // in the final message because it tells the user exactly what to do.
      if (clsBridge.isContextInvalidated || clsBridge.normalizedMessage.toLowerCase().includes('extension context invalidated')) {
        setBridgeInjected(false);
        setLastExternalError(clsBridge.normalizedMessage);
        const surfaceErr = new Error(
          'Extension context invalidated (bridge tunnel). The browser extension was reloaded or updated AFTER this ticket notes tab was opened. Fix: (1) refresh THIS ticket notes tab once. (2) Reload Ecovacs Note Helper at edge://extensions / chrome://extensions if issue persists.'
        );
        (surfaceErr as any).isContextInvalidated = true;
        throw surfaceErr;
      }
      // If external channel previously reported context-invalidated,
      // surface that now (bridge tunnel didn't help either).
      if (firstExternalError?.isContextInvalidated) {
        const surfaceErr = new Error(
          'Extension context invalidated. The browser extension was reloaded or updated AFTER this ticket notes tab was opened. Fix: (1) refresh THIS ticket notes tab once. (2) Reload Ecovacs Note Helper at edge://extensions / chrome://extensions if issue persists.'
        );
        (surfaceErr as any).isContextInvalidated = true;
        (surfaceErr as any).contextInvalidatedRetryHint = 'Refresh the Ticket Notes tab first, then push again. If still failing: open Ecovacs Note Helper popup → Bridge → Event log and confirm extension-side v0.1.28 is installed and bridge.js has been re-injected.';
        setLastExternalError(firstExternalError.normalizedMessage);
        throw surfaceErr;
      }
      // Bridge error might be OK — fallback to last external classification
      // if it is more specific (e.g. extension missing).
      const chosenCls = firstExternalError && !clsBridge.normalizedMessage.includes('timed out')
        ? firstExternalError
        : clsBridge;
      setLastExternalError(chosenCls.normalizedMessage);
      if (attempt2.value && typeof attempt2.value === 'object' && attempt2.value !== null && typeof (attempt2.value as any).ok === 'boolean') {
        return attempt2.value;
      }
      return { ok: false, error: clsBridge.normalizedMessage || 'Extension bridge did not reply.' };
    }
    // -- Nothing available --------------------------------------------------
    setLastExternalError(firstExternalError?.normalizedMessage || 'No extension message channel available.');
    if (firstExternalError?.isContextInvalidated) {
      const surfaceErr = new Error(firstExternalError.normalizedMessage || 'Extension context invalidated.');
      (surfaceErr as any).isContextInvalidated = true;
      throw surfaceErr;
    }
    return { ok: false, error: 'Extension bridge unavailable.' };
  }, []);

  const scrapeAll = useCallback(async (): Promise<any> => {
    try {
      const r = await sendRequest({ type: 'EXT_SCRAPE_ALL' });
      if (r?.ok) {
        const merged: ExtensionFieldMap = {};
        for (const k of ['ccp', 'sf'] as const) {
          const d = r[k]?.payload?.data as Record<string, string> | undefined;
          if (!d) continue;
          for (const [key, val] of Object.entries(d)) {
            if (!merged[key] && val) merged[key] = val;
          }
        }
        applyMerged(merged, { ccp: r.ccp?.payload, sf: r.sf?.payload }, false);
        return { ok: true, merged };
      }
      return { ok: false, error: r?.error || 'Scrape failed.' };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  }, [sendRequest, applyMerged]);

  const getSnapshot = useCallback(async (): Promise<any> => {
    try {
      const r = await sendRequest({ type: 'EXT_GET_STATE' });
      if (r?.ok) return { ok: true, merged: r.merged, state: r.state };
      return { ok: false, error: r?.error || 'Snapshot unavailable.' };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  }, [sendRequest]);

  const openCase = useCallback(async (opts: {
    caseNumber?: string;
    directUrl?: string;
    newTab?: boolean;
  } = {}): Promise<{ ok: boolean; url?: string; navigated?: 'new' | 'reused' | null; error?: string }> => {
    try {
      const r = await sendRequest({
        type: 'EXT_OPEN_CASE',
        caseNumber: opts.caseNumber ?? null,
        directUrl: opts.directUrl ?? null,
        newTab: Boolean(opts.newTab ?? false),
      });
      if (r?.ok) return { ok: true, url: r.url ?? undefined, navigated: r.navigated ?? null };
      return { ok: false, error: r?.error || 'Extension failed to open case.' };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  }, [sendRequest]);

  /** Push the formatted Post body + editable layout fields into the open
   *  Salesforce Case tab (or an auto-selected one if tabId is omitted).
   *  Returns { ok, summary:{ok,okCount,total}, postBody?, fields?:{…}, tab? }
   *  so the caller can surface per-field successes / failures via toast. */
  const applyCaseFields = useCallback(async (opts: {
    fields: {
      postBody?: string;
      postPublish?: boolean;
      amrModelNo?: string;
      customerName?: string;
      accountName?: string;
      contactPhone?: string;
    };
    tabId?: number;
    saveEach?: boolean;
  }): Promise<{ ok: boolean; summary?: { ok: boolean; okCount: number; total: number } | null; postBody?: any; fields?: any; tab?: any; error?: string | null }> => {
    try {
      const r = await sendRequest({
        type: 'EXT_APPLY_CASE_FIELDS',
        fields: opts?.fields ?? {},
        tabId: typeof opts?.tabId === 'number' ? opts.tabId : null,
        saveEach: opts?.saveEach === false ? false : true,
      });
      if (r?.ok) return { ok: true, summary: r.summary ?? null, postBody: r.postBody ?? null, fields: r.fields ?? null, tab: r.tab ?? null };
      return { ok: false, error: r?.error || 'Extension failed to apply fields.', summary: null };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e), summary: null };
    }
  }, [sendRequest]);

  return {
    connected,
    extensionId,
    version,
    lastApplied,
    lastMeta,
    pendingPush,
    acceptPendingPush,
    dismissPendingPush,
    scrapeAll,
    getSnapshot,
    openCase,
    applyCaseFields,
    connectionDiagnostics: {
      appOrigin,
      appHref,
      bridgeInjected,
      manifestBridgePatterns,
      manifestExternalPatterns,
      originCoveredByBridge,
      originCoveredByExternal,
      suggestedPatternsToAdd,
      lastHandshakeAt,
      handshakeRequested,
      lastExternalError,
      expectedManifestVersion: EXPECTED_MANIFEST_VERSION,
      injectedManifestVersion,
      injectedFingerprint,
      patternsReceivedFromBridge,
      patternsReceivedAt: receivedBridgePatternsAt,
      injectedVersionMatchesExpected,
      injectedVersionStale,
      contextInvalidatedSeen: contextInvalidatedSeenAt != null,
      contextInvalidatedSeenAt,
    },
    requestConnection,
  };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function extractMeta(state: any): ExtensionMeta | null {
  if (!state || typeof state !== 'object') return null;
  return {
    ccp: state.ccp ? {
      capturedAt: state.ccp.capturedAt,
      url: state.ccp.url,
      title: state.ccp.title,
    } : null,
    sf: state.sf ? {
      capturedAt: state.sf.capturedAt,
      url: state.sf.url,
      title: state.sf.title,
    } : null,
    pushedAt: state.pushedAt || new Date().toISOString(),
  };
}

function toPrettyLabel(key: string): string {
  switch (key) {
    case 'caseNumber': return 'Case #';
    case 'caseOwner': return 'Case Owner';
    case 'caseStatus': return 'Case Status';
    case 'issueTitle': return 'Case Subject';
    case 'firstName': return 'First Name';
    case 'lastName': return 'Last Name';
    case 'accountName': return 'Account';
    default: {
      // Case → Title Case
      const s = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
      return s ? s[0].toUpperCase() + s.slice(1) : '';
    }
  }
}
