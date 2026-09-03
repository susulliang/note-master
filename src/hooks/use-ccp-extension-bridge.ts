/**
 * useCcpExtensionBridge — connects the Ticket Notes React app to the
 * "Ecovacs Ticket DOM Scraper" Tier-2 browser extension living in
 * /extension of this repo.
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

import { useEffect, useRef, useState, useCallback } from 'react';
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
      if (src === 'ecovacs-ccp-extension:ready') {
        // bridge.js pings at least once on load.
        bridgeReadyRef.current = true;
        const id: string | undefined = data.extensionId;
        if (id) {
          extIdRef.current = id;
          setExtensionId(id);
          try { localStorage.setItem(EXT_ID_LS_KEY, id); } catch { /* ignore */ }
        }
        setConnected(true);
        // Ask background for a hello snapshot so the page picks up any
        // already-scraped CCP/SF data immediately on navigation.
        void sendRequest({ type: 'EXT_HELLO' }).then((r) => {
          if (r?.ok) {
            setVersion(r.version ?? null);
            if (r.merged && typeof r.merged === 'object' && Object.keys(r.merged).length > 0) {
              // Hello = already-scraped snapshot on nav; shows the confirm
              // popup with only the 4 identity fields, consistent with the
              // "user must confirm auto-fill" requirement.
              queuePendingPush(r.merged, r.state ?? null);
            }
          }
        });
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
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
    // Channel 1: direct chrome.runtime.sendMessage if origin matches the
    // extension's externally_connectable manifest AND we know the ext id.
    const id = extIdRef.current || (DEFAULT_EXT_ID_CANDIDATE as string);
    if (id && typeof (globalThis as any).chrome?.runtime?.sendMessage === 'function') {
      try {
        return await new Promise<any>((resolve, reject) => {
          (globalThis as any).chrome.runtime.sendMessage(id, request, (reply: any) => {
            const err = (globalThis as any).chrome?.runtime?.lastError;
            if (err) reject(err);
            else resolve(reply);
          });
        });
      } catch {
        // Fall through to the bridge path.
      }
    }
    // Channel 2: bridge.js content script tunnel via window.postMessage.
    if (typeof window !== 'undefined') {
      const reqId = requestCounterRef.current += 1;
      return await new Promise<any>((resolve) => {
        pendingReqRef.current[reqId] = resolve;
        // Timeout: 8s (covers SW cold wake + SF lazy DOM settle)
        window.setTimeout(() => {
          if (pendingReqRef.current[reqId]) {
            delete pendingReqRef.current[reqId];
            resolve({ ok: false, error: 'Extension request timed out.' });
          }
        }, 8000);
        window.postMessage({
          source: 'ecovacs-ccp-extension:request',
          id: reqId,
          request,
        }, '*');
      });
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
