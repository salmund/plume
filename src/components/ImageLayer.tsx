import { useEffect, useState } from "react";
import { listPageImages } from "../lib/api";
import type { PageImageInfo } from "../types";

export interface ImageTarget {
  pageIndex: number;
  image: PageImageInfo;
  /** Position du menu, en coordonnées écran. */
  clientX: number;
  clientY: number;
}

interface Props {
  docId: number;
  pageIndex: number;
  /** Pixels CSS par point PDF. */
  scale: number;
  /** Actif seulement en mode navigation (pas pendant l'annotation). */
  enabled: boolean;
  rev: number;
  onContextMenu: (target: ImageTarget) => void;
}

/**
 * Zones cliquables au-dessus des images de la page : survol pour les repérer,
 * clic droit pour le menu (enregistrer, copier).
 */
export function ImageLayer({
  docId,
  pageIndex,
  scale,
  enabled,
  rev,
  onContextMenu,
}: Props) {
  const [images, setImages] = useState<PageImageInfo[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listPageImages(docId, pageIndex)
      .then((list) => {
        if (!cancelled) setImages(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [docId, pageIndex, enabled, rev]);

  if (!enabled || images.length === 0) return null;

  return (
    <>
      {images.map((image) => (
        <button
          key={image.objectPath}
          type="button"
          title="Clic droit pour enregistrer ou copier l'image"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu({
              pageIndex,
              image,
              clientX: e.clientX,
              clientY: e.clientY,
            });
          }}
          className="absolute rounded-[2px] transition-shadow hover:shadow-[0_0_0_2px_var(--color-violette)]"
          style={{
            left: image.x * scale,
            top: image.y * scale,
            width: image.width * scale,
            height: image.height * scale,
            background: "transparent",
          }}
        />
      ))}
    </>
  );
}
