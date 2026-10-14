// Type definitions for @designesy/focal

export interface FocalOptions {
  /** Document or element to watch. Default document. */
  root?: Document | Element;
  /** A Sill instance: focus lifts toward its light and the light follows keyboard focus. */
  sill?: unknown;
  ringWidth?: number;
  ringOffset?: number;
  /** Ring colours in order of preference; the first that keeps 3:1 under the ring wins. */
  ringColors?: string[];
  trail?: boolean;
  bloom?: boolean;
  /** Extra elevation in px for a focused lit element (with Sill). */
  lift?: number;
  followLight?: boolean;
  /** Scroll focus clear of sticky or fixed content that hides it. */
  fixObscured?: boolean;
  warnObscured?: boolean;
}

export declare const DEFAULTS: Required<Omit<FocalOptions, 'root' | 'sill'>>;

export declare class Focal {
  constructor(options?: FocalOptions);
  destroy(): void;
}

export type RGBA = [number, number, number, number];
export declare function parseColor(css: string): RGBA | null;
export declare function composite(top: RGBA, under: RGBA): RGBA;
export declare function luminance(rgb: ArrayLike<number>): number;
export declare function contrastRatio(a: ArrayLike<number>, b: ArrayLike<number>): number;
export declare function pickRing(candidates: (string | RGBA)[], under: RGBA[], adjacent?: RGBA[]): { color: string | RGBA; ratio: number; adjacentRatio: number; meets: boolean; index: number };
export declare function minimumIndicatorArea(w: number, h: number): number;
export declare function outlineArea(w: number, h: number, width: number, offset: number): number;
export declare function meetsFocusArea(w: number, h: number, width: number, offset: number): boolean;
export declare function travelDuration(dist: number): number;
export declare function edgeEntry(from: { x: number; y: number }, to: { x: number; y: number }, vw: number, vh: number, inset?: number): { x: number; y: number };
export declare function samplePoints(rect: { left: number; top: number; width: number; height: number }): { x: number; y: number }[];

export interface FocalMoveDetail { from: DOMRectInit | null; to: DOMRectInit }
export interface FocalObscuredDetail { element: Element; fraction: number; entirely: boolean; cover: Element | null }
