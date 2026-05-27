import React, { useState, useEffect, useRef } from 'react';
import { AD_BANNERS } from '../config';

interface AdBannerProps {
  className?: string;
}

const AdBannerComponent: React.FC<AdBannerProps> = ({ className = '' }) => {
  const activeBanners = AD_BANNERS.filter(b => b.isActive);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hovered = useRef(false);

  const rotateBanner = () => {
    if (hovered.current || activeBanners.length <= 1) return;
    setVisible(false);
    setTimeout(() => {
      setCurrentIndex(i => (i + 1) % activeBanners.length);
      setVisible(true);
    }, 300);
  };

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    intervalRef.current = setInterval(rotateBanner, 7000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const banner = activeBanners[currentIndex];

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
          src={banner.imageUrl}
          alt={banner.altText}
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.3s ease',
            maxWidth: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '4px',
          }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </a>
      {activeBanners.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '4px' }}>
          {activeBanners.map((_, i) => (
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
                background: i === currentIndex ? '#233dff' : '#d1d5db',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
      )}
      <p style={{ fontSize: '9px', color: '#9ca3af', margin: '2px 0 0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sponsored</p>
    </div>
  );
};

export default AdBannerComponent;
