import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Diamonds } from '../components/Diamonds';

describe('Diamonds component', () => {
  it('renders decorative diamond backdrop with aria-hidden', () => {
    const { container } = render(<Diamonds />);
    const backdrop = container.querySelector('.crystalline-diamonds-backdrop');
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveStyle({ pointerEvents: 'none' });
  });

  it('renders clusters with triangular diamond arrangement', () => {
    const { container } = render(<Diamonds />);
    const clusters = container.querySelectorAll('.gem-cluster');
    expect(clusters.length).toBeGreaterThan(0);

    const firstCluster = clusters[0];
    expect(firstCluster.querySelector('.gem--top')).toBeInTheDocument();
    expect(firstCluster.querySelector('.gem--bottom-left')).toBeInTheDocument();
    expect(firstCluster.querySelector('.gem--bottom-right')).toBeInTheDocument();
  });

  it('renders faceted SVG diamond cuts and linear gradients', () => {
    const { container } = render(<Diamonds />);
    // Check for shared gradient definitions
    expect(container.querySelector('#crystalSkyToSapphire')).toBeInTheDocument();
    expect(container.querySelector('#crystalSapphireToAmethyst')).toBeInTheDocument();
    expect(container.querySelector('#crystalAmethystDeep')).toBeInTheDocument();
    expect(container.querySelector('#crystalTableShimmer')).toBeInTheDocument();

    // Check for facet polygons
    const polygons = container.querySelectorAll('polygon');
    expect(polygons.length).toBeGreaterThan(10);
  });
});
