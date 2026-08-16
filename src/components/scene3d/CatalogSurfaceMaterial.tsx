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

function SolidFallback({
  color,
  roughness,
  metalness,
}: {
  color: string;
  roughness: number;
  metalness: number;
}) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />;
}

function PbrMaps({
  colorUrl,
  roughUrl,
  normalUrl,
  metalUrl,
  tiles,
  roughness,
  metalness,
}: {
  colorUrl: string;
  roughUrl?: string;
  normalUrl?: string;
  metalUrl?: string;
  tiles: number;
  roughness: number;
  metalness: number;
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
      />
    );
  }
  if (roughUrl) {
    return <PbrColorRough colorUrl={colorUrl} roughUrl={roughUrl} tiles={tiles} roughness={roughness} metalness={metalness} />;
  }
  return <PbrColorOnly colorUrl={colorUrl} tiles={tiles} roughness={roughness} metalness={metalness} />;
}

function PbrColorOnly({
  colorUrl,
  tiles,
  roughness,
  metalness,
}: {
  colorUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
}) {
  const map = useTexture(colorUrl);
  useLayoutEffect(() => {
    configureMap(map, tiles, true);
  }, [map, tiles]);
  return <meshStandardMaterial map={map} color="#ffffff" roughness={roughness} metalness={metalness} />;
}

function PbrColorRough({
  colorUrl,
  roughUrl,
  tiles,
  roughness,
  metalness,
}: {
  colorUrl: string;
  roughUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
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
}: {
  colorUrl: string;
  roughUrl: string;
  normalUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
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
}: {
  colorUrl: string;
  roughUrl: string;
  normalUrl: string;
  metalUrl: string;
  tiles: number;
  roughness: number;
  metalness: number;
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
}: {
  color: string;
  maps?: CatalogSurfaceMaps;
  /** Approximate world size of the face for UV tiling. */
  worldSpan?: number;
  roughness?: number;
  metalness?: number;
}) {
  const roughness = roughnessOverride ?? maps?.roughness ?? 0.75;
  const metalness = metalnessOverride ?? maps?.metalness ?? 0.04;
  const textureUrl = maps?.textureUrl;
  if (!textureUrl) {
    return <SolidFallback color={color} roughness={roughness} metalness={metalness} />;
  }
  const repeatM = maps?.textureRepeat ?? 0.5;
  const tiles = Math.max(1, worldSpan / Math.max(0.08, repeatM));
  return (
    <Suspense fallback={<SolidFallback color={color} roughness={roughness} metalness={metalness} />}>
      <PbrMaps
        colorUrl={textureUrl}
        roughUrl={maps?.roughnessMapUrl}
        normalUrl={maps?.normalMapUrl}
        metalUrl={maps?.metalnessMapUrl}
        tiles={tiles}
        roughness={roughness}
        metalness={metalness}
      />
    </Suspense>
  );
}
