import { useState, useRef, useEffect, Component, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';

class ErrorBoundary extends Component<any, any> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return <div style={{padding: 40, color: 'red', zIndex: 99999, position: 'absolute', top: 0, left: 0, background: 'black', width: '100vw', height: '100vh'}}><h1>React Error!</h1><pre style={{whiteSpace: 'pre-wrap'}}>{String(this.state.error?.stack || this.state.error)}</pre></div>;
    return this.props.children;
  }
}

import { useWebRTC } from './useWebRTC';
import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, ref, set, onValue, onDisconnect } from './firebase';
import ReactPlayer from 'react-player';
import './App.css';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [chatInput, setChatInput] = useState('');
  
  const [loggedInEmail, setLoggedInEmail] = useState('');
  
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [uid, setUid] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        setLoggedInEmail(user.email || '');
        
        // Listen to their data in Realtime DB
        const userRef = ref(db, 'users/' + user.uid);
        onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            if (data.username) setUsername(data.username);
            if (data.avatar) setAvatar(data.avatar);
            if (data.watchHistory) setWatchHistory(data.watchHistory);
            if (data.friendsList) setFriendsList(data.friendsList);
            if (data.appSettings) {
              setAppSettings(data.appSettings);
              setIsMuted(data.appSettings.muteOnJoin);
            }
          }
          setCurrentScreen('home');
        }, { onlyOnce: true });

        // Presence system
        const myStatusRef = ref(db, 'users/' + user.uid + '/status');
        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
            onDisconnect(myStatusRef).set('offline').then(() => {
              set(myStatusRef, 'online');
            });
          }
        });
        
      } else {
        setUid('');
        setLoggedInEmail('');
        setUsername('');
        setAvatar(null);
        setWatchHistory([]);
        setFriendsList([]);
        setAppSettings({ enableToasts: true, muteOnJoin: false });
        setCurrentScreen('login');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async () => {
    setAuthError('');
    if (!email || !password) {
      setAuthError('Please fill in all fields.');
      return;
    }
    
    try {
      if (authMode === 'register') {
        if (password !== confirmPassword) {
          setAuthError('Passwords do not match.');
          return;
        }
        if (!username) {
          setAuthError('Please enter a username.');
          return;
        }
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Initialize their profile in Realtime DB
        await set(ref(db, 'users/' + user.uid), {
          username,
          email,
          avatar: null,
          watchHistory: [],
          friendsList: [],
          appSettings: { enableToasts: true, muteOnJoin: false }
        });
        
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };
  
  const webrtc = useWebRTC();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const reactPlayerRef = useRef<any>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null);
  const [ytPlaybackRate, setYtPlaybackRate] = useState<number>(1);
  const [stableRoomCode, setStableRoomCode] = useState<string>('');

  // Keep a stable room code that never goes blank once set
  useEffect(() => {
    if (webrtc.roomCode) setStableRoomCode(webrtc.roomCode);
  }, [webrtc.roomCode]);
  

  const [promptConfig, setPromptConfig] = useState<{ message: string, onSubmit: (val: string) => void, onCancel: () => void } | null>(null);

  useEffect(() => {
    if (!webrtc.socket) return;
    const handleYouTubeUrl = (url: string) => {
      setYoutubeUrl(url);
      setMovieName("YouTube Video");
      setIsPlaying(false);
      setCurrentScreen('watching');
    };
    webrtc.socket.on('room:youtube', handleYouTubeUrl);
    return () => {
      webrtc.socket?.off('room:youtube', handleYouTubeUrl);
    };
  }, [webrtc.socket]);

  // Wire remote WebRTC stream to the guest video element
  useEffect(() => {
    if (webrtc.remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = webrtc.remoteStream;
      remoteVideoRef.current.play().catch(() => {
        // Autoplay blocked — user will need to tap play
      });
    }
  }, [webrtc.remoteStream]);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isChatHidden, setIsChatHidden] = useState(false);

  const [showControls, setShowControls] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const hoverTimeout = useRef<any>(null);

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    const s = Math.floor(time % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const lastSyncRef = useRef(0);
  const handleTimeUpdate = (e: any) => {
    if (webrtc.isHost) {
      const newTime = e.target.currentTime;
      setCurrentTime(newTime);
      const now = Date.now();
      if (now - lastSyncRef.current > 1000) {
        webrtc.sendPlaybackCommand({ action: 'sync', time: newTime, duration: duration || e.target.duration });
        lastSyncRef.current = now;
      }
    }
  };
  const handleLoadedMetadata = (e: any) => {
    if (webrtc.isHost) {
      setDuration(e.target.duration);
      webrtc.sendPlaybackCommand({ action: 'sync', time: e.target.currentTime, duration: e.target.duration });
    }
  };
  const togglePlay = () => {
    if (youtubeUrl) {
      if (webrtc.isHost) webrtc.sendPlaybackCommand({ action: isPlaying ? 'pause' : 'play' });
      if (reactPlayerRef.current) {
        if (isPlaying) reactPlayerRef.current.pause();
        else reactPlayerRef.current.play();
      }
      setIsPlaying(!isPlaying);
      return;
    }

    const video = webrtc.isHost ? localVideoRef.current : remoteVideoRef.current;
    if (video) {
      if (isPlaying) {
        video.pause();
        if (webrtc.isHost) webrtc.sendPlaybackCommand({ action: 'pause' });
      } else {
        video.play();
        if (webrtc.isHost) webrtc.sendPlaybackCommand({ action: 'play' });
      }
      setIsPlaying(!isPlaying);
    }
  };
  const handleScrub = (e: any) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * duration;

    if (youtubeUrl && reactPlayerRef.current) {
      reactPlayerRef.current.currentTime = newTime;
      if (webrtc.isHost) webrtc.sendPlaybackCommand({ action: 'seek', time: newTime });
      return;
    }

    const video = webrtc.isHost ? localVideoRef.current : remoteVideoRef.current;
    if (video) {
      video.currentTime = newTime;
      if (webrtc.isHost) webrtc.sendPlaybackCommand({ action: 'seek', time: newTime });
    }
  };

  const handleVideoLoaded = (e: any) => {
    const videoElem = e.target as HTMLVideoElement & { audioTracks?: any };
    
    videoElem.play();
    webrtc.setLocalStream(videoElem.captureStream());
    
    // Check for audio tracks
    if (videoElem.audioTracks && videoElem.audioTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < videoElem.audioTracks.length; i++) {
        tracks.push(videoElem.audioTracks[i]);
      }
      setAudioTracks(tracks);
    } else {
      setAudioTracks([]);
    }
  };
  const playerRef = useRef<HTMLDivElement>(null);
  const [floatingReactions, setFloatingReactions] = useState<{id: number, emoji: string, left: number}[]>([]);
  const reactionIdCounter = useRef(0);
  
  const [appSettings, setAppSettings] = useState({ enableToasts: true, muteOnJoin: false });

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMessage, setToastMessage] = useState<any>(null);

  const [friendsList, setFriendsList] = useState<string[]>([]);
  const [newFriendName, setNewFriendName] = useState('');
  const [friendStatuses, setFriendStatuses] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const usersRef = ref(db, 'users');
    const unsub = onValue(usersRef, (snap) => {
      const data = snap.val();
      if (data) {
        const statuses: Record<string, string> = {};
        Object.values(data).forEach((u: any) => {
          if (u.username) statuses[u.username] = u.status || 'offline';
        });
        setFriendStatuses(statuses);
      }
    });
    return () => unsub();
  }, []);
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [useNativeControls, setUseNativeControls] = useState(Capacitor.isNativePlatform());
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [showTrackMenu, setShowTrackMenu] = useState(false);

  const [movieName, setMovieName] = useState<string | null>(null);
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState(0);
  const [trackSelection, setTrackSelection] = useState<{filePath: string, fileName: string, tracks: any[]} | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSources, setScreenSources] = useState<any[] | null>(null);

  useEffect(() => {
    if (uid && username) {
      set(ref(db, 'users/' + uid), {
        username,
        email: loggedInEmail,
        avatar,
        watchHistory,
        friendsList,
        appSettings
      });
    }
  }, [uid, username, avatar, watchHistory, friendsList, appSettings]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const SIZE = 128;
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const minDim = Math.min(img.width, img.height);
            const startX = (img.width - minDim) / 2;
            const startY = (img.height - minDim) / 2;
            ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, SIZE, SIZE);
            setAvatar(canvas.toDataURL('image/jpeg', 0.85));
          }
        };
        if (event.target?.result) img.src = event.target.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddFriend = () => {
    if (newFriendName.trim() && !friendsList.includes(newFriendName.trim())) {
      setFriendsList([...friendsList, newFriendName.trim()]);
      setNewFriendName('');
    }
  };

  useEffect(() => {
    if (webrtc.isHost && webrtc.participants.length > 1 && movieName) {
      const guest = webrtc.participants.find((p: any) => !p.isHost);
      
      if (guest) {
        setWatchHistory(prev => {
          const newHistory = [...prev];
          if (newHistory.length > 0 && newHistory[0].movieName === movieName) {
            if (newHistory[0].partner !== guest.name) {
              newHistory[0].partner = guest.name;
            }
          }
          return newHistory;
        });

        webrtc.sendPlaybackCommand({
          type: 'SESSION_INFO',
          movieName,
          hostName: username,
        });
      }
    }
  }, [webrtc.participants, webrtc.isHost, movieName, username]);

  useEffect(() => {
    if (webrtc.playbackCommand) {
      const cmd = webrtc.playbackCommand;
      
      if (cmd.type === 'SESSION_INFO') {
        const { movieName: mn, hostName } = cmd;
        setMovieName(mn);
        setWatchHistory(prev => {
          if (prev.length > 0 && prev[0].movieName === mn && prev[0].date > Date.now() - 1000 * 60 * 60) {
            return prev;
          }
          return [{
            id: Date.now().toString(),
            movieName: mn,
            date: Date.now(),
            partner: hostName,
            role: 'Guest'
          }, ...prev];
        });
      }
      
      // Handle playback sync
      if (youtubeUrl) {
        if (cmd.action === 'play') {
          setIsPlaying(true);
          reactPlayerRef.current?.play();
        } else if (cmd.action === 'pause') {
          setIsPlaying(false);
          reactPlayerRef.current?.pause();
        } else if (cmd.action === 'seek') {
          setCurrentTime(cmd.time);
          if (reactPlayerRef.current) reactPlayerRef.current.currentTime = cmd.time;
        }
      } else {
        const video = webrtc.isHost ? localVideoRef.current : remoteVideoRef.current;
        if (video) {
          if (cmd.action === 'play') {
            video.play();
            setIsPlaying(true);
          } else if (cmd.action === 'pause') {
            video.pause();
            setIsPlaying(false);
          } else if (cmd.action === 'seek') {
            video.currentTime = cmd.time;
          }
        }
      }
    }
  }, [webrtc.playbackCommand, youtubeUrl]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (appSettings.enableToasts && webrtc.chatMessages && webrtc.chatMessages.length > 0) {
      const latest = webrtc.chatMessages[webrtc.chatMessages.length - 1];
      if (latest.senderName !== username && isChatHidden) {
        setToastMessage(latest);
        const timer = setTimeout(() => setToastMessage(null), 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [webrtc.chatMessages, isChatHidden, username, appSettings.enableToasts]);

  const toggleMute = (e?: any) => {
    if (e) e.stopPropagation();
    const video = webrtc.isHost ? localVideoRef.current : remoteVideoRef.current;
    if (video) {
      video.muted = !isMuted;
      setIsMuted(!isMuted);
      if (isMuted && volume === 0) {
        setVolume(0.5);
        video.volume = 0.5;
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    const video = webrtc.isHost ? localVideoRef.current : remoteVideoRef.current;
    if (video) {
      video.volume = val;
      if (val > 0 && isMuted) {
        video.muted = false;
        setIsMuted(false);
      } else if (val === 0 && !isMuted) {
        video.muted = true;
        setIsMuted(true);
      }
    }
    setVolume(val);
  };

  const handleDoubleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isRightHalf = clickX > rect.width / 2;
    
    const video = webrtc.isHost ? localVideoRef.current : remoteVideoRef.current;
      if (video && webrtc.isHost) {
        let newTime = video.currentTime;
        if (isRightHalf) {
          newTime = Math.min(video.duration, video.currentTime + 10);
        } else {
          newTime = Math.max(0, video.currentTime - 10);
        }
        video.currentTime = newTime;
        setCurrentTime(newTime);
        webrtc.sendPlaybackCommand({ action: 'seek', time: newTime });
      }
  };

  const handleReaction = (e: any, emoji: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Clicked reaction:", emoji);
    const id = reactionIdCounter.current++;
    const left = 30 + Math.random() * 40;
    setFloatingReactions(prev => {
      const next = [...prev, { id, emoji, left }];
      console.log("New state:", next);
      return next;
    });
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 1650);
  };
  
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (playerRef.current) {
        playerRef.current.requestFullscreen().catch(err => console.log(err));
      }
    } else {
      document.exitFullscreen();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setShowControls(false), 2600);
  };
  
    const startOptimization = async (filePath: string, fileName: string, trackIndex?: number) => {
      setIsOptimizing(true);
      setOptimizeProgress(0);
      try {
        const optimizedPath = await (window as any).ipcRenderer.optimizeAudio(filePath, trackIndex);
        setLocalVideoUrl(`watchparty://local/${optimizedPath.replace(/\\/g, '/')}`);
        const dummyFile = new File([""], fileName, { type: "video/mp4" });
        webrtc.hostRoom(username, dummyFile);
        setIsOptimizing(false);
        setCurrentScreen('watching');
      } catch (err) {
        console.error("Optimization failed:", err);
        alert("Optimization failed: " + err);
        setIsOptimizing(false);
        setLocalVideoUrl(`watchparty://local/${filePath.replace(/\\/g, '/')}`);
        const dummyFile = new File([""], fileName, { type: "video/x-matroska" });
        webrtc.hostRoom(username, dummyFile);
        setCurrentScreen('watching');
      }
    };

    const handleScreenShareClick = async (e: any) => {
      e.preventDefault();
      try {
        const sources = await (window as any).ipcRenderer.getDesktopSources();
        setScreenSources(sources);
      } catch (err) {
        console.error("Failed to get sources", err);
        alert("Screen sharing is not supported in your browser/app version.");
      }
    };

    const startScreenShare = async (sourceId: string) => {
      setScreenSources(null);
      setYoutubeUrl(null);
      try {
        await (window as any).ipcRenderer.setDesktopSource(sourceId);
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { displaySurface: "monitor" } as any, 
          audio: true 
        });
        
        setMovieName("Screenshare");
        setIsScreenSharing(true);
        webrtc.hostRoom(username, new File([""], "Screenshare", { type: "video/mp4" }));
        
        // Let React render the video element first
        setCurrentScreen('watching');
        
        setTimeout(() => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true; // Mute to avoid feedback loop
            webrtc.setLocalStream(stream);
          }
        }, 100);

        stream.getVideoTracks()[0].onended = () => {
          // Handle screen share stop
          setCurrentScreen('dashboard');
          setIsScreenSharing(false);
          webrtc.socket?.emit('room:leave');
        };
      } catch (err) {
        console.error("Failed to share screen", err);
      }
    };

    const handleYouTubeClick = () => {
      setPromptConfig({
        message: "Enter a YouTube URL:",
        onSubmit: (url) => {
          setPromptConfig(null);
          if (url) {
            let normalizedUrl = url.trim();
            if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
              normalizedUrl = 'https://' + normalizedUrl;
            }
            setYoutubeUrl(normalizedUrl);
            setMovieName("YouTube Video");
            setIsPlaying(false);
            const dummyFile = new File([""], "youtube", { type: "video/youtube" });
            webrtc.hostRoom(username, dummyFile);
            webrtc.socket?.emit('room:youtube', normalizedUrl);
            setCurrentScreen('watching');
          }
        },
        onCancel: () => setPromptConfig(null)
      });
    };

    const handleHostClick = async (e: any) => {
      e.preventDefault();
      setYoutubeUrl(null);
      const isElectron = !!(window as any).ipcRenderer;
      if (isElectron) {
        const filePath = await (window as any).ipcRenderer.openFile();
        if (filePath) {
          const fileName = filePath.split('\\').pop().split('/').pop();
          const title = fileName.replace(/\.[^/.]+$/, "");
          setMovieName(title);
          setWatchHistory(prev => [{
            id: Date.now().toString(),
            movieName: title,
            date: Date.now(),
            partner: null,
            role: 'Host'
          }, ...prev]);

          if (fileName.toLowerCase().endsWith('.mkv')) {
            try {
              const tracks = await (window as any).ipcRenderer.getAudioTracks(filePath);
              if (tracks && tracks.length > 1) {
                setTrackSelection({ filePath, fileName, tracks });
              } else {
                startOptimization(filePath, fileName, tracks?.[0]?.index);
              }
            } catch (err) {
              console.error("Failed to get tracks", err);
              startOptimization(filePath, fileName);
            }
          } else {
            setLocalVideoUrl(`watchparty://local/${filePath.replace(/\\/g, '/')}`);
            const dummyFile = new File([""], fileName, { type: "video/mp4" });
            webrtc.hostRoom(username, dummyFile);
            setCurrentScreen('watching');
          }
        }
      } else {
        document.getElementById('fileInput2')?.click();
      }
    };

    const handleFileSelect = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const title = file.name.replace(/\.[^/.]+$/, "");
        setMovieName(title);
        setWatchHistory(prev => [{
          id: Date.now().toString(),
          movieName: title,
          date: Date.now(),
          partner: null,
          role: 'Host'
        }, ...prev]);
        const url = URL.createObjectURL(file);
        setLocalVideoUrl(url);
        webrtc.hostRoom(username, file);
        setCurrentScreen('watching');
      }
    };

  const startJoin = () => {
    if (joinCode) {
      webrtc.joinRoom(joinCode, username);
      setCurrentScreen('watching');
    }
  };

  useEffect(() => {
    const isElectron = !!(window as any).ipcRenderer;
    if (!isElectron) return;
    const cleanup = (window as any).ipcRenderer.onMediaProgress((percent: number) => {
      setOptimizeProgress(percent);
    });
    return cleanup;
  }, []);

  const sendMessage = () => {
    if (chatInput.trim()) {
      webrtc.sendChatMessage(chatInput, username);
      setChatInput('');
    }
  };

  const emberParticles = useMemo(() => {
    return Array.from({length: 14}).map((_, i) => (
      <div key={i} className="ember-particle" style={{
        left: `${5 + Math.random()*70}%`,
        animationDuration: `${5 + Math.random()*5}s`,
        animationDelay: `${Math.random()*6}s`
      }}></div>
    ));
  }, []);

  return (
    <ErrorBoundary>
      {trackSelection && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitAppRegion: 'no-drag' as any}}>
          <div style={{background: 'var(--panel-bg)', padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}}>
            <h2 style={{marginTop: 0, marginBottom: '16px', fontSize: '20px', color: 'var(--cream)'}}>Select Audio Track</h2>
            <p style={{color: 'var(--muted)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5}}>
              This movie has multiple audio tracks. Converting all of them takes 15+ minutes. Select the one you want to listen to for an ultra-fast conversion:
            </p>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px'}}>
              {trackSelection.tracks.map((t: any, i: number) => (
                <button key={i} onClick={() => {
                  setTrackSelection(null);
                  startOptimization(trackSelection.filePath, trackSelection.fileName, t.index);
                }} style={{background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '8px', color: 'var(--cream)', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div>
                    <strong style={{display: 'block', fontSize: '14px'}}>{t.tags?.title || `Track ${i + 1}`}</strong>
                    <span style={{fontSize: '12px', color: 'var(--muted)'}}>Language: {t.tags?.language?.toUpperCase() || 'Unknown'} • Format: {t.codec_name?.toUpperCase()}</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              ))}
            </div>
            <button onClick={() => {
              setTrackSelection(null);
              startOptimization(trackSelection.filePath, trackSelection.fileName);
            }} style={{background: 'none', border: 'none', color: 'var(--ember-bright)', marginTop: '24px', width: '100%', cursor: 'pointer', padding: '8px', fontSize: '14px'}}>
              Convert all tracks (takes ~15 minutes)
            </button>
          </div>
        </div>
      )}
      {screenSources && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitAppRegion: 'no-drag' as any}}>
          <div style={{background: 'var(--panel-bg)', padding: '24px', borderRadius: '12px', width: '700px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
              <h2 style={{margin: 0, fontSize: '20px', color: 'var(--cream)'}}>Select Window to Share</h2>
              <button onClick={() => setScreenSources(null)} style={{background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer'}}>✕</button>
            </div>
            <p style={{color: 'var(--muted)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5}}>
              Choose a window or screen to broadcast to your room. Audio from this window will be shared automatically.
            </p>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px'}}>
              {screenSources.map((s: any, i: number) => (
                <div key={i} onClick={() => startScreenShare(s.id)} style={{background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                  <div style={{height: '120px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    {s.thumbnail ? <img src={s.thumbnail} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}} /> : <span style={{color: 'var(--muted)'}}>No preview</span>}
                  </div>
                  <div style={{padding: '8px', fontSize: '12px', color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center'}}>
                    {s.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
        <div className={`app-window ${currentScreen === 'login' ? 'at-login' : ''} ${currentScreen === 'watching' ? 'is-watching' : ''} ${isMaximized ? 'maximized' : ''}`} id="appWindow">
          {!Capacitor.isNativePlatform() && (
        <div className="titlebar">
          <div className="tb-brand"><img src="/icon-64x64.png" alt="Hearth Logo" className="tb-mark" style={{background: 'none', boxShadow: 'none'}} />Hearth</div>
          <div className="tb-controls">
            <button className="tb-btn" aria-label="Minimize"><svg viewBox="0 0 11 1"><rect width="11" height="1" fill="currentColor"/></svg></button>
            <button className="tb-btn" aria-label="Maximize" onClick={() => setIsMaximized(!isMaximized)}><svg viewBox="0 0 11 11"><rect x="0.5" y="0.5" width="10" height="10" fill="none" stroke="currentColor"/></svg></button>
            <button className="tb-btn close" aria-label="Close"><svg viewBox="0 0 11 11"><line x1="0" y1="0" x2="11" y2="11" stroke="currentColor"/><line x1="11" y1="0" x2="0" y2="11" stroke="currentColor"/></svg></button>
          </div>
        </div>
        )}

        <div className="window-body">
          {currentScreen !== 'login' && (
            <aside className="sidebar">
              <div className="sb-profile">
                <div className="sb-avatar" style={{ overflow: 'hidden' }}>
                  {avatar?.startsWith('data:') ? <img src={avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (avatar || username.charAt(0).toUpperCase())}
                </div>
                <div className="sb-profile-info">
                  <div className="sb-profile-name">{username}</div>
                  <div className="sb-profile-status"><i></i>Online</div>
                </div>
              </div>
              <label className="sb-host-btn" onClick={handleHostClick} style={{cursor: 'pointer'}}>
                ▶ <span>Host a movie night</span>
                <input id="fileInput" type="file" accept="video/*" style={{display: 'none'}} onChange={handleFileSelect} />
              </label>
              <nav className="sb-nav">
                <button className={`sb-nav-item ${currentScreen === 'home' ? 'active' : ''}`} onClick={() => setCurrentScreen('home')}><span className="sb-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></span><span className="sb-label">Home</span></button>
                <button className={`sb-nav-item ${currentScreen === 'friends' ? 'active' : ''}`} onClick={() => setCurrentScreen('friends')}><span className="sb-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span><span className="sb-label">Friends</span></button>
                <button className={`sb-nav-item ${currentScreen === 'profile' ? 'active' : ''}`} onClick={() => setCurrentScreen('profile')}><span className="sb-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></span><span className="sb-label">Profile</span></button>
              </nav>
              <div className="sb-spacer"></div>
              <button className={`sb-nav-item ${currentScreen === 'settings' ? 'active' : ''}`} onClick={() => setCurrentScreen('settings')} style={{ opacity: 0.6, width: '100%', marginBottom: '16px' }}><span className="sb-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span><span className="sb-label">Settings</span></button>
              <div className="sb-stats">
                <div className="sb-stat"><div className="sb-stat-num">24</div><div className="sb-stat-label">Nights</div></div>
                <div className="sb-stat"><div className="sb-stat-num" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>4<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"></path></svg></div><div className="sb-stat-label">Streak</div></div>
              </div>
            </aside>
          )}

          <main className="content">
            {isOptimizing ? (
              <section className="view active" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div className="ember-field">{emberParticles}</div>
                <h2 style={{ color: 'var(--cream)', marginBottom: '16px' }}>Optimizing Audio Tracks...</h2>
                <p style={{ color: 'var(--muted)', marginBottom: '32px', textAlign: 'center', maxWidth: '400px' }}>
                  Converting Dolby Digital tracks to AAC so they play flawlessly in WatchParty. This takes just a moment!
                </p>
                <div style={{ width: '300px', height: '8px', background: 'var(--surface-3)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${optimizeProgress}%`, background: 'var(--ember-bright)', transition: 'width 0.3s ease' }}></div>
                </div>
                <div style={{ marginTop: '12px', color: 'var(--ember)', fontSize: '14px', fontWeight: 600 }}>{optimizeProgress}%</div>
              </section>
            ) : (
            <>
            <section className={`view ${currentScreen === 'login' ? 'active' : ''}`}>
              <div className="login-split">
                <div className="login-art">
                  <div className="ember-field">{emberParticles}</div>
                  <img src="/icon-192x192.png" alt="Hearth Logo" className="login-art-mark" style={{background: 'none', boxShadow: 'none'}} />
                  <h1>A private cinema<br/><em>for two</em>, on your desktop.</h1>
                  <p>Sign in to pick up where you left off — your rooms, your friends, and tonight's watch party are all one click away.</p>
                  <div className="login-art-sprockets"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
                </div>
                <div className="login-form-side">
                  <div className="login-card">
                    <div className="login-title">{authMode === 'login' ? 'Welcome back' : 'Create an Account'}</div>
                    <div className="login-sub">{authMode === 'login' ? 'Sign in to Hearth' : 'Join the private cinema'}</div>
                    
                    {authError && <div style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '12px', background: 'rgba(255,0,0,0.1)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,0,0,0.2)' }}>{authError}</div>}
                    
                    <div className="login-field">
                      <label htmlFor="email">Email</label>
                      <input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
                    </div>
                    
                    {authMode === 'register' && (
                      <div className="login-field">
                        <label htmlFor="username">Username</label>
                        <input id="username" type="text" placeholder="e.g. marshmello" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
                      </div>
                    )}

                    <div className="login-field">
                      <label htmlFor="password">Password</label>
                      <input id="password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
                    </div>

                    {authMode === 'register' && (
                      <div className="login-field">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
                      </div>
                    )}

                    <button className="login-submit" onClick={handleAuth}>{authMode === 'login' ? 'Sign in' : 'Create Account'}</button>
                    
                    <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--muted)' }}>
                      {authMode === 'login' ? (
                        <span>Don't have an account? <a href="#" style={{ color: 'var(--ember-bright)', textDecoration: 'none', fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setAuthMode('register'); setAuthError(''); }}>Sign up</a></span>
                      ) : (
                        <span>Already have an account? <a href="#" style={{ color: 'var(--ember-bright)', textDecoration: 'none', fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setAuthMode('login'); setAuthError(''); }}>Sign in</a></span>
                      )}
                    </div>

                    <div className="login-divider"><div></div><span>or</span><div></div></div>
                    <div className="login-field">
                      <label>Join Code</label>
                      <input type="text" placeholder="e.g. ABC-123" value={joinCode} onChange={e => setJoinCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && startJoin()} />
                    </div>
                    <button className="login-ghost" onClick={startJoin}>🔗 Join directly with link</button>
                  </div>
                </div>
              </div>
            </section>

            <section className={`view ${currentScreen === 'home' ? 'active' : ''}`}>
              <div className="view-inner">
                <div className="home-topbar">
                  <div className="home-greeting">
                    <h1>Good evening, {username}</h1>
                    <p>Here's what's happening tonight.</p>
                  </div>
                </div>

                {webrtc.roomCode && (
                  <div className="hero-live" onClick={() => setCurrentScreen('watching')}>
                    <div className="hero-live-glow"></div>
                    <div className="hero-live-text">
                      <div className="hl-label">🎬 Your Room</div>
                      <div className="hl-title">Code: {webrtc.roomCode}</div>
                      <span className="hl-btn">▶ Go to theater</span>
                    </div>
                    <div className="hero-live-preview">
                      <div className="hlp-sprocket top"></div><div className="hlp-sprocket bottom"></div>
                      <div className="hlp-play">▶</div>
                    </div>
                  </div>
                )}

                <div className="quick-actions" style={{display: 'flex', gap: '16px', marginTop: '24px'}}>
                  {!Capacitor.isNativePlatform() && (
                    <label className="qa-card" onClick={handleHostClick} style={{cursor: 'pointer', flex: 1}}>
                      <div className="qa-icon" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
                      </div>
                      <div><div className="qa-title">Host</div><div className="qa-sub">Play a file</div></div>
                      <input id="fileInput2" type="file" accept="video/*" style={{display: 'none'}} onChange={handleFileSelect} />
                    </label>
                  )}
                  <div className="qa-card" onClick={() => {
                    setPromptConfig({
                      message: 'Enter join code:',
                      onSubmit: (code) => {
                        setPromptConfig(null);
                        if (code) { setJoinCode(code); startJoin(); }
                      },
                      onCancel: () => setPromptConfig(null)
                    });
                  }} style={{cursor: 'pointer', flex: 1}}>
                    <div className="qa-icon" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div><div className="qa-title">Join</div><div className="qa-sub">Watch with a friend</div></div>
                  </div>
                  {!Capacitor.isNativePlatform() && (
                    <div className="qa-card" onClick={handleScreenShareClick} style={{cursor: 'pointer', flex: 1}}>
                      <div className="qa-icon" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                      </div>
                      <div><div className="qa-title">Share</div><div className="qa-sub">Stream your screen</div></div>
                    </div>
                  )}
                  <div className="qa-card" onClick={handleYouTubeClick} style={{cursor: 'pointer', flex: 1}}>
                    <div className="qa-icon" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
                    </div>
                    <div><div className="qa-title">YouTube</div><div className="qa-sub">Watch together</div></div>
                  </div>
                </div>
              </div>
            </section>

            <section className={`view ${currentScreen === 'friends' ? 'active' : ''}`}>
              <div className="view-inner" style={{padding: '40px'}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div>
                    <h1 style={{margin: 0, marginBottom: '8px'}}>Friends</h1>
                    <p style={{margin: 0, color: 'var(--muted)'}}>Manage your contacts and invite them to your rooms.</p>
                  </div>
                  <div className="join-code-row" style={{ marginTop: 0 }}>
                    <input type="text" placeholder="Friend's username" value={newFriendName} onChange={e => setNewFriendName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddFriend()} />
                    <button onClick={handleAddFriend}>Add</button>
                  </div>
                </div>

                <div className="friends-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {friendsList.length === 0 ? (
                    <div style={{color: 'var(--muted-dim)', padding: '20px', gridColumn: '1 / -1', background: 'var(--surface-2)', borderRadius: '12px', textAlign: 'center'}}>
                      You haven't added any friends yet.
                    </div>
                  ) : (
                    friendsList.map(friend => (
                      <div key={friend} className="friend-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--surface-2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="sb-avatar" style={{ width: '40px', height: '40px', fontSize: '18px' }}>{friend.charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--cream)', marginBottom: '4px' }}>{friend}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted-dim)' }}>Offline</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
            
            <section className={`view ${currentScreen === 'profile' ? 'active' : ''}`}>
              <div className="view-inner" style={{padding: '40px'}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', position: 'relative' }}>
                    
                    <div style={{ position: 'relative' }}>
                      <div 
                        className="sb-avatar" 
                        style={{ width: '64px', height: '64px', fontSize: '32px', cursor: 'pointer', overflow: 'hidden' }}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        {avatar?.startsWith('data:') ? <img src={avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (avatar || username.charAt(0).toUpperCase())}
                      </div>
                      <div 
                        style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--surface-2)', borderRadius: '50%', padding: '6px', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--muted)', display: 'flex', pointerEvents: 'none' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                      </div>
                      <input type="file" accept="image/*" ref={avatarInputRef} style={{ display: 'none' }} onChange={handleAvatarUpload} />
                    </div>

                    <div style={{ paddingTop: '4px' }}>
                      {isEditingProfile ? (
                        <input 
                          type="text" 
                          value={username} 
                          onChange={e => setUsername(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && setIsEditingProfile(false)}
                          onBlur={() => setIsEditingProfile(false)}
                          autoFocus
                          style={{ background: 'var(--surface-2)', border: '1px solid rgba(232, 121, 62, 0.4)', color: 'var(--cream)', padding: '4px 8px', borderRadius: '6px', fontSize: '24px', fontWeight: 'bold', width: '200px', margin: 0, outline: 'none' }} 
                        />
                      ) : (
                        <h1 style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setIsEditingProfile(true)}>
                          {username} 
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </h1>
                      )}
                      <div style={{ fontSize: '14px', color: 'var(--muted-dim)', marginTop: '4px' }}>Hearth Member</div>
                    </div>
                  </div>
                  <button className="login-submit" style={{width:'auto'}} onClick={handleSignOut}>Sign Out</button>
                </div>
                
                <h3 style={{ marginBottom: '16px', color: 'var(--muted)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Watch History</h3>
                {watchHistory.length === 0 ? (
                  <p style={{ color: 'var(--muted-dim)' }}>You haven't watched any movies yet. Host a room to get started!</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {watchHistory.map(session => (
                      <div key={session.id} style={{
                        background: 'var(--surface-2)',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid rgba(255,255,255,0.03)'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--cream)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            {session.movieName}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{new Date(session.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        </div>
                        {session.partner ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Watched with</div>
                            <div style={{
                              background: 'rgba(232, 121, 62, 0.1)',
                              color: 'var(--ember-bright)',
                              padding: '6px 12px',
                              borderRadius: '999px',
                              fontSize: '13px',
                              fontWeight: 600
                            }}>{session.partner}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '13px', color: 'var(--muted-dim)', fontStyle: 'italic' }}>Host - No partner yet</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className={`view ${currentScreen === 'settings' ? 'active' : ''}`}>
              <div className="view-inner" style={{padding: '40px', maxWidth: '600px'}}>
                <h1 style={{marginBottom: '32px'}}>Settings</h1>
                
                <div className="setting-group" style={{ marginBottom: '32px' }}>
                  <h3 style={{ color: 'var(--muted)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Preferences</h3>
                  
                  <div className="setting-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--surface-2)', borderRadius: '12px', marginBottom: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--cream)', marginBottom: '4px' }}>Chat Toast Notifications</div>
                      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Show pop-ups for new messages when chat is hidden.</div>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={appSettings.enableToasts} onChange={e => setAppSettings({...appSettings, enableToasts: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>
                  
                  <div className="setting-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--surface-2)', borderRadius: '12px', marginBottom: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--cream)', marginBottom: '4px' }}>Mute Video on Join</div>
                      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Automatically mute the player when joining or hosting a room.</div>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={appSettings.muteOnJoin} onChange={e => setAppSettings({...appSettings, muteOnJoin: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className={`view watch-view ${currentScreen === 'watching' ? 'active' : ''}`} style={{display: currentScreen === 'watching' ? 'flex' : 'none'}}>
              <div className="watch-video-col">
                <div className="watch-topbar">
                  <button className="back-btn" onClick={() => { setYoutubeUrl(null); setCurrentScreen('home'); }}>←</button>
                  <div className="watch-title"><div className="who">{webrtc.isHost ? 'Your movie night' : 'Watching'}</div><div className="sub" style={{cursor: 'pointer', userSelect: 'all'}} title="Click to copy" onClick={() => { const code = stableRoomCode || joinCode; if (code) navigator.clipboard?.writeText(code); }}>Code: {stableRoomCode || joinCode || '…'}</div></div>
                  <button className="theater-toggle" onClick={() => setIsChatHidden(!isChatHidden)}>{isChatHidden ? '💬 Show chat' : '💬 Hide chat'}</button>
                </div>
                <div ref={playerRef} className={`video-area ${showControls ? 'show-controls' : ''}`} onMouseMove={handleMouseMove} onMouseLeave={() => { clearTimeout(hoverTimeout.current); setShowControls(false); }} onDoubleClick={handleDoubleTap}>
                  <div className="sprocket-row top"></div>
                  {youtubeUrl ? (
                    <ReactPlayer
                      ref={reactPlayerRef}
                      src={youtubeUrl}
                      playing={isPlaying}
                      playbackRate={ytPlaybackRate}
                      volume={volume}
                      muted={isMuted}
                      width="100%"
                      height="100%"
                      controls={useNativeControls}
                      onTimeUpdate={(e: any) => {
                        setCurrentTime(e.target.currentTime);
                      }}
                      onDurationChange={(e: any) => setDuration(e.target.duration)}
                      style={{ background: '#000', pointerEvents: 'none' }}
                      config={{
                        youtube: {
                          playerVars: { 
                            modestbranding: 1,
                            controls: useNativeControls ? 1 : 0,
                            rel: 0,
                            iv_load_policy: 3,
                            disablekb: useNativeControls ? 0 : 1,
                            fs: useNativeControls ? 1 : 0
                          }
                        }
                      }}
                    />
                  ) : (
                    <video 
                      ref={webrtc.isHost ? localVideoRef : remoteVideoRef}
                      src={webrtc.isHost ? localVideoUrl! : undefined}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onLoadedData={webrtc.isHost ? handleVideoLoaded : undefined}
                      autoPlay
                      playsInline
                      muted={webrtc.isHost ? false : isMuted}
                      controls={useNativeControls}
                      style={{width: '100%', height: '100%', objectFit: 'contain', background: '#000'}}
                    />
                  )}

                  {useNativeControls && (
                    <button 
                      onClick={() => setUseNativeControls(false)}
                      style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10000, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 16px', borderRadius: '8px', color: 'var(--cream)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', backdropFilter: 'blur(10px)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                      Back to Hearth Controls
                    </button>
                  )}

                  {!useNativeControls && (
                    <>
                      <div className="reaction-row" onDoubleClick={(e) => e.stopPropagation()}>
                        <button className="reaction-btn" onClick={(e) => handleReaction(e, '❤️')}>❤️</button>
                        <button className="reaction-btn" onClick={(e) => handleReaction(e, '😂')}>😂</button>
                        <button className="reaction-btn" onClick={(e) => handleReaction(e, '😱')}>😱</button>
                        <button className="reaction-btn" onClick={(e) => handleReaction(e, '🤫')}>🤫</button>
                      </div>
                      {floatingReactions.map(r => (
                        <span key={r.id} className="floating-reaction" style={{left: `${r.left}%`}}>{r.emoji}</span>
                      ))}
                      {toastMessage && (
                        <div className="toast">
                          <span style={{fontWeight: 600}}>{toastMessage.senderName}</span>: {toastMessage.text}
                        </div>
                      )}
                      {isFullscreen && !isChatHidden && (
                        <div className="floating-fullscreen-chat" onDoubleClick={(e) => e.stopPropagation()}>
                          <div className="messages" style={{flex: 1, overflowY: 'auto', padding: '16px'}}>
                            {webrtc.chatMessages && webrtc.chatMessages.map((m: any, i: number) => {
                              const showName = i === 0 || webrtc.chatMessages[i - 1].senderName !== m.senderName;
                              return (
                                <div key={i} className={`msg ${m.senderName === username ? 'own' : ''}`} style={{ marginTop: showName ? '0px' : '-10px' }}>
                                  {showName && <div className="msg-meta"><span className="msg-name">{m.senderName}</span></div>}
                                  <div className="msg-bubble" style={{ borderTopLeftRadius: !showName && m.senderName !== username ? '4px' : '14px', borderTopRightRadius: !showName && m.senderName === username ? '4px' : '14px' }}>{m.text}</div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="chat-input-row" style={{background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                            <input className="chat-input" type="text" placeholder="Say something…" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                            <button className="send-btn" onClick={sendMessage}>➤</button>
                          </div>
                        </div>
                      )}
                      <button className="center-play" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
                      <div className="video-controls" onDoubleClick={(e) => e.stopPropagation()}>
                        <div className="scrub-track" onClick={handleScrub}>
                          <div className="scrub-fill" style={{width: `${duration ? (currentTime / duration) * 100 : 0}%`}}></div>
                          <div className="scrub-thumb" style={{left: `${duration ? (currentTime / duration) * 100 : 0}%`}}></div>
                        </div>
                        <div className="time-row">
                          <span className="mono">{formatTime(currentTime)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span className="mono">{formatTime(duration)}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onDoubleClick={(e) => e.stopPropagation()}>
                              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={toggleMute} title="Toggle Mute">
                                {isMuted || volume === 0 ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                )}
                              </button>
                              <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={handleVolumeChange} style={{ width: '60px', height: '4px', accentColor: 'var(--ember-bright)', cursor: 'pointer' }} />
                            </div>
                            <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => setIsChatHidden(!isChatHidden)} title="Toggle Chat">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            </button>
                            <div style={{ position: 'relative' }}>
                              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => setShowTrackMenu(!showTrackMenu)} title="Audio Tracks">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                              </button>
                              
                              {showTrackMenu && !youtubeUrl && (
                                <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '8px', background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px', minWidth: '150px', zIndex: 100 }}>
                                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 600 }}>Audio Tracks</div>
                                  {audioTracks.length > 0 ? audioTracks.map((track, i) => (
                                    <div 
                                      key={i} 
                                      onClick={() => {
                                        for (let j = 0; j < audioTracks.length; j++) audioTracks[j].enabled = false;
                                        track.enabled = true;
                                        setShowTrackMenu(false);
                                      }}
                                      style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', background: track.enabled ? 'rgba(232, 121, 62, 0.2)' : 'transparent', color: track.enabled ? 'var(--ember-bright)' : 'var(--cream)', fontSize: '12px' }}
                                    >
                                      {track.language || `Track ${i + 1}`} {track.label ? `(${track.label})` : ''}
                                    </div>
                                  )) : (
                                    <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '4px' }}>No multi-track audio detected or unsupported by Chromium engine.</div>
                                  )}
                                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '8px 0' }}></div>
                                  <div 
                                    onClick={() => setUseNativeControls(true)}
                                    style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                                    Use Native Player
                                  </div>
                                </div>
                              )}
                              
                              {showTrackMenu && youtubeUrl && (
                                <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '8px', background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', minWidth: '180px', zIndex: 100 }}>
                                  <div style={{ fontSize: '14px', color: 'white', marginBottom: '12px', fontWeight: 600 }}>YouTube Settings</div>
                                  
                                  <div style={{marginBottom: '12px'}}>
                                    <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '4px'}}>Quality (Auto-managed)</div>
                                    <select 
                                      style={{width: '100%', background: 'var(--surface-1)', color: 'white', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', outline: 'none', cursor: 'pointer'}}
                                      defaultValue="auto"
                                      onChange={(e) => {
                                        const ytNode = document.querySelector('youtube-video') as any;
                                        if (ytNode?.api?.setPlaybackQuality) {
                                          ytNode.api.setPlaybackQuality(e.target.value);
                                        }
                                      }}
                                    >
                                      <option value="auto">Auto</option>
                                      <option value="highres">High Res</option>
                                      <option value="hd1080">1080p</option>
                                      <option value="hd720">720p</option>
                                      <option value="large">480p</option>
                                      <option value="medium">360p</option>
                                      <option value="small">240p</option>
                                      <option value="tiny">144p</option>
                                    </select>
                                  </div>

                                  <div>
                                    <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '4px'}}>Playback Speed</div>
                                    <select 
                                      style={{width: '100%', background: 'var(--surface-1)', color: 'white', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', outline: 'none', cursor: 'pointer'}}
                                      value={ytPlaybackRate}
                                      onChange={(e) => {
                                        const rate = parseFloat(e.target.value);
                                        setYtPlaybackRate(rate);
                                      }}
                                    >
                                      <option value="0.25">0.25x</option>
                                      <option value="0.5">0.5x</option>
                                      <option value="1">Normal</option>
                                      <option value="1.25">1.25x</option>
                                      <option value="1.5">1.5x</option>
                                      <option value="2">2x</option>
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={handleFullscreen} title="Toggle Fullscreen">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {!isFullscreen && !isChatHidden && (
                <div className="chat-panel">
                  <div className="chat-head"><div className="chat-head-title">CHAT</div></div>
                  <div className="messages">
                    {webrtc.chatMessages && webrtc.chatMessages.map((m: any, i: number) => {
                      const showName = i === 0 || webrtc.chatMessages[i - 1].senderName !== m.senderName;
                      return (
                        <div key={i} className={`msg ${m.senderName === username ? 'own' : ''}`} style={{ marginTop: showName ? '0px' : '-10px' }}>
                          {showName && <div className="msg-meta"><span className="msg-name">{m.senderName}</span></div>}
                          <div className="msg-bubble" style={{ borderTopLeftRadius: !showName && m.senderName !== username ? '4px' : '14px', borderTopRightRadius: !showName && m.senderName === username ? '4px' : '14px' }}>{m.text}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chat-input-row">
                    <input className="chat-input" type="text" placeholder="Say something…" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                    <button className="send-btn" onClick={sendMessage}>➤</button>
                  </div>
                </div>
              )}
            </section>
            </>
            )}
          </main>
        </div>
        
        <div className="curtain curtain-left"></div>
        <div className="curtain curtain-right"></div>
      </div>

      {promptConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, backdropFilter: 'blur(10px)' }}>
          <div style={{ background: 'var(--surface-1)', padding: '24px', borderRadius: '16px', width: '400px', maxWidth: '90%', border: '1px solid var(--border)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{promptConfig.message}</h3>
            <input 
              autoFocus
              type="text" 
              id="custom-prompt-input"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', color: 'white', marginBottom: '16px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') promptConfig.onSubmit((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') promptConfig.onCancel();
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button style={{ background: 'transparent', color: 'var(--muted)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', border: 'none' }} onClick={promptConfig.onCancel}>Cancel</button>
              <button style={{ background: 'var(--primary)', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', border: 'none' }} onClick={() => promptConfig.onSubmit((document.getElementById('custom-prompt-input') as HTMLInputElement).value)}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
