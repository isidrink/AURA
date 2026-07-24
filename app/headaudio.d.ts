declare module "@met4citizen/headaudio/dist/headaudio.min.mjs" {
  export class HeadAudio extends AudioWorkletNode {
    onvalue?: (key: string, value: number) => void;
    onstarted?: (data: unknown) => void;
    onended?: (data: unknown) => void;
    constructor(
      context: BaseAudioContext,
      options?: AudioWorkletNodeOptions,
    );
    loadModel(url: string): Promise<void>;
    update(deltaMilliseconds: number): void;
    start(): void;
    stop(): void;
    resetAll(): void;
  }
}
