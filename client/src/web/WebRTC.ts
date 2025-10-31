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
  private buttonGrid: HTMLElement;
  private myVideo: HTMLVideoElement;
  private myStream?: MediaStream;
  private network: Network;

  constructor(userId: string, network: Network) {
    this.peers = new Map();
    this.onCalledPeers = new Map();
    this.myVideo = document.createElement("video");
    this.network = network;
    this.videoGrid = this.createOrGetElement("video-grid");
    this.buttonGrid = this.createOrGetElement("button-grid");
    const sanitizedId = this.replaceInvalidId(userId);
    this.myPeer = new Peer(sanitizedId);
    console.log("WebRTC initialized:", { userId, sanitizedId });
    this.myPeer.on("error", (err) => {
      console.error("PeerJS error:", err.type, err);
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
    call.on("stream", (userVideoStream) => {
      console.log("Received stream from:", sanitizedId);
      this.addVideoStream(video, userVideoStream);
    });
    call.on("error", (error) => {
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
    this.buttonGrid.innerHTML = "";
    const audioButton = document.createElement("button");
    audioButton.innerText = "Mute";
    audioButton.addEventListener("click", () => {
      if (this.myStream) {
        const audioTrack = this.myStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !audioTrack.enabled;
          audioButton.innerText = audioTrack.enabled ? "Mute" : "Unmute";
        }
      }
    });
    const videoButton = document.createElement("button");
    videoButton.innerText = "Video off";
    videoButton.addEventListener("click", () => {
      if (this.myStream) {
        const videoTrack = this.myStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !videoTrack.enabled;
          videoButton.innerText = videoTrack.enabled ? "Video off" : "Video on";
        }
      }
    });
    this.buttonGrid.append(audioButton, videoButton);
  }
}
