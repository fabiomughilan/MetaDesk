import Peer from "peerjs";
import Network from "../services/Network";
import store from "../stores";
import { setVideoConnected } from "../stores/UserStore";
import "./WebRTC.css";

interface VideoConnection {
  call: Peer.MediaConnection;
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
      host: import.meta.env.VITE_PEER_HOST || 'localhost',
      port: parseInt(import.meta.env.VITE_PEER_PORT || '9000'),
      path: '/metadesk',
      debug: 3,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
    this.myPeer = new Peer(sanitizedId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ],
        iceCandidatePoolSize: 10,
      },
      debug: 3 // Log everything for debugging
    });

    console.log("WebRTC initialized:", { userId, sanitizedId });

    this.myPeer.on("error", (err) => {
      console.error("PeerJS error:", err.type, err);
      if (err.type === 'network' || err.type === 'disconnected') {
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
    return userId.replace(/[^0-9a-z]/gi, "G");
  }

  public initialize(): void {
    this.myPeer.on("call", (call) => {
      if (!this.onCalledPeers.has(call.peer)) {
        call.answer(this.myStream);
        const video = document.createElement("video");
        this.onCalledPeers.set(call.peer, { call, video });
        call.on("stream", (userVideoStream) => {
          this.addVideoStream(video, userVideoStream);
        });
      }
    });
  }

  public async checkPreviousPermission(): Promise<void> {
    try {
      const permissions = await navigator.permissions.query({ name: "camera" as PermissionName });
      if (permissions.state === "granted") {
        await this.getUserMedia(false);
      }
    } catch (error) {
      console.log("Permission check failed:", error);
    }
  }

  public async getUserMedia(alertOnError = true): Promise<void> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("WebRTC is not supported in this browser");
      }
      console.log("Requesting user media...");
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
  }

  private addVideoStream(video: HTMLVideoElement, stream: MediaStream): void {
    video.srcObject = stream;
    video.playsInline = true;
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
          audioButton.classList.toggle("muted", !audioTrack.enabled);
        }
      }
    });
    
    const videoButton = document.createElement('button');
    videoButton.setAttribute('title', 'Turn off camera');
    const videoIcon = document.createElement('span');
    videoIcon.className = 'material-icons';
    videoIcon.textContent = 'videocam';
    videoButton.appendChild(videoIcon);
    videoButton.addEventListener('click', () => {
      if (!this.myStream) return

      try {
        const videoTrack = this.myStream.getVideoTracks()[0]
        if (videoTrack?.enabled) {
          // Stop and remove existing video track
          videoTrack.stop()
          this.myStream.removeTrack(videoTrack)
          this.myVideo.srcObject = null
          videoIcon.textContent = 'videocam_off'
          videoButton.classList.add('muted')
        } else {
          // Re-acquire camera access
          navigator.mediaDevices.getUserMedia({ video: true })
            .then(newStream => {
              try {
                const newVideoTrack = newStream.getVideoTracks()[0]
                if (!newVideoTrack) throw new Error('No video track in new stream')

                // Keep existing audio track if it exists
                const audioTrack = this.myStream?.getAudioTracks()[0]
                
                // Create new stream with new video track and existing audio
                this.myStream = new MediaStream()
                if (audioTrack) {
                  this.myStream.addTrack(audioTrack)
                }
                this.myStream.addTrack(newVideoTrack)
                
                // Update video element
                this.myVideo.srcObject = this.myStream
                
                // Update all peer connections with the new track
                this.peers.forEach(peer => {
                  if (peer.call.peerConnection) {
                    const sender = peer.call.peerConnection.getSenders()
                      .find(s => s.track?.kind === 'video')
                    if (sender) {
                      sender.replaceTrack(newVideoTrack)
                        .catch(err => console.error('Failed to replace video track:', err))
                    }
                  }
                })
              
                videoButton.innerText = 'Video off'
                videoButton.classList.remove('muted')
              } catch (err) {
                console.error('Error setting up new video track:', err)
                videoButton.classList.add('muted')
              }
            })
            .catch(err => {
              console.error('Failed to re-acquire camera:', err)
              videoButton.classList.add('muted')
            })
        }
      } catch (err) {
        console.error('Error toggling video:', err)
        videoButton.classList.add('muted')
      }
    })
    // Check initial track states
    if (this.myStream) {
      const audioTrack = this.myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioButton.classList.toggle("muted", !audioTrack.enabled);
      }
      const videoTrack = this.myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoButton.classList.toggle("muted", !videoTrack.enabled);
      }
    }

    this.buttonGrid.append(audioButton, videoButton);
  }
}
