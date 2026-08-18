import { useTexture } from '@react-three/drei';
import { Suspense, useLayoutEffect } from 'react';
import * as THREE from 'three';

export type CatalogSurfaceMaps = {
  textureUrl?: string;
  roughnessMapUrl?: string;
  normalMapUrl?: string;
  metalnessMapUrl?: string;
  textureRepeat?: number;
  roughness?: number;
  metalness?: number;
};

function configureMap(texture: THREE.Texture, tiles: number, srgb: boolean) {
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(tiles, tiles);
  texture.anisotropy = 6;
  texture.needsUpdate = true;
}

type SurfaceLook = {
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  side?: THREE.Side;
};

function SolidFallback({
  color,
  roughness,
  metalness,
  look,
}: {
  color: string;
  roughness: number;
  metalness: number;
  look?: SurfaceLook;
}) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      opacity={look?.opacity}
      transparent={look?.transparent}
      depthWrite={look?.depthWrite}
      side={look?.side}
    />
  );
}

function PbrMaps({
  colorUrl,
  roughUrl,
  normalUrl,
  metalUrl,
  tiles,
  roughness,
  metalness,
  look,
}: {
  colorUrl: string;
  roughUrl?: string;
  normalUrl?: string;
  metalUrl?: string;
  tiles: number;
  roughness: number;
  metalness: number;
  look?: SurfaceLook;
}) {
  // Fixed arity branches so hooks stay unconditional within each leaf.
  if (roughUrl && normalUrl && metalUrl) {
    return (
      <PbrColorRoughNormalMetal
        colorUrl={colorUrl}
        roughUrl={roughUrl}
        normalUrl={normalUrl}
        metalUrl={metalUrl}
        tiles={tiles}
        roughness={roughness}
        metalness={metalness}
        look={look}
      />
    );
  }
  if (roughUrl && normalUrl) {
    return (
      <PbrColorRoughNormal
        colorUrl={colorUrl}
        roughUrl={roughUrl}
        normalUrl={normalUrl}
        tiles={tiles}
        roughness={roughness}
        metalness={metalness}
        look={look}
      />
    );
  }
  if (roughUrl) {
    return (
      <PbrColorRough
        colorUrl={colorUrl}
        roughUrl={roughUrl}
        tiles={tiles}
        roughness={roughness}
        metalness={metalness}
        look={look}
      />
    );
  }
  return <PbrColorOnly colorUrl={colorUrl} tiles={tiles} roughness={roughness} metalness={metalness} look={look} />;
}

function lookProps(look?: SurfaceLook) {
  if (!look) return {};
  return {
    opacity: look.opacity,
    transparent: look.transparent,
    depthWrite: look.depthWrite,
    side: look.side,
  };
}

function PbrColorOnly({
  colorUrl,
  tiles,
  roughness,
  metalness,
  look,
}: {
  colorUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
  look?: SurfaceLook;
}) {
  const map = useTexture(colorUrl);
  useLayoutEffect(() => {
    configureMap(map, tiles, true);
  }, [map, tiles]);
  return <meshStandardMaterial map={map} color="#ffffff" roughness={roughness} metalness={metalness} {...lookProps(look)} />;
}

function PbrColorRough({
  colorUrl,
  roughUrl,
  tiles,
  roughness,
  metalness,
  look,
}: {
  colorUrl: string;
  roughUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
  look?: SurfaceLook;
}) {
  const [map, roughnessMap] = useTexture([colorUrl, roughUrl]);
  useLayoutEffect(() => {
    configureMap(map, tiles, true);
    configureMap(roughnessMap, tiles, false);
  }, [map, roughnessMap, tiles]);
  return (
    <meshStandardMaterial
      map={map}
      roughnessMap={roughnessMap}
      color="#ffffff"
      roughness={roughness}
      metalness={metalness}
      {...lookProps(look)}
    />
  );
}

function PbrColorRoughNormal({
  colorUrl,
  roughUrl,
  normalUrl,
  tiles,
  roughness,
  metalness,
  look,
}: {
  colorUrl: string;
  roughUrl: string;
  normalUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
  look?: SurfaceLook;
}) {
  const [map, roughnessMap, normalMap] = useTexture([colorUrl, roughUrl, normalUrl]);
  useLayoutEffect(() => {
    configureMap(map, tiles, true);
    configureMap(roughnessMap, tiles, false);
    configureMap(normalMap, tiles, false);
  }, [map, roughnessMap, normalMap, tiles]);
  return (
    <meshStandardMaterial
      map={map}
      roughnessMap={roughnessMap}
      normalMap={normalMap}
      normalScale={new THREE.Vector2(0.45, 0.45)}
      color="#ffffff"
      roughness={roughness}
      metalness={metalness}
      {...lookProps(look)}
    />
  );
}

function PbrColorRoughNormalMetal({
  colorUrl,
  roughUrl,
  normalUrl,
  metalUrl,
  tiles,
  roughness,
  metalness,
  look,
}: {
  colorUrl: string;
  roughUrl: string;
  normalUrl: string;
  metalUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
  look?: SurfaceLook;
}) {
  const [map, roughnessMap, normalMap, metalnessMap] = useTexture([colorUrl, roughUrl, normalUrl, metalUrl]);
  useLayoutEffect(() => {
    configureMap(map, tiles, true);
    configureMap(roughnessMap, tiles, false);
    configureMap(normalMap, tiles, false);
    configureMap(metalnessMap, tiles, false);
  }, [map, roughnessMap, normalMap, metalnessMap, tiles]);
  return (
    <meshStandardMaterial
      map={map}
      roughnessMap={roughnessMap}
      normalMap={normalMap}
      metalnessMap={metalnessMap}
      normalScale={new THREE.Vector2(0.4, 0.4)}
      color="#ffffff"
      roughness={roughness}
      metalness={metalness}
      {...lookProps(look)}
    />
  );
}

/**
 * Drop-in mesh material: solid color, or CC0 albedo (+ optional rough/normal/metal) maps.
 * Uses white tint with maps so patterns are not washed out.
 */
export function CatalogSurfaceMaterial({
  color,
  maps,
  worldSpan = 1,
  roughness: roughnessOverride,
  metalness: metalnessOverride,
  opacity,
  transparent,
  depthWrite,
  side,
}: {
  color: string;
  maps?: CatalogSurfaceMaps;
  /** Approximate world size of the face for UV tiling. */
  worldSpan?: number;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  side?: THREE.Side;
}) {
  const roughness = roughnessOverride ?? maps?.roughness ?? 0.75;
  const metalness = metalnessOverride ?? maps?.metalness ?? 0.04;
  const look: SurfaceLook | undefined =
    opacity !== undefined || transparent !== undefined || depthWrite !== undefined || side !== undefined
      ? { opacity, transparent, depthWrite, side }
      : undefined;
  const textureUrl = maps?.textureUrl;
  if (!textureUrl) {
    return <SolidFallback color={color} roughness={roughness} metalness={metalness} look={look} />;
  }
  const repeatM = maps?.textureRepeat ?? 0.5;
  const tiles = Math.max(1, worldSpan / Math.max(0.08, repeatM));
  return (
    <Suspense fallback={<SolidFallback color={color} roughness={roughness} metalness={metalness} look={look} />}>
      <PbrMaps
        colorUrl={textureUrl}
        roughUrl={maps?.roughnessMapUrl}
        normalUrl={maps?.normalMapUrl}
        metalUrl={maps?.metalnessMapUrl}
        tiles={tiles}
        roughness={roughness}
        metalness={metalness}
        look={look}
      />
    </Suspense>
  );
}
