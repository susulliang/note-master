import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getPetState, listStore, savePetState } from '@/lib/auth-client';
import type { CatId } from '@/lib/cat-sprites';
import { CAT_EAT_EVENT } from '@/lib/cat-sprites';
import {
  applyDailyLogin,
  applyFeed,
  applyNapToggle,
  applyPet,
  applyQaScore,
  generateProfile,
  initialState,
  loadState,
  nextStage,
  petStorageKey,
  saveStateJson,
  scaleFor,
  stageFor,
  tick,
  type CatPetProfile,
  type CatPetState,
} from '@/lib/cat-pet';

/** Identity used before sign-in — its progress migrates into the user's
 *  D1 slot on first authenticated save instead of being reset. */
const ANONYMOUS_IDENTITY = 'local-anonymous';

export interface CatPetSnapshot {
  state: CatPetState;
  napping: boolean;
  /** Sprite scale (0.5–1.22) from Bond XP. */
  scale: number;
  stage: ReturnType<typeof stageFor>;
  /** XP remaining until the next stage (null at Elder). */
  xpToNext: number | null;
}

export interface CatPetApi {
  pet: CatPetSnapshot | null;
  /** Pet the cat (+Mood, +XP; 30s cooldown, daily soft cap). */
  petCat: () => void;
  /** True while the 30s pet cooldown is running. */
  petCooldown: boolean;
  /** Bond XP award for a QA-scored call (0–100+ pct). */
  rewardQa: (scorePct: number) => void;
  /** Manual nap toggle (tuck in / wake; no XP). */
  toggleNap: () => void;
}

interface UseCatPetOptions {
  catId: CatId;
  /** Authenticated username, or null when signed out. */
  username: string | null;
}

/**
 * Single-mount cat-pet store. Mount ONCE in TicketNotesPage and pass the
 * snapshot down through props (Settings panel + CatAssistant) — the raw
 * state is NOT read independently via useScopedState elsewhere, otherwise
 * the two consumers would hold split copies.
 *
 * Owns: the one-minute simulation tick, localStorage persistence, D1 sync
 * (debounced; fetch-on-login with anonymous-progress migration), the
 * store-feed event listener, and the pet-cooldown / daily-cap bookkeeping.
 */
export function useCatPet({ catId, username }: UseCatPetOptions): CatPetApi {
  const identity = username ?? ANONYMOUS_IDENTITY;
  const [state, setState] = useState<CatPetState | null>(null);
  const [napping, setNapping] = useState(false);
  const [petCooldown, setPetCooldown] = useState(false);
  const lastPetAtRef = useRef(0);
  const petTimerRef = useRef<number | undefined>(undefined);
  /** latest state ref so event listeners / intervals see fresh values */
  const stateRef = useRef<CatPetState | null>(null);
  const dirtyRef = useRef(false);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const catRef = useRef(catId);
  catRef.current = catId;

  /* -------- persistence helpers -------- */

  const writeLocal = useCallback((s: CatPetState) => {
    try {
      window.localStorage.setItem(petStorageKey(identityRef.current, catRef.current), saveStateJson(s));
    } catch {
      /* quota / disabled storage — pet lives in memory only */
    }
  }, []);

  /** Debounced D1 flush — at most every 30s, plus a final flush on hide.
   *  savePetState no-ops internally when signed out. */
  const flushToD1 = useCallback(() => {
    const s = stateRef.current;
    if (!s || !navigator.onLine) return;
    void savePetState(saveStateJson(s)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        flushToD1();
      }
    }, 30_000);
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        dirtyRef.current = false;
        flushToD1();
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [flushToD1]);

  /** Central state mutator: writes localStorage immediately, flags D1 dirty. */
  const update = useCallback(
    (next: CatPetState) => {
      stateRef.current = next;
      dirtyRef.current = true;
      writeLocal(next);
      setNapping(next.napping);
      setState(next);
    },
    [writeLocal]
  );

  /** Advance the simulation by `fn` (pure state → state) and commit. */
  const commit = useCallback(
    (fn: (s: CatPetState) => CatPetState) => {
      const s = stateRef.current;
      if (!s) return;
      update(fn(s));
    },
    [update]
  );

  /* -------- bootstrap: local → D1 (with anonymous migration) -------- */

  useEffect(() => {
    let cancelled = false;
    setState(null);
    stateRef.current = null;

    const boot = async () => {
      const key = petStorageKey(identity, catId);
      let local = loadState(window.localStorage.getItem(key));

      // Migration: an anonymous pet follows the user into their account slot
      // on first sign-in (progress preserved, not reset).
      if (!local && identity !== ANONYMOUS_IDENTITY) {
        const anon = loadState(window.localStorage.getItem(petStorageKey(ANONYMOUS_IDENTITY, catId)));
        if (anon) {
          local = anon;
          try {
            window.localStorage.setItem(key, saveStateJson(anon));
          } catch {
            /* non-fatal */
          }
        }
      }

      // Signed in: D1 is the source of truth when it has a newer save.
      if (identity !== ANONYMOUS_IDENTITY) {
        try {
          const remote = loadState(await getPetState());
          if (cancelled) return;
          if (remote && (!local || remote.updatedAt > local.updatedAt)) {
            local = remote;
            try {
              window.localStorage.setItem(key, saveStateJson(remote));
            } catch {
              /* non-fatal */
            }
          }
        } catch {
          /* offline / API hiccup — local state is enough for now */
        }
      }

      if (cancelled) return;
      if (!local) {
        const profile = generateProfile(identity, catId, []);
        local = initialState(Date.now(), profile);
        writeLocal(local);
        dirtyRef.current = true;
      }
      // Bring the simulation up to now (capped offline decay) before showing.
      const { state: ticked } = tick(local, Date.now());
      stateRef.current = ticked;
      writeLocal(ticked);
      setNapping(ticked.napping);
      setState(ticked);
      dirtyRef.current = true;

      // First authenticated session of the day → +3 Bond XP.
      const loginOut = applyDailyLogin(ticked, Date.now());
      if (loginOut.applied) {
        stateRef.current = loginOut.state;
        dirtyRef.current = true;
        writeLocal(loginOut.state);
        setNapping(loginOut.state.napping);
        setState(loginOut.state);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [identity, catId, writeLocal]);

  /* -------- favorite food: fill in once the store list is available -------- */

  useEffect(() => {
    if (identity === ANONYMOUS_IDENTITY || !stateRef.current) return;
    if (stateRef.current.profile.favoriteFoodId) return;
    void listStore()
      .then((products) => {
        const foodIds = products.filter((p) => p.category === 'food').map((p) => p.id);
        const s = stateRef.current;
        if (!s || foodIds.length === 0) return;
        const profile: CatPetProfile = generateProfile(identity, catId, foodIds);
        update({ ...s, profile });
      })
      .catch(() => undefined);
  }, [identity, catId, update]); // runs after boot sets stateRef

  /* -------- one-minute simulation tick -------- */

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      const { state: next } = tick(s, Date.now());
      if (
        next.energy !== s.energy ||
        next.fullness !== s.fullness ||
        next.mood !== s.mood ||
        next.napping !== s.napping
      ) {
        update(next);
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [update]);

  /* -------- store purchases feed the pet -------- */

  useEffect(() => {
    const onEat = (e: Event) => {
      const detail = (e as CustomEvent<{ productId?: string; isFood?: boolean }>).detail ?? {};
      if (detail.isFood === false) return; // non-food store item
      commit((s) => {
        const out = applyFeed(s, detail.productId ?? null, Date.now());
        const before = stageFor(s.xp);
        const after = stageFor(out.state.xp);
        if (after !== before) {
          toast.success(`🌟 ${after.name} stage!`, { description: 'Your cat grew a little today.' });
        }
        return out.state;
      });
    };
    window.addEventListener(CAT_EAT_EVENT, onEat);
    return () => window.removeEventListener(CAT_EAT_EVENT, onEat);
  }, [commit]);

  /* -------- actions -------- */

  const petCat = useCallback(() => {
    const now = Date.now();
    if (now - lastPetAtRef.current < 30_000) return;
    lastPetAtRef.current = now;
    setPetCooldown(true);
    window.clearTimeout(petTimerRef.current);
    petTimerRef.current = window.setTimeout(() => setPetCooldown(false), 30_000);
    commit((s) => {
      const out = applyPet(s, now);
      const before = stageFor(s.xp);
      const after = stageFor(out.state.xp);
      if (after !== before) {
        toast.success(`🌟 ${after.name} stage!`, { description: 'Your cat grew a little today.' });
      }
      return out.state;
    });
  }, [commit]);

  const rewardQa = useCallback(
    (scorePct: number) => {
      commit((s) => {
        const out = applyQaScore(s, scorePct, Date.now());
        if (!out.applied) return s;
        const before = stageFor(s.xp);
        const after = stageFor(out.state.xp);
        if (after !== before) {
          toast.success(`🌟 ${after.name} stage!`, { description: 'Great call — your cat is proud.' });
        } else if (out.xpGained > 0) {
          toast.success(`🐱 +${out.xpGained} Bond`, { description: `QA score ${scorePct}/100` });
        }
        return out.state;
      });
    },
    [commit]
  );

  /** Manual nap toggle — tuck the cat in / wake it. No XP, mirrors the
   *  autonomous nap state machine (regen while asleep). */
  const toggleNap = useCallback(() => {
    commit((s) => applyNapToggle(s, Date.now()).state);
  }, [commit]);

  const snapshot: CatPetSnapshot | null = useMemo(() => {
    if (!state) return null;
    const stage = stageFor(state.xp);
    const next = nextStage(state.xp);
    return {
      state,
      napping,
      scale: scaleFor(state.xp),
      stage,
      xpToNext: next ? next.xp - state.xp : null,
    };
  }, [state, napping]);

  return { pet: snapshot, petCat, petCooldown, rewardQa, toggleNap };
}
