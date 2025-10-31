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
  private myPeer: Peer;
  private peers: Map<string, VideoConnection>;
  private onCalledPeers: Map<string, VideoConnection>;
  private videoGrid: HTMLElement;
  private buttonGrid?: HTMLElement;
  private myVideo: HTMLVideoElement;
  private myStream?: MediaStream;
  private network: Network;

  constructor(userId: string, network: Network) {
    this.peers = new Map();
    this.onCalledPeers = new Map();
    this.myVideo = document.createElement("video");
    this.network = network;
    this.videoGrid = this.createOrGetElement("video-grid");
    const sanitizedId = this.replaceInvalidId(userId);
    
    // PeerJS configuration with reconnection options
    this.myPeer = new Peer(sanitizedId, {
      host: import.meta.env.VITE_PEER_HOST || '0.peerjs.com',
      port: Number(import.meta.env.VITE_PEER_PORT) || 443,
      path: '/metadesk',
      secure: true,
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          { urls: 'stun:stun.global.stun.twilio.com:3478' }
        ],
        iceCandidatePoolSize: 10
      }
    });

    this.myPeer.on("open", (id) => {
      console.log("WebRTC initialized:", { userId, sanitizedId: id });
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
      console.error("PeerJS error:", error);
      if (error.type === 'network' || error.type === 'disconnected') {
        console.log("Attempting to reconnect PeerJS...");
        this.myPeer.reconnect();
      }
    });

    this.myPeer.on("disconnected", () => {
      console.log("PeerJS disconnected, attempting to reconnect...");
      this.myPeer.reconnect();
    });

    this.myPeer.on("close", () => {
      console.log("PeerJS connection closed");
    });

    this.myVideo.muted = true;
    this.initialize();
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