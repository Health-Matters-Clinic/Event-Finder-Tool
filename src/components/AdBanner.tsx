import React, { useState, useEffect, useRef } from 'react';
import { AdBanner } from '../config';

interface AdBannerProps {
  banners: AdBanner[];
  className?: string;
}

const AdBannerComponent: React.FC<AdBannerProps> = ({ banners, className = '' }) => {
  const activeBanners = banners.filter(b => b.isActive);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  // Track which banner indices have broken images
  const [erroredIndices, setErroredIndices] = useState<Set<number>>(new Set());
  // Responsive: track whether we are in mobile viewport
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hovered = useRef(false);

  // Advance to the next banner that hasn't errored; returns true if we found one
  const advanceToNextValid = (fromIndex: number, total: number, errored: Set<number>): number | null => {
    for (let i = 1; i < total; i++) {
      const next = (fromIndex + i) % total;
      if (!errored.has(next)) return next;
    }
    return null; // all errored
  };

  const rotateBanner = () => {
    if (hovered.current || activeBanners.length <= 1) return;
    setVisible(false);
    setTimeout(() => {
      setCurrentIndex(i => {
        // Skip errored banners during rotation
        for (let step = 1; step < activeBanners.length; step++) {
          const next = (i + step) % activeBanners.length;
          if (!erroredIndices.has(next)) return next;
        }
        return i; // all errored — stay
      });
      setVisible(true);
    }, 300);
  };

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    intervalRef.current = setInterval(rotateBanner, 7000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBanners.length, erroredIndices]);

  // Reset state when banners prop changes
  useEffect(() => {
    setCurrentIndex(0);
    setErroredIndices(new Set());
    setVisible(true);
  }, [banners]);

  // Hide entirely if no banners or all images errored
  if (activeBanners.length === 0) return null;
  if (erroredIndices.size >= activeBanners.length) return null;

  // If the current banner has errored, skip to a valid one
  const displayIndex = erroredIndices.has(currentIndex)
    ? (advanceToNextValid(currentIndex, activeBanners.length, erroredIndices) ?? currentIndex)
    : currentIndex;

  const banner = activeBanners[displayIndex];

  // Non-errored banners for dot nav
  const visibleBanners = activeBanners.filter((_, i) => !erroredIndices.has(i));

  // Pick the correct image source and dimensions based on viewport
  const imgSrc = isMobile && banner.mobileImageUrl ? banner.mobileImageUrl : banner.imageUrl;
  const imgStyle = isMobile
    ? { maxWidth: '320px', height: '50px', width: '100%', display: 'block' as const }
    : { maxWidth: '728px', height: '90px', width: '100%', display: 'block' as const };

  return (
    <div
      className={`ad-banner-wrap ${className}`}
      onMouseEnter={() => { hovered.current = true; }}
      onMouseLeave={() => { hovered.current = false; }}
      style={{ textAlign: 'center', lineHeight: 0 }}
    >
      <a
        href={banner.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={banner.altText}
        style={{ display: 'inline-block' }}
      >
        <img
          key={`${displayIndex}-${isMobile ? 'm' : 'd'}`}
          src={imgSrc}
          alt={banner.altText}
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.3s ease',
            borderRadius: '4px',
            ...imgStyle,
          }}
          onError={() => {
            setErroredIndices(prev => {
              const next = new Set(prev);
              next.add(displayIndex);
              return next;
            });
            // Auto-advance to next valid banner
            setVisible(false);
            setTimeout(() => {
              setCurrentIndex(ci => {
                const newErrored = new Set(erroredIndices);
                newErrored.add(displayIndex);
                const next = advanceToNextValid(ci, activeBanners.length, newErrored);
                return next !== null ? next : ci;
              });
              setVisible(true);
            }, 300);
          }}
        />
      </a>
      {visibleBanners.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '4px' }}>
          {activeBanners.map((_, i) => {
            if (erroredIndices.has(i)) return null;
            return (
              <button
                key={i}
                onClick={() => {
                  setVisible(false);
                  setTimeout(() => { setCurrentIndex(i); setVisible(true); }, 300);
                }}
                aria-label={`Show banner ${i + 1}`}
                style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  border: 'none', cursor: 'pointer', padding: 0,
                  background: i === displayIndex ? '#233dff' : '#d1d5db',
                  transition: 'background 0.2s',
                }}
              />
            );
          })}
        </div>
      )}
      <p style={{ fontSize: '9px', color: '#9ca3af', margin: '2px 0 0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sponsored</p>
    </div>
  );
};

export default AdBannerComponent;
