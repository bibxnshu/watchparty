import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
};

export function useWebRTC() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [playbackCommand, setPlaybackCommand] = useState<any>(null);
  const [peerState, setPeerState] = useState<RTCPeerConnectionState>('new');
  const [participants, setParticipants] = useState<any[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const targetIdRef = useRef<string | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);

  const stateRef = useRef({ roomCode, isHost, participants });
  useEffect(() => {
    stateRef.current = { roomCode, isHost, participants };
  }, [roomCode, isHost, participants]);

  // Initialize Socket
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).ipcRenderer;
    const serverUrl = isDesktop 
      ? 'http://localhost:4000' 
      : 'http://192.168.1.5:4000';
    const s = io(serverUrl);
    setSocket(s);

    s.on('connect', () => {
      setIsConnected(true);
      // Auto-rejoin if we were already in a room before disconnecting
      const { roomCode: rc, isHost: ih, participants: p } = stateRef.current;
      if (rc) {
        if (ih) {
          s.emit('room:create', { name: p.find((x: any)=>x.isHost)?.name || 'Host' }, () => {});
        } else {
          s.emit('room:join', { code: rc, name: p.find((x: any)=>!x.isHost)?.name || 'Guest' }, () => {});
        }
      }
    });
    
    s.on('disconnect', () => setIsConnected(false));

    return () => {
      s.disconnect();
    };
  }, []);

  const createPeerConnection = useCallback((s: Socket, targetId: string) => {
    if (pcRef.current) pcRef.current.close();
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    targetIdRef.current = targetId;
    iceCandidatesQueue.current = [];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        s.emit('webrtc:ice-candidate', { targetId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      setPeerState(pc.connectionState);
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    // Receive data channel
    pc.ondatachannel = (event) => {
      const receiveChannel = event.channel;
      receiveChannel.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        setChatMessages(prev => [...prev, msg]);
      };
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    return pc;
  }, []);

  // Handle Socket Events for WebRTC
  useEffect(() => {
    if (!socket) return;

    socket.on('room:participants', (parts) => {
      setParticipants(parts);
      // Simple logic for 1-on-1: if we are host and someone joins, we initiate the call
      if (isHost && parts.length > 1) {
        const guest = parts.find((p: any) => !p.isHost);
        if (guest && pcRef.current?.connectionState !== 'connected') {
          initiateCall(guest.id);
        }
      }
    });

    socket.on('webrtc:offer', async ({ senderId, sdp }) => {
      const pc = createPeerConnection(socket, senderId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const candidate of iceCandidatesQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidatesQueue.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { targetId: senderId, sdp: answer });
    });

    socket.on('webrtc:answer', async ({ senderId, sdp }) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const candidate of iceCandidatesQueue.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidatesQueue.current = [];
      }
    });

    socket.on('webrtc:ice-candidate', async ({ senderId, candidate }) => {
      if (pcRef.current) {
        if (pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          iceCandidatesQueue.current.push(candidate);
        }
      }
    });

    socket.on('playback:command', (cmd) => {
      setPlaybackCommand(cmd);
    });

    socket.on('chat:message', (msg: ChatMessage) => {
       // Fallback via server if needed, though we try to use DataChannel
       setChatMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
       });
    });

    return () => {
      socket.off('room:participants');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
      socket.off('chat:message');
      socket.off('playback:command');
    };
  }, [socket, isHost, createPeerConnection]);

  const initiateCall = async (targetId: string) => {
    if (!socket) return;
    const pc = createPeerConnection(socket, targetId);
    
    // Create data channel as caller
    const dc = pc.createDataChannel('chat');
    dataChannelRef.current = dc;
    dc.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      setChatMessages(prev => [...prev, msg]);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc:offer', { targetId, sdp: offer });
  };

  const setLocalStream = (stream: MediaStream) => {
    localStreamRef.current = stream;
    if (pcRef.current && peerState === 'connected') {
      stream.getTracks().forEach(track => {
        // Just a simple replace for MVP
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === track.kind);
        if (sender) sender.replaceTrack(track);
        else pcRef.current?.addTrack(track, stream);
      });
    }
  };

  const hostRoom = (name: string, stream: MediaStream | null) => {
    if (!socket) return;
    localStreamRef.current = stream;
    setIsHost(true);
    socket.emit('room:create', { name }, (res: any) => {
      if (res.ok) {
        setRoomCode(res.code);
        setParticipants(res.participants);
      }
    });
  };

  const joinRoom = (code: string, name: string) => {
    if (!socket) return;
    setIsHost(false);
    socket.emit('room:join', { code, name }, (res: any) => {
      if (res.ok) {
        setRoomCode(res.code);
        setParticipants(res.participants);
      }
    });
  };

  const sendPlaybackCommand = (cmd: any) => {
    if (socket && roomCode) {
      socket.emit('playback:command', cmd);
    }
  };

  const sendChatMessage = (text: string, senderName: string) => {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      senderId: socket?.id || 'local',
      senderName,
      text,
      timestamp: Date.now(),
    };
    
    setChatMessages(prev => [...prev, msg]);
    
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify(msg));
    } else if (socket && roomCode) {
      socket.emit('chat:message', { text });
    }
  };

  return {
    isConnected,
    roomCode,
    isHost,
    participants,
    peerState,
    remoteStream,
    chatMessages,
    hostRoom,
    joinRoom,
    sendChatMessage,
    setLocalStream,
    playbackCommand,
    sendPlaybackCommand,
  };
}
