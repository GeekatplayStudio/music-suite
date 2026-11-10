/**
 * Web Audio Modules 2 host: loads in-browser plugins from the internet.
 *
 * A WAM is third-party JavaScript that runs inside this page, so nothing here
 * runs until the user has switched internet plugins on for this browser.
 */

export const WAM_CATALOGUE_URL = "https://www.webaudiomodules.com/community/plugins.json";
const WAM_PLUGIN_BASE = "https://www.webaudiomodules.com/community/plugins/";
const CONSENT_KEY = "music-suite-editor-wam-enabled";

export interface WamCatalogueEntry {
  name: string;
  vendor: string;
  url: string;
  description: string;
  instrument: boolean;
}

export interface WamInstance {
  audioNode: AudioNode & {
    getState?: () => Promise<unknown>;
    setState?: (state: unknown) => Promise<void>;
    destroy?: () => void;
  };
  createGui: () => Promise<HTMLElement>;
  destroyGui?: (element: HTMLElement) => void;
  descriptor?: { name?: string };
}

/* ---------- Consent, kept in this browser ---------- */

const listeners = new Set<() => void>();

function readConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "yes";
  } catch {
    return false;
  }
}

/** Shaped for useSyncExternalStore. */
export const wamConsent = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: readConsent,
  getServerSnapshot: (): boolean => false,
  set(enabled: boolean): void {
    try {
      if (enabled) window.localStorage.setItem(CONSENT_KEY, "yes");
      else window.localStorage.removeItem(CONSENT_KEY);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
    for (const listener of listeners) listener();
  }
};

/** Only secure addresses (or this machine) may supply plugin code. */
export function isAllowedWamUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/* ---------- Catalogue ---------- */

let catalogue: Promise<WamCatalogueEntry[]> | null = null;

export function loadWamCatalogue(): Promise<WamCatalogueEntry[]> {
  if (!readConsent()) return Promise.reject(new Error("Internet plugins are switched off."));
  catalogue ??= fetch(WAM_CATALOGUE_URL, { credentials: "omit" })
    .then((res) => {
      if (!res.ok) throw new Error(`The plugin catalogue could not be loaded (${res.status}).`);
      return res.json() as Promise<Record<string, unknown>[]>;
    })
    .then((items) =>
      items
        .filter((item) => typeof item.path === "string" && typeof item.name === "string")
        .map((item) => {
          const categories = Array.isArray(item.category) ? item.category.map(String) : [];
          return {
            name: String(item.name).slice(0, 60),
            vendor: String(item.vendor ?? "").slice(0, 40),
            url: new URL(String(item.path), WAM_PLUGIN_BASE).href,
            description: String(item.description ?? "").slice(0, 200),
            instrument: categories.includes("Instrument") && !categories.includes("Effect")
          };
        })
        .filter((item) => item.url.startsWith(WAM_PLUGIN_BASE))
        .sort((a, b) => a.name.localeCompare(b.name))
    )
    .catch((err: unknown) => {
      catalogue = null;
      throw err;
    });
  return catalogue;
}

/* ---------- Host ---------- */

const hostGroups = new WeakMap<BaseAudioContext, Promise<string>>();

function hostGroup(ctx: BaseAudioContext): Promise<string> {
  let pending = hostGroups.get(ctx);
  if (!pending) {
    // Served as plain files: the host turns its own functions into worklet code, which bundling breaks.
    const hostUrl = `${window.location.origin}/wam-host/initializeWamHost.js`;
    pending = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ hostUrl).then(
      async (module: { default: (context: BaseAudioContext) => Promise<[string, string]> }) => (await module.default(ctx))[0]
    );
    hostGroups.set(ctx, pending);
  }
  return pending;
}

/** Fetch a plugin's code and create one instance of it on an audio context. */
export async function createWam(ctx: BaseAudioContext, url: string, state?: unknown): Promise<WamInstance> {
  if (!readConsent()) throw new Error("Internet plugins are switched off.");
  if (!isAllowedWamUrl(url)) throw new Error("Plugins must come from an https address.");
  const group = await hostGroup(ctx);
  const loaded = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as {
    default?: { createInstance?: (groupId: string, context: BaseAudioContext, initialState?: unknown) => Promise<WamInstance> };
  };
  if (typeof loaded.default?.createInstance !== "function") throw new Error("That address is not a Web Audio Module.");
  const instance = await loaded.default.createInstance(group, ctx, state ?? undefined);
  if (!instance?.audioNode) throw new Error("The plugin did not start.");
  return instance;
}
