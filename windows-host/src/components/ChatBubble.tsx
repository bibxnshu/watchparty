interface ChatBubbleProps {
  message: string;
  isMe: boolean;
  time: string;
}

export function ChatBubble({ message, isMe, time }: ChatBubbleProps) {
  return (
    <div className={`bubble-row ${isMe ? 'me' : 'them'}`}>
      <div className="bubble">{message}</div>
      <div className="bubble-time">{time}</div>
    </div>
  );
}
