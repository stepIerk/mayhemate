import Phaser from 'phaser';
import HomeScene from './scenes/HomeScene.js';
import GameScene from './scenes/GameScene.js';
import { BottomUiScene } from './scenes/BottomUiScene.js';
import { BootScene } from './scenes/BootScene.js';
import './style.css';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#1d1f27',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: [HomeScene, BootScene, GameScene, BottomUiScene],
};

new Phaser.Game(config);
