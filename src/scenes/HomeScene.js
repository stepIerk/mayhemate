import Phaser from 'phaser';

export default class HomeScene extends Phaser.Scene {
  constructor() {
    super('HomeScene');
  }

  create() {
    this.title = this.add
      .text(0, 0, 'Mayhemate', {
        fontFamily: 'Arial',
        fontSize: '64px',
        color: '#955e23',
      })
      .setOrigin(0.5);

    this.playButton = this.add
      .text(0, 0, 'Играть', {
        fontFamily: 'Arial',
        fontSize: '32px',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.playButton.on('pointerdown', () => {
      this.scene.start('BootScene');
    });

    this.layout();

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
    });
  }

  layout(gameSize) {
    const width = gameSize?.width ?? this.scale.width;
    const height = gameSize?.height ?? this.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;

    this.title.setPosition(centerX, centerY - 60);
    this.playButton.setPosition(centerX, centerY + 40);
  }
}
