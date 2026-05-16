/**
 * Decorative gem/diamond shapes scattered across the background.
 * Each cluster has 3 symmetric vertically-stretched diamonds
 * arranged in a triangular pattern.
 *
 * Positions are randomized on every mount, with logic to ensure
 * a minimum distance so they don't overlap. Each individual diamond
 * has an independent slight shaking animation.
 */
import { useMemo } from 'react';

interface GemCluster {
    top: number;
    left: number;
    scale: number;
    durT: number; delT: number;
    durBL: number; delBL: number;
    durBR: number; delBR: number;
}

const CLUSTER_COUNT = 15;
const MIN_DISTANCE = 16; // Minimum distance % between cluster centers

// Helper to check distance between two points in % space
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
                scale: 0.4 + Math.random() * 0.7,
                // Randomize shake timing for each diamond independently
                durT: 0.8 + Math.random() * 0.8, delT: -(Math.random() * 2),
                durBL: 0.8 + Math.random() * 0.8, delBL: -(Math.random() * 2),
                durBR: 0.8 + Math.random() * 0.8, delBR: -(Math.random() * 2),
            });
        }
    }

    return clusters;
}

export function Diamonds() {
    const clusters = useMemo(generateSpacedClusters, []);

    return (
        <>
            <style>{`
        /* Each gem occupies a specific base transform, so we must bake that into keyframes */
        @keyframes shakeTop {
          from { transform: translateX(-50%) rotate(-12deg); }
          to { transform: translateX(-50%) rotate(2deg); }
        }
        @keyframes shakeBL {
          from { transform: rotate(1deg); }
          to { transform: rotate(15deg); }
        }
        @keyframes shakeBR {
          from { transform: rotate(-17deg); }
          to { transform: rotate(-3deg); }
        }
      `}</style>
            {clusters.map((cluster, ci) => (
                <div
                    key={ci}
                    className="gem-cluster"
                    style={{
                        top: `${cluster.top}%`,
                        left: `${cluster.left}%`,
                        transform: `scale(${cluster.scale.toFixed(2)})`,
                    }}
                >
                    <svg
                        className="gem gem--top"
                        viewBox="0 0 40 68"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ animation: `shakeTop ${cluster.durT}s ease-in-out ${cluster.delT}s infinite alternate` }}
                    >
                        <GemShape />
                    </svg>
                    <svg
                        className="gem gem--bottom-left"
                        viewBox="0 0 40 68"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ animation: `shakeBL ${cluster.durBL}s ease-in-out ${cluster.delBL}s infinite alternate` }}
                    >
                        <GemShape />
                    </svg>
                    <svg
                        className="gem gem--bottom-right"
                        viewBox="0 0 40 68"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ animation: `shakeBR ${cluster.durBR}s ease-in-out ${cluster.delBR}s infinite alternate` }}
                    >
                        <GemShape />
                    </svg>
                </div>
            ))}
        </>
    );
}

/**
 * Symmetric vertically-stretched diamond.
 * Widest point at exact vertical center (y=34 of 68).
 */
function GemShape() {
    return (
        <g>
            <path
                d="M20 0 L40 34 L20 68 L0 34 Z"
                fill="var(--blue)"
                stroke="#3a9ac5"
                strokeWidth="1.5"
                opacity="0.6"
            />
            <line x1="20" y1="0" x2="20" y2="68" stroke="#3a9ac5" strokeWidth="0.7" opacity="0.4" />
            <line x1="0" y1="34" x2="40" y2="34" stroke="#3a9ac5" strokeWidth="0.7" opacity="0.4" />
            <line x1="20" y1="0" x2="0" y2="34" stroke="#3a9ac5" strokeWidth="0.6" opacity="0.3" />
            <line x1="20" y1="0" x2="40" y2="34" stroke="#3a9ac5" strokeWidth="0.6" opacity="0.3" />
            <line x1="20" y1="68" x2="0" y2="34" stroke="#3a9ac5" strokeWidth="0.6" opacity="0.3" />
            <line x1="20" y1="68" x2="40" y2="34" stroke="#3a9ac5" strokeWidth="0.6" opacity="0.3" />
            <ellipse cx="20" cy="34" rx="6.5" ry="5" fill="#3a9ac5" opacity="0.3" />
        </g>
    );
}
