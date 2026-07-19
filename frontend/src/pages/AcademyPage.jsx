import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { financeVideos } from '../data/financeVideos';

const AcademyPage = () => {
  const [hoveredVideo, setHoveredVideo] = useState(null);

  const handleVideoClick = (videoId) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="brand-title" style={{ fontSize: '2rem', marginBottom: '8px' }}>Finance Academy</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Expand your knowledge with curated finance, trading, and investment videos.
        </p>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: '24px' 
      }}>
        {financeVideos.map((video) => (
          <div 
            key={video.id}
            className="glass-panel"
            style={{ 
              padding: 0, 
              overflow: 'hidden', 
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              transform: hoveredVideo === video.id ? 'translateY(-4px)' : 'none',
              boxShadow: hoveredVideo === video.id ? '0 12px 24px rgba(25, 126, 114, 0.15)' : 'none',
              border: `1px solid ${hoveredVideo === video.id ? 'rgba(25, 126, 114, 0.4)' : 'var(--panel-border)'}`
            }}
            onMouseEnter={() => setHoveredVideo(video.id)}
            onMouseLeave={() => setHoveredVideo(null)}
            onClick={() => handleVideoClick(video.id)}
          >
            {/* Thumbnail Container */}
            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', backgroundColor: '#111' }}>
              <img 
                src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`} 
                alt={video.title}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: hoveredVideo === video.id ? 0.8 : 1,
                  transition: 'opacity 0.2s ease'
                }}
              />
              {/* Play Button Overlay */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(25, 126, 114, 0.9)',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: hoveredVideo === video.id ? 1 : 0,
                transition: 'opacity 0.2s ease, transform 0.2s ease',
                scale: hoveredVideo === video.id ? 1.1 : 1
              }}>
                <Play fill="white" color="white" size={24} style={{ marginLeft: '4px' }} />
              </div>
            </div>

            {/* Video Info */}
            <div style={{ padding: '16px' }}>
              <h3 style={{ 
                fontSize: '0.95rem', 
                marginBottom: '8px', 
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                color: 'var(--text-primary)'
              }}>
                {video.title}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {video.channel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AcademyPage;
