// Types for the parts of gifenc (MIT, https://github.com/mattdesl/gifenc) we use.
declare module "gifenc" {
  export type Palette = number[][];
  export type FrameOptions = {
    palette?: Palette | null;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    colorDepth?: number;
  };
  export type Encoder = {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): Encoder;
}
