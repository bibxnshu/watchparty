import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';

// STUN + free TURN servers for reliable NAT traversal in any network environment
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
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
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimers = useRef<Map<string, any>>(new Map());
  const peerStateRef = useRef<RTCPeerConnectionState>('new'); // ref for use in closures
  const negotiatingRef = useRef(false); // prevent offer storms

  const stateRef = useRef({ roomCode, isHost, participants });
  useEffect(() => {
    stateRef.current = { roomCode, isHost, participants };
  }, [roomCode, isHost, participants]);

  useEffect(() => {
    peerStateRef.current = peerState;
  }, [peerState]);

  // Initialize Socket
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && !!(window as any).ipcRenderer;
    const serverUrl = 'https://watchparty-owib.onrender.com';
    const s = io(serverUrl, {
      transports: ['websocket'], // skip long-polling for faster initial connect
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
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

    // Apply bitrate cap when connected to prevent encoder from choking
    pc.onconnectionstatechange = () => {
      setPeerState(pc.connectionState);
      peerStateRef.current = pc.connectionState;
      if (pc.connectionState === 'connected') {
        negotiatingRef.current = false;
        pc.getSenders().forEach(sender => {
          if (sender.track?.kind === 'video') {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
            params.encodings[0].maxBitrate = 2_500_000; // 2.5 Mbps
            params.encodings[0].maxFramerate = 24;
            sender.setParameters(params).catch(() => {});
          }
        });
      }
    };

    // Debounced renegotiation — prevents simultaneous offer/answer storms
    pc.onnegotiationneeded = async () => {
      if (!stateRef.current.isHost || pc.signalingState === 'closed' || negotiatingRef.current) return;
      negotiatingRef.current = true;
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') { negotiatingRef.current = false; return; }
        await pc.setLocalDescription(offer);
        s.emit('webrtc:offer', { targetId, sdp: offer });
      } catch (e) {
        console.error('Renegotiation error:', e);
        negotiatingRef.current = false;
      }
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

    if (localStreamRef.current && typeof (localStreamRef.current as any).getTracks === 'function') {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Apply encoding constraints after connection is established
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') {
        pc.getSenders().forEach(sender => {
          if (sender.track?.kind === 'video') {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 2_500_000; // 2.5 Mbps — smooth 1080p24
            params.encodings[0].maxFramerate = 24;
            sender.setParameters(params).catch(() => {});
          }
        });
      }
    });

    return pc;
  }, []);

  // Handle Socket Events for WebRTC
  useEffect(() => {
    if (!socket) return;

    socket.on('room:participants', (parts) => {
      setParticipants(parts);
      if (stateRef.current.isHost && parts.length > 1) {
        const guest = parts.find((p: any) => !p.isHost);
        // Only initiate if not already connected or connecting
        if (guest && peerStateRef.current !== 'connected' && peerStateRef.current !== 'connecting') {
          initiateCall(guest.id);
        }
      }
    });

    socket.on('webrtc:offer', async ({ senderId, sdp }) => {
      let pc = pcRef.current;
      if (!pc || pc.signalingState === 'closed') {
        pc = createPeerConnection(socket, senderId);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const candidate of iceCandidatesQueue.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidatesQueue.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { targetId: senderId, sdp: answer });
      } catch (e) {
        console.error('Error handling offer:', e);
      }
    });

    socket.on('webrtc:answer', async ({ sdp }) => {
      if (pcRef.current && pcRef.current.signalingState === 'have-local-offer') {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
          for (const candidate of iceCandidatesQueue.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceCandidatesQueue.current = [];
          negotiatingRef.current = false;
        } catch (e) {
          console.error('Error setting answer:', e);
        }
      }
    });

    socket.on('webrtc:ice-candidate', async ({ candidate }) => {
      if (pcRef.current) {
        if (pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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

    socket.on('chat:typing', ({ senderName }) => {
      setTypingUsers(prev => new Set(prev).add(senderName));
      if (typingTimers.current.has(senderName)) clearTimeout(typingTimers.current.get(senderName));
      typingTimers.current.set(senderName, setTimeout(() => {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(senderName);
          return next;
        });
      }, 3000));
    });

    return () => {
      socket.off('room:participants');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
      socket.off('chat:message');
      socket.off('chat:typing');
      socket.off('playback:command');
    };
  }, [socket, createPeerConnection]);

  const initiateCall = async (targetId: string) => {
    if (!socket) return;
    const pc = createPeerConnection(socket, targetId);
    const dc = pc.createDataChannel('chat');
    dataChannelRef.current = dc;
    dc.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      setChatMessages(prev => [...prev, msg]);
    };
    try {
      negotiatingRef.current = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', { targetId, sdp: offer });
    } catch (e) {
      console.error('Error creating offer:', e);
      negotiatingRef.current = false;
    }
  };

  const setLocalStream = (stream: MediaStream) => {
    localStreamRef.current = stream;
    // Use peerStateRef (not state) to avoid stale closure bugs
    if (pcRef.current && peerStateRef.current === 'connected') {
      stream.getTracks().forEach(track => {
        const sender = pcRef.current?.getSenders().find(s => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(() => {});
        } else {
          pcRef.current?.addTrack(track, stream);
        }
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

  const leaveRoom = () => {
    if (socket) socket.emit('room:leave');
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setRoomCode(null);
    setParticipants([]);
    setRemoteStream(null);
    setChatMessages([]);
    setIsHost(false);
    setPeerState('new');
    peerStateRef.current = 'new';
    negotiatingRef.current = false;
  };

  const sendPlaybackCommand = (cmd: any) => {
    if (socket && stateRef.current.roomCode) {
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

  const sendTypingIndicator = (senderName: string) => {
    if (socket && roomCode) {
      socket.emit('chat:typing', { senderName });
    }
  };

  return {
    socket,
    isConnected,
    roomCode,
    isHost,
    participants,
    peerState,
    remoteStream,
    chatMessages,
    typingUsers,
    hostRoom,
    joinRoom,
    leaveRoom,
    sendChatMessage,
    sendTypingIndicator,
    setLocalStream,
    playbackCommand,
    sendPlaybackCommand,
  };
}
