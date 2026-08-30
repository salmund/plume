import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type DefaultZoom = "fit-width" | "fit-page" | "p100" | "last";

export interface Settings {
  /** Zoom appliqué à l'ouverture d'un document. */
  defaultZoom: DefaultZoom;
  /** Rouvrir les documents de la dernière session au démarrage. */
  restoreSession: boolean;
}

const DEFAULTS: Settings = { defaultZoom: "p100", restoreSession: true };
const KEY = "plume.settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<SettingsCtx>({ settings: DEFAULTS, update: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible : le réglage vaut pour la session en cours
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}

/* ---------- Dernier zoom utilisé ---------- */

export function saveLastZoom(percent: number) {
  try {
    localStorage.setItem("plume.lastZoom", String(percent));
  } catch {
    /* ignoré */
  }
}

export function loadLastZoom(): number | null {
  try {
    const v = Number(localStorage.getItem("plume.lastZoom"));
    return Number.isFinite(v) && v >= 10 ? v : null;
  } catch {
    return null;
  }
}

/* ---------- Session (onglets ouverts) ---------- */

export interface Session {
  paths: string[];
  activePath: string | null;
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem("plume.session", JSON.stringify(session));
  } catch {
    /* ignoré */
  }
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem("plume.session");
    if (!raw) return { paths: [], activePath: null };
    const parsed = JSON.parse(raw);
    return {
      paths: Array.isArray(parsed.paths)
        ? parsed.paths.filter((p: unknown) => typeof p === "string")
        : [],
      activePath:
        typeof parsed.activePath === "string" ? parsed.activePath : null,
    };
  } catch {
    return { paths: [], activePath: null };
  }
}

/* ---------- Fichiers récents ---------- */

export interface RecentFile {
  path: string;
  title: string;
}

const RECENTS_MAX = 8;

export function loadRecents(): RecentFile[] {
  try {
    const raw = localStorage.getItem("plume.recents");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r: unknown): r is RecentFile =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as RecentFile).path === "string" &&
        typeof (r as RecentFile).title === "string",
    );
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentFile) {
  const list = [
    entry,
    ...loadRecents().filter((r) => r.path !== entry.path),
  ].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem("plume.recents", JSON.stringify(list));
  } catch {
    /* ignoré */
  }
}
