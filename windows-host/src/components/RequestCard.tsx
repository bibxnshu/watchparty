interface RequestCardProps {
  name: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function RequestCard({ name, onAccept, onDecline }: RequestCardProps) {
  const initial = name.replace('@', '')[0].toUpperCase();
  
  return (
    <div className="request-card">
      <div className="friend-avatar">{initial}</div>
      <div className="friend-info">
        <div className="name">{name}</div>
        <div className="status-label">wants to add you</div>
      </div>
      <div className="request-actions">
        <button className="btn-icon accept" title="Accept" onClick={(e) => { e.stopPropagation(); onAccept(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button className="btn-icon decline" title="Decline" onClick={(e) => { e.stopPropagation(); onDecline(); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}
