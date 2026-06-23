
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Point {
  x: number;
  y: number;
}

export type TileColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'cyan' | 'pink';

export interface LetterTile {
  id: string;
  char: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: TileColor;
  isDragging: boolean;
  inTray: boolean;
  trayIndex?: number;
  trayOwner?: 0 | 1;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
    __mpHandsWarm: any;   // pre-warmed Hands instance from index.html
    __mpReady: boolean;   // true once the dummy frame has been processed
  }
}
