"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

interface SafeImgProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
}

// Rendert <img> mit onError-Fallback. Wenn src leer oder Bild kaputt
// (z.B. 404/503 vom Bild-Backend), wird das fallback-Element gerendert,
// damit nicht der nackte Alt-Text vom Browser sichtbar wird.
export function SafeImg({ src, alt = "", className, style, fallback }: SafeImgProps) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (!src || errored) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setErrored(true)}
    />
  );
}
