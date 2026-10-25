import { useEffect } from 'react';

// A trailer in a pop-out player. Some trailers cannot be embedded, so the YouTube link is always there too. The player is
// YouTube's privacy-enhanced embed, and only loads when this window is opened.
export default function TrailerDialog({ videoId, title, onClose }) {
  useEffect(() => {
    // capture phase and stopped here, so Escape closes the player only, not the title window under it
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className="overlay stacked" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog trailer" role="dialog" aria-label={`${title} trailer`}>
        <div className="trailerframe">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin" // YouTube refuses to play when it is sent no referrer at all
          />
        </div>
        <div className="buttons">
          <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">Not playing? Watch on YouTube</a>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
