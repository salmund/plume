import { useEffect, useState } from "react";
import { ExternalLink, Feather, X } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings, type DefaultZoom } from "../lib/settings";

const REPO_URL = "https://github.com/salmund/plume";
const AUTHOR_URL = "https://github.com/salmund";

const ZOOM_OPTIONS: { value: DefaultZoom; label: string }[] = [
  { value: "p100", label: "100 %" },
  { value: "fit-width", label: "Largeur" },
  { value: "fit-page", label: "Page entière" },
  { value: "last", label: "Dernier utilisé" },
];

const SHORTCUTS: [string, string][] = [
  ["Ouvrir un document", "Ctrl+O"],
  ["Fermer l'onglet", "Ctrl+W"],
  ["Zoom", "Ctrl+molette · Ctrl+±"],
  ["Ajuster à la largeur", "Ctrl+0"],
  ["Mode annotation", "Ctrl+E · Échap"],
  ["Marquer la page", "Ctrl+D"],
  ["Rechercher", "Ctrl+F"],
  ["Occurrence suivante · précédente", "Entrée · Maj+Entrée"],
  ["Enregistrer", "Ctrl+S"],
  ["Enregistrer sous", "Ctrl+Maj+S"],
  ["Annuler · Rétablir", "Ctrl+Z · Ctrl+Y"],
  ["Paramètres", "Ctrl+,"],
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-chiffres border-trait rounded border bg-white/4 px-1.5 py-0.5 text-[11px]">
      {children}
    </kbd>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && (
          <div className="text-sourdine mt-0.5 text-[11.5px] leading-snug">
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${
          checked ? "bg-violette" : "bg-trait"
        }`}
      >
        <span
          className={`absolute top-[3px] size-4 rounded-full transition-all ${
            checked ? "left-[21px] bg-[#14141b]" : "bg-sourdine left-[3px]"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { settings, update } = useSettings();
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-black/55"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paramètres"
        onClick={(e) => e.stopPropagation()}
        className="bg-pupitre border-trait w-[460px] rounded-xl border p-6 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-[22px] tracking-wide">Paramètres</h2>
          <button
            type="button"
            aria-label="Fermer les paramètres"
            onClick={onClose}
            className="text-sourdine hover:text-papier grid size-7 place-items-center rounded-md transition-colors hover:bg-white/5"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <section>
            <div className="text-sourdine mb-2.5 text-[11px] font-medium tracking-[0.14em] uppercase">
              Lecture
            </div>
            <div className="mb-2 text-[13px]">Zoom à l'ouverture d'un document</div>
            <div className="border-trait flex overflow-hidden rounded-lg border">
              {ZOOM_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ defaultZoom: opt.value })}
                  aria-pressed={settings.defaultZoom === opt.value}
                  className={`flex-1 py-2 text-[12.5px] transition-colors ${
                    settings.defaultZoom === opt.value
                      ? "bg-violette font-medium text-[#14141b]"
                      : "text-sourdine hover:text-papier hover:bg-white/5"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="text-sourdine mb-2.5 text-[11px] font-medium tracking-[0.14em] uppercase">
              Images
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                label="Encadrer les images au survol"
                hint="Le clic droit reste disponible sans l'encadré."
                checked={settings.imageHighlight}
                onChange={(v) => update({ imageHighlight: v })}
              />
              <Toggle
                label="Afficher l'infobulle au survol"
                checked={settings.imageTooltip}
                onChange={(v) => update({ imageTooltip: v })}
              />
            </div>
          </section>

          <section>
            <div className="text-sourdine mb-2.5 text-[11px] font-medium tracking-[0.14em] uppercase">
              Démarrage
            </div>
            <Toggle
              label="Rouvrir les documents de la dernière session"
              checked={settings.restoreSession}
              onChange={(v) => update({ restoreSession: v })}
            />
          </section>

          <section>
            <div className="text-sourdine mb-2.5 text-[11px] font-medium tracking-[0.14em] uppercase">
              Raccourcis
            </div>
            <div className="flex flex-col gap-1.5">
              {SHORTCUTS.map(([action, keys]) => (
                <div
                  key={action}
                  className="flex items-baseline justify-between text-[12.5px]"
                >
                  <span className="text-sourdine">{action}</span>
                  <Kbd>{keys}</Kbd>
                </div>
              ))}
            </div>
          </section>

          <section className="border-trait border-t pt-5">
            <div className="flex items-center gap-3">
              <Feather size={18} strokeWidth={1.75} className="text-violette" />
              <div className="flex-1">
                <div className="font-display text-[17px] tracking-wide">
                  Plume{version && ` ${version}`}
                </div>
                <div className="text-sourdine text-[12px]">
                  Lecteur et éditeur de documents · par{" "}
                  <button
                    type="button"
                    onClick={() => openUrl(AUTHOR_URL).catch(() => {})}
                    className="text-violette hover:underline"
                  >
                    @salmund
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openUrl(REPO_URL).catch(() => {})}
                title="Voir le dépôt sur GitHub"
                className="text-sourdine hover:text-papier flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-white/5"
              >
                GitHub
                <ExternalLink size={12} strokeWidth={1.75} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
