interface TicketStubProps {
  roomCode: string;
}

export function TicketStub({ roomCode }: TicketStubProps) {
  return (
    <div className="stub-visual">
      <div className="top-row"><span>NOW SHOWING</span><span>2H 28M</span></div>
      <div className="film-block">

      </div>
      <div className="code">{roomCode || '--- · ---'}</div>
      <div className="sub">WAITING FOR IQRA...</div>
    </div>
  );
}
