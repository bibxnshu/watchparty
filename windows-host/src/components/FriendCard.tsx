import { useState } from 'react';

interface FriendCardProps {
  name: string;
  status: 'hosting' | 'online' | 'offline';
  statusText: string;
  onJoin?: () => void;
  showMenu: boolean;
  onToggleMenu: () => void;
}

export function FriendCard({ name, status, statusText, onJoin, showMenu, onToggleMenu }: FriendCardProps) {
  const [notify, setNotify] = useState(false);
  const initial = name.replace('@', '')[0].toUpperCase();

  return (
    <div className="friend-card">
      <div className="friend-avatar">
        {initial}
        <span className={`status-dot ${status}`}></span>
      </div>
      <div className="friend-info">
        <div className="name">{name}</div>
        <div className="status-label">{statusText}</div>
      </div>
      
      {status === 'hosting' && onJoin ? (
        <button className="btn btn-primary" onClick={onJoin}>Join</button>
      ) : (
        <button 
          className={`icon-toggle ${notify ? 'active' : ''}`} 
          onClick={(e) => { e.stopPropagation(); setNotify(!notify); }} 
          title="Notify when hosting"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3C9.5 3 8 5 8 8V11L6 14V15H18V14L16 11V8C16 5 14.5 3 12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 17.5C10 18.6 10.9 19.5 12 19.5C13.1 19.5 14 18.6 14 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      )}

      <div style={{ position: 'relative' }}>
        <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>
        </button>
        <div className={`friend-menu ${showMenu ? 'show' : ''}`}>
          <button>Unfriend</button>
          <button className="danger">Block</button>
        </div>
      </div>
    </div>
  );
}
