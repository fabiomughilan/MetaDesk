import Peer, { type MediaConnection } from "peerjs";
import Network from "../services/Network";
import store from "../stores";
import { setVideoConnected } from "../stores/UserStore";
import "./WebRTC.css";

interface VideoConnection {
  call: MediaConnection;
  video: HTMLVideoElement;
}

export default class WebRTC {
  private myPeer!: Peer;
  private peers: Map<string, VideoConnection>;
  private onCalledPeers: Map<string, VideoConnection>;
  private videoGrid: HTMLElement;
  private buttonGrid?: HTMLElement;
  private myVideo: HTMLVideoElement;
  private myStream?: MediaStream;
  private network: Network;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  private currentUserId: string;

  constructor(userId: string, network: Network) {
    this.peers = new Map();
    this.onCalledPeers = new Map();
    this.myVideo = document.createElement("video");
    this.network = network;
    this.currentUserId = userId;
    this.videoGrid = this.createOrGetElement("video-grid");
    const sanitizedId = this.replaceInvalidId(userId);
    
    this.initializePeer(sanitizedId);
  }

  private initializePeer(sanitizedId: string) {
    // PeerJS configuration with multiple server options for better reliability
    const peerConfig = {
      host: import.meta.env.VITE_PEER_HOST || '0.peerjs.com',
      port: Number(import.meta.env.VITE_PEER_PORT) || 443,
      path: '/metadesk',
      secure: true,
      debug: 0, // Reduced debug level to minimize console spam
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: 'stun:stun.cloudflare.com:3478' }
        ],
        iceCandidatePoolSize: 10,
        // Add connection timeout settings
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle'
      },
      // Add connection timeout
      timeout: 10000
    };

    console.log('🎥 Initializing WebRTC PeerJS connection...');
    console.log('📡 Using PeerJS host:', peerConfig.host);
    
    // PeerJS configuration with reconnection options
    this.myPeer = new Peer(sanitizedId, peerConfig);

    this.myPeer.on("open", (id) => {
      console.log("✅ WebRTC PeerJS initialized:", { userId: this.currentUserId, sanitizedId: id });
      this.reconnectAttempts = 0; // Reset on successful connection
    });

    this.myPeer.on("call", (call) => {
      console.log("Incoming call from:", call.peer);
      if (this.myStream) {
        call.answer(this.myStream);
        const video = document.createElement("video");
        this.onCalledPeers.set(call.peer, { call, video });

        call.on("stream", (userVideoStream) => {
          console.log("Received stream from caller:", call.peer);
          this.addVideoStream(video, userVideoStream);
        });

        call.on("close", () => {
          console.log("Call closed by:", call.peer);
          video.remove();
          this.onCalledPeers.delete(call.peer);
        });

        call.on("error", (error) => {
          console.error("Call error from:", call.peer, error);
          video.remove();
          this.onCalledPeers.delete(call.peer);
        });
      } else {
        console.warn("Cannot answer call: No local stream available");
        call.close();
      }
    });

    this.myPeer.on("error", (error) => {
      // Enhanced error logging with more context
      console.error("❌ PeerJS error:", error.type, error.message);
      
      // Enhanced error categorization and handling
      switch (error.type) {
        case 'network':
          console.warn("🌐 Network error - attempting reconnection...");
          this.handlePeerReconnection();
          break;
        case 'disconnected':
          console.warn("🔌 PeerJS disconnected - attempting reconnection...");
          this.handlePeerReconnection();
          break;
        case 'server-error':
          console.warn("🖥️ Server error - attempting reconnection...");
          this.handlePeerReconnection();
          break;
        case 'socket-error':
          console.warn("🔌 Socket error - attempting reconnection...");
          this.handlePeerReconnection();
          break;
        case 'peer-unavailable':
          console.warn("🚫 Peer unavailable - this is normal when calling non-existent peers");
          break;
        case 'browser-incompatible':
          console.error("🚫 Browser incompatible with PeerJS - WebRTC features disabled");
          break;
        case 'invalid-id':
          console.error("🆔 Invalid peer ID - trying with sanitized ID");
          break;
        case 'unavailable-id':
          console.error("🆔 Peer ID unavailable - trying with new ID");
          this.recreatePeerWithNewId();
          break;
        default:
          console.error("🚫 Unhandled PeerJS error:", error);
      }
    });

    this.myPeer.on("disconnected", () => {
      console.log("🔌 PeerJS disconnected, attempting to reconnect...");
      this.handlePeerReconnection();
    });

    this.myPeer.on("close", () => {
      console.log("🔒 PeerJS connection closed");
      // Don't auto-reconnect on close as it might be intentional
    });

    this.myVideo.muted = true;
    this.initialize();
  }

  private handlePeerReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🚫 Max PeerJS reconnection attempts (${this.maxReconnectAttempts}) reached. Video features disabled.`);
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff with jitter
    const baseDelay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = Math.min(baseDelay + jitter, 30000); // Cap at 30 seconds
    
    console.log(`🔄 PeerJS reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay)}ms...`);
    
    setTimeout(() => {
      try {
        if (this.myPeer && (this.myPeer.disconnected || this.myPeer.destroyed)) {
          if (!this.myPeer.destroyed) {
            console.log("🔄 Attempting to reconnect existing peer...");
            this.myPeer.reconnect();
          } else {
            console.log("🔄 Peer destroyed, creating new instance...");
            this.recreatePeer();
          }
        }
      } catch (error) {
        console.error("❌ Failed to reconnect PeerJS:", error);
        // Try creating a new peer instance if reconnect fails
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log("🔄 Trying to recreate peer after reconnect failure...");
          this.recreatePeer();
        }
      }
    }, delay);
  }

  private recreatePeer() {
    console.log("🔄 Recreating PeerJS instance...");
    try {
      this.myPeer.destroy();
    } catch (error) {
      console.warn("Error destroying old peer:", error);
    }
    
    const sanitizedId = this.replaceInvalidId(this.currentUserId + '-' + Date.now());
    this.initializePeer(sanitizedId);
  }

  private recreatePeerWithNewId() {
    console.log("🔄 Recreating PeerJS instance with new ID...");
    try {
      this.myPeer.destroy();
    } catch (error) {
      console.warn("Error destroying old peer:", error);
    }
    
    // Generate a new unique ID with timestamp
    const newId = this.replaceInvalidId(this.currentUserId + '-retry-' + Date.now());
    console.log("🆔 Using new peer ID:", newId);
    this.initializePeer(newId);
  }

  private createOrGetElement(className: string): HTMLElement {
    let element = document.querySelector(`.${className}`) as HTMLElement;
    if (!element) {
      element = document.createElement("div");
      element.className = className;
      document.body.appendChild(element);
    }
    return element;
  }

  private replaceInvalidId(userId: string): string {
    return userId.replace(/[^a-zA-Z0-9]/g, "G");
  }

  public initialize(): void {
    this.myVideo.autoplay = true;
    this.myVideo.playsInline = true;
  }

  public async checkPreviousPermission(): Promise<boolean> {
    try {
      const permissions = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (permissions.state === 'granted') {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  public async getUserMedia(alertOnError: boolean = true): Promise<void> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia is not supported in this browser");
      }

      this.myStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log("Got media stream:", this.myStream);
      this.addVideoStream(this.myVideo, this.myStream);
      this.setUpButtons();
      store.dispatch(setVideoConnected(true));
      this.network.videoConnected();
    } catch (error) {
      console.error("getUserMedia error:", error);
      if (alertOnError) {
        if (error instanceof Error) {
          switch (error.name) {
            case "NotAllowedError":
              alert("Camera/microphone access denied. Please allow access in your browser settings.");
              break;
            case "NotFoundError":
              alert("No webcam or microphone found. Please connect a device and try again.");
              break;
            default:
              alert("Failed to access camera/microphone. Please check your device and permissions.");
          }
        } else {
          alert("An unknown error occurred while accessing your camera/microphone.");
        }
      }
    }
  }

  public connectToNewUser(userId: string): void {
    if (!this.myStream) {
      console.warn("Cannot connect to user: No local stream available");
      return;
    }
    const sanitizedId = this.replaceInvalidId(userId);
    if (this.peers.has(sanitizedId)) {
      console.log("Already connected to:", sanitizedId);
      return;
    }
    console.log("Calling peer:", sanitizedId);
    const call = this.myPeer.call(sanitizedId, this.myStream);
    const video = document.createElement("video");
    this.peers.set(sanitizedId, { call, video });
    
    call.on("stream", (userVideoStream: MediaStream) => {
      console.log("Received stream from:", sanitizedId);
      this.addVideoStream(video, userVideoStream);
    });
    
    call.on("error", (error: Error) => {
      console.error("Call error:", error);
      this.deleteVideoStream(sanitizedId);
    });

    call.on("close", () => {
      console.log("Call closed:", sanitizedId);
      this.deleteVideoStream(sanitizedId);
    });
  }

  private addVideoStream(video: HTMLVideoElement, stream: MediaStream): void {
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = video === this.myVideo;
    video.addEventListener("loadedmetadata", () => {
      video.play().catch(error => {
        console.error("Failed to play video:", error);
      });
    });
    this.videoGrid.appendChild(video);
  }

  public deleteVideoStream(userId: string): void {
    const sanitizedId = this.replaceInvalidId(userId);
    const peer = this.peers.get(sanitizedId);
    if (peer) {
      peer.call.close();
      peer.video.remove();
      this.peers.delete(sanitizedId);
    }
  }

  public deleteOnCalledVideoStream(userId: string): void {
    const sanitizedId = this.replaceInvalidId(userId);
    const peer = this.onCalledPeers.get(sanitizedId);
    if (peer) {
      peer.call.close();
      peer.video.remove();
      this.onCalledPeers.delete(sanitizedId);
    }
  }

  private setUpButtons(): void {
    // Create button grid only when needed
    if (!this.buttonGrid) {
      this.buttonGrid = this.createOrGetElement("button-grid");
    }
    this.buttonGrid.innerHTML = "";
    
    const audioButton = document.createElement("button");
    audioButton.setAttribute('title', 'Mute microphone');
    const audioIcon = document.createElement('span');
    audioIcon.className = 'material-icons';
    audioIcon.textContent = 'mic';
    audioButton.appendChild(audioIcon);
    audioButton.addEventListener("click", () => {
      if (this.myStream) {
        const audioTrack = this.myStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !audioTrack.enabled;
          audioIcon.textContent = audioTrack.enabled ? 'mic' : 'mic_off';
          audioButton.setAttribute('title', audioTrack.enabled ? 'Mute microphone' : 'Unmute microphone');
        }
      }
    });

    const videoButton = document.createElement("button");
    videoButton.setAttribute('title', 'Turn off camera');
    const videoIcon = document.createElement('span');
    videoIcon.className = 'material-icons';
    videoIcon.textContent = 'videocam';
    videoButton.appendChild(videoIcon);
    videoButton.addEventListener("click", () => {
      if (this.myStream) {
        const videoTrack = this.myStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !videoTrack.enabled;
          videoIcon.textContent = videoTrack.enabled ? 'videocam' : 'videocam_off';
          videoButton.setAttribute('title', videoTrack.enabled ? 'Turn off camera' : 'Turn on camera');
        }
      }
    });

    this.buttonGrid.appendChild(audioButton);
    this.buttonGrid.appendChild(videoButton);
  }
}