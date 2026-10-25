/**
 * Decorative high-fashion crystalline gem clusters scattered across the background.
 * Honors the light Rarity motif:
 * - Faceted SVG diamond cuts with multi-tone depth
 * - Subtle linear gradients: soft sky azure (#dbeafe) -> brilliant sapphire (#38bdf8) -> deep amethyst (#7c3aed)
 * - Delicate 0.5px glistening facet lines
 * - Smooth, gentle floating/shimmer animation (no harsh shaking)
 * - Renders non-intrusively in the background without intercepting pointer events
 */
import { useMemo } from 'react';

interface GemCluster {
  top: number;
  left: number;
  scale: number;
  durT: number;
  delT: number;
  durBL: number;
  delBL: number;
  durBR: number;
  delBR: number;
}

const CLUSTER_COUNT = 14;
const MIN_DISTANCE = 16; // Minimum distance % between cluster centers

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function generateSpacedClusters(): GemCluster[] {
  const clusters: GemCluster[] = [];
  let attempts = 0;

  while (clusters.length < CLUSTER_COUNT && attempts < 200) {
    attempts++;

    // Spawn mostly on left (0-20%) or right (80-100%) edges
    const isLeft = Math.random() < 0.5;
    const left = isLeft ? Math.random() * 20 : 80 + Math.random() * 20;
    const top = 5 + Math.random() * 90;

    let overlap = false;
    for (const existing of clusters) {
      if (distance(left, top, existing.left, existing.top) < MIN_DISTANCE) {
        overlap = true;
        break;
      }
    }

    if (!overlap) {
      clusters.push({
        top,
        left,
        scale: 0.45 + Math.random() * 0.65,
        // Gentle, slow floating animation durations (4.5s to 7.5s)
        durT: 4.5 + Math.random() * 3.0,
        delT: -(Math.random() * 5.0),
        durBL: 4.8 + Math.random() * 3.0,
        delBL: -(Math.random() * 5.0),
        durBR: 4.2 + Math.random() * 3.0,
        delBR: -(Math.random() * 5.0),
      });
    }
  }

  return clusters;
}

export function Diamonds() {
  const clusters = useMemo(() => generateSpacedClusters(), []);

  return (
    <div
      className="crystalline-diamonds-backdrop"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <style>{`
        /* Smooth, gentle floating & shimmer keyframes */
        @keyframes floatTopCrystalline {
          0% {
            transform: translateX(-50%) translateY(0) rotate(-6deg);
            filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.25));
          }
          50% {
            transform: translateX(-50%) translateY(-6px) rotate(-2deg);
            filter: drop-shadow(0 0 10px rgba(116, 71, 217, 0.4)) drop-shadow(0 0 4px rgba(56, 189, 248, 0.45));
          }
          100% {
            transform: translateX(-50%) translateY(0) rotate(-6deg);
            filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.25));
          }
        }

        @keyframes floatBLCrystalline {
          0% {
            transform: translateY(0) rotate(5deg);
            filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.22));
          }
          50% {
            transform: translateY(5px) rotate(8deg);
            filter: drop-shadow(0 0 9px rgba(116, 71, 217, 0.35)) drop-shadow(0 0 3px rgba(56, 189, 248, 0.4));
          }
          100% {
            transform: translateY(0) rotate(5deg);
            filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.22));
          }
        }

        @keyframes floatBRCrystalline {
          0% {
            transform: translateY(0) rotate(-9deg);
            filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.22));
          }
          50% {
            transform: translateY(-5px) rotate(-6deg);
            filter: drop-shadow(0 0 9px rgba(116, 71, 217, 0.38)) drop-shadow(0 0 3px rgba(56, 189, 248, 0.4));
          }
          100% {
            transform: translateY(0) rotate(-9deg);
            filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.22));
          }
        }
      `}</style>

      {/* SVG Definitions for shared gradients & facet filters */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <linearGradient id="crystalSkyToSapphire" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#60a5fa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="crystalSapphireToAmethyst" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="crystalAmethystDeep" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5e3bb8" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="crystalTableShimmer" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#dbeafe" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id="crystalFlankLeft" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="crystalFlankRight" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5e3bb8" stopOpacity="0.85" />
          </linearGradient>
        </defs>
      </svg>

      {clusters.map((cluster, ci) => (
        <div
          key={ci}
          className="gem-cluster"
          style={{
            position: 'fixed',
            top: `${cluster.top}%`,
            left: `${cluster.left}%`,
            transform: `scale(${cluster.scale.toFixed(2)})`,
            pointerEvents: 'none',
          }}
        >
          {/* Top Diamond */}
          <svg
            className="gem gem--top"
            viewBox="0 0 40 68"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              animation: `floatTopCrystalline ${cluster.durT}s ease-in-out ${cluster.delT}s infinite alternate`,
              pointerEvents: 'none',
            }}
          >
            <FacetedGemShape />
          </svg>

          {/* Bottom Left Diamond */}
          <svg
            className="gem gem--bottom-left"
            viewBox="0 0 40 68"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              animation: `floatBLCrystalline ${cluster.durBL}s ease-in-out ${cluster.delBL}s infinite alternate`,
              pointerEvents: 'none',
            }}
          >
            <FacetedGemShape />
          </svg>

          {/* Bottom Right Diamond */}
          <svg
            className="gem gem--bottom-right"
            viewBox="0 0 40 68"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              animation: `floatBRCrystalline ${cluster.durBR}s ease-in-out ${cluster.delBR}s infinite alternate`,
              pointerEvents: 'none',
            }}
          >
            <FacetedGemShape />
          </svg>
        </div>
      ))}
    </div>
  );
}

/**
 * High-fashion faceted gemstone geometry.
 * Symmetrical vertically-stretched brilliant cut with multi-tone facet planes
 * and glistening 0.5px facet intersections.
 */
function FacetedGemShape() {
  const facetStroke = 'rgba(255, 255, 255, 0.72)';
  const strokeWidth = 0.5;

  return (
    <g>
      {/* Outer Diamond Silhouette Base */}
      <polygon
        points="20,1 34,16 39,34 34,52 20,67 6,52 1,34 6,16"
        fill="url(#crystalAmethystDeep)"
        stroke="rgba(124, 58, 237, 0.3)"
        strokeWidth="0.75"
      />

      {/* ─── Top Crown Facets ─── */}
      {/* Left Top Crown */}
      <polygon
        points="20,1 6,16 20,18"
        fill="url(#crystalSkyToSapphire)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />
      {/* Right Top Crown */}
      <polygon
        points="20,1 34,16 20,18"
        fill="url(#crystalSkyToSapphire)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
        opacity="0.9"
      />

      {/* ─── Upper Flank Facets ─── */}
      {/* Upper Left Flank */}
      <polygon
        points="6,16 1,34 10,34"
        fill="url(#crystalFlankLeft)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />
      {/* Upper Left Inner */}
      <polygon
        points="6,16 10,34 20,18"
        fill="url(#crystalSapphireToAmethyst)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />
      {/* Upper Right Inner */}
      <polygon
        points="34,16 20,18 30,34"
        fill="url(#crystalSapphireToAmethyst)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
        opacity="0.95"
      />
      {/* Upper Right Flank */}
      <polygon
        points="34,16 30,34 39,34"
        fill="url(#crystalFlankRight)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />

      {/* ─── Lower Flank Facets ─── */}
      {/* Lower Left Flank */}
      <polygon
        points="1,34 10,34 6,52"
        fill="url(#crystalFlankLeft)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />
      {/* Lower Left Inner */}
      <polygon
        points="10,34 20,50 6,52"
        fill="url(#crystalSapphireToAmethyst)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />
      {/* Lower Right Inner */}
      <polygon
        points="30,34 34,52 20,50"
        fill="url(#crystalSapphireToAmethyst)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
        opacity="0.9"
      />
      {/* Lower Right Flank */}
      <polygon
        points="39,34 34,52 30,34"
        fill="url(#crystalFlankRight)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />

      {/* ─── Lower Pavilion Facets (Tapering to Culet) ─── */}
      {/* Bottom Left Pavilion */}
      <polygon
        points="6,52 20,50 20,67"
        fill="url(#crystalAmethystDeep)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
      />
      {/* Bottom Right Pavilion */}
      <polygon
        points="34,52 20,50 20,67"
        fill="url(#crystalAmethystDeep)"
        stroke={facetStroke}
        strokeWidth={strokeWidth}
        opacity="0.95"
      />

      {/* ─── Central Table Facet (Radiant Highlight) ─── */}
      <polygon
        points="20,18 30,34 20,50 10,34"
        fill="url(#crystalTableShimmer)"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth="0.6"
      />

      {/* Specular Glisten Sparkle on Table */}
      <polygon
        points="18,25 19,27 21,28 19,29 18,31 17,29 15,28 17,27"
        fill="#ffffff"
        opacity="0.85"
      />
    </g>
  );
}
