# Test Plan: Inspect RealtimeSession Object

## Goal
Find out what properties/methods RealtimeSession exposes for controlling audio input.

## Test Steps

1. After `session.connect()`, log the session object
2. Check for:
   - `session.getMediaStream()` or similar
   - `session.mediaStream` property
   - `session.mute()` / `session.unmute()` methods
   - `session.audioTracks` or similar
   - Any WebRTC-related properties

3. Also check:
   - Can we access the underlying WebRTC peer connection?
   - Does the session expose RTCPeerConnection?
   - Can we get MediaStream from RTCPeerConnection?

## Implementation

Add this after line 277 in useVoiceAgent.ts:

```typescript
await session.connect({ apiKey: ephemeralKey });

// INSPECT SESSION OBJECT
console.log("=== SESSION INSPECTION ===");
console.log("Session object:", session);
console.log("Session keys:", Object.keys(session));
console.log("Session prototype:", Object.getPrototypeOf(session));
console.log("Session methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(session)));

// Check for MediaStream
if ('getMediaStream' in session) {
  console.log("getMediaStream exists:", typeof session.getMediaStream);
}
if ('mediaStream' in session) {
  console.log("mediaStream property:", session.mediaStream);
}
if ('mute' in session) {
  console.log("mute method exists:", typeof session.mute);
}
if ('unmute' in session) {
  console.log("unmute method exists:", typeof session.unmute);
}

// Check for RTCPeerConnection
if ('peerConnection' in session) {
  console.log("peerConnection:", session.peerConnection);
}
if ('pc' in session) {
  console.log("pc:", session.pc);
}

// Try to get MediaStream from RTCPeerConnection
try {
  const pc = (session as any).peerConnection || (session as any).pc;
  if (pc && pc.getSenders) {
    const senders = pc.getSenders();
    console.log("RTCPeerConnection senders:", senders);
    senders.forEach((sender: any, i: number) => {
      if (sender.track) {
        console.log(`Sender ${i} track:`, sender.track);
        console.log(`Sender ${i} track enabled:`, sender.track.enabled);
      }
    });
  }
} catch (e) {
  console.log("Error accessing RTCPeerConnection:", e);
}

console.log("=== END INSPECTION ===");
```

## Expected Results

We need to find:
- How to access the MediaStream used by the session
- OR how to control audio tracks directly
- OR if there's a built-in mute/unmute method

